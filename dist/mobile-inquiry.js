// A small progressive enhancement: every original inquiry link still works alone.
(() => {
  'use strict';
  const dock = document.querySelector('#mobile-inquiry');
  const link = dock?.querySelector('[data-mobile-inquiry]');
  const hero = document.querySelector('#home');
  const navigation = document.querySelector('.nav');
  const menu = document.querySelector('.menu-toggle');
  if (!dock || !link || !hero || !navigation || !window.matchMedia || !window.IntersectionObserver || !window.MutationObserver) return;

  const compact = window.matchMedia('(max-width: 760px)');
  const partners = [...document.querySelectorAll('[data-partner]')].filter(node => node !== link);
  const dialogs = [...document.querySelectorAll('dialog')];
  const inquiry = document.querySelector('#inquiry-dialog');
  const notice = document.querySelector('#analytics-notice');
  const footer = document.querySelector('footer');
  const viewport = window.visualViewport;
  let queued = false;
  let returnToDock = false;
  let restoreFocus = false;

  function rendered(node) {
    if (!node || node.hidden || !node.getClientRects().length) return false;
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.opacity !== '0';
  }

  function inView(node, top, bottom) {
    if (!rendered(node)) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < window.innerWidth && rect.bottom > top && rect.top < bottom;
  }

  function update() {
    queued = false;
    const focused = document.activeElement;
    const editable = focused?.matches('input, textarea, select') || focused?.isContentEditable;
    const keyboard = viewport && Math.abs((viewport.scale || 1) - 1) < .05 && window.innerHeight - viewport.height > 150;
    const overlay = menu?.getAttribute('aria-expanded') === 'true' || navigation.classList.contains('menu-open') || dialogs.some(dialog => dialog.open);
    const viewportTop = viewport?.offsetTop || 0;
    const viewportBottom = Math.min(window.innerHeight, viewportTop + (viewport?.height || window.innerHeight));
    const blocked = !compact.matches || document.hidden || editable || keyboard || overlay || inView(notice, viewportTop, viewportBottom);
    const navBottom = Math.max(viewportTop, navigation.getBoundingClientRect().bottom + 8);
    // Leave the bottom tap area clear when deciding whether another action is usable.
    const actionBottom = viewportBottom - 86;
    const existingAction = partners.find(node => node.closest('.nav')
      ? inView(node, viewportTop, viewportBottom)
      : inView(node, navBottom, actionBottom));
    const pastHero = hero.getBoundingClientRect().bottom <= viewportTop;
    const atFooter = inView(footer, viewportTop, viewportBottom);
    const keepFocusedAction = dock.contains(focused);
    const show = !blocked && (keepFocusedAction || (pastHero && !existingAction && !atFooter));
    if (dock.hidden === show) dock.hidden = !show;
    document.documentElement.classList.toggle('mobile-inquiry-visible', show);
    if (restoreFocus || (keepFocusedAction && !show && !overlay && !editable && !keyboard && !document.hidden)) {
      restoreFocus = false;
      if (show) link.focus({preventScroll: true});
      else if (!overlay && !editable && !keyboard) {
        const fallback = existingAction || (rendered(menu) ? menu : null);
        fallback?.focus({preventScroll: true});
      }
    }
  }

  function queue() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(update);
  }

  // Capture the opener before the existing form handler moves focus into its dialog.
  link.addEventListener('click', () => { returnToDock = true; }, {capture: true});
  inquiry?.addEventListener('close', () => {
    if (!returnToDock) return;
    returnToDock = false;
    restoreFocus = true;
    queue();
  });
  const intersection = new IntersectionObserver(queue, {threshold: [0, .5, 1]});
  [hero, footer, notice, ...partners].filter(Boolean).forEach(node => intersection.observe(node));
  const mutations = new MutationObserver(records => {
    if (records.some(record => record.target === menu || record.target === navigation || record.target === notice || dialogs.includes(record.target))) queue();
  });
  mutations.observe(document.body, {subtree: true, attributes: true, attributeFilter: ['open', 'hidden', 'class', 'aria-expanded']});
  if (window.ResizeObserver) new ResizeObserver(queue).observe(document.body);
  if (compact.addEventListener) compact.addEventListener('change', queue);
  else compact.addListener(queue);
  window.addEventListener('scroll', queue, {passive: true});
  window.addEventListener('resize', queue, {passive: true});
  window.addEventListener('pageshow', queue);
  viewport?.addEventListener('resize', queue, {passive: true});
  viewport?.addEventListener('scroll', queue, {passive: true});
  document.addEventListener('focusin', queue);
  document.addEventListener('focusout', queue);
  document.addEventListener('toggle', queue, true);
  document.addEventListener('visibilitychange', queue);
  document.fonts?.ready.then(queue);
  queue();
})();
