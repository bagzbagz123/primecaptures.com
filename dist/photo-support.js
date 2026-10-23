(() => {
  const dialog = document.querySelector('#photo-dialog');
  const form = document.querySelector('#photo-support-form');
  if (!dialog || !form) return;

  const success = document.querySelector('#photo-support-success');
  const error = document.querySelector('#photo-support-error');
  const submit = form.querySelector('[type="submit"]');
  const dateField = form.elements.namedItem('visitDate');
  dateField.min = '1900-01-01';
  const originalButton = submit.innerHTML;
  const editableFields = ['venue', 'visitDate', 'email', 'message'];
  let sending = false;
  let completed = false;
  let submissionId = '';
  let previousPayload = '';

  function miamiToday() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
  }

  function updateDateLimit() {
    dateField.max = miamiToday();
  }

  function validVisitDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= dateField.min && value <= dateField.max;
  }

  function focusOutcome(element) {
    if (dialog.open) element.focus();
  }

  updateDateLimit();
  form.addEventListener('input', event => {
    if (editableFields.includes(event.target.name)) event.target.setCustomValidity('');
  });
  dialog.addEventListener('toggle', () => {
    if (!dialog.open) return;
    updateDateLimit();
    if (!error.hidden) focusOutcome(error);
    else if (completed) focusOutcome(success);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || completed) return;
    updateDateLimit();
    const values = Object.fromEntries(new FormData(form));
    const payload = Object.fromEntries([...editableFields, 'website'].map(name => [name, String(values[name] || '').trim()]));
    for (const name of editableFields) {
      form.elements.namedItem(name).setCustomValidity(payload[name] ? '' : 'Please complete this field.');
    }
    if (payload.visitDate && !validVisitDate(payload.visitDate)) {
      dateField.setCustomValidity('Choose a valid visit date from 1900 through today in Miami.');
    }
    if (!form.reportValidity()) return;

    const fingerprint = JSON.stringify(payload);
    if (fingerprint !== previousPayload) {
      submissionId = crypto.randomUUID();
      previousPayload = fingerprint;
    }
    sending = true;
    submit.disabled = true;
    submit.textContent = 'Sending…';
    form.setAttribute('aria-busy', 'true');
    error.hidden = true;
    error.textContent = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch('/api/photo-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, submissionId }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || result?.ok !== true) {
        const deliveryError = new Error('The support request could not be sent.');
        deliveryError.status = response.status;
        throw deliveryError;
      }
      completed = true;
      form.hidden = true;
      success.hidden = false;
      focusOutcome(success);
    } catch (failure) {
      error.textContent = failure?.name === 'AbortError' || failure?.name === 'TimeoutError'
        ? 'We couldn’t confirm your request was sent. Your details are still here. Try again, or email photo support directly below.'
        : failure?.status === 429
          ? 'Please wait a little before trying again. Your details are still here, or you can email photo support directly below.'
          : 'Your request couldn’t be sent. Your details are still here. Please try again, or email photo support directly below.';
      error.hidden = false;
      focusOutcome(error);
    } finally {
      clearTimeout(timeout);
      sending = false;
      submit.disabled = false;
      submit.innerHTML = originalButton;
      form.removeAttribute('aria-busy');
    }
  });

  dialog.addEventListener('close', () => {
    if (!completed) return;
    form.reset();
    for (const name of editableFields) form.elements.namedItem(name).setCustomValidity('');
    form.hidden = false;
    success.hidden = true;
    error.hidden = true;
    error.textContent = '';
    completed = false;
    submissionId = '';
    previousPayload = '';
    updateDateLimit();
  });
  dialog.querySelector('.photo-support-done').addEventListener('click', () => dialog.close());
  form.hidden = false;
})();
