import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/measurement.js', import.meta.url), 'utf8');
const preferenceKey = 'primecapture.analytics-choice.v1';

function browser({
  gaId = 'G-PRIMETEST1', hostname = 'www.primecaptures.com',
  search = '', hash = '', referrer = '', stored = new Map(), storageThrows = false,
  doNotTrack = null, globalPrivacyControl = false,
} = {}) {
  const elements = new Map();
  const scripts = [];
  const cookieWrites = [];
  const storageWrites = [];
  const listeners = new Map();
  const makeElement = (tagName = 'div') => ({
    tagName: tagName.toUpperCase(), hidden: false, open: false, dataset: {},
    textContent: '', style: {}, children: [], attributes: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(type, callback) { this.listeners ??= {}; this.listeners[type] = callback; },
    querySelector(selector) { return getElement(selector); },
    querySelectorAll() { return []; },
    appendChild(child) { this.children.push(child); if (child.tagName === 'SCRIPT') scripts.push(child); return child; },
    append(...children) { children.forEach(child => this.appendChild(child)); },
    showModal() { this.open = true; }, close() { this.open = false; }, focus() {}, remove() {},
  });
  const getElement = selector => {
    if (!elements.has(selector)) elements.set(selector, makeElement());
    return elements.get(selector);
  };
  getElement('#measurement-script').dataset.gaId = gaId;
  const document = {
    title: 'Prime Capture | Restaurant Photography', referrer,
    head: makeElement('head'), body: makeElement('body'),
    documentElement: makeElement('html'),
    createElement: makeElement,
    querySelector: getElement,
    querySelectorAll() { return []; },
    getElementById(id) { return getElement(`#${id}`); },
    addEventListener(type, callback) { listeners.set(type, callback); },
  };
  Object.defineProperty(document, 'cookie', {
    get() { return '_ga=analytics-id; _ga_PRIMETEST1=session-id; session=keep-me'; },
    set(value) { cookieWrites.push(value); },
  });
  const localStorage = {
    getItem(key) { if (storageThrows) throw Error('storage blocked'); return stored.get(key) ?? null; },
    setItem(key, value) { if (storageThrows) throw Error('storage blocked'); storageWrites.push({ key, value }); stored.set(key, String(value)); },
    removeItem(key) { if (storageThrows) throw Error('storage blocked'); stored.delete(key); },
  };
  const window = {
    document, localStorage, navigator: { doNotTrack, globalPrivacyControl },
    location: { hostname, host: hostname, protocol: 'https:', pathname: '/', search, hash,
      href: `https://${hostname}/${search}${hash}` },
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener() {}, setTimeout, clearTimeout,
  };
  window.window = window;
  const context = vm.createContext({ window, document, localStorage,
    location: window.location, navigator: window.navigator, URL, URLSearchParams,
    setTimeout, clearTimeout, console });
  vm.runInContext(source, context, { filename: 'measurement.js' });
  const calls = () => Array.from(window.dataLayer ?? [], value => Array.from(value));
  const receiveStorage = (newValue, { key = preferenceKey, storageArea = localStorage } = {}) => {
    if (storageArea === localStorage) {
      if (key === null) stored.clear();
      else if (newValue === null) stored.delete(key);
      else stored.set(key, newValue);
    }
    listeners.get('storage')?.({ key, newValue, storageArea });
  };
  return { window, document, scripts, stored, cookieWrites, storageWrites, receiveStorage, api: window.PrimeCaptureMeasurement, calls,
    events: () => calls().filter(call => call[0] === 'event') };
}

test('measurement stays off until an explicit opt-in and does not replay pre-consent events', () => {
  const page = browser();
  assert.equal(page.api.status().enabled, false);
  assert.equal(page.scripts.length, 0);
  assert.equal(page.calls().length, 0);
  page.api.track('inquiry_start', { placement: 'hero' });
  page.api.track('inquiry_submit', { placement: 'hero' });
  page.api.track('inquiry_error', { placement: 'hero', error_type: 'validation' });
  assert.equal(page.calls().length, 0);
  page.api.setConsent('granted');
  assert.equal(page.api.status().enabled, true);
  assert.equal(page.scripts.length, 1);
  assert.deepEqual(page.events().map(event => event[1]), ['page_view']);
  assert.match(page.scripts[0].src, /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-PRIMETEST1$/);
});

test('only a valid measurement ID on an exact production hostname can load Google', () => {
  for (const gaId of ['', 'not-an-id', 'G-ABC', 'G-' + 'A'.repeat(21), 'G-test-lowercase', 'G-ABC";alert(1)', 'G-ABC&x=1']) {
    const page = browser({ gaId });
    page.api.setConsent('granted');
    assert.equal(page.api.status().configured, false, gaId);
    assert.equal(page.api.status().enabled, false, gaId);
    assert.equal(page.scripts.length, 0, gaId);
    assert.equal(page.events().length, 0, gaId);
  }
  for (const hostname of ['localhost', '127.0.0.1', 'primecaptures.vercel.app', 'primecaptures.com.evil.test']) {
    const page = browser({ hostname });
    page.api.setConsent('granted');
    page.api.track('inquiry_submit', { placement: 'hero' });
    page.api.track('inquiry_error', { placement: 'hero', error_type: 'validation' });
    assert.equal(page.api.status().enabled, false, hostname);
    assert.equal(page.scripts.length, 0, hostname);
    assert.equal(page.events().length, 0, hostname);
  }
  for (const hostname of ['primecaptures.com', 'www.primecaptures.com']) {
    const page = browser({ hostname });
    page.api.setConsent('granted');
    assert.equal(page.api.status().configured, true);
    assert.equal(page.api.status().enabled, true);
    assert.equal(page.scripts.length, 1);
  }
});

test('approved events keep only safe properties and never expose form values, URLs, or arbitrary events', () => {
  const secret = 'private-person@example.com';
  const page = browser({ search: `?email=${secret}&utm_source=${secret}`, hash: `#${secret}`, referrer: `https://other.test/?email=${secret}` });
  page.api.setConsent('granted');
  for (const event of ['cta_click', 'inquiry_open', 'inquiry_start', 'inquiry_submit', 'generate_lead', 'inquiry_error', 'contact_click']) {
    page.api.track(event, { placement: 'hero', channel: 'email', error_type: 'network',
      name: secret, email: secret, venue: secret, message: secret, arbitrary: secret,
      page_location: secret, page_referrer: secret });
  }
  page.api.track(`unknown_${secret}`, { placement: 'hero' });
  page.api.track('cta_click', { placement: 'copper_story', venue: secret, message: secret });
  page.api.track('cta_click', { placement: secret, channel: secret, error_type: secret });
  assert.equal(page.events().filter(event => event[1] === 'generate_lead').length, 1);
  assert.equal(page.events().some(event => event[1].startsWith('unknown_')), false);
  assert.equal(JSON.stringify(page.calls()).includes(secret), false);
  for (const [, , properties] of page.events()) {
    assert.equal(properties.page_location, 'https://www.primecaptures.com/');
    for (const field of ['name', 'email', 'venue', 'message', 'arbitrary']) assert.equal(properties[field], undefined);
  }
  const safeEvent = page.events().find(event => event[1] === 'cta_click');
  assert.equal(safeEvent[2].placement, 'hero');
  assert.equal(safeEvent[2].channel, 'email');
  assert.equal(safeEvent[2].error_type, 'network');
  const storyEvent = page.events().find(event => event[1] === 'cta_click' && event[2].placement === 'copper_story');
  assert.ok(storyEvent, 'Copper story attribution is allowed without passing venue or form content');
});

test('only an explicit small campaign allowlist is retained', () => {
  const page = browser({ search: '?utm_source=instagram&utm_medium=social&utm_campaign=profile_link&utm_content=private-person@example.com' });
  page.api.setConsent('granted');
  const payload = JSON.stringify(page.calls());
  assert.ok(payload.includes('instagram'));
  assert.ok(payload.includes('social'));
  assert.ok(payload.includes('profile_link'));
  assert.ok(!payload.includes('private-person@example.com'));
});

test('sticky mobile attribution stays consent gated and never includes inquiry details', () => {
  const page = browser();
  page.api.track('cta_click', {placement: 'mobile_sticky'});
  assert.equal(page.events().length, 0);
  page.api.setConsent('granted');
  for (const name of ['cta_click', 'inquiry_open', 'inquiry_start', 'inquiry_submit', 'generate_lead']) {
    page.api.track(name, {placement: 'mobile_sticky', email: 'private@example.test', venue: 'Private venue'});
  }
  const stickyEvents = page.events().filter(event => event[2].placement === 'mobile_sticky');
  assert.deepEqual(stickyEvents.map(event => event[1]), ['cta_click', 'inquiry_open', 'inquiry_start', 'inquiry_submit', 'generate_lead']);
  assert.equal(JSON.stringify(page.calls()).includes('private@example.test'), false);
  assert.equal(JSON.stringify(page.calls()).includes('Private venue'), false);
  page.api.setConsent('denied');
  page.api.track('cta_click', {placement: 'mobile_sticky'});
  assert.equal(page.events().filter(event => event[2].placement === 'mobile_sticky').length, 5);
});

test('new submission diagnostics accept only enum error labels and remain consent gated', () => {
  const page = browser();
  page.api.track('inquiry_submit', { placement: 'hero' });
  page.api.track('inquiry_error', { placement: 'hero', error_type: 'rate_limit' });
  assert.equal(page.events().length, 0);
  page.api.setConsent('granted');
  for (const error_type of ['validation', 'rate_limit', 'server', 'network', 'timeout']) {
    page.api.track('inquiry_error', { placement: 'hero', error_type,
      field: 'email', value: 'private@example.test', submissionId: 'private-reference' });
  }
  assert.deepEqual(page.events().filter(event => event[1] === 'inquiry_error').map(event => event[2].error_type), [
    'validation', 'rate_limit', 'server', 'network', 'timeout',
  ]);
  page.api.track('inquiry_error', { placement: 'hero', error_type: 'private@example.test' });
  assert.equal(page.events().at(-1)[2].error_type, undefined);
  assert.equal(JSON.stringify(page.calls()).includes('private@example.test'), false);
  assert.equal(JSON.stringify(page.calls()).includes('private-reference'), false);
  for (const event of page.events()) assert.equal(event[2].field, undefined);
  page.api.setConsent('denied');
  const count = page.events().length;
  page.api.track('inquiry_submit', { placement: 'hero' });
  page.api.track('inquiry_error', { placement: 'hero', error_type: 'validation' });
  assert.equal(page.events().length, count);
});

test('declining and revoking consent stop events, including after a later page load', () => {
  const declined = browser();
  declined.api.setConsent('denied');
  declined.api.track('cta_click', { placement: 'hero' });
  assert.equal(declined.scripts.length, 0);
  assert.equal(declined.events().length, 0);
  assert.equal(browser({ stored: declined.stored }).scripts.length, 0);

  const accepted = browser();
  accepted.api.setConsent('granted');
  accepted.api.track('generate_lead');
  const before = accepted.events().length;
  accepted.api.setConsent('denied');
  accepted.api.track('generate_lead');
  assert.equal(accepted.api.status().enabled, false);
  assert.equal(accepted.events().length, before);
  assert.equal(accepted.window['ga-disable-G-PRIMETEST1'], true);
  assert.ok(accepted.cookieWrites.some(cookie => cookie.startsWith('_ga=; Max-Age=0;')));
  assert.ok(accepted.cookieWrites.some(cookie => cookie.startsWith('_ga_PRIMETEST1=; Max-Age=0;')));
  assert.equal(accepted.cookieWrites.some(cookie => cookie.startsWith('session=')), false);
  const reloaded = browser({ stored: accepted.stored });
  assert.equal(reloaded.api.status().enabled, false);
  assert.equal(reloaded.scripts.length, 0);
});

test('blocked storage does not crash the page or prevent an in-memory consent choice', () => {
  const page = browser({ storageThrows: true });
  assert.equal(page.scripts.length, 0);
  assert.doesNotThrow(() => page.api.showChoices());
  assert.doesNotThrow(() => page.api.setConsent('granted'));
  assert.equal(page.api.status().enabled, true);
  page.api.track('generate_lead');
  assert.equal(page.events().filter(event => event[1] === 'generate_lead').length, 1);
  assert.doesNotThrow(() => page.api.setConsent('denied'));
  assert.equal(page.api.status().enabled, false);
});

test('browser privacy signals prevent tracking even when consent is requested', () => {
  for (const privacy of [{ doNotTrack: '1' }, { doNotTrack: 'yes' }, { globalPrivacyControl: true }]) {
    const page = browser(privacy);
    page.api.setConsent('granted');
    page.api.track('generate_lead');
    assert.equal(page.api.status().disabledByBrowser, true);
    assert.equal(page.api.status().enabled, false);
    assert.equal(page.scripts.length, 0);
    assert.equal(page.events().length, 0);
  }
});

test('analytics consent never grants Google advertising consent', () => {
  const page = browser();
  page.api.setConsent('granted');
  const consentCalls = page.calls().filter(call => call[0] === 'consent');
  assert.ok(consentCalls.length > 0);
  const effective = {};
  for (const [, , settings] of consentCalls) {
    Object.assign(effective, settings);
    assert.equal(effective.ad_storage, 'denied');
    assert.equal(effective.ad_user_data, 'denied');
    assert.equal(effective.ad_personalization, 'denied');
  }
});

test('a saved choice is honored only while it is valid and consent expiry restores opt-out', () => {
  const accepted = browser();
  accepted.api.setConsent('granted');
  const reloaded = browser({ stored: accepted.stored });
  assert.equal(reloaded.api.status().enabled, true);
  assert.equal(reloaded.scripts.length, 1);
  assert.equal(reloaded.events().filter(event => event[1] === 'page_view').length, 1);

  const key = 'primecapture.analytics-choice.v1';
  for (const entry of [
    '{invalid json',
    JSON.stringify({ choice: 'granted', updatedAt: Date.now() - 181 * 86400000 }),
    JSON.stringify({ choice: 'granted', updatedAt: Date.now() + 86400000 }),
    JSON.stringify({ choice: 'anything', updatedAt: Date.now() }),
    JSON.stringify({ choice: 'granted', updatedAt: 'not-a-date' }),
  ]) {
    const page = browser({ stored: new Map([[key, entry]]) });
    assert.equal(page.api.status().enabled, false);
    assert.equal(page.scripts.length, 0);
    assert.equal(page.events().length, 0);
  }
});

test('repeated consent choices neither duplicate the loader nor double-count page views', () => {
  const page = browser();
  page.api.setConsent('granted');
  page.api.setConsent('granted');
  page.api.track('page_view');
  page.api.setConsent('denied');
  page.api.setConsent('granted');
  page.api.track('cta_click', { placement: 'hero' });
  assert.equal(page.scripts.length, 1);
  assert.equal(page.events().filter(event => event[1] === 'page_view').length, 1);
  assert.equal(page.events().filter(event => event[1] === 'cta_click').length, 1);
  assert.equal(page.window['ga-disable-G-PRIMETEST1'], false);
});

test('cross-tab denial, removal, expiry, and invalid choices immediately stop an active tab without storage writes', () => {
  const choices = [
    JSON.stringify({ choice: 'denied', updatedAt: Date.now() }),
    null,
    '{invalid json',
    JSON.stringify({ choice: 'granted', updatedAt: Date.now() - 181 * 86400000 }),
    JSON.stringify({ choice: 'granted', updatedAt: Date.now() + 86400000 }),
    JSON.stringify({ choice: 'anything', updatedAt: Date.now() }),
    JSON.stringify({ choice: 'granted', updatedAt: 'not-a-date' }),
  ];
  for (const value of choices) {
    const page = browser();
    page.api.setConsent('granted');
    page.api.track('cta_click', { placement: 'hero' });
    const beforeEvents = page.events().length;
    const beforeWrites = page.storageWrites.length;
    page.receiveStorage(value);
    page.api.track('generate_lead');
    assert.equal(page.api.status().enabled, false, value);
    assert.equal(page.window['ga-disable-G-PRIMETEST1'], true, value);
    assert.equal(page.events().length, beforeEvents, value);
    assert.equal(page.storageWrites.length, beforeWrites, 'storage events must not echo writes');
    assert.ok(page.cookieWrites.some(cookie => cookie.startsWith('_ga=; Max-Age=0;')));
    const lastConsent = page.calls().filter(call => call[0] === 'consent').at(-1);
    assert.equal(lastConsent[2].analytics_storage, 'denied', value);
    assert.equal(page.document.querySelector('#analytics-notice').hidden, value === choices[0]);
  }
});

test('clearing storage in another tab revokes consent while unrelated or session storage changes do not', () => {
  const page = browser();
  page.api.setConsent('granted');
  const beforeWrites = page.storageWrites.length;
  page.receiveStorage(null, { key: 'unrelated-preference' });
  assert.equal(page.api.status().enabled, true);
  page.receiveStorage(null, { storageArea: {} });
  assert.equal(page.api.status().enabled, true);
  const beforeEvents = page.events().length;
  page.receiveStorage(null, { key: null });
  page.api.track('generate_lead');
  assert.equal(page.api.status().enabled, false);
  assert.equal(page.events().length, beforeEvents);
  assert.equal(page.storageWrites.length, beforeWrites);
});

test('a valid cross-tab grant can enable and resume tracking without duplicate loaders or page views', () => {
  const page = browser();
  const grant = JSON.stringify({ choice: 'granted', updatedAt: Date.now() });
  page.receiveStorage(grant);
  assert.equal(page.api.status().enabled, true);
  assert.equal(page.scripts.length, 1);
  assert.equal(page.events().filter(event => event[1] === 'page_view').length, 1);
  page.receiveStorage(null);
  page.receiveStorage(grant);
  page.api.track('generate_lead');
  assert.equal(page.api.status().enabled, true);
  assert.equal(page.window['ga-disable-G-PRIMETEST1'], false);
  assert.equal(page.scripts.length, 1);
  assert.equal(page.events().filter(event => event[1] === 'page_view').length, 1);
  assert.equal(page.events().filter(event => event[1] === 'generate_lead').length, 1);
  assert.equal(page.storageWrites.length, 0);
});

test('cross-tab grants cannot override browser privacy signals', () => {
  const grant = JSON.stringify({ choice: 'granted', updatedAt: Date.now() });
  for (const privacy of [{ doNotTrack: '1' }, { doNotTrack: 'yes' }, { globalPrivacyControl: true }]) {
    const page = browser(privacy);
    page.receiveStorage(grant);
    page.api.track('generate_lead');
    assert.equal(page.api.status().disabledByBrowser, true);
    assert.equal(page.api.status().enabled, false);
    assert.equal(page.scripts.length, 0);
    assert.equal(page.events().length, 0);
    assert.equal(page.storageWrites.length, 0);
  }
});
