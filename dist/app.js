function measure(name, properties) {
  try { window.PrimeCaptureMeasurement?.track(name, properties); } catch { /* Measurement never blocks an action. */ }
}
function placementOf(element) {
  if (element.matches('[data-mobile-inquiry]')) return 'mobile_sticky';
  if (element.closest('header')) return 'navigation';
  if (element.closest('footer')) return 'footer';
  if (element.closest('#inquiry-dialog')) return 'inquiry';
  const locations = { home: 'hero', partnership: 'partnership', 'copper-29': 'copper_story', founder: 'founder', 'getting-started': 'getting_started', contact: 'contact' };
  return locations[element.closest('section')?.id] || 'other';
}
let inquiryPlacement = 'other';
let inquiryStarted = false;
let inquiryDraftPlacement = null;
const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
function syncNavigationClearance() {
  document.documentElement.style.setProperty('--nav-clearance', `${Math.ceil(nav.getBoundingClientRect().bottom + 16)}px`);
}
if (window.ResizeObserver) new ResizeObserver(syncNavigationClearance).observe(nav);
window.addEventListener('resize', syncNavigationClearance);
document.fonts?.ready.then(syncNavigationClearance);
syncNavigationClearance();
menuButton.addEventListener('click', () => {
  const expanded = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(expanded));
  menuButton.setAttribute('aria-label', expanded ? 'Close menu' : 'Open menu');
  nav.classList.toggle('menu-open', expanded);
  syncNavigationClearance();
});
document.querySelectorAll('.nav a').forEach(link => link.addEventListener('click', () => {
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open menu');
  nav.classList.remove('menu-open');
  syncNavigationClearance();
}));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && nav.classList.contains('menu-open')) {
    menuButton.click();
    menuButton.focus();
  }
});

const inquiryDialog = document.querySelector('#inquiry-dialog');
const photoDialog = document.querySelector('#photo-dialog');
document.querySelectorAll('[data-partner]').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open menu');
  nav.classList.remove('menu-open');
  if (button.classList.contains('compact-partner-link')) menuButton.focus({ preventScroll: true });
  inquiryPlacement = placementOf(button);
  measure('cta_click', { placement: inquiryPlacement });
  inquiryDialog.showModal();
  measure('inquiry_open', { placement: inquiryPlacement });
}));
document.querySelectorAll('[data-photo-help]').forEach(button => button.addEventListener('click', () => {
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open menu');
  nav.classList.remove('menu-open');
  photoDialog.showModal();
}));
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
});

const processDialog = document.querySelector('#process-dialog');
const processVideo = document.querySelector('#process-video');
if (processDialog && processVideo) {
  document.querySelectorAll('[data-process-video]').forEach(link => {
    link.addEventListener('click', event => {
      if (typeof processDialog.showModal !== 'function') return;
      event.preventDefault();
      processDialog.showModal();
    });
  });
  processDialog.addEventListener('close', () => processVideo.pause());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) processVideo.pause();
  });
}

const form = document.querySelector('#inquiry-form');
const success = document.querySelector('#inquiry-success');
const errorMessage = document.querySelector('#inquiry-error');
const submitButton = form.querySelector('[type="submit"]');
const submitButtonContent = submitButton.innerHTML;
function startInquiryMeasurement() {
  try {
    if (inquiryStarted || !window.PrimeCaptureMeasurement?.status().enabled) return;
    inquiryDraftPlacement = inquiryPlacement;
    inquiryStarted = true;
    measure('inquiry_start', { placement: inquiryDraftPlacement });
  } catch { /* Measurement must never prevent editing or sending the inquiry. */ }
}
form.addEventListener('input', event => {
  if (event.target.matches('[name="website"]')) return;
  startInquiryMeasurement();
});
let validationReported = false;
form.addEventListener('invalid', event => {
  if (validationReported || event.target.matches('[name="website"]')) return;
  // Group one native validation run even if the browser checkpoints microtasks between fields.
  validationReported = true;
  setTimeout(() => { validationReported = false; }, 0);
  measure('inquiry_error', { placement: inquiryDraftPlacement || inquiryPlacement, error_type: 'validation' });
}, true);
document.querySelectorAll('a[href^="mailto:"], a[href^="https://www.instagram.com/"]').forEach(link => {
  link.addEventListener('click', () => measure('contact_click', {
    placement: placementOf(link), channel: link.getAttribute('href').startsWith('mailto:') ? 'email' : 'instagram'
  }));
});
let sending = false;
let submissionId = crypto.randomUUID();
let lastPayload = '';
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (sending || !form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  for (const key of Object.keys(data)) data[key] = data[key].trim();
  const payload = JSON.stringify(data);
  if (lastPayload && lastPayload !== payload) submissionId = crypto.randomUUID();
  lastPayload = payload;
  data.submissionId = submissionId;
  sending = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Sending…';
  form.setAttribute('aria-busy', 'true');
  errorMessage.hidden = true;
  // Autofill can reach a valid submission without dispatching an input event.
  startInquiryMeasurement();
  const submissionPlacement = inquiryDraftPlacement || inquiryPlacement;
  measure('inquiry_submit', { placement: submissionPlacement });
  try {
    const response = await fetch('/api/partnership', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data), signal: AbortSignal.timeout(20000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) {
      const error = new Error(result?.error || 'We couldn’t confirm your inquiry was sent. Please try again, or email contact@primecaptures.com.');
      error.inquiryErrorType = [400, 422].includes(response.status) ? 'validation' : response.status === 429 ? 'rate_limit' : 'server';
      throw error;
    }
    measure('generate_lead', { placement: submissionPlacement });
    form.hidden = true;
    success.hidden = false;
    document.querySelector('#dialog-title').textContent = 'Let’s start a conversation.';
    document.querySelector('#dialog-description').hidden = true;
    success.focus();
  } catch (error) {
    measure('inquiry_error', { placement: submissionPlacement, error_type: error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : error.name === 'TypeError' ? 'network' : error.inquiryErrorType || 'server' });
    errorMessage.textContent = error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 'This is taking longer than expected. Your details are still here—please try again, or email contact@primecaptures.com.'
      : error.name === 'TypeError'
        ? 'We couldn’t connect. Check your connection and try again, or email contact@primecaptures.com.'
        : error.message;
    errorMessage.hidden = false;
    errorMessage.focus();
  } finally {
    sending = false;
    submitButton.disabled = false;
    submitButton.innerHTML = submitButtonContent;
    form.removeAttribute('aria-busy');
  }
});
function resetCompletedInquiry() {
  if (success.hidden) return;
  form.reset();
  inquiryStarted = false;
  inquiryDraftPlacement = null;
  form.querySelector('.inquiry-extra').open = false;
  form.hidden = false;
  success.hidden = true;
  errorMessage.hidden = true;
  submissionId = crypto.randomUUID();
  lastPayload = '';
  document.querySelector('#dialog-title').innerHTML = 'Tell us about<br>your venue.';
  document.querySelector('#dialog-description').hidden = false;
}
document.querySelector('.success-close').addEventListener('click', () => inquiryDialog.close());
inquiryDialog.addEventListener('close', resetCompletedInquiry);

const allGalleryLinks = [...document.querySelectorAll('[data-gallery]')];
let galleryLinks = [];
const galleryDialog = document.querySelector('#gallery-dialog');
const galleryImage = document.querySelector('#gallery-image');
const galleryStatus = document.querySelector('#gallery-status');
const galleryMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let galleryAnimation;
let galleryDirection = 1;
let galleryIndex = 0;
let galleryThumbnails = [];
function selectGallery(group) {
  galleryLinks = allGalleryLinks.filter(link => (link.dataset.galleryGroup || 'portfolio') === group);
  const container = document.querySelector('.gallery-thumbnails');
  container.replaceChildren();
  galleryThumbnails = galleryLinks.map((link, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gallery-thumbnail';
    button.setAttribute('aria-label', `View photograph ${index + 1}: ${link.dataset.title}`);
    button.setAttribute('aria-pressed', 'false');
    const thumbnail = document.createElement('img');
    thumbnail.src = link.querySelector('img').getAttribute('src');
    thumbnail.alt = '';
    thumbnail.width = 84;
    thumbnail.height = 56;
    thumbnail.loading = 'lazy';
    thumbnail.decoding = 'async';
    button.append(thumbnail);
    button.addEventListener('click', () => showPhotograph(index));
    container.append(button);
    return button;
  });
}

function photographReady() {
  galleryImage.removeAttribute('aria-busy');
  if (!galleryDialog.open || galleryMotion.matches || !galleryImage.animate) return;
  galleryAnimation?.cancel();
  galleryAnimation = galleryImage.animate([
    { transform: `translateX(${galleryDirection * 8}px)` },
    { transform: 'translateX(0)' }
  ], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
}
galleryImage.addEventListener('load', photographReady);
galleryImage.addEventListener('error', () => {
  galleryImage.removeAttribute('aria-busy');
  galleryStatus.textContent = 'This photograph couldn’t load. Please choose another photo or try again.';
  galleryStatus.hidden = false;
});
galleryMotion.addEventListener('change', event => {
  if (event.matches) galleryAnimation?.cancel();
});
galleryDialog.addEventListener('close', () => galleryAnimation?.cancel());

function showPhotograph(index) {
  const previous = galleryIndex;
  galleryIndex = (index + galleryLinks.length) % galleryLinks.length;
  galleryDirection = index < previous ? -1 : 1;
  galleryAnimation?.cancel();
  const link = galleryLinks[galleryIndex];
  galleryImage.dataset.orientation = link.dataset.galleryOrientation || 'landscape';
  galleryStatus.hidden = true;
  galleryImage.setAttribute('aria-busy', 'true');
  galleryImage.alt = link.querySelector('img').alt;
  const changed = galleryImage.src !== link.href;
  galleryImage.src = link.href;
  if (!changed && galleryImage.complete && galleryImage.naturalWidth) galleryImage.removeAttribute('aria-busy');
  document.querySelector('#gallery-title').textContent = link.dataset.title;
  document.querySelector('#gallery-count').textContent = `${galleryIndex + 1} / ${galleryLinks.length}`;
  galleryThumbnails.forEach((button, buttonIndex) => button.setAttribute('aria-pressed', String(buttonIndex === galleryIndex)));
}
allGalleryLinks.forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  selectGallery(link.dataset.galleryGroup || 'portfolio');
  showPhotograph(galleryLinks.indexOf(link));
  galleryDialog.showModal();
}));
galleryDialog.querySelector('.gallery-previous').addEventListener('click', () => showPhotograph(galleryIndex - 1));
galleryDialog.querySelector('.gallery-next').addEventListener('click', () => showPhotograph(galleryIndex + 1));
galleryDialog.addEventListener('keydown', event => {
  if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    showPhotograph(event.key === 'Home' ? 0 : event.key === 'End' ? galleryLinks.length - 1 : galleryIndex + (event.key === 'ArrowRight' ? 1 : -1));
  }
});

// Horizontal photo swipes coexist with vertical scrolling and pinch-to-zoom.
let galleryTouch = null;
galleryImage.addEventListener('touchstart', event => {
  const touch = event.touches[0];
  galleryTouch = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY, time: Date.now() } : null;
}, { passive: true });
galleryImage.addEventListener('touchcancel', () => { galleryTouch = null; }, { passive: true });
galleryImage.addEventListener('touchend', event => {
  const start = galleryTouch;
  galleryTouch = null;
  if (!start || event.touches.length || !event.changedTouches.length) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - start.x;
  const dy = touch.clientY - start.y;
  if (Date.now() - start.time < 800 && Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
    showPhotograph(galleryIndex + (dx < 0 ? 1 : -1));
  }
}, { passive: true });
