import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { BillsService } from './bills.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CryptoService } from '../crypto/crypto.service';
import { OcrService } from '../ocr/ocr.service';

test('rejects invalid uploads before file storage or bill creation', async () => {
  let fileStored = false;
  let billCreated = false;
  const prisma = {
    view: { findFirst: async () => null },
    bill: { create: async () => { billCreated = true; } },
  } as unknown as PrismaService;
  const storage = {
    saveEncryptedFile: async () => { fileStored = true; },
  } as unknown as StorageService;
  const ocr = {
    processBillImage: async () => ({
      isReceipt: false,
      quality: 'readable' as const,
      error: 'No valid bill detected. Please upload a valid bill or receipt.',
    }),
  } as unknown as OcrService;
  const service = new BillsService(prisma, storage, {} as CryptoService, ocr);
  const file = {
    buffer: Buffer.from('not a bill'),
    mimetype: 'image/png',
  } as Express.Multer.File;

  await assert.rejects(
    service.uploadBill('user-id', file, {}),
    (error: unknown) => error instanceof BadRequestException
      && error.message === 'No valid bill detected. Please upload a valid bill or receipt.',
  );
  assert.equal(fileStored, false);
  assert.equal(billCreated, false);
});
