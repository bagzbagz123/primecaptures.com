import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../dist/motion.js', import.meta.url), 'utf8');

function fixture({reduced = false, compact = false, coarse = false, saveData = false, native = true, animateFails = false, deep = false} = {}) {
  const animations = [], registrations = [], queries = new Map();
  let now = 2000;
  class Node extends EventTarget {
    constructor(name, top = 1400) { super(); this.name = name; this.top = top; this.children = []; this.dataset = {}; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    querySelector(selector) { return this.parts?.[selector] || null; }
    matches(selector) { return this.name === 'founder' && selector === '.founder-copy'; }
    closest(selector) { return this.panorama && selector === '.portfolio-opening' ? this : null; }
    getBoundingClientRect() { return {top: this.top, bottom: this.top + 300}; }
    animate(frames, options) {
      if (animateFails) throw new Error('Animation unavailable');
      const animation = {element: this, frames, options, cancelled: false,
        cancel() { this.cancelled = true; this.oncancel?.(); },
        finish() { this.finished = true; this.onfinish?.(); }};
      animations.push(animation);
      return animation;
    }
  }
  const title = new Node('title'), kicker = new Node('kicker'), deck = new Node('deck');
  const chapter = new Node('chapter');
  chapter.parts = {'h2': title, '.section-kicker, .eyebrow': kicker, ':scope > p:not(.section-kicker):not(.founder-promise)': deck};
  chapter.children = [title,kicker,deck];
  const media = new Node('media'), image = new Node('image');
  media.children = [image]; media.parts = {'img': image};
  const panorama = new Node('panorama'), roomImage = new Node('roomImage');
  panorama.panorama = true; panorama.children = [roomImage]; panorama.parts = {'img': roomImage};
  const sequence = new Node('sequence'); sequence.children = [new Node('step1'),new Node('step2'),new Node('step3')];
  const hero = [new Node('hero1'),new Node('hero2')];
  const root = new Node('root'), body = new Node('body');
  body.children = [chapter,media,panorama,sequence,...hero]; root.children = [body];
  const document = Object.assign(new EventTarget(), {
    documentElement: root, body, activeElement: body, hidden: false, modalOpen: false,
    querySelector(selector) { return selector === 'dialog[open]' && this.modalOpen ? body : null; },
    querySelectorAll(selector) {
      if (selector.startsWith('.scroll-story-heading')) return [chapter];
      if (selector.startsWith('.steps')) return [sequence];
      if (selector.startsWith('.experience-photo')) return [media,panorama];
      if (selector.startsWith('#hero-title')) return hero;
      return [];
    }
  });
  function recordEvents(target) {
    const original = target.addEventListener.bind(target);
    target.addEventListener = (name, listener, options) => { registrations.push(name); original(name,listener,options); };
  }
  recordEvents(document);
  const connection = Object.assign(new EventTarget(), {saveData});
  const window = Object.assign(new EventTarget(), {
    matchMedia(query) {
      if (!queries.has(query)) queries.set(query,Object.assign(new EventTarget(),{matches: query.includes('reduced') ? reduced : query.includes('760') ? compact : coarse}));
      return queries.get(query);
    },
    CSS: {supports: () => native}, scrollY: deep ? 4000 : 0,
  });
  recordEvents(window);
  const observers = [];
  class Observer {
    constructor(callback) { this.callback = callback; this.observed = new Set(); observers.push(this); }
    observe(node) { this.observed.add(node); }
    unobserve(node) { this.observed.delete(node); }
    disconnect() { this.observed.clear(); }
    enter(node, top = 700) {
      if (!this.observed.has(node)) return;
      node.top = top;
      this.callback([{target:node,isIntersecting:true,boundingClientRect:{top,bottom:top+300}}]);
    }
  }
  window.IntersectionObserver = Observer;
  vm.runInNewContext(source, {
    window, document, navigator:{connection}, Element:Node,
    matchMedia:window.matchMedia, IntersectionObserver:Observer, CSS:window.CSS,
    innerHeight:1000, location:{hash:deep ? '#experience' : ''}, performance:{now:() => now},
    requestAnimationFrame() { throw new Error('No frame loop permitted'); },
    setInterval() { throw new Error('No idle polling permitted'); },
  });
  const change = (query,value) => { const mq=queries.get(query); mq.matches=value; mq.dispatchEvent(new Event('change')); };
  return {root,body,document,window,connection,animations,registrations,observer:observers[0],chapter,title,kicker,deck,media,image,panorama,sequence,hero,change,advance:ms=>{now+=ms;}};
}

test('OS reduction and data saver leave the page static, including at initial load', () => {
  for (const options of [{reduced:true},{saveData:true}]) {
    const f=fixture(options);
    assert.equal(f.root.dataset.sceneMotion,undefined);
    assert.equal(f.root.dataset.scrollScenes,undefined);
    assert.equal(f.animations.length,0);
    assert.equal(f.observer.observed.size,0);
  }
});

test('mobile and coarse pointers get brief bounded entrances without image zoom or native parallax', () => {
  for (const options of [{compact:true},{coarse:true}]) {
    const f=fixture(options);
    assert.equal(f.root.dataset.sceneMotion,'light');
    assert.equal(f.root.dataset.scrollScenes,undefined);
    f.animations.forEach(a=>a.finish());
    f.observer.enter(f.media);
    f.observer.enter(f.chapter);
    f.observer.enter(f.sequence);
    const running=f.animations.filter(a=>!a.cancelled && !a.finished);
    assert.ok(running.length<=4);
    assert.ok(f.animations.every(a=>a.options.duration<=460));
    assert.ok(f.animations.every(a=>!a.frames.some(frame=>frame.transform?.includes('scale'))));
    assert.ok(f.animations.every(a=>a.frames.every(frame=>frame.opacity===undefined || frame.opacity>=.9)));
    assert.equal(f.animations.some(a=>a.element===f.image),false);
  }
});

test('desktop stages title and deck while leaving actions and body copy outside the animation plan', () => {
  const f=fixture({deep:true});
  f.observer.enter(f.chapter);
  assert.deepEqual(f.animations.map(a=>a.element.name),['kicker','title','deck']);
  assert.deepEqual(f.animations.map(a=>a.options.delay),[0,65,120]);
  assert.ok(f.animations.every(a=>a.frames.every(frame=>frame.opacity===undefined)));
  assert.equal(f.registrations.includes('scroll'),false);
  assert.equal(f.registrations.includes('wheel'),false);
  assert.equal(f.registrations.includes('touchmove'),false);
});

test('native panorama timelines and one-time media fallback never compete', () => {
  const native=fixture({deep:true});
  native.observer.enter(native.panorama);
  assert.equal(native.root.dataset.scrollScenes,'native');
  assert.equal(native.animations.length,0);
  const fallback=fixture({deep:true,native:false});
  fallback.observer.enter(fallback.panorama);
  assert.equal(fallback.root.dataset.scrollScenes,undefined);
  assert.equal(fallback.animations.length,2);
});

test('focus, pointer and keyboard interrupt motion, including when a focused link wraps the animated image', () => {
  for (const name of ['focusin','pointerdown','keydown']) {
    const f=fixture({deep:true}); f.observer.enter(f.media);
    assert.equal(f.animations.length,2);
    f.document.dispatchEvent(new Event(name));
    assert.ok(f.animations.every(a=>a.cancelled));
  }
  const focused=fixture({deep:true}); focused.document.activeElement=focused.media;
  focused.observer.enter(focused.media);
  assert.equal(focused.animations.length,0);
});

test('deep links, hash jumps and quickly passed sections stay static and never replay', () => {
  const f=fixture({deep:true});
  assert.equal(f.animations.length,0);
  f.window.dispatchEvent(new Event('hashchange'));
  f.observer.enter(f.chapter);
  assert.equal(f.animations.length,0);
  f.advance(1500);
  f.observer.enter(f.media,-20);
  assert.equal(f.animations.length,0);
  f.observer.enter(f.chapter);
  assert.equal(f.animations.length,0);
});

test('opening a dialog cancels entrances and background scenes stay still while it is open', () => {
  const f=fixture({deep:true}); f.observer.enter(f.media);
  const dialog=Object.assign(new EventTarget(),{tagName:'DIALOG'});
  // Dispatch with the dialog as the originating target, like a native toggle.
  const event=new Event('toggle'); Object.defineProperty(event,'target',{value:dialog});
  f.document.modalOpen=true; f.document.dispatchEvent(event);
  assert.ok(f.animations.every(a=>a.cancelled));
  const before=f.animations.length; f.observer.enter(f.chapter);
  assert.equal(f.animations.length,before);
  f.document.modalOpen=false; f.observer.enter(f.sequence);
  assert.ok(f.animations.length>before);
});

test('preference changes and backgrounding cancel work; restore observes only future scenes', () => {
  const f=fixture({deep:true}); f.observer.enter(f.chapter);
  f.change('(prefers-reduced-motion: reduce)',true);
  assert.ok(f.animations.every(a=>a.cancelled));
  assert.equal(f.root.dataset.sceneMotion,undefined);
  assert.equal(f.observer.observed.size,0);
  f.change('(prefers-reduced-motion: reduce)',false);
  assert.equal(f.root.dataset.sceneMotion,'full');
  assert.equal(f.observer.observed.has(f.chapter),false);
  assert.equal(f.observer.observed.has(f.media),true);
  f.observer.enter(f.media); f.document.hidden=true;
  f.document.dispatchEvent(new Event('visibilitychange'));
  assert.ok(f.animations.every(a=>a.cancelled));
  assert.equal(f.observer.observed.size,0);
  f.document.hidden=false; f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.observer.observed.has(f.media),false);
  assert.equal(f.observer.observed.has(f.sequence),true);
});

test('initial pageshow does not cancel the opening, and animation API failure leaves future sections usable', () => {
  const f=fixture(); f.window.dispatchEvent(new Event('pageshow'));
  assert.equal(f.animations.length,2);
  assert.ok(f.animations.every(a=>!a.cancelled));
  const failure=fixture({animateFails:true});
  assert.doesNotThrow(()=>failure.observer.enter(failure.chapter));
  assert.doesNotThrow(()=>failure.observer.enter(failure.media));
  assert.equal(failure.animations.length,0);
  assert.equal(failure.observer.observed.has(failure.sequence),true);
});
