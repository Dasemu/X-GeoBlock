# Architecture

## Request flow

1. The content script observes X's timeline and extracts an author from each canonical `/user/status/id` link.
2. The service worker checks the local cache and coalesces concurrent lookups for the same username.
3. On a cache miss, the background process requests `https://x.com/<user>/about` with the browser's existing X session.
4. Chromium passes fetched HTML to an offscreen document; Firefox can parse it in its background page. When X returns only its SPA shell, an invisible same-origin frame inside the current X page renders the URL. The content script reads the location row and immediately destroys the frame. This does not create a browser tab or window.
5. The worker caches the result and compares the country with the configured blacklist.
6. The content script hides the post only when the country matches and the account is not followed.

Failed or ambiguous lookups fail open: the post remains visible. Empty results are never cached. Successful local and cloud lookups expire after 30 days. The user can clear the entire cache from the settings page at any time.

## Browser components

- `background.js`: networking, throttling, cache, and decisions.
- `content.js`: timeline observation and post visibility.
- `offscreen/`: isolated HTML parsing with `DOMParser`.
- `lib/parser.js`: DOM and embedded-data extraction.
- `lib/config.js`: defaults and country normalization.
- `options/` and `popup/`: user controls.

## Compatibility

The Chromium package requires Chrome 109 or newer. Firefox 109 or newer uses a browser-specific background-page manifest and does not require the Chromium offscreen-document API.
