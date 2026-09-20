# API Copy

[English](./README.md) | [简体中文](./README.zh-CN.md)

API Copy 是一个面向前后端联调场景的 Chrome DevTools 扩展，用来快速查看、筛选和复制 XHR / Fetch 请求与响应信息。

它的目标很简单：减少在 Network 面板里反复复制 URL、参数、Body、Token 和响应数据的操作，让接口问题更快地交给开发者或 AI 辅助工具分析。

## 功能

- 只展示 XHR / Fetch 请求。
- 界面自动跟随 Chrome 语言，内置简体中文和英文。
- 快速复制：
  - **复制路径**：只复制接口路径。
  - **复制路径 + 参数**：包含 Query；有 Body 的请求会同时带 Body。
  - **复制精简请求**：请求 + 响应，不包含 Header。
  - **复制完整请求**：请求 + 响应，包含 Header。
  - **复制 Token**：复制 Authorization / Token Header 的完整值，例如 `Bearer eyJ...`。
- 请求列表 Hover 时显示 3 个高频快捷复制按钮。
- 支持键盘上下切换接口。
- 支持业务失败识别：
  - `isSuccess === false`
  - `code` 存在且不为 `0` / `200`
- 过滤设置：默认移除 Query 参数 `_t`，并排除埋点接口 `/jsfulldatasave-be/savedatasfromjs`；支持自行配置多个参数和接口路径。
- 请求参数：在请求列表旁展示 URL Query 参数列表，以及 JSON 或原始文本格式的请求 Body。
- 请求列表展示：支持全局截断路径前缀，并可选择是否展示 URL Query 参数；默认不展示 Query。
- JSON Preview：
  - 对象字段按 A-Z 排序
  - 搜索字段和值，展示命中数量并支持上下切换命中项
  - 展开 / 收起对象与数组
  - 默认展开根节点和顶层 `data`；搜索时只展开命中路径
  - 区分字符串、数字、布尔值、null、对象和数组
  - 一键复制字段值
  - 长字符串自动收缩，可通过字段按钮或双击展开 / 收起
- 支持自动、左右和上下三种面板布局，并分别记住布局模式和拖拽尺寸。

## 安装开发版

1. Clone 或下载本仓库。
2. Chrome 打开 `chrome://extensions/`。
3. 开启右上角 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择仓库根目录。
6. 打开任意业务页面并重新打开 DevTools。
7. 在 DevTools 顶部进入 **API Copy**。

> 更新本地代码后，在 `chrome://extensions/` 中点击扩展的“重新加载”，再重新打开 DevTools。

## 常用操作

| 操作 | 作用 |
| --- | --- |
| `↑ / ↓` | 在当前筛选后的请求列表中上下切换 |
| `C` | 复制“路径 + 参数”；有 Body 时同时复制 Body |
| `Cmd + C` / `Ctrl + C` | 没有文字选区时复制“精简请求” |
| 鼠标框选 + 系统复制 | 正常复制列表中的选中文字 |
| Hover 请求行 | 显示路径、路径+参数、精简请求 3 个快捷按钮 |

面板顶部的 **帮助** 按钮也会显示这些快捷操作。

## Query 参数过滤

默认过滤：

```text
_t
```

例如：

```text
/his/his/task/getTaskRestartApplyInfo?taskId=127494&_t=1789114449248
```

展示和复制时会变成：

```text
/his/his/task/getTaskRestartApplyInfo?taskId=127494
```

可以在面板中配置多个参数名，例如：

```text
_t,timestamp,nonce
```

过滤仅针对 URL Query 参数，不会删除 POST Body 中的同名字段。

## 排除接口

在面板顶部打开 **过滤设置**，可以配置不需要展示的埋点、统计或健康检查接口。多个路径使用逗号分隔，规则按 URL 路径精确匹配，不受 Query 参数影响。

默认排除：

```text
/jsfulldatasave-be/savedatasfromjs
```

## 业务失败识别

很多后端接口即使业务失败，HTTP Status 仍然是 `200`。API Copy 会额外分析 JSON 响应：

```json
{
  "isSuccess": false,
  "code": 500,
  "message": "保存失败"
}
```

当满足以下任一条件时，请求列表会标记 **业务失败**：

- `isSuccess === false`
- `code` 存在且不等于 `0` 或 `200`

因此可以快速定位“HTTP 成功但业务失败”的接口。

## 项目结构

```text
api-copy-devtools/
├── manifest.json
├── devtools.html
├── devtools.js
├── panel.html
├── panel.css
├── panel.js
├── _locales/
│   ├── en/messages.json
│   └── zh_CN/messages.json
├── icon16.png
├── icon48.png
├── icon128.png
├── README.md
├── README.zh-CN.md
├── PRIVACY.md
├── PRIVACY.zh-CN.md
├── CHANGELOG.md
├── CHANGELOG.zh-CN.md
├── LICENSE
├── docs/
├── screenshots/
└── scripts/
    └── package.sh
```

项目不依赖 npm，也没有构建步骤，源码就是扩展运行文件。

## 打包

执行：

```bash
./scripts/package.sh
```

会生成：

```text
dist/api-copy-devtools-v0.3.0.zip
```

ZIP 根目录直接包含 `manifest.json`，后续可用于 Chrome Web Store 上传。

## 隐私

API Copy 会在 DevTools 中读取当前检查页面的网络请求数据，包括 URL、Header、Body 和 Response。所有处理都在本地浏览器内完成，不上传到开发者服务器或第三方服务。

完整说明见 [PRIVACY.zh-CN.md](./PRIVACY.zh-CN.md)。

## License

MIT License，详见 [LICENSE](./LICENSE)。
