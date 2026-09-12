# Chrome Web Store 发布准备

[English](./CHROME_WEB_STORE.md) | [简体中文](./CHROME_WEB_STORE.zh-CN.md)

建议在 GitHub 仓库内容稳定后，再进行 Chrome Web Store 发布。

建议准备：

- 至少 1 张清晰的 API Copy DevTools 面板截图
- 128 × 128 图标（仓库已包含 `icon128.png`）
- 商店简介与详细说明
- Privacy Policy：可直接使用仓库根目录的 `PRIVACY.md`
- 发布 ZIP：执行 `./scripts/package.sh`

生成的发布 ZIP 根目录会直接包含 `manifest.json`，可以直接用于 Chrome Web Store 上传。
