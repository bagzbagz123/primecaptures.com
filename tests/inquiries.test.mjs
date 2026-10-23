import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createInquiryHandler, createResendDelivery, validateInquiry } from '../inquiries.mjs';

const lead = { name: 'Test Lead', email: 'lead@example.com', venue: 'Example Venue', city: 'Miami', message: 'A partnership question.', website: '', submissionId: '4f00a845-7411-4a0d-ae8f-d43714f58d70' };
const origin = 'http://127.0.0.1:4174';
async function request(handler, body = lead, headers = {}, method = 'POST') {
  const req = Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  req.method = method; req.headers = { origin, 'content-type': 'application/json', ...headers }; req.socket = { remoteAddress: '127.0.0.1' };
  const result = {};
  await handler(req, { writeHead(status) { result.status = status; }, end(body) { result.body = JSON.parse(body); } });
  return result;
}
test('only confirms success after delivery accepts the lead', async () => {
  let received;
  const result = await request(createInquiryHandler({ origin, deliver: async f => { received = f; return 'email-id'; } }));
  assert.equal(result.status, 200); assert.equal(result.body.ok, true); assert.equal(received.email, lead.email);
});
test('provider rejection returns retry error without exposing provider secrets', async () => {
  const result = await request(createInquiryHandler({ origin, deliver: async () => { throw new Error('secret provider detail'); } }));
  assert.equal(result.status, 503); assert.equal(result.body.ok, undefined); assert.ok(!JSON.stringify(result).includes('secret'));
});
test('hosting adapter accepts parsed bodies only from either production origin', async () => {
  let received;
  const handler = createInquiryHandler({ origin: ['https://primecaptures.com', 'https://www.primecaptures.com'], deliver: async fields => { received = fields; } });
  async function hosted(body, origin) {
    const req = { body, method: 'POST', headers: { origin, 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.1' } };
    const result = {};
    await handler(req, { writeHead(status) { result.status = status; }, end(body) { result.body = JSON.parse(body); } });
    return result;
  }
  assert.equal((await hosted(lead, 'https://primecaptures.com')).status, 200);
  assert.equal(received.email, lead.email);
  assert.equal((await hosted(lead, 'https://www.primecaptures.com')).status, 200);
  assert.equal((await hosted(lead, 'https://untrusted.example')).status, 403);
  assert.equal((await hosted({ ...lead, message: 'x'.repeat(17000) }, 'https://primecaptures.com')).status, 413);
});
test('bad email, missing fields, header injection, and honeypot never reach delivery', async () => {
  let calls = 0;
  const handler = createInquiryHandler({ origin, deliver: async () => { calls++; } });
  for (const changed of [{ email: 'bad' }, { name: '' }, { venue: 'Venue\r\nBcc: bad@example.com' }, { website: 'spam' }]) {
    assert.equal((await request(handler, { ...lead, ...changed })).status, 400);
  }
  assert.equal(calls, 0);
});
test('rejects foreign origins, incorrect content type, GET, invalid JSON, and oversized bodies', async () => {
  const handler = createInquiryHandler({ origin, deliver: async () => assert.fail('must not deliver') });
  assert.equal((await request(handler, lead, { origin: 'https://other.example' })).status, 403);
  assert.equal((await request(handler, lead, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await request(handler, lead, {}, 'GET')).status, 405);
  assert.equal((await request(handler, '{')).status, 400);
  assert.equal((await request(handler, 'a'.repeat(17000))).status, 413);
});
test('limits repeated attempts and allows requests again after cooldown', async () => {
  let time = 0;
  const handler = createInquiryHandler({ origin, now: () => time, deliver: async () => 'id' });
  for (let i = 0; i < 6; i++) assert.equal((await request(handler)).status, 200);
  assert.equal((await request(handler)).status, 429);
  time = 600001; assert.equal((await request(handler)).status, 200);
});
test('Resend uses fixed recipient, lead reply-to, plain text, and stable retry key', async () => {
  const calls = [];
  const send = createResendDelivery({ apiKey: 'test-key', from: 'test@example.com', to: 'contact@primecaptures.com' }, async (url, options) => {
    calls.push({ url, ...options }); return { ok: true, json: async () => ({ id: 'accepted-id' }) };
  });
  const data = validateInquiry(lead);
  await send(data); await send(data);
  const email = JSON.parse(calls[0].body);
  assert.deepEqual(email.to, ['contact@primecaptures.com']); assert.equal(email.reply_to, lead.email);
  assert.equal(email.html, undefined); assert.ok(email.text.includes(lead.message));
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  await send({ ...data, message: 'Changed message' });
  assert.notEqual(calls[0].headers['Idempotency-Key'], calls[2].headers['Idempotency-Key']);
});
test('unconfigured service, timeout, or missing acceptance ID cannot return success', async () => {
  await assert.rejects(createResendDelivery({})(lead));
  for (const adapter of [async () => { throw new Error('timeout'); }, async () => ({ ok: true, json: async () => ({}) })]) {
    await assert.rejects(createResendDelivery({ apiKey: 'test', from: 'test@example.com', to: 'contact@primecaptures.com' }, adapter)(lead));
  }
});
