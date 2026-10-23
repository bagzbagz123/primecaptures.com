import { createPhotoSupportHandler, createPhotoSupportDelivery } from '../photo-support.mjs';

export default createPhotoSupportHandler({
  origin: ['https://primecaptures.com', 'https://www.primecaptures.com'],
  trustProxy: true,
  deliver: createPhotoSupportDelivery({
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.INQUIRY_FROM
  })
});
