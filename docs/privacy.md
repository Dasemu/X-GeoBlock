# Privacy

X GeoBlock does not collect analytics, transmit browsing data to third parties, or operate a remote server.

The extension reads public account About pages from `x.com` using the X session already present in your browser. It stores usernames, detected countries, following status, and lookup timestamps in local extension storage for 30 days. Settings use synchronized extension storage when browser sync is enabled. You can clear the lookup cache at any time from the settings page or remove all extension data by uninstalling the extension.

The extension reads post author links in X timelines only to decide whether to display those posts. It does not read or store post text.

The collaborative cache at `x-geoblock-cache.dariosevilla.es` receives SHA-256 hashes of public usernames for lookups. Contributions are enabled by default and can be disabled in settings; signed reports contain the observed location, timestamp, and parser version. The service never receives following relationships, blacklist settings, post contents, or raw usernames. Public username hashes remain enumerable and must not be treated as anonymous data.
