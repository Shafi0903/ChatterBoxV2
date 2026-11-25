import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { RegisterDto, LoginDto, SafeUser, AuthMeResponse } from '@chatterbox/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export interface AuthSessionResult {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private passwordService: PasswordService,
    private tokenService: TokenService,
  ) {}

  /**
   * Registers a new user account with default Profile and UserSettings
   */
  async register(
    dto: RegisterDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthSessionResult> {
    const email = dto.email.toLowerCase().trim();
    const username = dto.username.toLowerCase().trim();

    // Check reserved usernames (defense-in-depth)
    const reserved = ['admin', 'administrator', 'support', 'moderator', 'system', 'chatterbox', 'official', 'security', 'root', 'help'];
    if (reserved.includes(username)) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'This username is reserved and cannot be registered',
      });
    }

    // Check for existing email or username conflict
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existing) {
      if (existing.email === email) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'An account with this email already exists',
        });
      }
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Username is already taken',
      });
    }

    // Hash password with Argon2id (spec: 64 MiB, 3 iterations)
    const passwordHash = await this.passwordService.hashPassword(dto.password);

    // Create user, profile, and default settings in a single transaction
    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        return tx.user.create({
          data: {
            email,
            username,
            passwordHash,
            profile: {
              create: {
                displayName: dto.displayName.trim(),
              },
            },
            settings: {
              create: {
                theme: 'DARK',
                profileVisibility: 'PUBLIC',
                showOnlineStatus: true,
                showReadReceipts: true,
                allowDirectMessages: true,
                notifyNewMessages: true,
                notifyMentions: true,
              },
            },
          },
        });
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'An account with this email or username already exists',
        });
      }
      throw err;
    }

    // Generate tokens
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      username: user.username,
    });
    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenHash = this.tokenService.hashRefreshToken(refreshToken);

    // Save session
    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        userAgent,
        ipAddress,
        expiresAt: this.tokenService.getRefreshTokenExpiry(),
      },
    });

    return {
      user: this.toSafeUser(user),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Authenticates a user via email or username + password
   */
  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthSessionResult> {
    const rawIdentifier = dto.identifier.trim();
    const isEmail = rawIdentifier.includes('@');
    const identifier = rawIdentifier.toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: isEmail ? { email: identifier } : { username: identifier },
    });

    // Generic error hygiene: never reveal if identifier exists
    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid credentials',
      });
    }

    const isPasswordValid = await this.passwordService.verifyPassword(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid credentials',
      });
    }

    // Generate fresh tokens
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      username: user.username,
    });
    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenHash = this.tokenService.hashRefreshToken(refreshToken);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        userAgent,
        ipAddress,
        expiresAt: this.tokenService.getRefreshTokenExpiry(),
      },
    });

    return {
      user: this.toSafeUser(user),
      accessToken,
      refreshToken,
    };
  }

  /**
   * Rotates refresh token with reuse detection
   */
  async refresh(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RefreshResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'No refresh token provided',
      });
    }

    const refreshTokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid refresh token',
      });
    }

    // Reuse Detection: If token is already revoked, an attacker or leak occurred!
    if (session.revokedAt !== null) {
      this.logger.warn(
        `Revoked refresh token reuse detected for userId: ${session.userId}. Revoking all sessions!`,
      );
      // Immediately invalidate all active sessions for this user
      await this.prisma.session.updateMany({
        where: {
          userId: session.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      throw new UnauthorizedException({
        code: 'REVOKED_REFRESH_TOKEN',
        message: 'Session has been invalidated due to suspected reuse. Please log in again.',
      });
    }

    // If merely expired, fail without revoking other sessions
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'EXPIRED_REFRESH_TOKEN',
        message: 'Refresh token has expired. Please log in again.',
      });
    }

    if (!session.user || !session.user.isActive || session.user.deletedAt !== null) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'User account is inactive or deleted',
      });
    }

    // Valid session: atomically revoke old session (only if still unrevoked) and issue new pair
    const newRefreshToken = this.tokenService.generateRefreshToken();
    const newRefreshTokenHash = this.tokenService.hashRefreshToken(newRefreshToken);

    const rotated = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      if (revoked.count === 0) {
        return false;
      }

      await tx.session.create({
        data: {
          userId: session.userId,
          refreshTokenHash: newRefreshTokenHash,
          userAgent,
          ipAddress,
          expiresAt: this.tokenService.getRefreshTokenExpiry(),
        },
      });

      return true;
    });

    if (!rotated) {
      this.logger.warn(
        `Concurrent refresh token rotation detected for userId: ${session.userId}. Revoking all sessions!`,
      );
      await this.prisma.session.updateMany({
        where: {
          userId: session.userId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        code: 'REVOKED_REFRESH_TOKEN',
        message: 'Session has been invalidated due to suspected reuse. Please log in again.',
      });
    }

    const newAccessToken = this.tokenService.generateAccessToken({
      sub: session.user.id,
      email: session.user.email,
      username: session.user.username,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logs out the user by revoking their current session
   */
  async logout(userId: string, rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    const refreshTokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);
    await this.prisma.session.updateMany({
      where: {
        userId,
        refreshTokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Retrieves the current authenticated user's profile and settings
   */
  async getMe(userId: string): Promise<AuthMeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        settings: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'User not found or account deactivated',
      });
    }

    return {
      user: this.toSafeUser(user),
      profile: user.profile,
      settings: user.settings,
    };
  }

  private toSafeUser(user: {
    id: string;
    email: string;
    username: string;
    emailVerifiedAt: Date | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): SafeUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerifiedAt: user.emailVerifiedAt,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
