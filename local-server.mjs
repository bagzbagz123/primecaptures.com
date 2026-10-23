import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createInquiryHandler } from './inquiries.mjs';
import { createPartnershipDelivery } from './inquiry-receipt.mjs';
import { createPhotoSupportHandler, createPhotoSupportDelivery } from './photo-support.mjs';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.PORT || 4174);
const origin = process.env.SITE_ORIGIN || `http://127.0.0.1:${port}`;
const inquiries = createInquiryHandler({
  origin, trustProxy: process.env.TRUST_PROXY === 'true',
  deliver: createPartnershipDelivery({ apiKey: process.env.RESEND_API_KEY, from: process.env.INQUIRY_FROM, to: process.env.INQUIRY_TO || 'contact@primecaptures.com' })
});
const photoSupport = createPhotoSupportHandler({
  origin, trustProxy: process.env.TRUST_PROXY === 'true',
  deliver: createPhotoSupportDelivery({ apiKey: process.env.RESEND_API_KEY, from: process.env.INQUIRY_FROM })
});
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
createServer(async (req, res) => {
  try {
    const path = new URL(req.url, origin).pathname;
    if (path === '/api/partnership') return await inquiries(req, res);
    if (path === '/api/photo-support') return await photoSupport(req, res);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    const file = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403); return res.end(); }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`Prime Capture preview: ${origin}`);
  console.log(process.env.RESEND_API_KEY && process.env.INQUIRY_FROM ? 'Email service configured; inbox delivery still needs verification.' : 'Email setup pending; submissions will show a retry message, never a false confirmation.');
});
