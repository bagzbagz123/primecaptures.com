/* Consent-gated, allowlisted measurement. Never read inquiry field values here. */
(() => {
  'use strict';
  const win = window;
  const doc = document;
  const measurementId = doc.querySelector('#measurement-script')?.dataset.gaId || '';
  const configured = /^G-[A-Z0-9]{6,20}$/.test(measurementId);
  const production = ['primecaptures.com', 'www.primecaptures.com'].includes(win.location.hostname);
  const disabledByBrowser = win.navigator.globalPrivacyControl === true || ['1', 'yes'].includes(win.navigator.doNotTrack);
  const storageKey = 'primecapture.analytics-choice.v1';
  const maxAge = 180 * 24 * 60 * 60 * 1000;
  const canonicalUrl = 'https://www.primecaptures.com/';
  const notice = doc.querySelector('#analytics-notice');
  const privacyDialog = doc.querySelector('#privacy-dialog');
  const allowedEvents = new Set(['page_view', 'cta_click', 'inquiry_open', 'inquiry_start', 'inquiry_submit', 'generate_lead', 'inquiry_error', 'contact_click']);
  const allowedProperties = {
    placement: new Set(['mobile_sticky', 'navigation', 'hero', 'partnership', 'copper_story', 'founder', 'getting_started', 'contact', 'footer', 'inquiry', 'other']),
    channel: new Set(['email', 'instagram']),
    error_type: new Set(['network', 'timeout', 'server', 'validation', 'rate_limit'])
  };
  const sourceValues = new Set(['instagram', 'google', 'facebook', 'linkedin', 'partner', 'email', 'qr']);
  const mediumValues = new Set(['social', 'email', 'referral', 'organic', 'qr']);
  const campaignValues = new Set(['venue_intro', 'partner_referral', 'print_qr', 'profile_link']);
  let consent = null;
  let initialized = false;
  let pageSent = false;

  function savedChoice(value) {
    try {
      const stored = JSON.parse(value || 'null');
      if (stored && ['granted', 'denied'].includes(stored.choice) && Number.isFinite(stored.updatedAt) &&
          Date.now() - stored.updatedAt >= 0 && Date.now() - stored.updatedAt < maxAge) return stored.choice;
    } catch { /* Missing, malformed, and expired preferences all leave analytics off. */ }
    return null;
  }

  try { consent = savedChoice(win.localStorage.getItem(storageKey)); }
  catch { /* Storage access is optional. The form must always remain usable. */ }

  function enabled() { return configured && production && !disabledByBrowser && consent === 'granted'; }
  function status() { return { configured, enabled: enabled(), consent, disabledByBrowser }; }
  function gtag() { win.dataLayer.push(arguments); }

  function attribution() {
    const result = { page_location: canonicalUrl, page_referrer: '' };
    try {
      const params = new URL(win.location.href).searchParams;
      const source = params.get('utm_source');
      const medium = params.get('utm_medium');
      const campaign = params.get('utm_campaign');
      if (sourceValues.has(source)) result.campaign_source = source;
      if (mediumValues.has(medium)) result.campaign_medium = medium;
      if (campaignValues.has(campaign)) result.campaign_name = campaign;
      const referrer = new URL(doc.referrer || canonicalUrl);
      const hosts = {
        'www.google.com': 'https://www.google.com/', 'google.com': 'https://www.google.com/',
        'www.instagram.com': 'https://www.instagram.com/', 'l.instagram.com': 'https://www.instagram.com/',
        'www.facebook.com': 'https://www.facebook.com/', 'l.facebook.com': 'https://www.facebook.com/',
        'www.linkedin.com': 'https://www.linkedin.com/', 'www.bing.com': 'https://www.bing.com/'
      };
      result.page_referrer = hosts[referrer.hostname] || '';
    } catch { /* Malformed referrers and query strings are discarded. */ }
    return result;
  }

  function initialize() {
    if (!enabled() || initialized) return;
    initialized = true;
    win['ga-disable-' + measurementId] = false;
    win.dataLayer = win.dataLayer || [];
    gtag('consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'
    });
    gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('js', new Date());
    gtag('set', { ...attribution(), ads_data_redaction: true });
    gtag('config', measurementId, {
      ...attribution(), send_page_view: false, allow_google_signals: false,
      allow_ad_personalization_signals: false, cookie_expires: 15552000, cookie_update: false
    });
    const script = doc.createElement('script');
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    doc.head.appendChild(script);
  }

  function track(name, properties = {}) {
    try {
      if (!enabled() || !allowedEvents.has(name)) return;
      initialize();
      if (name === 'page_view' && pageSent) return;
      const safe = { ...attribution(), send_to: measurementId };
      for (const [key, values] of Object.entries(allowedProperties)) {
        if (values.has(properties[key])) safe[key] = properties[key];
      }
      if (name === 'page_view') pageSent = true;
      gtag('event', name, safe);
    } catch { /* Analytics must never prevent an inquiry or interaction. */ }
  }

  function clearAnalyticsCookies() {
    const names = (doc.cookie || '').split(';').map(value => value.trim().split('=')[0]);
    for (const name of names) {
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of ['', '; Domain=primecaptures.com', '; Domain=.primecaptures.com', '; Domain=www.primecaptures.com']) {
        doc.cookie = name + '=; Max-Age=0; Path=/' + domain + '; SameSite=Lax';
      }
    }
  }

  function refreshControls() {
    if (notice) notice.hidden = !configured || !production || disabledByBrowser || consent !== null;
    for (const node of doc.querySelectorAll('[data-analytics-status]')) {
      node.textContent = disabledByBrowser ? 'Analytics is off because your browser requests no tracking.' :
        !configured ? 'Analytics is not active yet.' : enabled() ? 'Optional analytics is on.' : 'Optional analytics is off.';
    }
    for (const button of doc.querySelectorAll('[data-analytics-allow]')) button.disabled = disabledByBrowser || !configured || !production;
  }

  function applyConsent(choice) {
    consent = disabledByBrowser && choice === 'granted' ? 'denied' : choice;
    if (enabled()) {
      if (initialized) {
        win['ga-disable-' + measurementId] = false;
        gtag('consent', 'update', { analytics_storage: 'granted' });
      }
      track('page_view');
    } else {
      if (configured) win['ga-disable-' + measurementId] = true;
      if (initialized) gtag('consent', 'update', { analytics_storage: 'denied' });
      clearAnalyticsCookies();
    }
    refreshControls();
  }

  function setConsent(choice) {
    if (!['granted', 'denied'].includes(choice)) return;
    const nextChoice = disabledByBrowser ? 'denied' : choice;
    try { win.localStorage.setItem(storageKey, JSON.stringify({ choice: nextChoice, updatedAt: Date.now() })); } catch { /* Memory-only choice. */ }
    applyConsent(nextChoice);
    if (privacyDialog?.open) privacyDialog.close();
  }

  function showChoices() {
    refreshControls();
    if (privacyDialog && !privacyDialog.open) privacyDialog.showModal();
  }

  for (const button of doc.querySelectorAll('[data-analytics-allow]')) button.addEventListener('click', () => setConsent('granted'));
  for (const button of doc.querySelectorAll('[data-analytics-deny]')) button.addEventListener('click', () => setConsent('denied'));
  for (const button of doc.querySelectorAll('[data-privacy]')) button.addEventListener('click', showChoices);
  win.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    try { if (event.storageArea && event.storageArea !== win.localStorage) return; }
    catch { return; }
    // Apply another tab's choice without writing it back or renewing its expiry.
    applyConsent(event.key === null ? null : savedChoice(event.newValue));
  });
  win.PrimeCaptureMeasurement = Object.freeze({ track, setConsent, showChoices, status });
  refreshControls();
  if (enabled()) track('page_view');
})();
