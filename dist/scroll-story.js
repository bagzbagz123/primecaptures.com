import {shouldAnimate} from './scroll-story-core.js?v=1';

const section = document.querySelector('.scroll-story');
if (section && 'IntersectionObserver' in window) {
  const button = section.querySelector('.story-motion-toggle');
  const label = button.querySelector('span');
  const skip = section.querySelector('.story-skip');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  let preference = 'on', nearby = false, visible = false, failed = false;
  let controller, pending = false, disposed = false;
  let pageReady = document.readyState === 'complete';
  try { preference = localStorage.getItem('primecapture-particle-motion') === 'off' ? 'off' : 'on'; } catch { /* Private browsing still works. */ }
  const wantsMotion = () => !reduced.matches && preference !== 'off' && !connection?.saveData && !failed;
  const allowed = () => shouldAnimate({reducedMotion: reduced.matches, preference, saveData: connection?.saveData, hidden: document.hidden, visible: true, failed});
  const setLayout = enabled => {
    if (Boolean(section.dataset.storyLayout) === enabled) return;
    // Reserve the scroll track before the deferred renderer arrives. Keep a
    // visitor's reading position if a fallback changes content above them.
    const next = section.nextElementSibling;
    const before = next.getBoundingClientRect().top;
    if (enabled) {
      section.dataset.storyLayout = 'true';
      section.querySelector('.story-chapter').dataset.active = 'true';
    } else delete section.dataset.storyLayout;
    if (before <= 120) {
      const shift = next.getBoundingClientRect().top - before;
      if (Math.abs(shift) > 1) window.scrollBy({top: shift, behavior: 'instant'});
    }
  };
  const updateControl = () => {
    button.hidden = reduced.matches || Boolean(connection?.saveData) || failed;
    button.setAttribute('aria-pressed', String(preference === 'on' && !button.hidden));
    label.textContent = `Animation: ${preference === 'on' ? 'on' : 'off'}`;
    button.querySelector('path').setAttribute('d', preference === 'on' ? 'M4 3h3v10H4zm5 0h3v10H9z' : 'M5 2v12l9-6z');
    skip.firstChild.textContent = section.dataset.storyLayout ? 'Skip the animation ' : 'See the experience ';
  };
  const stop = () => {
    controller?.destroy();
    controller = undefined;
    delete section.dataset.enhanced;
    section.querySelector('[data-story-stage]').textContent = 'THE KEEPSAKE';
    section.querySelectorAll('.story-chapter').forEach(chapter => delete chapter.dataset.active);
  };
  const fail = () => { failed = true; stop(); setLayout(false); updateControl(); };
  async function reconcile() {
    setLayout(wantsMotion());
    updateControl();
    if (disposed) return;
    if (!allowed()) {
      // A background tab pauses an existing scene without tearing it down.
      if (document.hidden && !reduced.matches && preference !== 'off' && !connection?.saveData && !failed) controller?.setVisible(false);
      else stop();
      updateControl();
      return;
    }
    if (controller) { controller.setVisible(visible); return; }
    if (!nearby || pending || !pageReady) return;
    pending = true;
    try {
      // This import and its self-hosted renderer never enter the critical hero path.
      const {createStoryScene} = await import('./scroll-story-scene.js?v=1');
      if (disposed || !allowed()) return;
      controller = createStoryScene(section, {onFailure: fail});
      controller.setVisible(visible);
    } catch (error) {
      if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') console.info('Particle story fallback:', error);
      fail();
    }
    finally { pending = false; updateControl(); }
  }
  const nearObserver = new IntersectionObserver(entries => {
    nearby = entries[0].isIntersecting;
    if (nearby) reconcile();
  }, {rootMargin: '400px 0px'});
  const visibleObserver = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    reconcile();
  });
  nearObserver.observe(section);
  visibleObserver.observe(section);
  button.addEventListener('click', () => {
    preference = preference === 'off' ? 'on' : 'off';
    try { localStorage.setItem('primecapture-particle-motion', preference); } catch { /* Optional preference. */ }
    reconcile();
  });
  reduced.addEventListener('change', reconcile);
  connection?.addEventListener?.('change', reconcile);
  document.addEventListener('visibilitychange', reconcile);
  window.addEventListener('pagehide', event => {
    if (event.persisted) controller?.setVisible(false);
    else { disposed = true; nearObserver.disconnect(); visibleObserver.disconnect(); stop(); }
  });
  window.addEventListener('pageshow', reconcile);
  if (!pageReady) window.addEventListener('load', () => {
    const ready = () => { pageReady = true; reconcile(); };
    if ('requestIdleCallback' in window) requestIdleCallback(ready, {timeout: 1500});
    else setTimeout(ready, 150);
  }, {once: true});
  setLayout(wantsMotion());
  updateControl();
}
