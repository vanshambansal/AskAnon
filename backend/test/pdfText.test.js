import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.REDIS_URL = '';
process.env.GEMINI_API_KEY = 'fixture';
const { recoverScannedPages } = await import('../src/utils/pdfTextService.js');

test('native text requires no OCR; excessive scanned pages are bounded before rendering', async () => {
  const parser = { getScreenshot: () => { throw new Error('must not render'); } };
  const pages = [{ text: 'Readable academic material from the original text layer.', page_number: 1 }];
  assert.deepEqual(await recoverScannedPages(parser, pages), pages);
  await assert.rejects(recoverScannedPages(parser, Array.from({ length: 13 }, (_, i) => ({ text: '', page_number: i + 1 }))), /more than 12/);
});

test('scanned text keeps page citations, caches successful transcription and sends media outside generation config', async () => {
  let calls = 0, body;
  globalThis.fetch = async (url, config) => {
    calls++; body = JSON.parse(config.body);
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Atomicity commits or rolls back a transaction as one unit.' }] } }] }) };
  };
  const parser = { getScreenshot: async () => ({ pages: [{ data: Buffer.from('unique-ocr-unit-fixture') }] }) };
  const pages = [{ text: '', page_number: 4 }];
  const result = await recoverScannedPages(parser, pages);
  await recoverScannedPages(parser, pages);
  assert.equal(result[0].page_number, 4);
  assert.match(result[0].text, /Atomicity/);
  assert.equal(calls, 1);
  assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'image/png');
  assert.equal(body.generationConfig.mediaParts, undefined);
});

test('unreadable pages stay empty; provider failure is not fabricated as readable text', async () => {
  const parser = { getScreenshot: async () => ({ pages: [{ data: Buffer.from('blank-ocr-fixture') }] }) };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '[NO_TEXT]' }] } }] }) });
  assert.equal((await recoverScannedPages(parser, [{ text: '', page_number: 1 }]))[0].text, '');
  globalThis.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(recoverScannedPages({ getScreenshot: async () => ({ pages: [{ data: Buffer.from('failed-ocr-fixture') }] }) }, [{ text: '', page_number: 2 }]));
});
