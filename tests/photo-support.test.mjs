import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createPhotoSupportDelivery, createPhotoSupportHandler, validatePhotoSupport } from '../photo-support.mjs';
import { createResendDelivery } from '../inquiries.mjs';

const origin = 'https://www.primecaptures.com';
const now = () => Date.parse('2026-10-23T14:00:00Z');
const support = {
  venue: 'Copper 29', visitDate: '2026-10-22', email: 'guest@example.com',
  message: 'I need help finding the digital photo from my visit.', website: '',
  submissionId: '4f00a845-7411-4a0d-ae8f-d43714f58d70'
};
const config = { apiKey: 'private-test-key', from: 'photo-help@example.com' };
async function request(handler, body = support, { headers = {}, method = 'POST', parsed = false, ip = '127.0.0.1' } = {}) {
  const req = parsed ? { body } : Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  req.method = method;
  req.headers = { origin, 'content-type': 'application/json', ...headers };
  req.socket = { remoteAddress: ip };
  const result = {};
  await handler(req, {
    writeHead(status, headers) { result.status = status; result.headers = headers; },
    end(body) { result.body = JSON.parse(body); }
  });
  return result;
}
function handler(deliver, options = {}) {
  return createPhotoSupportHandler({ origin: [origin, 'https://primecaptures.com'], now, deliver, ...options });
}

test('photo help trims its four required fields and does not require a name or purchase email', () => {
  const fields = validatePhotoSupport({
    ...support, venue: ' Copper 29 ', visitDate: ' 2026-10-22 ', email: ' guest@example.com ', message: '  Please reply here.\nMy purchase used another email.  '
  }, { now });
  assert.equal(fields.venue, support.venue);
  assert.equal(fields.visitDate, support.visitDate);
  assert.equal(fields.email, support.email);
  assert.equal(fields.message, 'Please reply here.\nMy purchase used another email.');
  assert.equal(fields.name, undefined);
  assert.equal(fields.website, undefined);
});

test('calendar dates reject rollover, missing zero padding, future dates, and dates before 1900', () => {
  for (const visitDate of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-2-01', '10/22/2026', '2026-10-24', '1899-12-31']) {
    assert.throws(() => validatePhotoSupport({ ...support, visitDate }, { now }), undefined, visitDate);
  }
  for (const visitDate of ['1900-01-01', '2000-02-29', '2024-02-29', '2026-10-23']) {
    assert.equal(validatePhotoSupport({ ...support, visitDate }, { now }).visitDate, visitDate);
  }
});

test('future-date validation follows New York midnight in daylight and standard time', () => {
  for (const [visitDate, before, after] of [
    ['2026-10-24', '2026-10-24T03:59:59Z', '2026-10-24T04:00:00Z'],
    ['2026-01-02', '2026-01-02T04:59:59Z', '2026-01-02T05:00:00Z']
  ]) {
    assert.throws(() => validatePhotoSupport({ ...support, visitDate }, { now: () => Date.parse(before) }));
    assert.equal(validatePhotoSupport({ ...support, visitDate }, { now: () => Date.parse(after) }).visitDate, visitDate);
  }
});

test('missing fields, invalid types, excessive lengths, controls, fake UUIDs, and honeypots never reach delivery', async () => {
  let calls = 0;
  const invalid = [null, [], 'text',
    ...Object.keys({ venue: 1, visitDate: 1, email: 1, message: 1 }).flatMap(key => [
      { ...support, [key]: undefined }, { ...support, [key]: 123 }, { ...support, [key]: '' }
    ]),
    ...[
      { venue: 'v'.repeat(151) }, { email: 'x'.repeat(190) + '@example.com' }, { message: 'x'.repeat(2001) },
      { email: 'guest@example.com\r\nBcc: outsider@example.com' }, { venue: '\nCopper 29' },
      { venue: 'Copper\u007f29' }, { message: 'Help\u0000please' }, { email: 'not-an-email' },
      { email: 'one@example.com,two@example.com' }, { submissionId: '-'.repeat(36) },
      { submissionId: '4f00a845-7411-4a0d-ae8f-d43714f58d7z' }, { submissionId: 123 },
      { website: 'https://spam.example' }, { website: ' ' }, { website: false }, { website: null }
    ].map(changes => ({ ...support, ...changes }))
  ];
  for (const body of invalid) {
    const result = await request(handler(async () => { calls++; }), body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(result.body.ok, undefined);
    assert.match(result.body.error, /venue, visit date, email address/);
  }
  assert.equal(calls, 0);
});

test('only confirms photo support after the email provider accepts it', async () => {
  let release, entered;
  const providerPending = new Promise(resolve => { release = resolve; });
  const providerStarted = new Promise(resolve => { entered = resolve; });
  const deliver = createPhotoSupportDelivery(config, async () => {
    entered();
    await providerPending;
    return { ok: true, json: async () => ({ id: 'accepted-support-id' }) };
  });
  let completed = false;
  const resultPending = request(handler(deliver)).then(result => { completed = true; return result; });
  await providerStarted;
  assert.equal(completed, false);
  release();
  const result = await resultPending;
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, reference: support.submissionId });
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
});

test('support emails go to the fixed owner inbox with guest reply-to and a separate stable retry key', async () => {
  const calls = [];
  const fetchEmail = async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, json: async () => ({ id: 'accepted-support-id' }) };
  };
  const fields = validatePhotoSupport({ ...support, to: 'outsider@example.com' }, { now });
  const deliver = createPhotoSupportDelivery({ ...config, to: 'outsider@example.com' }, fetchEmail);
  await deliver(fields); await deliver(fields);
  const email = JSON.parse(calls[0].body);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.deepEqual(email.to, ['contact@primecaptures.com']);
  assert.equal(email.reply_to, support.email);
  assert.equal(email.subject, 'Photo support — Copper 29');
  assert.match(email.text, /This is photo support, not a partnership inquiry\./);
  for (const value of [support.venue, support.visitDate, support.email, support.message, support.submissionId]) assert.ok(email.text.includes(value));
  assert.match(email.text, /Contact email: guest@example.com/);
  assert.equal(email.html, undefined);
  const firstKey = calls[0].headers['Idempotency-Key'];
  assert.match(firstKey, /^photo-support-[a-f0-9]{64}$/);
  assert.equal(firstKey, calls[1].headers['Idempotency-Key']);
  await deliver({ ...fields, message: 'A corrected support message.' });
  assert.notEqual(firstKey, calls[2].headers['Idempotency-Key']);
  await deliver({ ...fields, submissionId: '9f00a845-7411-4a0d-ae8f-d43714f58d70' });
  assert.notEqual(firstKey, calls[3].headers['Idempotency-Key']);
  await createResendDelivery({ ...config, to: 'contact@primecaptures.com' }, fetchEmail)(fields);
  assert.match(calls[4].headers['Idempotency-Key'], /^partnership-/);
  assert.notEqual(firstKey, calls[4].headers['Idempotency-Key']);
});

test('unconfigured, rejected, timed out, malformed, or unacknowledged deliveries never show false success', async () => {
  const failures = [
    createPhotoSupportDelivery({}, async () => assert.fail('unconfigured must not call provider')),
    ...[
      async () => { throw new Error('private provider failure'); },
      async () => ({ ok: false, json: async () => ({ id: 'rejected-id', message: 'private provider failure' }) }),
      async () => ({ ok: true, json: async () => { throw new Error('private malformed response'); } }),
      ...[{}, null, { id: '' }, { id: '   ' }, { id: 123 }].map(result => async () => ({ ok: true, json: async () => result }))
    ].map(fetchEmail => createPhotoSupportDelivery(config, fetchEmail))
  ];
  for (const deliver of failures) {
    const result = await request(handler(deliver));
    assert.equal(result.status, 503);
    assert.equal(result.body.ok, undefined);
    assert.match(result.body.error, /photo help request/);
    assert.ok(!JSON.stringify(result).includes('private'));
  }
});

test('both production origins accept hosted parsed bodies while malicious origins and oversized bodies are rejected', async () => {
  let calls = 0;
  const route = handler(async () => { calls++; });
  assert.equal((await request(route, support, { parsed: true })).status, 200);
  assert.equal((await request(route, support, { parsed: true, headers: { origin: 'https://primecaptures.com' } })).status, 200);
  for (const foreign of ['https://www.primecaptures.com.attacker.example', 'https://attacker.example', 'null', undefined]) {
    assert.equal((await request(route, support, { headers: { origin: foreign } })).status, 403);
  }
  assert.equal((await request(route, support, { method: 'GET' })).status, 405);
  assert.equal((await request(route, support, { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await request(route, '{')).status, 400);
  assert.equal((await request(route, 'x'.repeat(16385))).status, 413);
  assert.equal((await request(route, { ...support, message: 'x'.repeat(16385) }, { parsed: true })).status, 413);
  assert.equal(calls, 2);
});

test('photo support limits attempts per client and expires the limit after ten minutes', async () => {
  let elapsed = now();
  let calls = 0;
  const route = handler(async () => { calls++; }, { now: () => elapsed, trustProxy: true });
  const headers = { 'x-forwarded-for': '203.0.113.10, 192.0.2.1' };
  for (let i = 0; i < 6; i++) assert.equal((await request(route, support, { headers })).status, 200);
  assert.equal((await request(route, support, { headers })).status, 429);
  assert.equal(calls, 6);
  assert.equal((await request(route, support, { headers: { 'x-forwarded-for': '203.0.113.11' } })).status, 200);
  elapsed += 600001;
  assert.equal((await request(route, support, { headers })).status, 200);
  assert.equal(calls, 8);
});
