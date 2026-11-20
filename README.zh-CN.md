# API Copy

当前版本：**0.5.3**。

[English](./README.md) | [简体中文](./README.zh-CN.md)

API Copy 是一个面向接口联调和问题排查的 Chrome DevTools 扩展。它把 XHR / Fetch 请求集中列出，选中后即可在同一面板查看路径、参数和响应，并快速复制。

在 Network 面板中，查看完整请求信息通常要逐条打开请求详情、切换区域；复制路径、参数和响应也需要重复操作。API Copy 将这些信息集中到一个面板，减少来回切换，让接口问题更快地交给开发者或 AI 辅助工具分析。

## 功能

- 按 Chrome Network 的 Fetch/XHR 分类展示 XHR、Fetch 和 EventSource。通过这些方式发起的文件请求也会出现在列表中。
- 快捷筛选：按 GET、POST 或其他方法筛选，区分 HTTP／业务失败，并支持自定义慢请求阈值。
- 界面自动跟随 Chrome 语言，内置简体中文和英文。
- 快速复制：
  - **复制路径**：按请求列表显示复制路径，跟随路径前缀截断和 Query 显示设置。
  - **复制路径 + 参数**：按全局设置截断路径前缀，保留 Query 编码。有 Body 时一并复制。
  - **复制精简请求**：方法与截断后的编码路径合并为一行，并附上 Body、响应状态和响应内容。
  - **复制完整请求**：包含完整 URL、请求头、响应头和响应内容。精简与完整格式均省略空 Body 区块。
  - **复制 cURL**：按原始 URL、请求头和 Body 生成 POSIX Shell 命令，不受展示截断与 Query 过滤影响；文件上传需替换本地文件占位路径。
  - **复制 Token**：复制 Authorization / Token Header 的完整值，例如 `Bearer eyJ...`。
- 请求列表 Hover 时显示 3 个高频快捷复制按钮。
- 列表筛选栏左侧的排序图标切换较早／最新请求在前，按请求开始时间排序；默认正序并记住选择。筛选与方向键跟随当前显示顺序，切换排序保留选中接口和 JSON 展开状态。
- 紧凑工作台：请求路径使用 12px、JSON 与参数正文使用 11px 字号，方法和状态使用 9px；显示、过滤与业务规则在侧边设置抽屉中管理。
- 顶部集中展示所有复制操作；窄窗口自动隐藏文字，仅保留图标与悬浮说明。
- 响应与 Body 共用无框字段复制按钮，复制成功就地变勾，保持内容位置。
- 请求列表获得焦点时，支持键盘上下切换接口。
- 支持业务失败识别：
  - `isSuccess === false`
  - `code` 存在且不为 `0` / `200`
- 过滤设置：默认移除 Query 参数 `_t`，并排除埋点接口 `/jsfulldatasave-be/savedatasfromjs`；支持自行配置多个参数和接口路径。
- 请求参数：在请求列表旁展示 URL Query、FormData／URL 编码表单，以及 JSON 或原始文本格式的请求 Body。悬停时可复制值或 `字段名: 值`，文件字段以文件名作为复制值。
- 请求列表展示：支持全局截断路径前缀，并可选择是否展示 URL Query 参数；默认不展示 Query。
- JSON Preview：
  - 对象字段默认按 A-Z 排序，可切换为原始字段顺序
  - 保留长整数、高精度小数和指数数字，预览与复制均不丢精度
  - 大数组按索引范围惰性展开；搜索统计全部命中，跳转时仅打开所需路径
  - 切换接口时保留展开状态、搜索词、命中项和滚动位置
  - 搜索字段和值，展示命中数量并支持上下切换命中项
  - 展开 / 收起对象与数组
  - 默认展开根节点和顶层 `data`；搜索时只展开命中路径
  - 区分字符串、数字、布尔值、null、对象和数组
  - 悬停时可复制值或 `字段名: 值`。数组项使用原始下标，例如 `0: {…}`
  - 长字符串自动收缩，可通过字段按钮或双击展开 / 收起
- 支持自动、左右和上下三种面板布局，并分别记住布局模式和拖拽尺寸；双击分隔线恢复主面板 40% / 60%、列表与参数 65% / 35% 的默认比例。

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
| `↑ / ↓` | 列表获得焦点时，在当前筛选后的请求中上下切换 |
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

在面板顶部打开 **设置 → 过滤**，可以配置不需要展示的埋点、统计或健康检查接口。多个路径使用逗号分隔，规则按 URL 路径精确匹配，不受 Query 参数影响。

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

在 **设置 → 业务规则** 中，可配置成功标识字段及成功值、状态码字段及多个成功码，字段支持 data.code 这样的点号路径。留空可跳过一类检查，也可以关闭业务失败识别；HTTP 失败判断保持独立。规则验证并保存后，对已采集和后续请求同时生效。

在业务规则中可选择 `isSuccess + code`、`success` 或 `code` 预设，继续修改字段和成功值后保存。`success` 预设只检查 `success = true`，不假定 `errorCode` 的成功值。

Query／FormData 的字段名与值支持换行。参数区过窄时两者分行显示，为两个复制按钮留出空间。复制请求时，表单字段逐行输出，并附带可用的文件信息。拖动分隔线可调整请求列表与参数区的比例。

## 项目结构

```text
api-copy-devtools/
├── manifest.json
├── devtools.html
├── devtools.js
├── panel.html
├── panel.css
├── panel.js
├── src/                 # 请求数据、JSON 树、筛选、业务规则及文案模块
├── vendor/              # 本地无损 JSON 解析库和许可证
├── tests/               # 本地回归检查，不进入安装包
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

项目不依赖 npm，也没有构建步骤，源码就是扩展运行文件。无损 JSON 解析库固定版本放在 `vendor/` 中并随包分发，无需 CDN。

本地启动静态服务器后，打开 `tests/panel-regression.html` 可运行参数准确性、大数组搜索和阅读状态恢复的浏览器回归检查；测试页不会进入安装包。

## 打包

执行：

```bash
./scripts/package.sh
```

会生成：

```text
dist/api-copy-devtools-v0.5.3.zip
```

ZIP 根目录直接包含 `manifest.json`，可用于 Chrome Web Store 或 Microsoft Edge Add-ons 上传。安装包包含 `src/`、`vendor/` 和第三方许可证，不包含测试代码、大 JSON 样例、截图及商店材料。

0.5.3 商店更新说明见 [发布说明](./store-assets/RELEASE_NOTES.md)。

## 隐私

API Copy 会在 DevTools 中读取当前检查页面的网络请求数据，包括 URL、Header、Body 和 Response。所有处理都在本地浏览器内完成，不上传到开发者服务器或第三方服务。

完整说明见 [PRIVACY.zh-CN.md](./PRIVACY.zh-CN.md)。

## License

MIT License，详见 [LICENSE](./LICENSE)。

## 代码维护

模块边界和更新规则见 [面板代码结构](./docs/ARCHITECTURE.zh-CN.md)。纯逻辑回归执行 node --test tests/request-features.test.cjs；浏览器回归入口为 tests/panel-regression.html。
