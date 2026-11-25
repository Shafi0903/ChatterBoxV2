import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  RegisterDeviceInput,
  RotateSignedPreKeyInput,
  ReplenishPreKeysInput,
  verifySignedPreKey,
  verifyDeviceBundle,
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

    // Cryptographically enforce identityKeyPublic <-> signedPreKeyPublic binding
    const isBoundPreKeySig = await verifySignedPreKey(
      input.signedPreKeyPublic,
      input.signedPreKeySignature,
      input.signingKeyPublic,
      input.identityKeyPublic,
    );

    if (!isBoundPreKeySig) {
      throw new BadRequestException(
        'Signed pre-key signature verification failed against signingKeyPublic and identityKeyPublic',
      );
    }

    if (input.identityBindingSignature) {
      const isBindingValid = await verifyDeviceBundle(
        input.identityKeyPublic,
        input.signedPreKeyPublic,
        input.identityBindingSignature,
        input.signingKeyPublic,
      );
      if (!isBindingValid) {
        throw new BadRequestException('Identity binding signature verification failed');
      }
    }

    let device;
    try {
      device = await this.prisma.$transaction(async (tx) => {
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

        if (input.oneTimePreKeys.length > 0) {
          await tx.oneTimePreKey.createMany({
            data: input.oneTimePreKeys.map((otpk) => ({
              deviceId: createdDevice.id,
              keyId: otpk.keyId,
              publicKey: otpk.publicKey,
            })),
            skipDuplicates: true,
          });
        }

        return createdDevice;
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('Duplicate device or prekey identifier detected');
      }
      throw err;
    }

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
   * Rotate signed prekey for an active device owned by userId
   */
  async rotateSignedPreKey(
    userId: string,
    deviceId: string,
    input: RotateSignedPreKeyInput,
  ): Promise<DeviceSummary> {
    if (!isValidPublicJwkEC(input.signedPreKeyPublic)) {
      throw new BadRequestException('Invalid signed pre-key public JWK');
    }

    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    if (device.userId !== userId) {
      throw new ForbiddenException('Cannot rotate prekey for another user device');
    }

    if (device.revokedAt) {
      throw new BadRequestException('Cannot rotate prekey for a revoked device');
    }

    const isBoundSig = await verifySignedPreKey(
      input.signedPreKeyPublic,
      input.signedPreKeySignature,
      device.signingKeyPublic,
      device.identityKeyPublic,
    );

    if (!isBoundSig) {
      throw new BadRequestException(
        'Signed pre-key signature verification failed against signingKeyPublic and identityKeyPublic',
      );
    }

    if (input.identityBindingSignature) {
      const isBindingValid = await verifyDeviceBundle(
        device.identityKeyPublic,
        input.signedPreKeyPublic,
        input.identityBindingSignature,
        device.signingKeyPublic,
      );
      if (!isBindingValid) {
        throw new BadRequestException('Identity binding signature verification failed');
      }
    }

    const updated = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        signedPreKeyPublic: input.signedPreKeyPublic,
        signedPreKeySignature: input.signedPreKeySignature,
        lastActiveAt: new Date(),
      },
      include: {
        _count: {
          select: {
            oneTimePreKeys: { where: { consumedAt: null } },
          },
        },
      },
    });

    return {
      id: updated.id,
      deviceName: updated.deviceName,
      identityKeyPublic: updated.identityKeyPublic,
      signingKeyPublic: updated.signingKeyPublic,
      signedPreKeyPublic: updated.signedPreKeyPublic,
      signedPreKeySignature: updated.signedPreKeySignature,
      remainingPreKeys: updated._count.oneTimePreKeys,
      lastActiveAt: updated.lastActiveAt,
      revokedAt: updated.revokedAt,
      createdAt: updated.createdAt,
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
   * Replenish one-time prekeys for an active device (race-safe)
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

    const res = await this.prisma.oneTimePreKey.createMany({
      data: input.preKeys.map((otpk) => ({
        deviceId,
        keyId: otpk.keyId,
        publicKey: otpk.publicKey,
      })),
      skipDuplicates: true,
    });

    return { added: res.count };
  }

  /**
   * Fetch key bundles for all active devices of targetUserId.
   * Restricted to self or users who share at least one conversation with targetUserId.
   * Atomically claims 1 unconsumed OneTimePreKey per device.
   */
  async getUserKeyBundles(callerId: string, targetUserId: string): Promise<UserKeyBundleResponse> {
    if (callerId !== targetUserId) {
      const sharedConversation = await this.prisma.conversationMember.findFirst({
        where: {
          userId: callerId,
          conversation: {
            members: {
              some: { userId: targetUserId },
            },
          },
        },
        select: { id: true },
      });

      if (!sharedConversation) {
        throw new ForbiddenException(
          'You can only fetch encryption key bundles for peers you share a conversation with',
        );
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, isActive: true, deletedAt: true },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
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
      }),
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
      return conversation;
    }

    for (const member of conversation.members) {
      const activeDevice = await this.prisma.device.findFirst({
        where: {
          userId: member.userId,
          revokedAt: null,
        },
      });

      if (!activeDevice) {
        throw new BadRequestException(
          `User ${member.userId} has no active registered device capable of E2EE`,
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
   * Verify safety number between caller's device and peer's device,
   * binding both identityKeyPublic and signingKeyPublic.
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
      peerDevice.identityKeyPublic,
      callerDevice.signingKeyPublic,
      peerDevice.signingKeyPublic,
    );

    return { safetyNumber };
  }
}
