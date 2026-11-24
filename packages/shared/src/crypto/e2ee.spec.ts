import {
  generateIdentityKeyPair,
  generateSigningKeyPair,
  generateSignedPreKey,
  verifySignedPreKey,
  generateOneTimePreKeys,
  exportJwk,
  encryptMessage,
  decryptMessage,
  computeSafetyNumber,
} from './e2ee';
import { isValidPublicJwkEC, registerDeviceSchema } from '../validation/encryption.schema';

describe('WebCrypto E2EE Primitives', () => {
  it('should generate valid identity and signing key pairs and export JWKs', async () => {
    const identity = await generateIdentityKeyPair();
    const signing = await generateSigningKeyPair();

    const identityPublicJwk = await exportJwk(identity.publicKey);
    const signingPublicJwk = await exportJwk(signing.publicKey);

    expect(isValidPublicJwkEC(identityPublicJwk)).toBe(true);
    expect(isValidPublicJwkEC(signingPublicJwk)).toBe(true);

    const parsed = JSON.parse(identityPublicJwk);
    expect(parsed.kty).toBe('EC');
    expect(parsed.crv).toBe('P-256');
    expect(parsed.d).toBeUndefined(); // strictly no private key
  });

  it('should generate and verify signed pre-keys', async () => {
    const signing = await generateSigningKeyPair();
    const signingPublicJwk = await exportJwk(signing.publicKey);

    const { preKey, preKeyPublicJwk, signatureBase64 } = await generateSignedPreKey(signing.privateKey);

    expect(isValidPublicJwkEC(preKeyPublicJwk)).toBe(true);
    expect(typeof signatureBase64).toBe('string');

    const isValid = await verifySignedPreKey(preKeyPublicJwk, signatureBase64, signingPublicJwk);
    expect(isValid).toBe(true);

    // Tampered signature or key fails verification
    const isTampered = await verifySignedPreKey(preKeyPublicJwk, signatureBase64.slice(0, -4) + 'AAAA', signingPublicJwk);
    expect(isTampered).toBe(false);
  });

  it('should reject JWKs that contain private parameter d', () => {
    const invalidJwkWithD = JSON.stringify({
      kty: 'EC',
      crv: 'P-256',
      x: 'f83OJ3D2xFmTEcNV_bNP01_N6XVi8mSeyUT6zTIh7cg',
      y: 'x_daaqundebUR-Z60q46DZGo0kMm5P-hI_p7A22v-3U',
      d: 'jpsQnnGQmL-Y2_EYUZnULW-HJbNaRwUvU2BgBhTHw9o',
    });

    expect(isValidPublicJwkEC(invalidJwkWithD)).toBe(false);

    const validation = registerDeviceSchema.safeParse({
      deviceName: 'Chrome',
      identityKeyPublic: invalidJwkWithD,
      signingKeyPublic: invalidJwkWithD,
      signedPreKeyPublic: invalidJwkWithD,
      signedPreKeySignature: 'dGVzdA==',
      oneTimePreKeys: [{ keyId: 1, publicKey: invalidJwkWithD }],
    });

    expect(validation.success).toBe(false);
  });

  it('should encrypt and decrypt messages between sender and recipient devices with distinct wrapIv and AAD binding', async () => {
    // 1. Recipient device setup
    const recipientIdentity = await generateIdentityKeyPair();
    const recipientSigning = await generateSigningKeyPair();
    const { preKey: recipientPreKey, preKeyPublicJwk: recipientPreKeyPublic } = await generateSignedPreKey(recipientSigning.privateKey);

    const recipientDeviceId = 'a0000000-0000-0000-0000-000000000001';
    const conversationId = 'c0000000-0000-0000-0000-000000000001';
    const senderId = 'u0000000-0000-0000-0000-000000000001';

    // 2. Sender encrypts plaintext
    const plaintext = 'Secret ChatterBox message 🤫';
    const encrypted = await encryptMessage({
      plaintext,
      conversationId,
      senderId,
      senderDeviceId: 's0000000-0000-0000-0000-000000000001',
      recipients: [
        {
          deviceId: recipientDeviceId,
          identityPublicKey: await exportJwk(recipientIdentity.publicKey),
          signedPreKeyPublic: recipientPreKeyPublic,
        },
      ],
    });

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.e2eeHeader.version).toBe(1);
    expect(encrypted.e2eeHeader.devices[recipientDeviceId]).toBeDefined();
    expect(encrypted.e2eeHeader.devices[recipientDeviceId].wrapIv).toBeDefined();
    expect(encrypted.e2eeHeader.devices[recipientDeviceId].wrapIv).not.toBe(encrypted.e2eeHeader.iv);

    // 3. Recipient decrypts
    const decrypted = await decryptMessage({
      ciphertext: encrypted.ciphertext,
      e2eeHeader: encrypted.e2eeHeader,
      recipientDeviceId,
      recipientPrivateKey: recipientPreKey.privateKey,
      conversationId,
      senderId,
    });

    expect(decrypted).toBe(plaintext);

    // 4. AAD Tampering / Cross-conversation replay should fail decryption
    await expect(
      decryptMessage({
        ciphertext: encrypted.ciphertext,
        e2eeHeader: encrypted.e2eeHeader,
        recipientDeviceId,
        recipientPrivateKey: recipientPreKey.privateKey,
        conversationId: 'tampered-conversation-id',
        senderId,
      })
    ).rejects.toThrow();
  });

  it('should compute consistent 15-digit safety numbers', async () => {
    const keyA = '{"kty":"EC","crv":"P-256","x":"111","y":"222"}';
    const keyB = '{"kty":"EC","crv":"P-256","x":"333","y":"444"}';

    const num1 = await computeSafetyNumber(keyA, keyB);
    const num2 = await computeSafetyNumber(keyB, keyA);

    expect(num1).toBe(num2);
    expect(num1).toMatch(/^\d{5} \d{5} \d{5}$/);
  });
});
