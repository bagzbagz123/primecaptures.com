import { calculateEarnings } from './earnings-math.js?v=1';

const calculator = document.querySelector('#venue-earnings');

if (calculator) {
  const interactive = calculator.querySelector('[data-earnings-interactive]');
  const fallback = calculator.querySelector('[data-earnings-fallback]');
  const form = calculator.querySelector('[data-earnings-form]');
  const sales = calculator.querySelector('#earnings-sales');
  const evenings = calculator.querySelector('#earnings-evenings');
  const salesError = calculator.querySelector('#earnings-sales-error');
  const eveningsError = calculator.querySelector('#earnings-evenings-error');
  const announcement = calculator.querySelector('[data-earnings-announcement]');
  const monthly = calculator.querySelector('[data-earnings-monthly]');
  const weekly = calculator.querySelector('[data-earnings-weekly]');
  const fortnightly = calculator.querySelector('[data-earnings-fortnightly]');
  const resultNote = calculator.querySelector('[data-earnings-result-note]');
  const currency = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2,
  });
  const currencyWithCents = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  let announcementTimer;

  function formatCents(cents) {
    return (cents % 100 === 0 ? currency : currencyWithCents).format(cents / 100);
  }

  function render(announce = true) {
    const salesValid = calculateEarnings(sales.value, '1') !== null;
    const eveningsValid = calculateEarnings('0', evenings.value) !== null;
    const estimate = calculateEarnings(sales.value, evenings.value);
    sales.setAttribute('aria-invalid', String(!salesValid));
    evenings.setAttribute('aria-invalid', String(!eveningsValid));
    sales.setAttribute('aria-describedby', salesValid ? 'earnings-sales-help' : 'earnings-sales-help earnings-sales-error');
    evenings.setAttribute('aria-describedby', eveningsValid ? 'earnings-evenings-help' : 'earnings-evenings-help earnings-evenings-error');
    salesError.hidden = salesValid;
    eveningsError.hidden = eveningsValid;

    monthly.textContent = estimate ? formatCents(estimate.monthlyCents) : '—';
    weekly.textContent = estimate ? formatCents(estimate.weeklyCents) : '—';
    fortnightly.textContent = estimate ? formatCents(estimate.fortnightlyCents) : '—';
    resultNote.textContent = estimate
      ? 'Illustrative inputs. Actual sales and earnings vary.'
      : 'Enter valid estimates to see your venue share.';

    clearTimeout(announcementTimer);
    if (announce) {
      announcementTimer = setTimeout(() => {
        announcement.textContent = estimate
          ? `Estimated venue share: ${formatCents(estimate.monthlyCents)} per month, ${formatCents(estimate.weeklyCents)} per week, and ${formatCents(estimate.fortnightlyCents)} every two weeks. All amounts in US dollars. Actual sales and earnings vary.`
          : 'Enter valid photo sales and evenings per week to see your venue share.';
      }, 400);
    }
  }

  if (interactive && fallback && form && sales && evenings && salesError && eveningsError
      && announcement && monthly && weekly && fortnightly && resultNote
      && calculateEarnings(sales.value, evenings.value) !== null) {
    form.addEventListener('input', () => render());
    form.addEventListener('submit', event => {
      event.preventDefault();
      render();
      if (sales.getAttribute('aria-invalid') === 'true') sales.focus();
      else if (evenings.getAttribute('aria-invalid') === 'true') evenings.focus();
    });
    render(false);
    fallback.hidden = true;
    interactive.hidden = false;
  }
}
