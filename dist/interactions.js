// Keep visitors oriented without changing native scrolling or anchor navigation.
(() => {
  const navigation = document.querySelector('.nav');
  if (!navigation) return;
  const links = [...navigation.querySelectorAll('.nav-links a[href^="#"]')];
  const sections = [...document.querySelectorAll('main > section[id]')];
  let scheduled = false;
  let currentSection;

  function update() {
    scheduled = false;
    const offset = Math.min(180, navigation.getBoundingClientRect().bottom + 24);
    let current = '';
    for (const section of sections) {
      const bounds = section.getBoundingClientRect();
      if (bounds.top <= offset && bounds.bottom > offset) current = section.dataset.navSection || section.id;
    }
    if (current === currentSection) return;
    currentSection = current;
    for (const link of links) {
      if (link.getAttribute('href') === `#${current}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }

  function queue() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  window.addEventListener('pageshow', queue);
  document.addEventListener('toggle', queue, true);
  if (window.ResizeObserver) new ResizeObserver(queue).observe(document.body);
  document.fonts?.ready.then(queue);
  update();
})();
