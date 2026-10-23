import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../dist/brand-film.js', import.meta.url), 'utf8');

function fixture({ play = () => Promise.resolve(), supportsDialog = true } = {}) {
  const dialog = new EventTarget();
  dialog.open = false;
  if (supportsDialog) dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new Event('close')); };
  const attributes = new Map();
  const video = Object.assign(new EventTarget(), {
    dataset: { src: 'assets/prime-capture-brand-film.mp4' },
    readyState: 0, error: null, currentTime: 0, loads: 0, plays: 0, pauses: 0,
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    load() { this.loads++; },
    play() { this.plays++; return play(); },
    pause() { this.pauses++; },
  });
  const status = { hidden: true, textContent: '' };
  const links = [new EventTarget(), new EventTarget()];
  const elements = { '#brand-film-dialog': dialog, '#brand-film-video': video, '#brand-film-status': status };
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    querySelector: selector => elements[selector],
    querySelectorAll: () => links,
  });
  vm.runInNewContext(script, { document });
  const click = index => {
    const event = new Event('click', { cancelable: true });
    links[index].dispatchEvent(event);
    return event;
  };
  return { dialog, video, status, document, click };
}

test('film waits for a user action, and reopening retains playback position without reloading', async () => {
  const { dialog, video, status, click } = fixture();
  assert.equal(video.getAttribute('src'), null);
  assert.equal(video.loads, 0);
  assert.equal(video.plays, 0);
  assert.equal(click(0).defaultPrevented, true);
  assert.equal(dialog.open, true);
  assert.equal(video.getAttribute('src'), video.dataset.src);
  assert.equal(video.loads, 1);
  assert.equal(status.hidden, false);
  video.dispatchEvent(new Event('canplay'));
  assert.equal(status.hidden, true);
  video.currentTime = 12.5;
  dialog.close();
  assert.ok(video.pauses > 0);
  click(1);
  assert.equal(video.currentTime, 12.5);
  assert.equal(video.loads, 1);
  await Promise.resolve();
});

test('a browser-blocked play attempt keeps native playback available without a false load error', async () => {
  const { dialog, video, status, click } = fixture({ play: () => Promise.reject(new Error('NotAllowedError')) });
  click(0);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(dialog.open, true);
  assert.equal(video.plays, 1);
  assert.equal(status.hidden, true);
  assert.doesNotMatch(status.textContent, /couldn’t load/);
});

test('closing or hiding the page pauses the film, including a late successful play promise', async () => {
  let finishPlay;
  const { dialog, video, document, click } = fixture({ play: () => new Promise(resolve => { finishPlay = resolve; }) });
  click(0);
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(video.pauses, 1);
  dialog.close();
  assert.equal(video.pauses, 2);
  finishPlay();
  await Promise.resolve();
  assert.equal(video.pauses, 3);
});

test('a failed media load exposes the direct-video fallback and does not retry automatically', () => {
  const { dialog, video, status, click } = fixture();
  click(0);
  video.error = { code: 4 };
  video.dispatchEvent(new Event('error'));
  assert.equal(status.hidden, false);
  assert.match(status.textContent, /open the video directly/);
  dialog.close();
  click(1);
  assert.equal(video.loads, 1);
  assert.equal(video.plays, 1);
});

test('unsupported dialogs leave the normal video link usable', () => {
  const { video, click } = fixture({ supportsDialog: false });
  assert.equal(click(0).defaultPrevented, false);
  assert.equal(video.getAttribute('src'), null);
  assert.equal(video.loads, 0);
});
