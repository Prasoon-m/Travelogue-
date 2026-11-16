import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
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
      errorCode: 'NOT_A_BILL' as const,
      statusCode: 422 as const,
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
    (error: unknown) => {
      const err = error as UnprocessableEntityException;
      return (
        err instanceof UnprocessableEntityException &&
        err.getStatus() === 422 &&
        err.message === 'No valid bill detected. Please upload a valid bill or receipt.'
      );
    },
  );
  assert.equal(fileStored, false);
  assert.equal(billCreated, false);
});

test('rejects wrong file type with 400 INVALID_FILE_TYPE', async () => {
  let fileStored = false;
  let billCreated = false;
  const storage = { saveEncryptedFile: async () => { fileStored = true; } } as unknown as StorageService;
  const prisma = { bill: { create: async () => { billCreated = true; } } } as unknown as PrismaService;
  const ocr = {
    processBillImage: async () => ({
      isReceipt: false,
      errorCode: 'INVALID_FILE_TYPE' as const,
      statusCode: 400 as const,
      quality: 'unreadable' as const,
      error: 'Invalid file type. Only JPEG, PNG, WebP image and PDF files are supported.',
    }),
  } as unknown as OcrService;
  const service = new BillsService(prisma, storage, {} as CryptoService, ocr);
  const file = { buffer: Buffer.from('plain text file'), mimetype: 'text/plain' } as Express.Multer.File;

  await assert.rejects(
    service.uploadBill('user-id', file, {}),
    (error: unknown) => {
      const err = error as BadRequestException;
      const res = err.getResponse() as any;
      return (
        err instanceof BadRequestException &&
        err.getStatus() === 400 &&
        res.error === 'INVALID_FILE_TYPE' &&
        res.code === 'INVALID_FILE_TYPE'
      );
    },
  );
  assert.equal(fileStored, false);
  assert.equal(billCreated, false);
});

test('rejects low quality image (blank/blurry/dark) with 400 IMAGE_QUALITY_LOW', async () => {
  let fileStored = false;
  const storage = { saveEncryptedFile: async () => { fileStored = true; } } as unknown as StorageService;
  const prisma = { bill: { create: async () => {} } } as unknown as PrismaService;
  const ocr = {
    processBillImage: async () => ({
      isReceipt: false,
      errorCode: 'IMAGE_QUALITY_LOW' as const,
      statusCode: 400 as const,
      quality: 'blurry' as const,
      error: 'This bill is too blurry to read. Please upload a clearer image.',
    }),
  } as unknown as OcrService;
  const service = new BillsService(prisma, storage, {} as CryptoService, ocr);
  const file = { buffer: Buffer.from('blurry-data'), mimetype: 'image/jpeg' } as Express.Multer.File;

  await assert.rejects(
    service.uploadBill('user-id', file, {}),
    (error: unknown) => {
      const err = error as BadRequestException;
      const res = err.getResponse() as any;
      return (
        err instanceof BadRequestException &&
        err.getStatus() === 400 &&
        res.error === 'IMAGE_QUALITY_LOW'
      );
    },
  );
  assert.equal(fileStored, false);
});

test('rejects low confidence OCR with 422 OCR_LOW_CONFIDENCE', async () => {
  const ocr = {
    processBillImage: async () => ({
      isReceipt: false,
      errorCode: 'OCR_LOW_CONFIDENCE' as const,
      statusCode: 422 as const,
      quality: 'blurry' as const,
      error: 'This bill is too blurry to read. Please upload a clearer image.',
    }),
  } as unknown as OcrService;
  const service = new BillsService({} as PrismaService, {} as StorageService, {} as CryptoService, ocr);
  const file = { buffer: Buffer.from('data'), mimetype: 'image/jpeg' } as Express.Multer.File;

  await assert.rejects(
    service.uploadBill('user-id', file, {}),
    (error: unknown) => {
      const err = error as UnprocessableEntityException;
      const res = err.getResponse() as any;
      return (
        err instanceof UnprocessableEntityException &&
        err.getStatus() === 422 &&
        res.error === 'OCR_LOW_CONFIDENCE'
      );
    },
  );
});

test('rejects empty text detection with 422 NO_TEXT_DETECTED', async () => {
  const ocr = {
    processBillImage: async () => ({
      isReceipt: false,
      errorCode: 'NO_TEXT_DETECTED' as const,
      statusCode: 422 as const,
      quality: 'unreadable' as const,
      error: 'No text detected in the uploaded image. Please ensure the bill is clear and legible.',
    }),
  } as unknown as OcrService;
  const service = new BillsService({} as PrismaService, {} as StorageService, {} as CryptoService, ocr);
  const file = { buffer: Buffer.from('data'), mimetype: 'image/jpeg' } as Express.Multer.File;

  await assert.rejects(
    service.uploadBill('user-id', file, {}),
    (error: unknown) => {
      const err = error as UnprocessableEntityException;
      const res = err.getResponse() as any;
      return (
        err instanceof UnprocessableEntityException &&
        err.getStatus() === 422 &&
        res.error === 'NO_TEXT_DETECTED'
      );
    },
  );
});

test('persists valid bill and stores encrypted file when bill is verified', async () => {
  let fileSaved = false;
  let billSaved = false;
  const prisma = {
    view: { findFirst: async () => null },
    bill: {
      create: async () => {
        billSaved = true;
        return { id: 'bill-123', status: 'READY_FOR_REVIEW' };
      },
    },
  } as unknown as PrismaService;
  const storage = {
    saveEncryptedFile: async () => {
      fileSaved = true;
      return { filePath: '/uploads/bill-123.enc', fileHash: 'hash-abc' };
    },
  } as unknown as StorageService;
  const ocr = {
    processBillImage: async () => ({
      isReceipt: true,
      quality: 'readable' as const,
      currency: { value: 'INR', confidence: 'found' as const },
      merchant: { value: 'ACME Cafe', confidence: 'found' as const },
      date: { value: '2025-11-15', confidence: 'found' as const },
      billNo: { value: 'A12345', confidence: 'found' as const },
      items: { value: 'Coffee 2 — 300.00', confidence: 'found' as const },
      total: { value: '300.00', confidence: 'found' as const },
      tax: { value: '15.00', confidence: 'found' as const },
      payment: { value: 'UPI', confidence: 'found' as const },
    }),
  } as unknown as OcrService;
  const service = new BillsService(prisma, storage, {} as CryptoService, ocr);
  const file = { buffer: Buffer.from('valid-bill-data'), mimetype: 'image/png' } as Express.Multer.File;

  const result = await service.uploadBill('user-id', file, {});
  assert.equal(result.billId, 'bill-123');
  assert.equal(result.status, 'READY_FOR_REVIEW');
  assert.equal(fileSaved, true);
  assert.equal(billSaved, true);
});
