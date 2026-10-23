// Native scroll and brief one-time entrances. Content never depends on motion.
// No scroll interception, per-frame JavaScript, or idle render loop.
(() => {
  if (!window.matchMedia || !Element.prototype.animate) return;
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 760px)');
  const coarse = matchMedia('(pointer: coarse)');
  const connection = navigator.connection;
  const nativeScroll = Boolean(window.CSS?.supports('animation-timeline: view()') && CSS.supports('animation-range: entry 0% entry 100%'));
  const active = new Map();
  const seen = new WeakSet();
  const records = new Map();
  const easing = 'cubic-bezier(.16, 1, .3, 1)';
  let mode, skipUntil = 0, disposed = false;

  const focused = element => {
    const current = document.activeElement;
    return current && current !== document.body && current !== root &&
      (element.contains(current) || current.contains(element));
  };
  function animate(element, frames, delay = 0, duration) {
    if (!mode || document.hidden || document.querySelector('dialog[open]') || focused(element) || active.size >= (mode === 'light' ? 4 : 8)) return;
    try {
      const animation = element.animate(frames, {
        duration: duration || (mode === 'light' ? 460 : 900), delay, easing, fill: 'backwards'
      });
      active.set(animation, element);
      animation.onfinish = animation.oncancel = () => active.delete(animation);
    } catch { /* Unavailable animation leaves the underlying content untouched. */ }
  }
  function lift(element, delay = 0) {
    animate(element, [{transform: `translateY(${mode === 'light' ? 12 : 32}px)`}, {transform: 'none'}], delay);
  }
  function enter(element, kind) {
    if (kind === 'chapter') {
      // Actions, forms and long paragraphs stay put. The title and short deck lead.
      const title = element.querySelector('h2');
      const kicker = element.querySelector('.section-kicker, .eyebrow') ||
        (element.previousElementSibling?.matches('.section-kicker') ? element.previousElementSibling : null);
      const deck = element.querySelector(':scope > p:not(.section-kicker):not(.founder-promise)');
      if (kicker) lift(kicker);
      if (title) lift(title, mode === 'light' ? 25 : 65);
      if (deck && !element.matches('.founder-copy')) lift(deck, mode === 'light' ? 45 : 120);
    } else if (kind === 'sequence') {
      [...element.children].forEach((child, index) => lift(child, Math.min(index, 2) * (mode === 'light' ? 30 : 75)));
    } else {
      // Capable desktops use the native scroll timeline for the room panorama.
      if (mode === 'full' && nativeScroll && element.closest('.portfolio-opening')) return;
      animate(element, [
        {transform: `translateY(${mode === 'light' ? 10 : 24}px)`, opacity: .9},
        {transform: 'none', opacity: 1}
      ]);
      if (mode === 'full') {
        const image = element.querySelector('img');
        if (image) animate(image, [{transform: 'scale(1.045)'}, {transform: 'none'}], 0, 1100);
      }
    }
  }

  const observer = window.IntersectionObserver ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      seen.add(entry.target);
      // Anchor jumps and fast scrolling land directly on readable content.
      if (!mode || performance.now() < skipUntil || entry.boundingClientRect.top < 0 || document.hidden) continue;
      enter(entry.target, records.get(entry.target));
    }
  }, {threshold: 0, rootMargin: '0px 0px -10% 0px'}) : null;

  const selectors = {
    chapter: '.scroll-story-heading > div:first-child, .intro-heading, .keepsake-heading, .partnership-heading, .venue-story-copy, .moments-heading, .founder-copy, .getting-started-heading, .faq-intro, .contact-copy',
    sequence: '.steps, .launch-steps',
    media: '.experience-photo .photo-open, .hospitality-photo .photo-open, .keepsake-collection .photo-open, .keepsake-glass .photo-open, .venue-story .photo-open, .portfolio-opening .photo-open, .moments-grid .photo-open, .brand-film-poster'
  };
  for (const [kind, selector] of Object.entries(selectors)) {
    document.querySelectorAll(selector).forEach(element => records.set(element, kind));
  }
  function cancelActive() {
    for (const animation of active.keys()) animation.cancel();
    active.clear();
  }
  function reconcile() {
    cancelActive();
    observer?.disconnect();
    mode = !disposed && !reduced.matches && !connection?.saveData ?
      (compact.matches || coarse.matches ? 'light' : 'full') : null;
    if (mode) root.dataset.sceneMotion = mode;
    else delete root.dataset.sceneMotion;
    if (mode === 'full' && nativeScroll) root.dataset.scrollScenes = 'native';
    else delete root.dataset.scrollScenes;
    if (!mode || document.hidden) return;
    for (const element of records.keys()) {
      if (seen.has(element)) continue;
      // Restored sessions and preference changes do not replay passed scenes.
      if (element.getBoundingClientRect().top < innerHeight * .9) seen.add(element);
      else observer?.observe(element);
    }
  }
  function skipArrival() {
    cancelActive();
    skipUntil = performance.now() + 1200;
  }
  document.addEventListener('focusin', cancelActive);
  document.addEventListener('pointerdown', cancelActive, {passive: true});
  document.addEventListener('keydown', event => {
    cancelActive();
    if (['Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) skipArrival();
  });
  document.addEventListener('click', event => {
    if (event.target.closest?.('a[href^="#"]')) skipArrival();
  }, {capture: true});
  window.addEventListener('hashchange', skipArrival);
  document.addEventListener('visibilitychange', reconcile);
  document.addEventListener('toggle', event => {
    if (event.target.tagName === 'DIALOG') cancelActive();
  }, true);
  reduced.addEventListener('change', reconcile);
  compact.addEventListener('change', reconcile);
  coarse.addEventListener('change', reconcile);
  connection?.addEventListener?.('change', reconcile);
  window.addEventListener('pagehide', event => {
    cancelActive(); observer?.disconnect();
    if (!event.persisted) disposed = true;
  });
  window.addEventListener('pageshow', event => { if (event.persisted) reconcile(); });
  reconcile();

  if (mode && window.scrollY < 80 && (!location.hash || location.hash === '#home')) {
    document.querySelectorAll('#hero-title > span, #hero-title > em').forEach((line, index) => lift(line, index * (mode === 'light' ? 35 : 100)));
  }
})();
