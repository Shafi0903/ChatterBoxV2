import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string().min(3),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cuid: z.string().cuid(),
  });

  let pipe: ZodValidationPipe;

  beforeEach(() => {
    pipe = new ZodValidationPipe(schema);
  });

  it('should transform and return valid input', () => {
    const valid = {
      name: 'General Channel',
      limit: '25',
      cuid: 'cjld2cjxh0000qzrmn831i7rn',
    };

    const result = pipe.transform(valid);
    expect(result).toEqual({
      name: 'General Channel',
      limit: 25,
      cuid: 'cjld2cjxh0000qzrmn831i7rn',
    });
  });

  it('should apply defaults for optional fields', () => {
    const input = {
      name: 'Valid Name',
      cuid: 'cjld2cjxh0000qzrmn831i7rn',
    };

    const result = pipe.transform(input);
    expect(result.limit).toBe(50);
  });

  it('should throw BadRequestException on invalid data types or missing required fields', () => {
    const invalid = {
      name: 'ab', // too short
      limit: 'not-a-number', // NaN
      cuid: 'invalid-cuid-string',
    };

    expect(() => pipe.transform(invalid)).toThrow(BadRequestException);
  });

  it('should reject invalid cuid formats', () => {
    const invalidCuid = {
      name: 'Valid Name',
      limit: 10,
      cuid: 'uuid-1234-5678-9012',
    };

    expect(() => pipe.transform(invalidCuid)).toThrow(BadRequestException);
  });

  it('should provide formatted error details on ZodError', () => {
    try {
      pipe.transform({});
    } catch (err: any) {
      expect(err).toBeInstanceOf(BadRequestException);
      const res = err.getResponse();
      expect(res.message).toBe('Validation failed');
      expect(Array.isArray(res.details)).toBe(true);
      expect(res.details.length).toBeGreaterThan(0);
    }
  });
});
