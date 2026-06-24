# FB Auto Scroll Agent Notes

## Architecture Rules

- `fbivan-loader.js` is the loader source of truth.
- `fbivan-autoscroll.js` is the payload only.
- Loader and payload must remain separate scripts.
- The landing page bookmarklet must be generated from `fbivan-loader.js`.
- This tool is intended for regular `facebook.com` tabs, so the generated bookmarklet includes an embedded payload fallback when Graph OG loading is not available.

## Release Rules

- Build versions use `DDMMYYbN`, based on the local build date.
- `npm run build` runs `scripts/bump-build-version.cjs` before packaging. If the current version date is today, it increments only `bN`; otherwise it resets to today's date with `b1`.
- Do not manually keep old build dates in `FINE_BUILD` or `package.json`; release builds update them together.
- After each production deploy, scrape:
  - `https://fbautoscroll.pages.dev/fbautoscroll/latest/manifest.html`
  - every `https://fbautoscroll.pages.dev/fbautoscroll/latest/og/chunk-*.html`
- Use a real Graph API POST scrape request, not Meta Sharing Debugger in a browser.
- Publish `dist/fbautoscroll/latest/package-info.json` and `dist/fbautoscroll/latest/tool-meta.json` for the shared Yellow Web hub.

## Hygiene

- Do not add network exfiltration or external logging to the payload.
- Do not duplicate loader code inside the payload.
