import assert from 'node:assert/strict';
import { test } from 'node:test';
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
  assert.match(result.error || '', /too blurry/i);
});

test('rejects an incomplete bill without an amount', () => {
  const result = ocr.validateRecognizedText('ACME Cafe\nTAX INVOICE\nDate: 2025-11-15', 90);

  assert.equal(result.isReceipt, false);
  assert.equal(result.quality, 'incomplete');
});
