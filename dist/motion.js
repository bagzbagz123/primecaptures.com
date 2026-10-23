// Apple HIG principles, translated for the web: brief, optional, interruptible motion.
// Distances and timing are Prime Capture design choices, not Apple specifications.
(() => {
  if (!window.matchMedia || !Element.prototype.animate) return;

  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches) return;

  const active = new Map();
  const easing = 'cubic-bezier(.2, .8, .2, 1)';
  const compact = window.matchMedia('(max-width: 760px)');

  function reveal(element, delay = 0, opening = false) {
    if (preference.matches || document.hidden || element.contains(document.activeElement)) return;
    const distance = opening ? 8 : (compact.matches ? 6 : 12);
    const animation = element.animate([
      { transform: `translateY(${distance}px)` },
      { transform: 'translateY(0)' }
    ], {
      duration: opening ? 480 : 400,
      delay,
      easing,
      fill: 'backwards'
    });
    active.set(element, animation);
    const cleanup = () => active.delete(element);
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  }

  // One opening gesture. Text stays at full contrast; actions never wait or move.
  if (window.scrollY < 80 && (!location.hash || location.hash === '#home')) {
    const title = document.querySelector('#hero-title');
    if (title) reveal(title, 0, true);
  }

  // Photography supplies the visual rhythm; copy, prices, and forms stay still.
  const groups = [
    '.experience-story', '.product-media', '.content-image',
    '.portfolio-opening .photo-open', '.moments-grid .photo-open', '.venue-story .photo-open'
  ];
  const delays = new WeakMap();
  const observer = window.IntersectionObserver ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      // Fast scrolling or following an anchor must never animate content already passed.
      if (entry.boundingClientRect.bottom <= 0) continue;
      reveal(entry.target, delays.get(entry.target) || 0);
    }
  }, { threshold: .12, rootMargin: '0px 0px -16px 0px' }) : null;

  for (const selector of groups) {
    document.querySelectorAll(selector).forEach((element, index) => {
      delays.set(element, compact.matches ? 0 : Math.min(index * 45, 90));
      observer?.observe(element);
    });
  }

  // Focused content is always fully visible, including during keyboard navigation.
  document.addEventListener('focusin', event => {
    for (const [element, animation] of active) {
      if (element.contains(event.target)) animation.cancel();
    }
  });

  function cancelActive() {
    for (const animation of active.values()) animation.cancel();
    active.clear();
  }
  // Any direct interaction can interrupt an entrance without delaying its action.
  document.addEventListener('pointerdown', cancelActive, { passive: true });
  document.addEventListener('keydown', cancelActive);
  window.addEventListener('hashchange', cancelActive);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelActive();
  });
  preference.addEventListener('change', event => {
    if (event.matches) {
      observer?.disconnect();
      cancelActive();
    }
  });
})();
