import { createHash } from 'node:crypto';
import { createInquiryHandler } from './inquiries.mjs';

const required = { venue: 150, visitDate: 10, email: 200, message: 2000 };
const controlCharacters = /[\x00-\x1f\x7f]/;
const messageControlCharacters = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validatePhotoSupport(input, { now = Date.now } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Please check your details.');
  const website = input.website === undefined ? '' : input.website;
  if (typeof website !== 'string' || website !== '') throw new Error('Please check your details.');
  const fields = {};
  for (const [key, max] of Object.entries(required)) {
    const value = input[key];
    if (typeof value !== 'string' || (key === 'message' ? messageControlCharacters : controlCharacters).test(value)) {
      throw new Error('Please check your details.');
    }
    fields[key] = value.trim();
    if (!fields[key] || fields[key].length > max) throw new Error('Please complete the required fields.');
  }
  if (!/^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/.test(fields.email)) throw new Error('Please enter a valid email address.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.visitDate)) throw new Error('Please enter a valid visit date.');
  const [year, month, day] = fields.visitDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('Please enter a valid visit date.');
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(now())).map(part => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (fields.visitDate > today) throw new Error('Please enter a visit date that is today or earlier.');
  if (typeof input.submissionId !== 'string' || !uuid.test(input.submissionId)) throw new Error('Please refresh the page and try again.');
  return { ...fields, submissionId: input.submissionId.toLowerCase() };
}

export function createPhotoSupportDelivery(config = {}, fetchEmail = fetch) {
  return async fields => {
    if (!config.apiKey || !config.from) throw new Error('Email delivery is not configured.');
    const key = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
    const response = await fetchEmail('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `photo-support-${key}`
      },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        from: config.from, to: ['contact@primecaptures.com'], reply_to: fields.email,
        subject: `Photo support — ${fields.venue}`,
        text: `New guest photo support request from primecaptures.com\n\nThis is photo support, not a partnership inquiry.\n\nVenue: ${fields.venue}\nVisit date: ${fields.visitDate}\nContact email: ${fields.email}\n\nHelp requested:\n${fields.message}\n\nReference: ${fields.submissionId}`
      })
    });
    const result = await response.json();
    if (!response.ok || typeof result?.id !== 'string' || !result.id.trim()) throw new Error('Email service did not accept the support request.');
    return result.id;
  };
}

export function createPhotoSupportHandler({ origin, deliver, now = Date.now, trustProxy = false }) {
  return createInquiryHandler({
    origin, deliver, now, trustProxy,
    validate: input => validatePhotoSupport(input, { now }),
    formError: 'Please use the photo help form.',
    validationError: 'Please check the venue, visit date, email address, and help description, then try again.',
    deliveryError: 'We couldn’t confirm your photo help request was sent. Your details are still here—please try again, or email contact@primecaptures.com.'
  });
}
