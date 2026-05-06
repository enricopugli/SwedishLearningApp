# Swedish Web App

## Deployment rules

- **Always bump the cache version in `sw.js` before deploying.**
  The `CACHE` constant (e.g. `svverbs-v2`) must be incremented each time changes are deployed to Netlify,
  otherwise Android (and other mobile devices) will keep serving the old cached version.
  Current version: `svverbs-v1778074625`

- **Also bump `APP_VERSION` in `app.js` (line 3) before deploying.**
  Format: `'YYYY.MM.DD'`. This shows in the home screen header so users can verify they have the latest version.
