# FB Auto Scroll Agent Notes

## Architecture Rules

- `fbivan-loader.js` is the loader source of truth.
- `fbivan-autoscroll.js` is the payload only.
- Loader and payload must remain separate scripts.
- The landing page bookmarklet must be generated from `fbivan-loader.js`.
- This tool is intended for regular `facebook.com` tabs, so the generated bookmarklet includes an embedded payload fallback when Graph OG loading is not available.

## Release Rules

- Bump `FINE_BUILD` in `fbivan-autoscroll.js` and `package.json` for every behavior change.
- After each production deploy, scrape:
  - `https://fbautoscroll.pages.dev/fbautoscroll/latest/manifest.html`
  - every `https://fbautoscroll.pages.dev/fbautoscroll/latest/og/chunk-*.html`
- Use a real Graph API POST scrape request, not Meta Sharing Debugger in a browser.

## Hygiene

- Do not add network exfiltration or external logging to the payload.
- Do not duplicate loader code inside the payload.
