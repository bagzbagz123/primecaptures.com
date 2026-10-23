import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createInquiryHandler, createResendDelivery, validateInquiry } from '../inquiries.mjs';
import { createInquiryReceipt, createPartnershipDelivery } from '../inquiry-receipt.mjs';

const origin = 'http://127.0.0.1:4174';
const lead = {
  name: 'PRIVATE visitor name', email: 'visitor@example.com', venue: 'PRIVATE venue', city: 'PRIVATE city',
  message: 'PRIVATE message <script>alert("unsafe")</script>', website: '',
  submissionId: '4f00a845-7411-4a0d-ae8f-d43714f58d70'
};
const config = { apiKey: 'private-test-key', from: 'Prime Capture <website@primecaptures.com>', to: 'contact@primecaptures.com' };
const accepted = id => ({ ok: true, json: async () => ({ id }) });

function mockProvider(responses = [accepted('owner-id'), accepted('receipt-id')]) {
  const calls = [];
  const send = async (url, options) => {
    calls.push({ url, ...options, email: JSON.parse(options.body) });
    const response = responses[calls.length - 1];
    if (response instanceof Error) throw response;
    if (typeof response === 'function') return response(calls.at(-1));
    assert.ok(response, 'Unexpected additional provider request');
    return response;
  };
  return { calls, send };
}

async function request(deliver, body = lead) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.headers = { origin, 'content-type': 'application/json' };
  req.socket = { remoteAddress: '127.0.0.1' };
  const result = {};
  await createInquiryHandler({ origin, deliver })(req, {
    writeHead(status) { result.status = status; },
    end(body) { result.body = JSON.parse(body); }
  });
  return result;
}

test('receipt explains the next conversation and direct reply in plain text and HTML', () => {
  const receipt = createInquiryReceipt(lead.submissionId);
  assert.equal(typeof receipt.subject, 'string');
  assert.ok(receipt.subject.length > 0 && receipt.subject.length < 150);
  for (const content of [receipt.text, receipt.html]) {
    assert.match(content, /Prime\s*Capture/i);
    assert.match(content, /receiv|thank/i);
    assert.match(content, /venue/i);
    assert.match(content, /days|schedule/i);
    assert.match(content, /setup|station/i);
    assert.match(content, /automatic|automated/i);
    assert.ok(content.includes('contact@primecaptures.com'));
    assert.ok(content.includes(lead.submissionId));
    assert.doesNotMatch(content, /within\s+\d+|\d+\s*(?:hours?|business days?)|guarantee/i);
  }
  assert.match(receipt.html, /mailto:contact@primecaptures\.com/);
  const other = createInquiryReceipt('bfa82455-ea44-4aaa-8fb2-c442ef1cbbad');
  assert.equal(receipt.subject, other.subject, 'User input must not influence the receipt subject');
});

test('only canonical references can be interpolated into a receipt', () => {
  for (const reference of ['', undefined, '<img src=x onerror=alert(1)>', 'a'.repeat(36), '4f00a8457411-4a0d-ae8f-d43714f58d70', `${lead.submissionId}\r\nBcc: extra@example.com`]) {
    assert.throws(() => createInquiryReceipt(reference));
  }
});

test('owner is accepted first; visitor receipt has fixed reply routing and no inquiry content', async () => {
  const provider = mockProvider();
  const result = await createPartnershipDelivery(config, provider.send)(validateInquiry(lead));
  assert.equal(result, 'owner-id');
  assert.equal(provider.calls.length, 2);
  const [owner, receipt] = provider.calls;
  assert.equal(owner.url, 'https://api.resend.com/emails');
  assert.equal(receipt.url, owner.url);
  assert.deepEqual(owner.email.to, ['contact@primecaptures.com']);
  assert.equal(owner.email.reply_to, lead.email);
  assert.ok(owner.email.text.includes(lead.message));
  assert.deepEqual(receipt.email.to, [lead.email]);
  assert.equal(receipt.email.from, config.from);
  assert.equal(receipt.email.reply_to, 'contact@primecaptures.com');
  assert.equal(receipt.headers.Authorization, `Bearer ${config.apiKey}`);
  assert.ok(receipt.signal instanceof AbortSignal);
  assert.equal(receipt.signal.aborted, false);
  for (const privateValue of [lead.name, lead.venue, lead.city, lead.message, config.apiKey]) {
    assert.ok(!`${receipt.email.subject}\n${receipt.email.text}\n${receipt.email.html}`.includes(privateValue));
  }
  assert.doesNotMatch(receipt.email.html, /<script|onerror\s*=|javascript:/i);
  assert.ok(receipt.email.text.includes(lead.submissionId));
});

test('receipt completion is awaited so serverless completion cannot drop the send', async () => {
  let finishReceipt;
  let reachedReceipt;
  const receiptStarted = new Promise(resolve => { reachedReceipt = resolve; });
  const provider = mockProvider([accepted('owner-id'), () => {
    reachedReceipt();
    return new Promise(resolve => { finishReceipt = () => resolve(accepted('receipt-id')); });
  }]);
  let settled = false;
  const result = createPartnershipDelivery(config, provider.send)(validateInquiry(lead)).then(id => { settled = true; return id; });
  await receiptStarted;
  assert.equal(settled, false);
  finishReceipt();
  assert.equal(await result, 'owner-id');
});

test('receipt retries use a separate stable key while new references, recipients, and senders get distinct keys', async () => {
  const data = validateInquiry(lead);
  async function keys(fields, settings = config) {
    const provider = mockProvider();
    await createPartnershipDelivery(settings, provider.send)(fields);
    return provider.calls.map(call => call.headers['Idempotency-Key']);
  }
  const first = await keys(data);
  assert.match(first[1], /^partnership-receipt-v1-[a-f0-9]{64}$/);
  assert.notEqual(first[0], first[1]);
  assert.deepEqual(await keys(data), first);
  assert.equal((await keys({ ...data, name: 'Changed name', message: 'Changed message' }))[1], first[1]);
  assert.notEqual((await keys({ ...data, submissionId: 'bfa82455-ea44-4aaa-8fb2-c442ef1cbbad' }))[1], first[1]);
  assert.notEqual((await keys({ ...data, email: 'another@example.com' }))[1], first[1]);
  assert.notEqual((await keys(data, { ...config, from: 'Prime Capture <other@primecaptures.com>' }))[1], first[1]);
  const original = mockProvider([accepted('owner-id')]);
  await createResendDelivery(config, original.send)(data);
  assert.equal(first[0], original.calls[0].headers['Idempotency-Key'], 'Adding a receipt must preserve the existing owner retry key');
});

test('owner failure prevents a visitor confirmation and still returns the existing retry response', async () => {
  for (const failure of [new Error('PRIVATE provider owner failure'), { ok: false, json: async () => ({ message: 'PRIVATE provider rejection' }) }, accepted('')]) {
    const provider = mockProvider([failure]);
    const warnings = [];
    const result = await request(createPartnershipDelivery(config, provider.send, (...args) => warnings.push(args)));
    assert.equal(result.status, 503);
    assert.equal(result.body.ok, undefined);
    assert.equal(provider.calls.length, 1);
    assert.equal(warnings.length, 0);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|provider rejection/);
  }
});

test('receipt rejection, invalid response, and timeout preserve the accepted lead without extra sends or private logs', async () => {
  const timeout = new Error(`PRIVATE timeout ${lead.email}`);
  timeout.name = 'TimeoutError';
  const failures = [
    { ok: false, status: 400, json: async () => ({ message: `PRIVATE provider rejected ${lead.email}` }) },
    { ok: true, json: async () => { throw new Error('PRIVATE JSON failure'); } },
    { ok: true, json: async () => null },
    accepted(''),
    accepted(' \t\n '),
    timeout
  ];
  for (const failure of failures) {
    const provider = mockProvider([accepted('owner-id'), failure]);
    const warnings = [];
    const result = await request(createPartnershipDelivery(config, provider.send, (...args) => warnings.push(args)));
    assert.deepEqual(result, { status: 200, body: { ok: true, reference: lead.submissionId } });
    assert.equal(provider.calls.length, 2, 'A failed receipt must never resend an already accepted owner notification');
    assert.equal(warnings.length, 1);
    const logged = JSON.stringify(warnings);
    assert.ok(logged.length > 0 && logged.length < 300);
    for (const privateValue of [lead.email, lead.name, lead.venue, lead.city, lead.message, lead.submissionId, config.apiKey, 'PRIVATE']) {
      assert.ok(!logged.includes(privateValue), 'Receipt diagnostics must not contain inquiry details or raw provider errors');
    }
    assert.doesNotMatch(JSON.stringify(result), /receipt|PRIVATE/);
  }
});

test('a diagnostics failure cannot turn an accepted lead into a client retry', async () => {
  const provider = mockProvider([accepted('owner-id'), new Error('receipt failed')]);
  const result = await request(createPartnershipDelivery(config, provider.send, () => { throw new Error('logging failed'); }));
  assert.equal(result.status, 200);
  assert.equal(provider.calls.length, 2);
});

test('an asynchronous diagnostics rejection is absorbed after an accepted lead', async () => {
  const provider = mockProvider([accepted('owner-id'), new Error('receipt failed')]);
  let diagnosticsCalls = 0;
  const result = await request(createPartnershipDelivery(config, provider.send, async () => {
    diagnosticsCalls++;
    throw new Error('PRIVATE asynchronous diagnostics failure');
  }));
  // Let rejected-promise diagnostics run before the test finishes. The test
  // runner will fail an unhandled rejection even if form delivery returned 200.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(result.status, 200);
  assert.equal(diagnosticsCalls, 1);
  assert.equal(provider.calls.length, 2);
});

test('address lists, header syntax, malformed references, and other invalid submissions never send either message', async () => {
  const invalid = [
    { email: 'first@example.com,second@example.com' },
    { email: 'first@example.com;second@example.com' },
    { email: 'Name:first@example.com' },
    { email: '"visitor"@example.com' },
    { email: 'visitor\\name@example.com' },
    { email: 'visitor\r\nBcc:other@example.com' },
    { submissionId: 'a'.repeat(36) },
    { submissionId: '4f00a8457411-4a0d-ae8f-d43714f58d70' },
    { website: 'honeypot' },
    { name: '' }
  ];
  const provider = mockProvider([]);
  for (const change of invalid) {
    const result = await request(createPartnershipDelivery(config, provider.send), { ...lead, ...change });
    assert.equal(result.status, 400, `Expected rejection for ${JSON.stringify(change)}`);
  }
  assert.equal(provider.calls.length, 0);
});
