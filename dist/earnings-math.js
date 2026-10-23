/**
 * Estimate a venue's 20% share of photo sales, in integer US cents.
 * Monthly estimates use 52 weeks / 12 months. Each period is rounded once.
 * Invalid or incomplete inputs return null so the UI can withhold estimates.
 */
export function calculateEarnings(salesString, nightsString) {
  if (typeof salesString !== 'string' || typeof nightsString !== 'string') return null;

  const sales = salesString.trim();
  const nights = nightsString.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(sales) || !/^[1-7]$/.test(nights)) return null;

  const [dollars, fraction = ''] = sales.split('.');
  const salesCents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(salesCents) || salesCents > 1_000_000) return null;

  const nightlySalesCents = salesCents * Number(nights);
  return {
    weeklyCents: Math.round(nightlySalesCents / 5),
    fortnightlyCents: Math.round(nightlySalesCents * 2 / 5),
    monthlyCents: Math.round(nightlySalesCents * 52 / 60),
  };
}
