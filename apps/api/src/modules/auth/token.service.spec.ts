import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({});
    service = new TokenService(jwtService);
  });

  it('should generate an access token', () => {
    const token = service.generateAccessToken({
      sub: 'usr_123',
      email: 'test@chatterbox.app',
      username: 'testuser',
    });

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });

  it('should generate a 64-character hex refresh token', () => {
    const token = service.generateRefreshToken();

    expect(token).toBeDefined();
    expect(token.length).toBe(64);
    expect(/^[a-f0-9]{64}$/.test(token)).toBe(true);
  });

  it('should hash a refresh token deterministically with SHA-256', () => {
    const token = 'abcdef123456';
    const hash1 = service.hashRefreshToken(token);
    const hash2 = service.hashRefreshToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });

  it('should calculate refresh token expiry 7 days in the future', () => {
    const now = new Date();
    const expiry = service.getRefreshTokenExpiry();

    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    expect(diffDays).toBe(7);
  });
});
