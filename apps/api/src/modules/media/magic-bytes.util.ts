/**
 * Verifies file magic bytes against the declared MIME type.
 */
export function verifyMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length === 0) return false;

  switch (mimeType) {
    case 'image/jpeg':
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    case 'image/png':
      return (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );

    case 'image/gif': {
      if (buffer.length < 6) return false;
      const sig = buffer.subarray(0, 6).toString('ascii');
      return sig === 'GIF87a' || sig === 'GIF89a';
    }

    case 'image/webp':
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );

    case 'application/pdf':
      return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';

    case 'video/mp4':
      return buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';

    case 'video/webm':
    case 'audio/webm':
      return (
        buffer.length >= 4 &&
        buffer[0] === 0x1a &&
        buffer[1] === 0x45 &&
        buffer[2] === 0xdf &&
        buffer[3] === 0xa3
      );

    case 'audio/ogg':
      return buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'OggS';

    case 'audio/mpeg': {
      if (buffer.length < 3) return false;
      const isId3 = buffer.subarray(0, 3).toString('ascii') === 'ID3';
      const isSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
      return isId3 || isSync;
    }

    case 'text/plain': {
      // Reject binary executables or files containing null bytes
      const sample = buffer.subarray(0, Math.min(buffer.length, 512));
      if (sample.includes(0x00)) return false;
      return true;
    }

    default:
      return false;
  }
}
