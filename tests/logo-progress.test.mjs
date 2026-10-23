import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../dist/interactions.js', import.meta.url), 'utf8');

function element(attributes = {}) {
  const attrs = new Map(Object.entries(attributes));
  const properties = new Map();
  return {
    children: [],
    dataset: {},
    style: {
      setProperty: (name, value) => properties.set(name, value),
      getPropertyValue: name => properties.get(name) ?? '',
    },
    setAttribute: (name, value) => attrs.set(name, value),
    getAttribute: name => attrs.get(name) ?? null,
    removeAttribute: name => attrs.delete(name),
    append(child) { this.children.push(child); },
    getBoundingClientRect: () => ({ top: 0, bottom: 64 }),
  };
}

function fixture({ scrollHeight = 3000, innerHeight = 1000, scrollY = 0, rings = 2, navigation = true } = {}) {
  const nav = element();
  const links = [element({ href: '#experience' }), element({ href: '#partnership' })];
  nav.querySelectorAll = () => links;
  const section = Object.assign(element(), { id: 'experience' });
  section.getBoundingClientRect = () => ({ top: 0, bottom: 800 });
  const logoRings = Array.from({ length: rings }, () => {
    const rotor = element();
    rotor.original = element(); rotor.aperture = element();
    rotor.blades = Array.from({length: 3}, () => element());
    rotor.querySelector = selector => selector === '[data-logo-original]' ? rotor.original : rotor.aperture;
    rotor.querySelectorAll = () => rotor.blades;
    return rotor;
  });
  const document = Object.assign(new EventTarget(), {
    documentElement: { scrollHeight },
    body: element(),
    createElement: () => { throw new Error('Scroll must not create a timeline'); },
    querySelector: selector => selector === '.nav' && navigation ? nav : null,
    querySelectorAll: selector => selector === '[data-logo-morph]' ? logoRings : [section],
  });
  let fontsReady;
  document.fonts = { ready: { then(callback) { fontsReady = callback; } } };
  const frames = [];
  const observations = [];
  let notifyResize;
  class ResizeObserver {
    constructor(callback) { notifyResize = callback; }
    observe(target) { observations.push(target); }
  }
  const window = Object.assign(new EventTarget(), {
    innerHeight, scrollY, ResizeObserver,
    requestAnimationFrame(callback) { frames.push(callback); },
  });
  vm.runInNewContext(script, { document, window, ResizeObserver });
  return {
    window, document, nav, links, logoRings, frames, observations,
    
    get fraction() { return Number(logoRings[0]?.getAttribute('data-morph-progress') ?? 0); },
    flush() { for (const callback of frames.splice(0)) callback(); },
    scroll(y) { window.scrollY = y; window.dispatchEvent(new Event('scroll')); },
    resize() { notifyResize(); },
    fontsReady() { fontsReady(); },
  };
}

function assertSynchronized(f, fraction) {
  assert.equal(f.nav.children.length, 0, 'No horizontal timeline is appended');
  for (const logo of f.logoRings) {
    assert.equal(Number(logo.getAttribute('data-morph-progress')), fraction);
    assert.equal(logo.getAttribute('transform'), `rotate(${360 * fraction} 66 66)`);
    const phase = Number(logo.getAttribute('data-morph-phase'));
    assert.ok(phase >= 0 && phase <= 1);
    if (fraction === 0 || fraction === 1) {
      assert.equal(phase, 0);
      assert.equal(logo.original.getAttribute('opacity'), '1');
      assert.equal(logo.aperture.getAttribute('opacity'), '0');
    }
    if (fraction === .5) {
      assert.equal(phase, 1);
      assert.equal(logo.original.getAttribute('opacity'), '0');
      assert.equal(logo.aperture.getAttribute('opacity'), '1');
    }
    assert.equal(logo.blades.length, 3);
    const paths = logo.blades.map(b => b.getAttribute('d'));
    assert.ok(paths.every(p => p === paths[0] && !/NaN|Infinity/.test(p)));
    if (fraction === .5) {
      const inner = paths[0].match(/ L66\.000 66\.000/g) || [];
      assert.equal(inner.length, 24, 'The opening collapses exactly to the center');
    }
  }
}

test('at the top, both original logos start at their original orientation with no timeline', () => {
  const f = fixture();
  assertSynchronized(f, 0);
  assert.equal(f.nav.children.length, 0);
});

test('halfway down, all three blades are fully closed', () => {
  const f = fixture();
  f.scroll(1000);
  f.flush();
  assertSynchronized(f, 0.5);

});

test('at the bottom, the original logo is fully restored', () => {
  const f = fixture();
  f.scroll(2000);
  f.flush();
  assertSynchronized(f, 1);

});

test('scrolling upward reverses the scroll-driven rotation', () => {
  const f = fixture({ scrollY: 2000 });
  assertSynchronized(f, 1);
  f.scroll(500);
  f.flush();
  assertSynchronized(f, 0.25);
  f.scroll(0);
  f.flush();
  assertSynchronized(f, 0);
});

test('rubber-band overscroll is clamped at either page boundary', () => {
  const f = fixture();
  f.scroll(-150);
  f.flush();
  assertSynchronized(f, 0);
  f.scroll(2250);
  f.flush();
  assertSynchronized(f, 1);
});

test('a page without a scrollable distance keeps its original logo', () => {
  for (const scrollHeight of [1000, 700]) {
    const f = fixture({ scrollHeight, scrollY: 0 });
    assertSynchronized(f, 0);
    f.scroll(20);
    f.flush();
    assertSynchronized(f, 0);
  }
});

test('fractional layout rounding completes the logo morph within one pixel of the bottom', () => {
  const f = fixture();
  f.scroll(1998.9);
  f.flush();
  assertSynchronized(f, 1998.9 / 2000);
  f.scroll(1999);
  f.flush();
  assertSynchronized(f, 1);
  f.scroll(1999.75);
  f.flush();
  assertSynchronized(f, 1);
});

test('viewport changes recalculate logo morph', () => {
  const f = fixture({ scrollY: 1000 });
  assertSynchronized(f, 0.5);
  f.window.innerHeight = 500;
  f.window.dispatchEvent(new Event('resize'));
  f.flush();
  assertSynchronized(f, 0.4);
});

test('body resize, font loading, pageshow, and expanding details refresh the document height', () => {
  for (const trigger of [
    f => f.resize(),
    f => f.fontsReady(),
    f => f.window.dispatchEvent(new Event('pageshow')),
    f => f.document.dispatchEvent(new Event('toggle')),
  ]) {
    const f = fixture({ scrollY: 1000 });
    assert.deepEqual(f.observations, [f.document.body]);
    f.document.documentElement.scrollHeight = 5000;
    trigger(f);
    assert.equal(f.frames.length, 1);
    f.flush();
    assertSynchronized(f, 0.25);
  }
});

test('scroll and layout events coalesce into one frame using the latest position', () => {
  const f = fixture();
  f.scroll(100);
  f.scroll(700);
  f.window.dispatchEvent(new Event('resize'));
  f.resize();
  f.scroll(1500);
  assert.equal(f.frames.length, 1);
  assertSynchronized(f, 0);
  f.flush();
  assertSynchronized(f, 0.75);
  f.scroll(1000);
  assert.equal(f.frames.length, 1, 'later scrolls can schedule another frame');
  f.flush();
  assertSynchronized(f, 0.5);
});

test('logo morph preserves current-section navigation and handles pages without logo marks', () => {
  const f = fixture({ rings: 0 });
  assert.equal(f.links[0].getAttribute('aria-current'), 'location');
  assert.equal(f.links[1].getAttribute('aria-current'), null);
  f.scroll(1000);
  f.flush();
  assert.equal(f.nav.children.length, 0);
});

test('a page without site navigation exits without adding progress UI', () => {
  const f = fixture({ navigation: false });
  assert.equal(f.nav.children.length, 0);
  assert.equal(f.frames.length, 0);
  assert.deepEqual(f.observations, []);
});

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
test('Each mark has the original logo plus exactly three blades and no galaxy or additional outlines', () => {
  assert.equal((html.match(/data-logo-morph\b/g) || []).length, 2);
  assert.equal((html.match(/data-morph-blade\b/g) || []).length, 6);
  assert.equal((html.match(/data-logo-original\b/g) || []).length, 2);
  assert.equal((html.match(/class="logo-three-blades"[^>]*>[\s\S]*?<\/g>/g) || []).length, 2);
  for (const group of html.match(/class="logo-three-blades"[^>]*>[\s\S]*?<\/g>/g)) assert.doesNotMatch(group, /<circle|<ellipse/);
  assert.doesNotMatch(html, /galaxy-arm|data-galaxy|logo-progress-ring/);
});

test('Quarter and three-quarter scroll positions have the same half-open geometry', () => {
  const f = fixture();
  f.scroll(500); f.flush();
  const halfwayClosing = f.logoRings[0].blades[0].getAttribute('d');
  assert.equal(f.logoRings[0].getAttribute('data-morph-phase'), '0.5');
  f.scroll(1500); f.flush();
  assert.equal(f.logoRings[0].getAttribute('data-morph-phase'), '0.5');
  assert.equal(f.logoRings[0].blades[0].getAttribute('d'), halfwayClosing);
});
