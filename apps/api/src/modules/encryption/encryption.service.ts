import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  RegisterDeviceInput,
  ReplenishPreKeysInput,
  verifySignedPreKey,
  isValidPublicJwkEC,
  computeSafetyNumber,
  UserKeyBundleResponse,
  DeviceSummary,
} from '@chatterbox/shared';

@Injectable()
export class EncryptionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a new user device with identity, signing, signed prekey, and one-time prekeys
   */
  async registerDevice(userId: string, input: RegisterDeviceInput): Promise<DeviceSummary> {
    // 1. Validate public JWK properties and ensure no private 'd' is present
    if (
      !isValidPublicJwkEC(input.identityKeyPublic) ||
      !isValidPublicJwkEC(input.signingKeyPublic) ||
      !isValidPublicJwkEC(input.signedPreKeyPublic)
    ) {
      throw new BadRequestException('Invalid public EC P-256 JWK format or private key parameters detected');
    }

    for (const otpk of input.oneTimePreKeys) {
      if (!isValidPublicJwkEC(otpk.publicKey)) {
        throw new BadRequestException(`Invalid one-time prekey JWK for keyId ${otpk.keyId}`);
      }
    }

    // 2. Cryptographically verify signed pre-key signature using the device's public signing key
    const isValidSignature = await verifySignedPreKey(
      input.signedPreKeyPublic,
      input.signedPreKeySignature,
      input.signingKeyPublic
    );

    if (!isValidSignature) {
      throw new BadRequestException('Signed pre-key signature verification failed against signingKeyPublic');
    }

    // 3. Persist Device and OneTimePreKeys transactionally
    const device = await this.prisma.$transaction(async (tx) => {
      const createdDevice = await tx.device.create({
        data: {
          userId,
          deviceName: input.deviceName,
          identityKeyPublic: input.identityKeyPublic,
          signingKeyPublic: input.signingKeyPublic,
          signedPreKeyPublic: input.signedPreKeyPublic,
          signedPreKeySignature: input.signedPreKeySignature,
          lastActiveAt: new Date(),
        },
      });

      // Insert prekeys
      if (input.oneTimePreKeys.length > 0) {
        await tx.oneTimePreKey.createMany({
          data: input.oneTimePreKeys.map((otpk) => ({
            deviceId: createdDevice.id,
            keyId: otpk.keyId,
            publicKey: otpk.publicKey,
          })),
        });
      }

      return createdDevice;
    });

    const remainingPreKeys = await this.prisma.oneTimePreKey.count({
      where: { deviceId: device.id, consumedAt: null },
    });

    return {
      id: device.id,
      deviceName: device.deviceName,
      identityKeyPublic: device.identityKeyPublic,
      signingKeyPublic: device.signingKeyPublic,
      signedPreKeyPublic: device.signedPreKeyPublic,
      signedPreKeySignature: device.signedPreKeySignature,
      remainingPreKeys,
      lastActiveAt: device.lastActiveAt,
      revokedAt: device.revokedAt,
      createdAt: device.createdAt,
    };
  }

  /**
   * List active/revoked devices for the authenticated caller
   */
  async getMyDevices(userId: string): Promise<DeviceSummary[]> {
    const devices = await this.prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            oneTimePreKeys: {
              where: { consumedAt: null },
            },
          },
        },
      },
    });

    return devices.map((d) => ({
      id: d.id,
      deviceName: d.deviceName,
      identityKeyPublic: d.identityKeyPublic,
      signingKeyPublic: d.signingKeyPublic,
      signedPreKeyPublic: d.signedPreKeyPublic,
      signedPreKeySignature: d.signedPreKeySignature,
      remainingPreKeys: d._count.oneTimePreKeys,
      lastActiveAt: d.lastActiveAt,
      revokedAt: d.revokedAt,
      createdAt: d.createdAt,
    }));
  }

  /**
   * Revoke a device belonging to the authenticated caller
   */
  async revokeDevice(userId: string, deviceId: string): Promise<{ success: true }> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    if (device.userId !== userId) {
      throw new ForbiddenException('Cannot revoke a device belonging to another user');
    }

    await this.prisma.device.update({
      where: { id: deviceId },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  /**
   * Replenish one-time prekeys for an active device
   */
  async replenishPreKeys(userId: string, deviceId: string, input: ReplenishPreKeysInput): Promise<{ added: number }> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    if (device.userId !== userId) {
      throw new ForbiddenException('Cannot replenish prekeys for another user device');
    }

    if (device.revokedAt) {
      throw new BadRequestException('Cannot replenish prekeys for a revoked device');
    }

    for (const otpk of input.preKeys) {
      if (!isValidPublicJwkEC(otpk.publicKey)) {
        throw new BadRequestException(`Invalid one-time prekey JWK for keyId ${otpk.keyId}`);
      }
    }

    // Upsert or insert ignoring duplicates
    let added = 0;
    for (const otpk of input.preKeys) {
      const existing = await this.prisma.oneTimePreKey.findUnique({
        where: {
          deviceId_keyId: {
            deviceId,
            keyId: otpk.keyId,
          },
        },
      });

      if (!existing) {
        await this.prisma.oneTimePreKey.create({
          data: {
            deviceId,
            keyId: otpk.keyId,
            publicKey: otpk.publicKey,
          },
        });
        added++;
      }
    }

    return { added };
  }

  /**
   * Fetch key bundles for all active devices of targetUserId.
   * Atomically claims 1 unconsumed OneTimePreKey per device (Adjustment 4).
   */
  async getUserKeyBundles(targetUserId: string): Promise<UserKeyBundleResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new NotFoundException('User not found or inactive');
    }

    const devices = await this.prisma.device.findMany({
      where: {
        userId: targetUserId,
        revokedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    const deviceBundles = await Promise.all(
      devices.map(async (device) => {
        // Race-free OTPK claiming using raw SQL transaction with FOR UPDATE SKIP LOCKED
        const claimedKey = await this.prisma.$transaction(async (tx) => {
          const rows = await tx.$queryRaw<Array<{ id: string; keyId: number; publicKey: string }>>`
            SELECT id, "keyId", "publicKey"
            FROM "OneTimePreKey"
            WHERE "deviceId" = ${device.id} AND "consumedAt" IS NULL
            ORDER BY "keyId" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `;

          if (rows && rows.length > 0) {
            const row = rows[0];
            await tx.$executeRaw`
              UPDATE "OneTimePreKey"
              SET "consumedAt" = NOW()
              WHERE id = ${row.id}
            `;
            return {
              keyId: row.keyId,
              publicKey: row.publicKey,
            };
          }

          return null;
        });

        return {
          deviceId: device.id,
          deviceName: device.deviceName,
          identityKeyPublic: device.identityKeyPublic,
          signingKeyPublic: device.signingKeyPublic,
          signedPreKeyPublic: device.signedPreKeyPublic,
          signedPreKeySignature: device.signedPreKeySignature,
          oneTimePreKey: claimedKey,
        };
      })
    );

    return {
      userId: targetUserId,
      devices: deviceBundles,
    };
  }

  /**
   * Enable E2EE for a 1:1 DM conversation.
   * Rejects GROUP conversations or DMs where either party lacks an active device.
   */
  async enableConversationE2ee(conversationId: string, callerId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          select: { userId: true },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const isMember = conversation.members.some((m) => m.userId === callerId);
    if (!isMember) {
      throw new ForbiddenException('Not a member of this conversation');
    }

    if (conversation.type !== 'DM') {
      throw new BadRequestException('E2EE is currently supported only for 1:1 DM conversations');
    }

    if (conversation.isEncrypted) {
      return conversation; // Already enabled
    }

    // Check that both users have at least one active (unrevoked) registered device
    for (const member of conversation.members) {
      const activeDevice = await this.prisma.device.findFirst({
        where: {
          userId: member.userId,
          revokedAt: null,
        },
      });

      if (!activeDevice) {
        throw new BadRequestException(
          `User ${member.userId} has no active registered device capable of E2EE`
        );
      }
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { isEncrypted: true },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profile: {
                  select: {
                    displayName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return updated;
  }

  /**
   * Verify safety number between caller's device and peer's device
   */
  async getSafetyNumber(callerId: string, peerUserId: string): Promise<{ safetyNumber: string }> {
    const callerDevice = await this.prisma.device.findFirst({
      where: { userId: callerId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const peerDevice = await this.prisma.device.findFirst({
      where: { userId: peerUserId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!callerDevice || !peerDevice) {
      throw new BadRequestException('Both users must have registered active devices to compute safety number');
    }

    const safetyNumber = await computeSafetyNumber(
      callerDevice.identityKeyPublic,
      peerDevice.identityKeyPublic
    );

    return { safetyNumber };
  }
}
