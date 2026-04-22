# Swedish Web App

## Deployment rules

- **Always bump the cache version in `sw.js` before deploying.**
  The `CACHE` constant (e.g. `svverbs-v2`) must be incremented each time changes are deployed to Netlify,
  otherwise Android (and other mobile devices) will keep serving the old cached version.
  Current version: `svverbs-v14`
