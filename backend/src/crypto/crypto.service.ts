import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
  tag: string;
}

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly masterKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const configuredKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!configuredKey && process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY must be configured in production.');
    }
    const rawKey = configuredKey || 'travelogue_32_byte_aes_key_dev!!';
    // Ensure key is exactly 32 bytes (256 bits)
    this.masterKey = Buffer.from(rawKey.padEnd(32, '0').slice(0, 32));
  }

  /**
   * Encrypt a text string using AES-256-GCM with a fresh 12-byte IV.
   * Returns a compact JSON string representing { iv, ciphertext, tag }.
   */
  encryptField(plainText?: string): string | null {
    if (!plainText) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);
    let ciphertext = cipher.update(plainText, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    
    return JSON.stringify({
      iv: iv.toString('hex'),
      ciphertext,
      tag,
    });
  }

  /**
   * Decrypt a ciphertext string back into plain text.
   */
  decryptField(serializedPayload?: string | null): string {
    if (!serializedPayload) return '';
    try {
      const payload: EncryptedPayload = JSON.parse(serializedPayload);
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.masterKey,
        Buffer.from(payload.iv, 'hex'),
      );
      decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
      let plain = decipher.update(payload.ciphertext, 'hex', 'utf8');
      plain += decipher.final('utf8');
      return plain;
    } catch (err) {
      console.error('Decryption failed:', err instanceof Error ? err.message : err);
      throw new InternalServerErrorException('Unable to decrypt protected bill data.');
    }
  }

  /**
   * Encrypt a binary file buffer with AES-256-GCM.
   */
  encryptBuffer(buffer: Buffer): { iv: Buffer; ciphertext: Buffer; tag: Buffer } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return { iv, ciphertext, tag: cipher.getAuthTag() };
  }

  /**
   * Decrypt a binary file buffer.
   */
  decryptBuffer(ciphertext: Buffer, iv: Buffer, tag: Buffer): Buffer {
    const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Calculate SHA-256 hash for file integrity.
   */
  calculateSha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
