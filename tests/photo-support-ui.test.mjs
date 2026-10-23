import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/photo-support.js', import.meta.url), 'utf8');

function photoSupportPage() {
  const events = [];
  const requests = [];
  const timers = new Map();
  let nextTimer = 0;
  let focused;
  function element() {
    const listeners = new Map();
    const attributes = new Map();
    const node = {
      hidden: false, open: true, disabled: false, value: '', validityMessage: '',
      innerHTML: 'Send photo help request', textContent: '',
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(callback);
      },
      dispatch(name, details = {}) {
        const event = { target: node, preventDefault() {}, ...details };
        return Promise.all((listeners.get(name) || []).map(callback => callback(event)));
      },
      setCustomValidity(message) { node.validityMessage = message; },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      removeAttribute(name) { attributes.delete(name); },
      focus() { focused = node; },
    };
    return node;
  }
  const dialog = element();
  const form = element();
  const submit = element();
  const success = element();
  const error = element();
  const done = element();
  success.hidden = true;
  error.hidden = true;
  form.hidden = true;
  form.nativeValid = true;
  form.resetCount = 0;
  const fields = Object.fromEntries(['venue', 'visitDate', 'email', 'message', 'website'].map(name => {
    const field = element();
    field.name = name;
    return [name, field];
  }));
  Object.entries({ venue: 'Test Venue', visitDate: '2026-10-20', email: 'guest@example.com', message: 'Please help with my digital photo.', website: '' }).forEach(([name, value]) => { fields[name].value = value; });
  form.elements = { namedItem: name => fields[name] };
  form.querySelector = selector => selector === '[type="submit"]' ? submit : null;
  form.reportValidity = () => form.nativeValid && Object.values(fields).every(field => !field.validityMessage);
  form.reset = () => { form.resetCount++; Object.values(fields).forEach(field => { field.value = ''; }); };
  dialog.querySelector = selector => selector === '.photo-support-done' ? done : null;
  dialog.close = () => { dialog.open = false; return dialog.dispatch('close'); };
  dialog.showModal = () => { dialog.open = true; return dialog.dispatch('toggle'); };
  const nodes = { '#photo-dialog': dialog, '#photo-support-form': form, '#photo-support-success': success, '#photo-support-error': error };
  class FormData {
    constructor() { this.entries = Object.entries(fields).map(([name, field]) => [name, field.value]); }
    [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
  }
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-10-23T02:00:00Z'])); }
  }
  vm.runInNewContext(source, {
    document: { querySelector: selector => nodes[selector] ?? null },
    window: { PrimeCaptureMeasurement: { track: (...args) => events.push(args) } },
    crypto: { randomUUID }, FormData, AbortController, Intl, Date: TestDate,
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) {
      let resolve, reject;
      const result = new Promise((accept, fail) => { resolve = accept; reject = fail; });
      requests.push({ url, ...options, resolve, reject });
      return result;
    },
  }, { filename: 'photo-support.js' });
  return {
    dialog, form, fields, submit, success, error, done, requests, events, timers,
    get focused() { return focused; },
    respond(index, { ok = true, status = 200, body = { ok: true } } = {}) {
      requests[index].resolve({ ok, status, json: async () => body });
    },
  };
}

test('photo support validates empty fields, native email validity, and the Miami visit date before sending', async () => {
  const page = photoSupportPage();
  assert.equal(page.form.hidden, false, 'the form becomes available after its handlers initialize');
  assert.equal(page.fields.visitDate.max, '2026-10-22', 'date limit follows Miami instead of the UTC day');
  assert.equal(page.fields.visitDate.min, '1900-01-01');
  page.fields.venue.value = '   ';
  await page.form.dispatch('submit');
  assert.equal(page.requests.length, 0);
  assert.match(page.fields.venue.validityMessage, /complete/);
  page.fields.venue.value = 'Test Venue';
  page.fields.visitDate.value = '2026-10-23';
  await page.form.dispatch('submit');
  assert.equal(page.requests.length, 0);
  assert.match(page.fields.visitDate.validityMessage, /Miami/);
  page.fields.visitDate.value = '2026-02-30';
  await page.form.dispatch('submit');
  assert.equal(page.requests.length, 0, 'impossible dates cannot be submitted');
  page.fields.visitDate.value = '1899-12-31';
  await page.form.dispatch('submit');
  assert.equal(page.requests.length, 0, 'dates outside the supported range cannot be submitted');
  page.fields.visitDate.value = '2026-10-20';
  page.form.nativeValid = false;
  await page.form.dispatch('submit');
  assert.equal(page.requests.length, 0, 'browser email and required-field checks remain enforced');
  await page.form.dispatch('input', { target: page.fields.visitDate });
  assert.equal(page.fields.visitDate.validityMessage, '');
});

test('one support submission locks the button, confirms only accepted delivery, and does not emit lead analytics', async () => {
  const page = photoSupportPage();
  const pending = page.form.dispatch('submit');
  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].url, '/api/photo-support');
  assert.equal(page.submit.disabled, true);
  assert.equal(page.form.getAttribute('aria-busy'), 'true');
  assert.equal(page.success.hidden, true);
  await page.form.dispatch('submit');
  assert.equal(page.requests.length, 1, 'a duplicate submit cannot create a duplicate email');
  page.respond(0);
  await pending;
  assert.equal(page.success.hidden, false);
  assert.equal(page.form.hidden, true);
  assert.equal(page.focused, page.success);
  assert.equal(page.submit.disabled, false);
  assert.equal(page.form.getAttribute('aria-busy'), null);
  assert.equal(page.timers.size, 0);
  assert.deepEqual(page.events, [], 'support submissions must never become partnership leads');
});

test('a failed request retains details and its idempotency ID on retry; an edited request gets a new ID', async () => {
  const page = photoSupportPage();
  const first = page.form.dispatch('submit');
  const originalId = JSON.parse(page.requests[0].body).submissionId;
  page.respond(0, { ok: false, status: 503, body: { error: 'Temporarily unavailable' } });
  await first;
  assert.equal(page.error.hidden, false);
  assert.equal(page.focused, page.error);
  assert.equal(page.fields.message.value, 'Please help with my digital photo.');
  assert.equal(page.form.resetCount, 0);
  const retry = page.form.dispatch('submit');
  assert.equal(JSON.parse(page.requests[1].body).submissionId, originalId);
  page.respond(1, { ok: true, body: { ok: false } });
  await retry;
  assert.equal(page.success.hidden, true, 'an HTTP 200 without confirmed delivery is still a failure');
  page.fields.message.value = 'I need help correcting my purchase email.';
  const edited = page.form.dispatch('submit');
  assert.notEqual(JSON.parse(page.requests[2].body).submissionId, originalId);
  page.respond(2);
  await edited;
  assert.deepEqual(page.events, []);
});

test('closing and reopening a pending support request preserves a later failure and its entered fields', async () => {
  const page = photoSupportPage();
  const pending = page.form.dispatch('submit');
  await page.dialog.close();
  page.requests[0].reject(new TypeError('Network unavailable'));
  await pending;
  assert.equal(page.error.hidden, false);
  assert.equal(page.form.resetCount, 0);
  assert.equal(page.focused, undefined, 'a closed dialog must not steal focus from the page');
  await page.dialog.showModal();
  assert.equal(page.focused, page.error);
  assert.equal(page.fields.email.value, 'guest@example.com');
  assert.equal(page.form.hidden, false);
});

test('completed support requests reset only when dismissed and reopen as a clean form', async () => {
  const page = photoSupportPage();
  const pending = page.form.dispatch('submit');
  const previousId = JSON.parse(page.requests[0].body).submissionId;
  page.respond(0);
  await pending;
  assert.equal(page.form.resetCount, 0);
  await page.form.dispatch('submit');
  assert.equal(page.requests.length, 1, 'a completed form must not resubmit before dismissal');
  await page.done.dispatch('click');
  assert.equal(page.form.resetCount, 1);
  assert.equal(page.form.hidden, false);
  assert.equal(page.success.hidden, true);
  assert.equal(page.fields.email.value, '');
  await page.dialog.showModal();
  Object.entries({ venue: 'Another Venue', visitDate: '2026-10-21', email: 'another@example.com', message: 'A new request.' }).forEach(([name, value]) => { page.fields[name].value = value; });
  const another = page.form.dispatch('submit');
  assert.notEqual(JSON.parse(page.requests[1].body).submissionId, previousId);
  page.respond(1);
  await another;
});

test('a support timeout keeps the details and gives an honest unconfirmed-delivery error', async () => {
  const page = photoSupportPage();
  const pending = page.form.dispatch('submit');
  [...page.timers.values()][0]();
  assert.equal(page.requests[0].signal.aborted, true);
  page.requests[0].reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
  await pending;
  assert.match(page.error.textContent, /couldn’t confirm/);
  assert.equal(page.fields.venue.value, 'Test Venue');
  assert.equal(page.success.hidden, true);
  assert.equal(page.submit.disabled, false);
  assert.deepEqual(page.events, []);
});
