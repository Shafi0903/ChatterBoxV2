import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should hash passwords with Argon2id parameters', async () => {
    const password = 'SuperSecretPassword123!';
    const hash = await service.hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).toContain('$argon2id$');
  });

  it('should verify correct password successfully', async () => {
    const password = 'CorrectPassword123!';
    const hash = await service.hashPassword(password);

    const isValid = await service.verifyPassword(hash, password);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const password = 'CorrectPassword123!';
    const hash = await service.hashPassword(password);

    const isValid = await service.verifyPassword(hash, 'WrongPassword456!');
    expect(isValid).toBe(false);
  });
});
