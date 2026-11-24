import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
}

@Injectable()
export class TokenService {
  constructor(private jwtService: JwtService) {}

  /**
   * Generates a short-lived access JWT (15m)
   */
  generateAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(
      {
        sub: payload.sub,
        email: payload.email,
        username: payload.username,
        jti: crypto.randomUUID(),
      },
      {
        secret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-min-32-chars-long',
        expiresIn: '15m',
      },
    );
  }

  /**
   * Generates an opaque random 64-character hex refresh token
   */
  generateRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hashes a refresh token with SHA-256 for persistent database storage
   */
  hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Calculates expiry date for 7 days in the future
   */
  getRefreshTokenExpiry(): Date {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    return expiresAt;
  }
}
