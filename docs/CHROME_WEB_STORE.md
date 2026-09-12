# Chrome Web Store Publishing Guide

[English](./CHROME_WEB_STORE.md) | [简体中文](./CHROME_WEB_STORE.zh-CN.md)

Publish to the Chrome Web Store after the GitHub repository is stable.

Recommended preparation:

- At least one clear screenshot of the API Copy DevTools panel
- 128 × 128 icon (already included as `icon128.png`)
- Short store description and full description
- Privacy Policy: use the repository root `PRIVACY.md`
- Release ZIP: run `./scripts/package.sh`

The generated ZIP contains `manifest.json` directly at the archive root and is ready for Chrome Web Store upload.
