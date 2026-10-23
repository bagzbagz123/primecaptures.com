import { createHash } from 'node:crypto';

const limits = { name: 100, email: 200, venue: 150, city: 100, message: 2000 };
export function validateInquiry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Please check your details.');
  if (input.website) throw new Error('Please check your details.');
  const fields = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = input[key] ?? '';
    if (typeof value !== 'string') throw new Error('Please check your details.');
    fields[key] = value.trim();
    if (fields[key].length > max || (key !== 'message' && !fields[key])) throw new Error('Please complete the required fields.');
    if (key !== 'message' && /[\r\n\x00-\x1f\x7f]/.test(fields[key])) throw new Error('Please check your details.');
  }
  if (!/^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/.test(fields.email)) throw new Error('Please enter a valid email address.');
  if (typeof input.submissionId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.submissionId)) throw new Error('Please refresh the page and try again.');
  return { ...fields, submissionId: input.submissionId };
}

export function createResendDelivery(config, fetchEmail = fetch) {
  return async fields => {
    if (!config.apiKey || !config.from || !config.to) throw new Error('Email delivery is not configured.');
    const key = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
    const response = await fetchEmail('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `partnership-${key}` },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        from: config.from, to: [config.to], reply_to: fields.email,
        subject: `Partnership inquiry — ${fields.venue}`,
        text: `New partnership inquiry from primecaptures.com\n\nName: ${fields.name}\nEmail: ${fields.email}\nVenue: ${fields.venue}\nCity: ${fields.city}\n\nMessage:\n${fields.message || '(No additional message)'}\n\nReference: ${fields.submissionId}`
      })
    });
    const result = await response.json();
    if (!response.ok || typeof result.id !== 'string' || !result.id) throw new Error('Email service did not accept the inquiry.');
    return result.id;
  };
}

export function createInquiryHandler({
  origin, deliver, now = Date.now, trustProxy = false, validate = validateInquiry,
  formError = 'Please use the inquiry form.',
  validationError = 'Please check your name, email, venue, and city, then try again.',
  deliveryError = 'We couldn’t confirm your inquiry was sent. Your details are still here—please try again, or email contact@primecaptures.com.'
}) {
  const attempts = new Map();
  return async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST') return reply(405, { error: formError });
    if (!(Array.isArray(origin) ? origin : [origin]).includes(req.headers.origin)) return reply(403, { error: 'Please submit from our website.' });
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(415, { error: 'Please refresh the page and try again.' });
    const ip = trustProxy ? String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim() : req.socket.remoteAddress;
    const time = now();
    for (const [key, value] of attempts) if (time - value.start >= 600000) attempts.delete(key);
    const count = attempts.get(ip) || { start: time, count: 0 };
    if (count.count >= 6 || attempts.size >= 10000) return reply(429, { error: 'You’ve tried several times. Please wait a few minutes, or email contact@primecaptures.com.' });
    count.count++; attempts.set(ip, count);
    let fields;
    try {
      let body;
      if (req.body !== undefined) {
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      } else {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += Buffer.byteLength(chunk);
          if (size > 16384) return reply(413, { error: 'Your message is too long. Please shorten it and try again.' });
          chunks.push(Buffer.from(chunk));
        }
        body = Buffer.concat(chunks).toString('utf8');
      }
      if (Buffer.byteLength(body) > 16384) return reply(413, { error: 'Your message is too long. Please shorten it and try again.' });
      fields = validate(JSON.parse(body));
    } catch {
      return reply(400, { error: validationError });
    }
    try {
      await deliver(fields);
      return reply(200, { ok: true, reference: fields.submissionId });
    } catch {
      // Never log names, messages, API keys, or raw provider errors.
      return reply(503, { error: deliveryError });
    }
  };
}
