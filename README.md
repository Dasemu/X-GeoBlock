# X GeoBlock

X GeoBlock is a Manifest V3 browser extension for Chromium and Firefox. While you browse `x.com`, it checks each post author's public **About this account** page and hides posts from countries in your blacklist. Accounts you follow are always allowed.

## Features

- Processes posts already on the page and posts loaded by infinite scrolling.
- Performs authenticated About-page requests in the background. If X returns only its empty application shell, an isolated invisible extension frame renders the account data without opening tabs or windows.
- Caches account results locally for 30 days, with manual clearing available.
- Coalesces duplicate lookups and spaces network requests to reduce load on X.
- Skips followed accounts.
- Provides a searchable country and region checklist with flags, an enable switch, and optional hidden-post placeholders.
- Includes opt-in debug logging for every lookup and filtering decision.
- By default, stores all settings and lookup results only in browser extension storage. No data is sent to third parties unless cloud contribution is explicitly enabled.
- Supports an optional, self-hosted Cloudflare Worker + D1 collaborative cache with signed opt-in contributions and three-installation consensus.

## Install from source in Chromium

1. Open `chrome://extensions` in Chrome, Edge, Brave, or another Chromium browser.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this repository directory.
4. Sign in to `https://x.com` and browse normally.
5. Open the extension settings and select the countries you want to block. No country is selected by default.

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

After editing a file, reload the extension and refresh the X tab. See [Architecture](docs/architecture.md), [Cloud cache](docs/cloud-cache.md), [Releases](docs/releases.md), [Privacy](docs/privacy.md), and [Contributing](CONTRIBUTING.md).

## Limitations

X does not publish a stable API for the country shown on the About page. The extension parses X's HTML and embedded page data, so a markup change can temporarily prevent detection. An unknown country leaves the post visible. Requests use your existing X session and are subject to X's rate limits.

The location picker contains the ISO 3166-1 countries, plus Kosovo, using English CLDR display names. It also includes the broader English region labels exposed by X, such as `West Asia`, alongside country labels such as `United Kingdom`. Inclusion is a local user preference and does not assert anything about individual account holders.

## Permissions

- `storage`: saves settings and the local user cache.
- `offscreen`: parses returned HTML without opening visible tabs.
- `declarativeNetRequestWithHostAccess`: permits only `x.com` subframes to render inside the isolated background document after X returns an empty application shell.
- `https://x.com/*`: reads About pages and runs the feed filter on X.

## License

[MIT](LICENSE)
