import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/mobile-inquiry.js', import.meta.url), 'utf8');

// The fixture models layout, observers and focus rather than parsing script text.
// All visibility decisions are exercised by running the shipped browser script.
function page({ width = 390, height = 844, intersectionObserver = true, mediaQueries = true } = {}) {
  const frames = new Map();
  const intersectionObservers = [];
  const mutationObservers = [];
  const resizeObservers = [];
  const media = [];
  let nextFrame = 0;
  let boundsReads = 0;
  let document;

  const target = () => ({
    listeners: new Map(),
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    },
    removeEventListener(type, listener) {
      this.listeners.set(type, (this.listeners.get(type) || []).filter(value => value !== listener));
    },
    dispatch(type, detail = {}) {
      for (const listener of this.listeners.get(type) || []) listener({ type, target: this, ...detail });
    },
  });

  function node({ id = '', tagName = 'DIV', classes = [], parent = null, rect = {}, hidden = false, data = {}, display = 'block' } = {}) {
    const attributes = new Map();
    const classNames = new Set(classes);
    const current = {
      ...target(), id, tagName, parentElement: parent, children: [], hidden, dataset: data,
      open: false, isConnected: true, disabled: false, isContentEditable: false,
      display, visibility: 'visible', opacity: '1',
      rect: { top: 2000, bottom: 2060, left: 0, right: width, width, height: 60, ...rect },
      style: { setProperty() {}, removeProperty() {} },
      classList: {
        contains: value => classNames.has(value),
        add: value => classNames.add(value),
        remove: value => classNames.delete(value),
        toggle(value, force) { const add = force ?? !classNames.has(value); if (add) classNames.add(value); else classNames.delete(value); return add; },
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
        if (name === 'hidden') this.hidden = true;
        if (name === 'open') this.open = true;
      },
      getAttribute(name) { return attributes.get(name) ?? null; },
      hasAttribute(name) { return name === 'hidden' ? this.hidden : name === 'open' ? this.open : attributes.has(name); },
      removeAttribute(name) {
        attributes.delete(name);
        if (name === 'hidden') this.hidden = false;
        if (name === 'open') this.open = false;
      },
      getBoundingClientRect() { boundsReads += 1; return { ...this.rect }; },
      getClientRects() { return this.rendered() ? [this.getBoundingClientRect()] : []; },
      rendered() {
        for (let value = this; value; value = value.parentElement) {
          if (value.hidden || value.display === 'none') return false;
        }
        return true;
      },
      contains(other) {
        for (let value = other; value; value = value.parentElement) if (value === this) return true;
        return false;
      },
      matches(selector) {
        return selector.split(',').some(part => {
          const value = part.trim();
          if (value === 'input' || value === 'textarea' || value === 'select' || value === 'button' || value === 'a') return this.tagName === value.toUpperCase();
          if (value === '[contenteditable]' || value === '[contenteditable="true"]' || value === '[contenteditable]:not([contenteditable="false"])') return this.isContentEditable;
          if (value === ':focus-within') return this.contains(document.activeElement);
          if (value === '[data-partner]') return Object.hasOwn(this.dataset, 'partner');
          if (value === '[data-mobile-inquiry]') return Object.hasOwn(this.dataset, 'mobileInquiry');
          if (value === 'dialog[open]') return this.tagName === 'DIALOG' && this.open;
          if (value === '[hidden]') return this.hidden;
          if (value === '[inert]') return this.hasAttribute('inert');
          if (value.startsWith('#')) return value.slice(1) === this.id;
          if (value.startsWith('.')) return classNames.has(value.slice(1));
          return value.toUpperCase() === this.tagName;
        });
      },
      closest(selector) {
        for (let value = this; value; value = value.parentElement) if (value.matches(selector)) return value;
        return null;
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      querySelectorAll(selector) { return all.filter(value => value !== this && this.contains(value) && value.matches(selector)); },
      focus() { document.activeElement = this; document.dispatch('focusin', { target: this }); },
    };
    parent?.children.push(current);
    all.push(current);
    return current;
  }

  const all = [];
  const html = node({ tagName: 'HTML' });
  html.clientWidth = width;
  html.clientHeight = height;
  const body = node({ tagName: 'BODY', parent: html });
  const nav = node({ tagName: 'NAV', classes: ['nav'], parent: body, rect: { top: 12, bottom: 74, height: 62 } });
  const menu = node({ tagName: 'BUTTON', classes: ['menu-toggle'], parent: nav });
  menu.setAttribute('aria-expanded', 'false');
  const hero = node({ id: 'home', tagName: 'SECTION', parent: body, rect: { top: 0, bottom: 800, height: 800 } });
  const heroLink = node({ tagName: 'A', data: { partner: '' }, parent: hero, rect: { top: 590, bottom: 646, height: 56 } });
  const ordinaryLink = node({ tagName: 'A', data: { partner: '' }, parent: body });
  const hiddenNavLink = node({ tagName: 'A', data: { partner: '' }, parent: nav, display: 'none', rect: { top: 20, bottom: 64, height: 44 } });
  const contact = node({ id: 'contact', tagName: 'SECTION', parent: body, rect: { top: 6000, bottom: 6800, height: 800 } });
  const contactLink = node({ tagName: 'BUTTON', data: { partner: '' }, parent: contact, rect: { top: 6650, bottom: 6706, height: 56 } });
  const footer = node({ tagName: 'FOOTER', parent: body, rect: { top: 7000, bottom: 7300, height: 300 } });
  const notice = node({ id: 'analytics-notice', tagName: 'ASIDE', hidden: true, parent: body, rect: { top: 620, bottom: 830, height: 210 } });
  const sticky = node({ id: 'mobile-inquiry', classes: ['mobile-inquiry'], parent: body, hidden: true,
    rect: { top: height - 86, bottom: height - 16, height: 70, left: 16, right: width - 16, width: width - 32 } });
  const stickyLink = node({ tagName: 'A', data: { partner: '', mobileInquiry: '' }, parent: sticky,
    rect: { top: height - 72, bottom: height - 16, height: 56, left: 16, right: width - 16, width: width - 32 } });
  const dialog = node({ id: 'inquiry-dialog', tagName: 'DIALOG', parent: body });
  const input = node({ tagName: 'INPUT', parent: body });
  const textarea = node({ tagName: 'TEXTAREA', parent: body });
  const editable = node({ parent: body });
  editable.isContentEditable = true;
  const viewport = { ...target(), width, height, offsetTop: 0, offsetLeft: 0, scale: 1 };
  const win = {
    ...target(), innerWidth: width, innerHeight: height, scrollY: 1000, visualViewport: viewport,
    getComputedStyle(value) { return { display: value.rendered() ? value.display : 'none', visibility: value.visibility, opacity: value.opacity }; },
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  if (mediaQueries) win.matchMedia = query => {
    const value = { ...target(), media: query, matches: width <= 760, addListener(listener) { this.addEventListener('change', listener); } };
    media.push(value);
    return value;
  };
  document = {
    ...target(), documentElement: html, body, activeElement: body, hidden: false,
    visibilityState: 'visible', fonts: { ready: Promise.resolve() },
    querySelector(selector) { return all.find(value => value.matches(selector)) || null; },
    querySelectorAll(selector) { return all.filter(value => value.matches(selector)); },
    getElementById(id) { return all.find(value => value.id === id) || null; },
  };
  class IntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = new Set(); intersectionObservers.push(this); }
    observe(value) { this.targets.add(value); }
    unobserve(value) { this.targets.delete(value); }
    disconnect() { this.targets.clear(); }
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback; mutationObservers.push(this); }
    observe(value, options) { this.target = value; this.options = options; }
    disconnect() {}
  }
  class ResizeObserver {
    constructor(callback) { this.callback = callback; resizeObservers.push(this); }
    observe() {}
    disconnect() {}
  }
  Object.assign(win, { MutationObserver, ResizeObserver });
  if (intersectionObserver) win.IntersectionObserver = IntersectionObserver;
  const context = {
    window: win, document, MutationObserver, ResizeObserver,
    getComputedStyle: win.getComputedStyle,
    requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: win.cancelAnimationFrame,
    setTimeout, clearTimeout,
  };
  if (intersectionObserver) context.IntersectionObserver = IntersectionObserver;
  for (const name of ['innerWidth', 'innerHeight', 'scrollY']) Object.defineProperty(context, name, { get: () => win[name] });
  vm.runInNewContext(source, context, { filename: 'mobile-inquiry.js' });

  function flush() {
    // Fails if an ostensibly idle controller accidentally schedules a render loop.
    for (let i = 0; frames.size && i < 12; i += 1) {
      const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(i * 16));
    }
    assert.equal(frames.size, 0, 'visibility controller must settle instead of running continuously');
  }
  const observe = () => {
    for (const observer of intersectionObservers) observer.callback([...observer.targets].map(value => {
      const rect = value.getBoundingClientRect();
      return { target: value, boundingClientRect: rect, isIntersecting: value.rendered() && rect.top < viewport.height && rect.bottom > 0,
        intersectionRatio: value.rendered() && rect.top < viewport.height && rect.bottom > 0 ? 1 : 0 };
    }));
  };
  const mutation = (changed = menu) => mutationObservers.forEach(observer => observer.callback([{ type: 'attributes', target: changed }]));
  const scroll = () => { win.dispatch('scroll'); observe(); flush(); };
  const belowHero = () => { hero.rect.top = -1000; hero.rect.bottom = -200; heroLink.rect.top = -410; heroLink.rect.bottom = -354; scroll(); };
  const resize = (nextWidth, nextHeight = height) => {
    win.innerWidth = html.clientWidth = viewport.width = nextWidth;
    win.innerHeight = html.clientHeight = viewport.height = nextHeight;
    media.forEach(value => { value.matches = nextWidth <= 760; value.dispatch('change', { matches: value.matches }); });
    win.dispatch('resize'); viewport.dispatch('resize'); resizeObservers.forEach(observer => observer.callback([])); flush();
  };
  return { win, document, hero, heroLink, ordinaryLink, hiddenNavLink, nav, menu, sticky, stickyLink, dialog,
    contact, contactLink, footer, notice, input, textarea, editable, viewport, flush, scroll, observe, mutation, belowHero, resize,
    frames, get boundsReads() { return boundsReads; } };
}

test('sticky inquiry starts hidden and appears only after the mobile hero has passed', () => {
  const current = page();
  assert.equal(current.sticky.hidden, true);
  current.flush();
  assert.equal(current.sticky.hidden, true, 'hero is still visible');
  current.hero.rect.top = 900; current.hero.rect.bottom = 1700;
  current.scroll();
  assert.equal(current.sticky.hidden, true, 'a hero below the viewport has not been passed');
  current.belowHero();
  assert.equal(current.sticky.hidden, false);
});

test('desktop stays clear, including resizing out of the mobile breakpoint', () => {
  const current = page();
  current.belowHero();
  assert.equal(current.sticky.hidden, false);
  current.resize(761);
  assert.equal(current.sticky.hidden, true);
  current.resize(760);
  assert.equal(current.sticky.hidden, false);
  const desktop = page({ width: 1440 });
  desktop.belowHero();
  assert.equal(desktop.sticky.hidden, true);
});

test('no IntersectionObserver or media-query support leaves regular inquiry actions untouched', () => {
  for (const capability of [{ intersectionObserver: false }, { mediaQueries: false }]) {
    const current = page(capability);
    current.belowHero();
    assert.equal(current.sticky.hidden, true);
    assert.equal(current.ordinaryLink.hidden, false);
    assert.equal(current.heroLink.hidden, false);
  }
});

test('an existing usable inquiry action suppresses duplication but hidden or occluded actions do not', () => {
  const current = page();
  current.belowHero();
  assert.equal(current.sticky.hidden, false, 'hidden mobile navigation link is not a visible CTA');
  current.ordinaryLink.rect = { top: 300, bottom: 356, left: 24, right: 260, width: 236, height: 56 };
  current.scroll();
  assert.equal(current.sticky.hidden, true, 'a static CTA in the reading area is usable');
  current.ordinaryLink.display = 'none';
  current.scroll();
  assert.equal(current.sticky.hidden, false);
  current.ordinaryLink.display = 'block';
  current.ordinaryLink.rect.top = -20; current.ordinaryLink.rect.bottom = 50;
  current.scroll();
  assert.equal(current.sticky.hidden, false, 'an action hidden behind the navigation does not replace the floating action');
  current.ordinaryLink.rect.top = 820; current.ordinaryLink.rect.bottom = 876;
  current.scroll();
  assert.equal(current.sticky.hidden, false, 'an action below the floating button is not usable yet');
});

test('a visible inquiry action inside navigation suppresses duplication at wider mobile widths', () => {
  const current = page({ width: 600 });
  current.hiddenNavLink.display = 'block';
  current.belowHero();
  assert.equal(current.sticky.hidden, true, 'the existing header action already offers a persistent inquiry path');
  current.hiddenNavLink.display = 'none';
  current.mutation(current.nav); current.flush();
  assert.equal(current.sticky.hidden, false);
  current.ordinaryLink.rect = { top: 20, bottom: 64, left: 24, right: 260, width: 236, height: 44 };
  current.scroll();
  assert.equal(current.sticky.hidden, false, 'a content action behind the header is occluded rather than a navigation action');
});

test('menus, dialogs and the analytics choice hide the floating inquiry until dismissed', () => {
  const current = page();
  current.belowHero();
  current.menu.setAttribute('aria-expanded', 'true');
  current.mutation(); current.flush();
  assert.equal(current.sticky.hidden, true);
  current.menu.setAttribute('aria-expanded', 'false');
  current.mutation(); current.flush();
  assert.equal(current.sticky.hidden, false);
  current.dialog.open = true;
  current.mutation(current.dialog); current.flush();
  assert.equal(current.sticky.hidden, true);
  current.dialog.open = false;
  current.mutation(current.dialog); current.flush();
  assert.equal(current.sticky.hidden, false);
  current.notice.hidden = false;
  current.mutation(current.notice); current.flush();
  assert.equal(current.sticky.hidden, true);
  current.notice.hidden = true;
  current.mutation(current.notice); current.flush();
  assert.equal(current.sticky.hidden, false);
});

test('typing and an open mobile keyboard keep the floating control out of the way', () => {
  const current = page();
  current.belowHero();
  for (const field of [current.input, current.textarea, current.editable]) {
    field.focus(); current.flush();
    assert.equal(current.sticky.hidden, true);
    current.document.activeElement = current.document.body;
    current.document.dispatch('focusout', { target: field }); current.flush();
    assert.equal(current.sticky.hidden, false);
  }
  current.viewport.height = 500;
  current.viewport.dispatch('resize'); current.flush();
  assert.equal(current.sticky.hidden, true, 'visual viewport contraction is a keyboard safeguard');
  current.viewport.height = 844;
  current.viewport.dispatch('resize'); current.flush();
  assert.equal(current.sticky.hidden, false);
  current.viewport.height = 500; current.viewport.scale = 1.6;
  current.viewport.dispatch('resize'); current.flush();
  assert.equal(current.sticky.hidden, false, 'pinch zoom must not be mistaken for a keyboard');
});

test('contact keeps an inquiry action available until its regular CTA appears, then footer stays clear', () => {
  const current = page();
  current.belowHero();
  current.contact.rect.top = 500; current.contact.rect.bottom = 1300;
  current.scroll();
  assert.equal(current.sticky.hidden, false, 'contact heading alone must not leave a gap before its action');
  current.contactLink.rect.top = 500; current.contactLink.rect.bottom = 556;
  current.scroll();
  assert.equal(current.sticky.hidden, true);
  current.contact.rect.top = 6000; current.contact.rect.bottom = 6800;
  current.contactLink.rect.top = 6650; current.contactLink.rect.bottom = 6706;
  current.scroll();
  assert.equal(current.sticky.hidden, false);
  current.footer.rect.top = 600; current.footer.rect.bottom = 900;
  current.scroll();
  assert.equal(current.sticky.hidden, true);
});

test('geometry changes do not remove the focused floating link from keyboard users', () => {
  const current = page();
  current.belowHero();
  current.stickyLink.focus(); current.flush();
  current.ordinaryLink.rect = { top: 300, bottom: 356, left: 24, right: 260, width: 236, height: 56 };
  current.scroll();
  assert.equal(current.sticky.hidden, false);
  assert.equal(current.document.activeElement, current.stickyLink);
  current.hero.rect.top = -400; current.hero.rect.bottom = 400;
  current.scroll();
  assert.equal(current.sticky.hidden, false, 'scrolling back into the hero must not hide a keyboard-focused control');
  assert.equal(current.document.activeElement, current.stickyLink);
  current.dialog.open = true;
  current.mutation(current.dialog); current.flush();
  assert.equal(current.sticky.hidden, true, 'a modal still takes precedence over a focused background control');
});

test('resizing to desktop moves focus from the hidden floating action to an available inquiry action', () => {
  const current = page();
  current.belowHero();
  current.stickyLink.focus(); current.flush();
  current.ordinaryLink.rect = { top: 300, bottom: 356, left: 24, right: 260, width: 236, height: 56 };
  current.resize(900);
  assert.equal(current.sticky.hidden, true);
  assert.equal(current.document.activeElement, current.ordinaryLink);
});

test('closing an inquiry opened from the floating action restores visible keyboard focus', () => {
  const current = page();
  current.belowHero();
  current.stickyLink.focus();
  current.stickyLink.dispatch('click');
  current.dialog.open = true;
  current.document.activeElement = current.input;
  current.mutation(current.dialog); current.flush();
  assert.equal(current.sticky.hidden, true);
  current.dialog.open = false;
  current.document.activeElement = current.document.body;
  current.dialog.dispatch('close');
  current.mutation(current.dialog); current.flush();
  assert.equal(current.sticky.hidden, false);
  assert.equal(current.document.activeElement, current.stickyLink);
});

test('focus after closing a dialog moves to an available existing CTA when the floating action is suppressed', () => {
  const current = page();
  current.belowHero();
  current.stickyLink.dispatch('click');
  current.dialog.open = true;
  current.mutation(current.dialog); current.flush();
  current.ordinaryLink.rect = { top: 300, bottom: 356, left: 24, right: 260, width: 236, height: 56 };
  current.dialog.open = false;
  current.document.activeElement = current.document.body;
  current.dialog.dispatch('close');
  current.mutation(current.dialog); current.flush();
  assert.equal(current.sticky.hidden, true);
  assert.equal(current.document.activeElement, current.ordinaryLink);
});

test('background tabs hide the control and restore it after returning to the page', () => {
  const current = page();
  current.belowHero();
  current.document.hidden = true;
  current.document.dispatch('visibilitychange'); current.flush();
  assert.equal(current.sticky.hidden, true);
  current.document.hidden = false;
  current.document.dispatch('visibilitychange'); current.flush();
  assert.equal(current.sticky.hidden, false);
});

test('scroll and observer bursts coalesce into one layout update with no idle loop', () => {
  const current = page();
  current.belowHero();
  const before = current.boundsReads;
  for (let i = 0; i < 30; i += 1) current.win.dispatch('scroll');
  assert.equal(current.frames.size, 1, 'scroll work is queued only once per animation frame');
  assert.equal(current.boundsReads, before, 'scroll handlers do not force synchronous layout');
  current.flush();
  assert.ok(current.boundsReads > before);
  assert.equal(current.frames.size, 0);
});
