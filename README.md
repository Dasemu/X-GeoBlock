# X GeoBlock

X GeoBlock is a Manifest V3 browser extension for Chromium and Firefox. While you browse `x.com`, it checks each post author's public **About this account** page and hides posts from countries in your blacklist. Accounts you follow are always allowed.

## Features

- Processes posts already on the page and posts loaded by infinite scrolling.
- Performs authenticated About-page requests in the extension service worker.
- Caches account results locally for a configurable period (seven days by default).
- Coalesces duplicate lookups and spaces network requests to reduce load on X.
- Skips followed accounts.
- Provides a configurable country blacklist, an enable switch, and optional hidden-post placeholders.
- Stores all settings and lookup results in browser extension storage. No data is sent to third parties.

## Install from source in Chromium

1. Open `chrome://extensions` in Chrome, Edge, Brave, or another Chromium browser.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this repository directory.
4. Sign in to `https://x.com` and browse normally.
5. Open the extension settings to review the default blacklist.

No build step or dependency installation is required.

## Install from source in Firefox

1. Run `npm run build`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Select **Load Temporary Add-on**.
4. Choose `dist/firefox/manifest.json`.

The generated XPI is unsigned and is intended for temporary installation or submission to Mozilla Add-ons. Standard Firefox releases require Mozilla signing for permanent installation.

## Development

The extension uses plain JavaScript, HTML, and CSS. Node.js 18 or newer is needed only for tests:

```sh
npm test
npm run check
npm run build
```

After editing a file, reload the extension and refresh the X tab. See [Architecture](docs/architecture.md), [Releases](docs/releases.md), [Privacy](docs/privacy.md), and [Contributing](CONTRIBUTING.md).

## Limitations

X does not publish a stable API for the country shown on the About page. The extension parses X's HTML and embedded page data, so a markup change can temporarily prevent detection. An unknown country leaves the post visible. Requests use your existing X session and are subject to X's rate limits.

The default blacklist is an editable starting point: Belarus, China, Iran, North Korea, and Russia. Inclusion is a local user preference and does not assert anything about individual account holders.

## Permissions

- `storage`: saves settings and the local user cache.
- `offscreen`: parses returned HTML without opening visible tabs.
- `https://x.com/*`: reads About pages and runs the feed filter on X.

## License

[MIT](LICENSE)
