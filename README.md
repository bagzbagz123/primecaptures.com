# Prime Capture website

The marketing site for [Prime Capture](https://www.primecaptures.com/), a Miami guest-photography and on-site printing business.

## Local development

Use Node.js 22. The project has no npm dependencies.

```sh
npm run build
npm test
npm start
```

The local preview runs at `http://127.0.0.1:4174`. Email delivery is optional for browsing. To configure it, copy `.env.example` to `.env` and set the delivery values locally. Never commit credentials. Without email configuration, forms report an honest retry error instead of a false success.

## Project structure

- `dist/`: website HTML, JavaScript, source stylesheets and optimized public assets.
- `scripts/build-styles.mjs`: combines source stylesheets into `dist/site.css` and updates its cache version in the HTML. Edit source CSS, then rebuild; do not edit the bundle directly.
- `api/`: Vercel partnership-inquiry and photo-support endpoints.
- `inquiries.mjs`, `inquiry-receipt.mjs`, `photo-support.mjs`: shared validation and email-delivery logic.
- `local-server.mjs`: local preview and API adapter.
- `tests/`: Node.js tests for forms, analytics, galleries, calculation, motion and related behavior.
- `vercel.json`: production build, output, redirects and function settings.

## Current landing page

The site includes venue benefits, guest and food photography, a Copper 29 partner story, product and workstation examples, optional video, expandable earnings estimates and a sample report, and inquiry/photo-support forms. Website analytics is optional and consent gated.

The header and footer use the original Prime Capture logo at the top and bottom of the page. While scrolling, it spins and morphs into three aperture blades, fully closing halfway down before reopening. One blade uses the red brand accent; two are white. Reduced-motion mode preserves the static original mark.

## Deployment

This repository's `main` branch is connected to the existing Vercel project `primecaptures-com`. Vercel runs `npm run build` and serves `dist/`; API handlers run as Vercel functions. Configure production delivery credentials in Vercel rather than in source control.

For landing-page updates, validate the change, commit it, and push to `origin/main`. Let Vercel deploy from GitHub automatically, then verify the deployment for that commit. Direct CLI production deployments are not the normal release workflow. See `AGENTS.md` for repository instructions.

Local `.env` files, `.vercel`, private originals, design drafts and deployment evidence are excluded from Git. The staff application is maintained in a separate repository.

## Assets

Public images and videos are the optimized files used by the website. Source references are recorded in `dist/assets/photo-sources.json`; font licenses are included with the fonts. The older website export remains available in this repository's commit history.
