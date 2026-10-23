# Prime Capture landing page

## Repository and release workflow

- This directory is the canonical landing-page checkout.
- GitHub remote: `https://github.com/bagzbagz123/primecaptures.com.git`.
- Production branch: `main`; Vercel project: `primecaptures-com`.
- The owner has authorized committing and pushing requested landing-page changes as the normal completion step. Do not ask for repeat approval for routine commits and pushes within the requested scope.
- Inspect local changes and fetch the remote before work. Preserve unrelated local edits and remote history; do not force-push.
- After code changes, run the build and relevant existing tests, and verify the requested behavior. For documentation-only changes, inspect the diff and check formatting.
- Commit completed changes and push to `origin/main`. Let the existing Vercel Git integration build and deploy that commit automatically.
- Verify the Vercel check/deployment for the pushed commit and check the published result. If deployment fails, diagnose and fix it through another reviewed commit and push.
- Do not use direct `vercel deploy --prod`, manual promotion, or an alternative deployment path for normal releases. Use those only when the owner explicitly requests an exception.

## Editing and privacy

- Edit source stylesheets, then run `npm run build` to regenerate `dist/site.css` and its HTML cache version. Do not hand-edit the generated stylesheet.
- The site uses Node.js 22 and has no npm dependencies. Existing checks are `npm run build` and `npm test`.
- Keep runtime credentials, `.env` files, `.vercel`, private originals, drafts and internal deployment evidence out of commits. Preserve the existing exclusions; `.env.example` must contain only safe example settings.
- Keep README documentation public-facing. Store private working notes under the ignored `work/` directory.
