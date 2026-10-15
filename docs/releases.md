# Releases

Every non-release commit that reaches `main` starts `.github/workflows/release.yml`. The workflow updates the version in `manifest.json` and `package.json`, commits that change to `main`, runs the checks, builds both browser packages, creates a version tag, and publishes a GitHub release containing:

- `x-geoblock-chrome-vX.Y.Z.zip`
- `x-geoblock-firefox-vX.Y.Z.xpi`

The Firefox XPI is unsigned. It can be used for temporary installation and as the input for Mozilla Add-ons signing.

## Version rules

- A pull request whose head branch is exactly `development` and whose base is `main` increments the minor component and resets patch to zero: `1.4.7` becomes `1.5.0`.
- Every other commit reaching `main`, including direct commits and merges from `hotfix/*`, increments the patch component: `1.4.7` becomes `1.4.8`.

The automated version commit contains `[skip release]`, preventing a second workflow release. The repository must allow GitHub Actions to push commits and tags to `main`; if branch protection is enabled, grant the Actions bot an appropriate bypass or use an equivalent ruleset exception.
