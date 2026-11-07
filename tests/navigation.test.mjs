import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../dist/interactions.js', import.meta.url), 'utf8');

function navigationPage() {
  let scrollY = 0;
  const frames = [];
  const links = ['#experience', '#partnership'].map(href => {
    const attributes = new Map([['href', href]]);
    return {
      getAttribute: name => attributes.get(name) ?? null,
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: name => attributes.delete(name),
    };
  });
  const sections = [
    { id: 'home', top: 0, bottom: 600 },
    { id: 'from-moment-to-memory', parent: 'experience', top: 600, bottom: 1000 },
    { id: 'experience', top: 1000, bottom: 1500 },
    { id: 'partnership', top: 1500, bottom: 2000 },
  ].map(({ id, parent, top, bottom }) => ({
    id, dataset: { navSection: parent },
    getBoundingClientRect: () => ({ top: top - scrollY, bottom: bottom - scrollY }),
  }));
  const nav = { querySelectorAll: () => links, getBoundingClientRect: () => ({ bottom: 64 }) };
  const document = Object.assign(new EventTarget(), {
    querySelector: () => nav, querySelectorAll: () => sections,
  });
  const window = Object.assign(new EventTarget(), {
    requestAnimationFrame: callback => frames.push(callback),
  });
  vm.runInNewContext(script, { document, window });
  return {
    currentLinks: () => links.filter(link => link.getAttribute('aria-current') === 'location').map(link => link.getAttribute('href')),
    scroll(y) {
      scrollY = y;
      window.dispatchEvent(new Event('scroll'));
      for (const callback of frames.splice(0)) callback();
    },
  };
}

test('native scrolling keeps the matching section link current, including the nested story', () => {
  const page = navigationPage();
  assert.deepEqual(page.currentLinks(), []);
  page.scroll(650);
  assert.deepEqual(page.currentLinks(), ['#experience']);
  page.scroll(1050);
  assert.deepEqual(page.currentLinks(), ['#experience']);
  page.scroll(1550);
  assert.deepEqual(page.currentLinks(), ['#partnership']);
  page.scroll(2050);
  assert.deepEqual(page.currentLinks(), []);
});

test('the header and footer use the static logo artwork', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/<img class="brand-logo" src="assets\/prime-capture-logo\.svg"/g) || []).length, 2);
});
