import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');

function inquiryPage({ measurementEnabled = true } = {}) {
  const events = [];
  const requests = [];
  const pendingRequests = [];
  const element = () => {
    const listeners = new Map();
    const attributes = new Map();
    const children = new Map();
    const node = {
      hidden: false, open: false, disabled: false, dataset: {}, innerHTML: '', textContent: '',
      style: { setProperty() {} },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(callback);
      },
      dispatch(name, details = {}) {
        const event = { target: node, preventDefault() {}, ...details };
        return Promise.all((listeners.get(name) || []).map(callback => callback(event)));
      },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      removeAttribute(name) { attributes.delete(name); },
      querySelector(selector) { return children.get(selector) ?? null; },
      matches(selector) { return selector === '[data-mobile-inquiry]' && Object.hasOwn(node.dataset, 'mobileInquiry'); },
      closest() { return null; },
      getBoundingClientRect() { return { bottom: 72 }; },
      showModal() { node.open = true; },
      close() { node.open = false; void node.dispatch('close'); },
      focus() {}, reset() {},
      children,
    };
    return node;
  };
  const selectors = new Map([
    '.menu-toggle', '.nav', '#inquiry-dialog', '#photo-dialog', '#inquiry-form',
    '#inquiry-success', '#inquiry-error', '#dialog-title', '#dialog-description',
    '.success-close', '#gallery-dialog', '#gallery-image', '#gallery-status',
  ].map(selector => [selector, element()]));
  const form = selectors.get('#inquiry-form');
  const submit = element();
  form.children.set('[type="submit"]', submit);
  form.children.set('.inquiry-extra', element());
  form.valid = true;
  form.reportValidity = () => form.valid;
  form.values = { name: 'Test Lead', email: 'lead@example.com', venue: 'Test Venue', city: 'Miami', message: '', website: '' };
  selectors.get('#inquiry-success').hidden = true;
  for (const selector of ['#inquiry-dialog', '#photo-dialog', '#gallery-dialog']) {
    selectors.get(selector).children.set('.close-dialog', element());
  }
  selectors.get('#gallery-dialog').children.set('.gallery-previous', element());
  selectors.get('#gallery-dialog').children.set('.gallery-next', element());
  const partner = section => {
    const button = element();
    button.closest = selector => selector === 'section' ? { id: section } : null;
    return button;
  };
  const hero = partner('home');
  const copper = partner('copper-29');
  const sticky = partner('');
  sticky.dataset.mobileInquiry = '';
  const document = {
    documentElement: element(), fonts: { ready: Promise.resolve() },
    querySelector: selector => selectors.get(selector) ?? null,
    querySelectorAll: selector => selector === '[data-partner]' ? [hero, copper, sticky] :
      selector === 'dialog' ? ['#inquiry-dialog', '#photo-dialog', '#gallery-dialog'].map(id => selectors.get(id)) : [],
    addEventListener() {},
  };
  const window = {
    PrimeCaptureMeasurement: {
      track(name, properties) { if (measurementEnabled) events.push({ name, ...properties }); },
      status() { return { enabled: measurementEnabled }; },
    },
    addEventListener() {}, matchMedia() { return { matches: false, addEventListener() {} }; },
  };
  class FormData {
    constructor(currentForm) { this.entries = Object.entries(currentForm.values); }
    [Symbol.iterator]() { return this.entries[Symbol.iterator](); }
  }
  vm.runInNewContext(source, {
    window, document, crypto: { randomUUID }, FormData, AbortSignal, setTimeout,
    fetch(url, options) {
      requests.push({ url, ...options });
      return new Promise((resolve, reject) => pendingRequests.push({ resolve, reject }));
    },
  }, { filename: 'app.js' });
  return {
    form, submit, hero, copper, sticky, events, requests,
    dialog: selectors.get('#inquiry-dialog'), success: selectors.get('#inquiry-success'),
    completeRequest(response, index = pendingRequests.length - 1) { pendingRequests[index].resolve(response); },
    failRequest(error, index = pendingRequests.length - 1) { pendingRequests[index].reject(error); },
    setMeasurementEnabled(enabled) { measurementEnabled = enabled; },
  };
}

test('the sticky inquiry retains safe placement through opening, starting and accepted delivery', async () => {
  const page = inquiryPage();
  await page.sticky.dispatch('click');
  await page.form.dispatch('input', {target: {matches() { return false; }}});
  const submission = page.form.dispatch('submit');
  page.completeRequest({ok: true, json: async () => ({ok: true})});
  await submission;
  assert.deepEqual(page.events.map(event => [event.name, event.placement]), [
    ['cta_click', 'mobile_sticky'], ['inquiry_open', 'mobile_sticky'],
    ['inquiry_start', 'mobile_sticky'], ['inquiry_submit', 'mobile_sticky'], ['generate_lead', 'mobile_sticky']
  ]);
  assert.equal(page.requests.length, 1);
  assert.equal(page.success.hidden, false);
});

for (const accepted of [true, false]) {
  test(`pending inquiry keeps the submitted CTA attribution after another CTA opens (${accepted ? 'success' : 'failure'})`, async () => {
    const page = inquiryPage();
    await page.hero.dispatch('click');
    const submission = page.form.dispatch('submit');
    assert.equal(page.requests.length, 1);
    assert.equal(page.submit.disabled, true);
    await page.form.dispatch('submit');
    assert.equal(page.requests.length, 1, 'a second submit while sending must not create another request');
    page.dialog.close();
    await page.copper.dispatch('click');
    assert.equal(page.events.filter(event => event.name === 'inquiry_open').at(-1).placement, 'copper_story');
    page.completeRequest({ ok: accepted, json: async () => accepted ? { ok: true } : { error: 'Test delivery failure' } });
    await submission;
    const outcomes = page.events.filter(event => ['generate_lead', 'inquiry_error'].includes(event.name));
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].name, accepted ? 'generate_lead' : 'inquiry_error');
    assert.equal(outcomes[0].placement, 'hero', 'outcome must retain the placement that submitted the request');
    assert.equal(page.success.hidden, !accepted);
    assert.equal(page.submit.disabled, false);
  });
}

test('a continued draft keeps its first consented edit attribution while each opener records its actual location', async () => {
  const page = inquiryPage();
  await page.hero.dispatch('click');
  await page.form.dispatch('input', { target: { matches() { return false; } } });
  const originalValues = { ...page.form.values };
  page.dialog.close();
  await page.copper.dispatch('click');
  await page.form.dispatch('input', { target: { matches() { return false; } } });
  const submission = page.form.dispatch('submit');
  page.completeRequest({ ok: true, json: async () => ({ ok: true }) });
  await submission;
  assert.deepEqual(page.events.map(event => [event.name, event.placement]), [
    ['cta_click', 'hero'], ['inquiry_open', 'hero'], ['inquiry_start', 'hero'],
    ['cta_click', 'copper_story'], ['inquiry_open', 'copper_story'],
    ['inquiry_submit', 'hero'], ['generate_lead', 'hero'],
  ]);
  assert.deepEqual(page.form.values, originalValues, 'closing must retain the editable draft');
  assert.equal(JSON.stringify(page.events).includes('lead@example.com'), false);
  assert.equal(JSON.stringify(page.events).includes('Test Venue'), false);

  page.dialog.close();
  await page.copper.dispatch('click');
  await page.form.dispatch('input', { target: { matches() { return false; } } });
  assert.equal(page.events.filter(event => event.name === 'inquiry_start').at(-1).placement, 'copper_story', 'completion must release the previous draft origin');
});

test('a valid autofilled submission emits start then submit once without requiring an input event', async () => {
  const page = inquiryPage();
  await page.hero.dispatch('click');
  page.dialog.close();
  await page.copper.dispatch('click');
  const submission = page.form.dispatch('submit');
  await page.form.dispatch('submit');
  assert.deepEqual(page.events.filter(event => ['inquiry_start', 'inquiry_submit'].includes(event.name)).map(event => [event.name, event.placement]), [
    ['inquiry_start', 'copper_story'], ['inquiry_submit', 'copper_story'],
  ]);
  assert.equal(page.requests.length, 1);
  page.completeRequest({ ok: true, json: async () => ({ ok: true }) });
  await submission;
  assert.equal(page.events.filter(event => event.name === 'generate_lead').length, 1);
});

test('native invalid fields count once across microtask checkpoints and again after the next task without sending field details', async () => {
  const page = inquiryPage();
  await page.hero.dispatch('click');
  await Promise.all(['name', 'email', 'venue', 'city'].map(() => page.form.dispatch('invalid', {
    target: { matches() { return false; } },
  })));
  assert.deepEqual(page.events.filter(event => event.name === 'inquiry_error'), [
    { name: 'inquiry_error', placement: 'hero', error_type: 'validation' },
  ]);
  assert.equal(page.requests.length, 0);
  assert.equal(page.events.some(event => ['inquiry_start', 'inquiry_submit', 'generate_lead'].includes(event.name)), false);
  await page.form.dispatch('invalid', { target: { matches() { return false; } } });
  await Promise.resolve();
  await page.form.dispatch('invalid', { target: { matches() { return false; } } });
  assert.equal(page.events.filter(event => event.name === 'inquiry_error').length, 1, 'microtask checkpoints between invalid field callbacks must not multiply one attempt');
  await new Promise(resolve => setTimeout(resolve, 0));
  await page.form.dispatch('invalid', { target: { matches() { return false; } } });
  assert.equal(page.events.filter(event => event.name === 'inquiry_error').length, 2, 'a later attempt must remain visible');
  await new Promise(resolve => setTimeout(resolve, 0));
  await page.form.dispatch('invalid', { target: { matches(selector) { return selector === '[name="website"]'; } } });
  assert.equal(page.events.filter(event => event.name === 'inquiry_error').length, 2, 'the honeypot must never add a validation event');
});

test('invalid submission does not count a send attempt and native validation keeps the draft origin', async () => {
  const page = inquiryPage();
  await page.hero.dispatch('click');
  await page.form.dispatch('input', { target: { matches() { return false; } } });
  page.dialog.close();
  await page.copper.dispatch('click');
  page.form.valid = false;
  await page.form.dispatch('submit');
  await page.form.dispatch('invalid', { target: { matches() { return false; } } });
  assert.equal(page.requests.length, 0);
  assert.equal(page.events.some(event => event.name === 'inquiry_submit'), false);
  assert.equal(page.events.filter(event => event.name === 'inquiry_error').at(-1).placement, 'hero');
});

for (const [status, expected] of [[400, 'validation'], [422, 'validation'], [429, 'rate_limit'], [503, 'server'], [200, 'server']]) {
  test(`HTTP ${status} is classified as ${expected} without a lead`, async () => {
    const page = inquiryPage();
    await page.hero.dispatch('click');
    const submission = page.form.dispatch('submit');
    page.completeRequest({ ok: status === 200, status, json: async () => ({ error: 'Please try again.' }) });
    await submission;
    assert.deepEqual(page.events.filter(event => event.name === 'inquiry_error'), [
      { name: 'inquiry_error', placement: 'hero', error_type: expected },
    ]);
    assert.equal(page.events.some(event => event.name === 'generate_lead'), false);
    assert.equal(page.submit.disabled, false);
    assert.equal(page.success.hidden, true);
  });
}

for (const [name, expected] of [['TypeError', 'network'], ['TimeoutError', 'timeout'], ['AbortError', 'timeout']]) {
  test(`${name} preserves ${expected} classification and permits retry`, async () => {
    const page = inquiryPage();
    await page.hero.dispatch('click');
    const submission = page.form.dispatch('submit');
    page.failRequest(Object.assign(new Error('Test request failure'), { name }));
    await submission;
    assert.equal(page.events.filter(event => event.name === 'inquiry_error').at(-1).error_type, expected);
    assert.equal(page.events.some(event => event.name === 'generate_lead'), false);
    assert.equal(page.submit.disabled, false);
  });
}

test('retry sends one submit per actual request while retaining draft attribution and delivery identity', async () => {
  const page = inquiryPage();
  await page.hero.dispatch('click');
  await page.form.dispatch('input', { target: { matches() { return false; } } });
  const failed = page.form.dispatch('submit');
  page.completeRequest({ ok: false, status: 429, json: async () => ({ error: 'Please wait before retrying.' }) });
  await failed;
  page.dialog.close();
  await page.copper.dispatch('click');
  const retried = page.form.dispatch('submit');
  await page.form.dispatch('submit');
  page.completeRequest({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await retried;
  assert.equal(page.requests.length, 2);
  assert.equal(JSON.parse(page.requests[0].body).submissionId, JSON.parse(page.requests[1].body).submissionId, 'an unchanged retry must keep provider deduplication');
  assert.deepEqual(page.events.filter(event => ['inquiry_start', 'inquiry_submit', 'inquiry_error', 'generate_lead'].includes(event.name)).map(event => [event.name, event.placement]), [
    ['inquiry_start', 'hero'], ['inquiry_submit', 'hero'], ['inquiry_error', 'hero'],
    ['inquiry_submit', 'hero'], ['generate_lead', 'hero'],
  ]);
});

test('pre-consent edits and invalid attempts are not replayed or used as draft attribution', async () => {
  const page = inquiryPage({ measurementEnabled: false });
  await page.hero.dispatch('click');
  await page.form.dispatch('input', { target: { matches() { return false; } } });
  await page.form.dispatch('invalid', { target: { matches() { return false; } } });
  assert.equal(page.events.length, 0);
  page.dialog.close();
  await page.copper.dispatch('click');
  page.setMeasurementEnabled(true);
  assert.equal(page.events.length, 0, 'granting consent must not replay an earlier action');
  const submission = page.form.dispatch('submit');
  page.completeRequest({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await submission;
  assert.deepEqual(page.events.map(event => [event.name, event.placement]), [
    ['inquiry_start', 'copper_story'], ['inquiry_submit', 'copper_story'], ['generate_lead', 'copper_story'],
  ]);
});

test('an unmeasured inquiry still sends normally without emitting funnel events', async () => {
  const page = inquiryPage({ measurementEnabled: false });
  await page.sticky.dispatch('click');
  await page.form.dispatch('input', { target: { matches() { return false; } } });
  const submission = page.form.dispatch('submit');
  page.completeRequest({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await submission;
  assert.equal(page.requests.length, 1);
  assert.equal(page.events.length, 0);
  assert.equal(page.success.hidden, false);
});
