import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { OcrService } from './ocr.service';

const ocr = new OcrService();

test('accepts a readable bill and extracts merchant, date, items, total, and GST', () => {
  const result = ocr.validateRecognizedText(`ACME Cafe
TAX INVOICE
Invoice No: A12345
Date: 2025-11-15
Coffee 2 300.00
Sandwich 1 250.00
CGST 5% 27.50
Grand Total Rs. 577.50
Paid by UPI`, 92);

  assert.equal(result.isReceipt, true);
  assert.equal(result.merchant.value, 'ACME Cafe');
  assert.equal(result.date.value, '2025-11-15');
  assert.equal(result.total.value, '577.50');
  assert.equal(result.tax.value, '27.50');
  assert.match(result.items.value, /Coffee 2 — 300\.00/);
  assert.match(result.items.value, /Sandwich 1 — 250\.00/);
});

test('rejects OCR text from a personal photo with no bill structure', () => {
  const result = ocr.validateRecognizedText('Green trees beside a lake. Summer holiday with friends.', 90);

  assert.equal(result.isReceipt, false);
  assert.equal(result.errorCode, 'NOT_A_BILL');
  assert.equal(result.statusCode, 422);
  assert.equal(result.error, 'No valid bill detected. Please upload a valid bill or receipt.');
});

test('rejects an unrelated dashboard screenshot with totals', () => {
  const result = ocr.validateRecognizedText(`Travelogue Dashboard
Friday plans
Total activities: 4
Upcoming trip: Mountain weekend
Budget overview
View itinerary`, 90);

  assert.equal(result.isReceipt, false);
  assert.equal(result.errorCode, 'NOT_A_BILL');
  assert.equal(result.statusCode, 422);
});

test('rejects a blurry bill even when some bill text was recognized', () => {
  const result = ocr.validateRecognizedText(`ACME Cafe
TAX INVOICE
Invoice No: A12345
Date: 2025-11-15
Coffee 2 300.00
Sandwich 1 250.00
CGST 5% 27.50
Grand Total Rs. 577.50
Paid by UPI`, 8);

  assert.equal(result.isReceipt, false);
  assert.equal(result.quality, 'blurry');
  assert.equal(result.errorCode, 'OCR_LOW_CONFIDENCE');
  assert.equal(result.statusCode, 422);
  assert.match(result.error || '', /too blurry/i);
});

test('rejects an incomplete bill without an amount', () => {
  const result = ocr.validateRecognizedText('ACME Cafe\nTAX INVOICE\nDate: 2025-11-15', 90);

  assert.equal(result.isReceipt, false);
  assert.equal(result.quality, 'incomplete');
  assert.equal(result.errorCode, 'NOT_A_BILL');
  assert.equal(result.statusCode, 422);
});

test('rejects empty or whitespace-only OCR text with NO_TEXT_DETECTED', () => {
  const result = ocr.validateRecognizedText('   \n  \t  ', 85);

  assert.equal(result.isReceipt, false);
  assert.equal(result.quality, 'unreadable');
  assert.equal(result.errorCode, 'NO_TEXT_DETECTED');
  assert.equal(result.statusCode, 422);
  assert.match(result.error || '', /no text detected/i);
});

test('rejects too short OCR text with NO_TEXT_DETECTED', () => {
  const result = ocr.validateRecognizedText('Hi 123', 85);

  assert.equal(result.isReceipt, false);
  assert.equal(result.errorCode, 'NO_TEXT_DETECTED');
  assert.equal(result.statusCode, 422);
});

test('pre-OCR rejects blank image (solid white canvas) with IMAGE_QUALITY_LOW', async () => {
  const canvas = createCanvas(100, 100);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 100, 100);
  const buffer = canvas.toBuffer('image/png');

  const check = await ocr.validateImageQuality(buffer);
  assert.equal(check.valid, false);
  assert.equal(check.quality, 'blank');
  assert.equal(check.errorCode, 'IMAGE_QUALITY_LOW');
});

test('pre-OCR rejects pitch black image with IMAGE_QUALITY_LOW', async () => {
  const canvas = createCanvas(100, 100);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, 100, 100);
  const buffer = canvas.toBuffer('image/png');

  const check = await ocr.validateImageQuality(buffer);
  assert.equal(check.valid, false);
  assert.equal(check.quality, 'dark');
  assert.equal(check.errorCode, 'IMAGE_QUALITY_LOW');
});

test('pre-OCR rejects blurry image with IMAGE_QUALITY_LOW', async () => {
  const canvas = createCanvas(100, 100);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 100, 100);
  gradient.addColorStop(0, '#000000');
  gradient.addColorStop(1, '#ffffff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 100, 100);
  const buffer = canvas.toBuffer('image/png');

  const check = await ocr.validateImageQuality(buffer);
  assert.equal(check.valid, false);
  assert.equal(check.quality, 'blurry');
  assert.equal(check.errorCode, 'IMAGE_QUALITY_LOW');
});

test('pre-OCR rejects wrong file types and corrupt buffers with INVALID_FILE_TYPE', () => {
  const textBuffer = Buffer.from('Hello world this is not an image');
  const check = ocr.verifyFileType(textBuffer, 'text/plain');
  assert.equal(check.valid, false);

  const fakePng = Buffer.from('Not really a png file content');
  const checkFake = ocr.verifyFileType(fakePng, 'image/png');
  assert.equal(checkFake.valid, false);

  // Correct PNG magic header
  const realPngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const checkReal = ocr.verifyFileType(realPngHeader, 'image/png');
  assert.equal(checkReal.valid, true);

  // Correct JPEG magic header
  const realJpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const checkJpeg = ocr.verifyFileType(realJpegHeader, 'image/jpeg');
  assert.equal(checkJpeg.valid, true);

  // Correct PDF magic header
  const realPdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const checkPdf = ocr.verifyFileType(realPdfHeader, 'application/pdf');
  assert.equal(checkPdf.valid, true);
});

test('pre-OCR rejects invalid file type via processBillImage directly', async () => {
  const textBuffer = Buffer.from('Plain text content');
  const result = await ocr.processBillImage(textBuffer, 'text/plain');

  assert.equal(result.isReceipt, false);
  assert.equal(result.errorCode, 'INVALID_FILE_TYPE');
  assert.equal(result.statusCode, 400);
});

test('respects configurable thresholds when overridden', () => {
  const customOcr = new OcrService(undefined, {
    minConfidence: 75,
    minTextLength: 30,
  });

  assert.equal(customOcr.config.minConfidence, 75);
  assert.equal(customOcr.config.minTextLength, 30);

  // A 60% confidence OCR should now be rejected as low confidence under 75% threshold
  const result = customOcr.validateRecognizedText(`ACME Cafe
TAX INVOICE
Invoice No: A12345
Date: 2025-11-15
Total: 500.00`, 60);

  assert.equal(result.isReceipt, false);
  assert.equal(result.errorCode, 'OCR_LOW_CONFIDENCE');
});
