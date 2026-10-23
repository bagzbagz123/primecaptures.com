// Keep visitors oriented without changing native scrolling or anchor navigation.
(() => {
  const navigation = document.querySelector('.nav');
  if (!navigation) return;
  const links = [...navigation.querySelectorAll('.nav-links a[href^="#"]')];
  const sections = [...document.querySelectorAll('main > section[id]')];
  const logos = [...document.querySelectorAll('[data-logo-morph]')].map(rotor => ({
    rotor,
    original: rotor.querySelector('[data-logo-original]'),
    aperture: rotor.querySelector('[data-three-blades]'),
    blades: [...rotor.querySelectorAll('[data-morph-blade]')],
  }));

  function bladePath(progress) {
    const radius = 59 * (1 - progress);
    const twist = -Math.PI / 6 * progress;
    const point = (r, angle) => [r * Math.cos(angle), r * Math.sin(angle)];
    const position = ([x, y]) => `${(66 + x).toFixed(3)} ${(66 + y).toFixed(3)}`;
    const innerStart = point(radius, -Math.PI / 2 + twist);
    const innerEnd = point(radius, Math.PI / 6 + twist);
    const outerStart = [0, -59];
    // Shared curved boundaries meet exactly when the three blades close.
    const controlStart = [(outerStart[0] + innerStart[0]) / 2 - .3 * (59 - radius), (outerStart[1] + innerStart[1]) / 2];
    const controlEnd = [controlStart[0] * -.5 - controlStart[1] * Math.sqrt(3) / 2,
      controlStart[0] * Math.sqrt(3) / 2 - controlStart[1] * .5];
    let path = `M66 7 A59 59 0 0 1 117.095 95.5 Q${position(controlEnd)} ${position(innerEnd)}`;
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      const r = radius * (1 - .25 * progress * Math.sin(Math.PI * t));
      path += ` L${position(point(r, Math.PI / 6 + twist - 2 * Math.PI / 3 * t))}`;
    }
    return path + ` Q${position(controlStart)} 66 7Z`;
  }
  let scheduled = false;

  function update() {
    scheduled = false;
    const offset = Math.min(180, navigation.getBoundingClientRect().bottom + 24);
    let current = '';
    for (const section of sections) {
      const bounds = section.getBoundingClientRect();
      if (bounds.top <= offset && bounds.bottom > offset) current = section.dataset.navSection || section.id;
    }
    for (const link of links) {
      if (link.getAttribute('href') === `#${current}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    const fraction = distance <= 0 ? 0 : distance - window.scrollY <= 1
      ? 1 : Math.min(1, Math.max(0, window.scrollY / distance));
    // Close through the first half, then reopen through the second half.
    // Ease each leg so the blades settle gently at the midpoint and endpoints.
    const cycle = 1 - Math.abs(2 * fraction - 1);
    const morph = cycle * cycle * (3 - 2 * cycle);
    const path = bladePath(morph);
    for (const logo of logos) {
      logo.rotor.setAttribute('data-morph-progress', String(fraction));
      logo.rotor.setAttribute('data-morph-phase', String(morph));
      logo.rotor.setAttribute('transform', `rotate(${360 * fraction} 66 66)`);
      logo.original?.setAttribute('opacity', String(Math.max(0, 1 - morph / .22)));
      logo.aperture?.setAttribute('opacity', String(Math.min(1, morph / .1)));
      for (const blade of logo.blades) blade.setAttribute('d', path);
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
