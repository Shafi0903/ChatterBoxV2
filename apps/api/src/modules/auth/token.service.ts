import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { getJwtAccessSecret, parseDurationMs } from '../../config/jwt-secret.util';

export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
}

@Injectable()
export class TokenService {
  constructor(private jwtService: JwtService) {}

  /**
   * Generates a short-lived access JWT (configured via JWT_ACCESS_EXPIRES_IN, default 15m)
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
        secret: getJwtAccessSecret(),
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
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
   * Calculates expiry date using JWT_REFRESH_EXPIRES_IN (default 7 days)
   */
  getRefreshTokenExpiry(): Date {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const ttlMs = parseDurationMs(process.env.JWT_REFRESH_EXPIRES_IN, sevenDaysMs);
    return new Date(Date.now() + ttlMs);
  }
}
