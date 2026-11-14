import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CryptoService } from '../crypto/crypto.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface StoredFileInfo {
  filePath: string;
  fileHash: string;
}

@Injectable()
export class StorageService {
  private readonly uploadDir = path.resolve(process.cwd(), 'uploads');

  constructor(private readonly cryptoService: CryptoService) {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Encrypts and writes a file to the secure local storage directory.
   */
  async saveEncryptedFile(file: Express.Multer.File): Promise<StoredFileInfo> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file content provided');
    }

    // 1. Calculate original SHA-256 hash for integrity verification
    const fileHash = this.cryptoService.calculateSha256(file.buffer);

    // 2. Encrypt buffer with AES-256-GCM
    const { iv, ciphertext, tag } = this.cryptoService.encryptBuffer(file.buffer);

    // 3. Format payload: IV (12 bytes) + Tag (16 bytes) + Ciphertext
    const combined = Buffer.concat([iv, tag, ciphertext]);

    // 4. Generate opaque filename
    const ext = path.extname(file.originalname) || '.bin';
    const opaqueName = `${crypto.randomUUID()}${ext}.enc`;
    const fullPath = path.join(this.uploadDir, opaqueName);

    await fs.promises.writeFile(fullPath, combined, { flag: 'wx' });

    return {
      filePath: opaqueName,
      fileHash,
    };
  }

  /**
   * Reads, decrypts, and verifies the integrity of an encrypted file.
   */
  async readDecryptedFile(filePath: string, expectedHash?: string): Promise<Buffer> {
    const fullPath = path.join(this.uploadDir, filePath);
    if (path.dirname(fullPath) !== this.uploadDir) {
      throw new BadRequestException('Invalid bill file path');
    }
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Bill file not found on disk');
    }

    const combined = await fs.promises.readFile(fullPath);
    if (combined.length < 28) {
      throw new BadRequestException('Corrupted file structure');
    }

    const iv = combined.subarray(0, 12);
    const tag = combined.subarray(12, 28);
    const ciphertext = combined.subarray(28);

    const decrypted = this.cryptoService.decryptBuffer(ciphertext, iv, tag);

    // Check integrity if expectedHash is provided
    if (expectedHash) {
      const currentHash = this.cryptoService.calculateSha256(decrypted);
      if (currentHash !== expectedHash) {
        throw new BadRequestException('File integrity check failed: SHA-256 mismatch');
      }
    }

    return decrypted;
  }

  async removeFile(filePath: string): Promise<void> {
    const fullPath = path.join(this.uploadDir, filePath);
    if (path.dirname(fullPath) !== this.uploadDir) {
      throw new BadRequestException('Invalid bill file path');
    }
    await fs.promises.rm(fullPath, { force: true });
  }
}
