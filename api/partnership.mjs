import { createInquiryHandler } from '../inquiries.mjs';
import { createPartnershipDelivery } from '../inquiry-receipt.mjs';

export default createInquiryHandler({
  origin: ['https://primecaptures.com', 'https://www.primecaptures.com'],
  trustProxy: true,
  deliver: createPartnershipDelivery({
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.INQUIRY_FROM,
    to: 'contact@primecaptures.com'
  })
});
