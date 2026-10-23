import { createHash } from 'node:crypto';
import { createResendDelivery } from './inquiries.mjs';

const inbox = 'contact@primecaptures.com';
const receiptVersion = 'v1';
const referencePattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// No submitted names, venue names or free-form messages are reflected in an
// automatic email. Only a canonical reference varies in this transactional copy.
export function createInquiryReceipt(reference) {
  if (typeof reference !== 'string' || !referencePattern.test(reference)) throw new Error('Invalid inquiry reference.');
  const subject = 'We received your venue inquiry | Prime Capture';
  const text = `Thanks for reaching out.\n\nWe've received your venue inquiry.\n\nIvan and the Prime Capture team will review your inquiry and reply to discuss your venue, service days, frame branding, and space for the printing station.\n\nHave a question or something to add? Reply to this email to reach ${inbox}.\n\nPrime Capture\nMiami, FL\nhttps://www.primecaptures.com/\n\nInquiry reference: ${reference}\n\nThis is an automatic confirmation. If you didn't send an inquiry, you can disregard this email.`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Prime Capture — inquiry received</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f6;color:#222225;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f4f6"><tr><td align="center" style="padding:28px 16px;">
    <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background-color:#ffffff;border:1px solid #dedee3;">
      <tr><td bgcolor="#111113" style="padding:26px 28px;border-top:4px solid #d9322e;">
        <p style="margin:0 0 10px;color:#ff8a84;font-size:11px;line-height:16px;letter-spacing:2px;">VENUE INQUIRY</p>
        <p style="margin:0;color:#ffffff;font-size:24px;line-height:30px;font-weight:bold;letter-spacing:-.5px;">Prime Capture</p>
      </td></tr>
      <tr><td style="padding:30px 28px 24px;">
        <h1 style="margin:0 0 18px;font-size:28px;line-height:34px;letter-spacing:-.7px;color:#111113;">Thanks for reaching out.</h1>
        <p style="margin:0 0 20px;font-size:16px;line-height:25px;">We've received your venue inquiry.</p>
        <p style="margin:0 0 20px;font-size:16px;line-height:25px;">Ivan and the Prime Capture team will review your inquiry and reply to discuss your venue, service days, frame branding, and space for the printing station.</p>
        <p style="margin:0 0 24px;font-size:16px;line-height:25px;">Have a question or something to add? Reply to this email to reach <a href="mailto:${inbox}" style="color:#b82420;text-decoration:underline;">${inbox}</a>.</p>
        <p style="margin:0;font-size:14px;line-height:22px;"><strong>Prime Capture</strong><br>Miami, FL<br><a href="https://www.primecaptures.com/" style="color:#b82420;text-decoration:underline;">primecaptures.com</a></p>
      </td></tr>
      <tr><td style="padding:20px 28px 24px;border-top:1px solid #e5e5e9;">
        <p style="margin:0 0 12px;font-size:12px;line-height:19px;color:#62626c;word-break:break-word;">Inquiry reference: ${reference}</p>
        <p style="margin:0;font-size:12px;line-height:19px;color:#62626c;">This is an automatic confirmation. If you didn't send an inquiry, you can disregard this email.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject, text, html };
}

function failureReason(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'timeout';
  if (error?.name === 'TypeError') return 'network';
  return 'provider';
}

// Keep the owner delivery contract. Receipt acceptance never controls form
// success; its four-second bound fits inside the existing browser timeout.
export function createPartnershipDelivery(config, fetchEmail = fetch, onReceiptFailure = event => console.warn(JSON.stringify(event))) {
  const deliverOwner = createResendDelivery(config, fetchEmail);
  return async fields => {
    const ownerId = await deliverOwner(fields);
    try {
      const receipt = createInquiryReceipt(fields.submissionId);
      const key = createHash('sha256').update(JSON.stringify([
        receiptVersion, fields.submissionId, fields.email, config.from
      ])).digest('hex');
      const response = await fetchEmail('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json',
          'Idempotency-Key': `partnership-receipt-${receiptVersion}-${key}`
        },
        signal: AbortSignal.timeout(4000),
        body: JSON.stringify({from: config.from, to: [fields.email], reply_to: inbox, ...receipt})
      });
      const result = await response.json();
      if (!response.ok || typeof result?.id !== 'string' || !result.id.trim()) throw new Error('Receipt was not accepted.');
    } catch (error) {
      // Fixed operational fields only: no submitted details, IDs, keys or raw
      // provider errors. Even a failing logger cannot turn a lead into an error.
      try {
        const logged = onReceiptFailure({event: 'partnership_receipt_failed', reason: failureReason(error)});
        logged?.catch?.(() => {});
      }
      catch { /* The accepted owner email remains authoritative. */ }
    }
    return ownerId;
  };
}
