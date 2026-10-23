import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Preserve the existing cascade while serving a single blocking stylesheet.
const files = ['styles.css', 'brand.css', 'refinements.css', 'measurement.css', 'motion.css', 'interactions.css', 'copper-story.css', 'keepsake-showcase.css', 'earnings-calculator.css', 'brand-film.css', 'workstation.css', 'venue-fit.css', 'daily-report.css', 'experience-refresh.css', 'scroll-story.css', 'mobile-inquiry.css', 'mobile.css', 'launch.css'];
const directory = new URL('../dist/', import.meta.url);
const sources = await Promise.all(files.map(async file => {
  const source = await readFile(new URL(file, directory), 'utf8');
  if (/^\s*@import\b/m.test(source)) throw new Error('External stylesheet imports must not enter the bundle: ' + file);
  return `/* ${file} */\n${source.trim()}\n`;
}));
const bundle = sources.join('\n');
const version = createHash('sha256').update(bundle).digest('hex').slice(0, 12);
await writeFile(new URL('site.css', directory), bundle);
const page = new URL('index.html', directory);
let count = 0;
const html = (await readFile(page, 'utf8')).replace(/<link rel="stylesheet" href="[^"]+">/g, () => count++ === 0 ? `<link rel="stylesheet" href="site.css?v=${version}">` : '');
if (!count) throw new Error('The homepage must have a stylesheet link.');
await writeFile(page, html);
console.log(`Bundled ${files.length} stylesheets: ${Buffer.byteLength(bundle)} bytes, version ${version}`);
