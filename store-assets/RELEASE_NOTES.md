# API Copy 0.6.0

更新日期为 2026-11-23。

## 简体中文

- 新增重复请求警告，支持调整判定间隔、筛选重复组和联动高亮。文件内容缺失的匹配上传显示「可能重复」。
- 保留并发同地址请求，区分二进制和正文读取状态，优化大响应的解析、缓存和复制。
- 优化明暗主题及窄面板布局。展开长文本时完整显示字段名，Tab 可直达选中行的复制按钮。
- 预览标题显示复制目标及筛选外提示，并分别标明 HTTP 状态和业务失败。设置和帮助使用轻遮罩。
- 同一页面内修改 Query、Hash 或切换路由时，保留接口记录和当前预览。
- 提前显示进行中的请求，完成后原位回填响应。排序和筛选保留请求的时间序号。
- 全局路径前缀截断默认改为 0 段，保留完整路径。

## English

- Add duplicate request warnings with a configurable interval, a group filter, and peer highlighting. Matching uploads with incomplete file contents are marked as possible duplicates.
- Keep concurrent requests separate, label binary responses and body availability, and improve large-response parsing, caching, and copying.
- Refine light and dark themes and narrow layouts. Keep field names visible when expanding long JSON strings, and focus the selected row's copy buttons with Tab.
- Show the copy target in Preview, flag filtered-out requests, and distinguish HTTP status from business failures. Use a light overlay for Settings and Help.
- Preserve requests and the active preview when the query, hash, or route changes within the same document.
- Show pending requests and update their rows on completion. Keep the start-time numbers when sorting or filtering.
- Keep the full path by default with global path prefix trimming set to 0 segments.

---

# API Copy 0.5.3

更新日期为 2026-11-20。

## 简体中文

- Query、FormData 和 JSON 字段可单独复制值，也可复制 `字段名: 值`。数组项使用原始下标。
- 「复制路径 + 参数」和「复制精简请求」跟随全局前缀设置，并保留 URL 编码和剩余斜杠。
- 请求复制格式更紧凑，表单字段逐行输出。改进 multipart 正文、cURL 字段值和窄面板复制按钮的处理。

## English

- Copy a value or a `name: value` pair from Query, FormData, and JSON. Array items use their original indexes.
- Copy Path + Params and Copy Simplified Request follow the global path prefix setting and preserve URL encoding and remaining slashes.
- Request copies use a more compact format with one form field per line. Improve multipart body handling, cURL field accuracy, and button visibility in narrow panes.

---

# API Copy 0.5.2

更新日期：2026-11-10。

## 简体中文

- 「复制路径」跟随请求列表的路径前缀截断和 Query 显示设置。
- 请求列表支持搜索原始 URL，可匹配域名、被截掉的路径前缀和隐藏的 Query 参数。
- 请求类型与 Chromium 的 Fetch/XHR 分类对齐，纳入 EventSource 和由 Fetch/XHR 发起的下载请求。

## English

- Copy Path follows the request list’s path trimming and Query visibility settings.
- Search requests by original URL, including the domain, hidden path prefixes, and hidden Query parameters.
- Align request types with Chromium’s Fetch/XHR category, including EventSource and downloads initiated by Fetch/XHR.

---

# API Copy 0.5.1

发布日期：2026-10-28。

## 简体中文

JSON 搜索支持 Enter 跳到下一个命中项，Shift + Enter 跳到上一个，首尾循环切换，并兼容中文输入法确认。

优化安装后的文字可读性：适当提高工具栏、筛选栏、方法与状态码、表头和辅助信息字号，调整方法列宽和行距，保留 JSON、请求参数正文与列表的紧凑布局。

## English

Navigate JSON search matches with Enter / Shift + Enter, with wraparound and input-method composition support.

Improve text readability with larger toolbar, filter, method/status, column heading and helper text. Adjust the method column width and line spacing while preserving the compact request list, JSON and parameter content layout.

---

# API Copy 0.5.0

发布日期：2026-10-22。以下文案可用于 Chrome Web Store / Microsoft Edge Add-ons 更新说明。

## 简体中文

本次更新提升接口排查效率，优化大量 JSON 数据的阅读与复制体验。

- 请求列表支持按开始时间正序／倒序排列并记住选择，切换不打断当前 JSON 阅读。
- Query／FormData 字段名和值保持完整换行；新增可编辑业务规则预设，保存后生效。
- 新增请求方法、HTTP／业务失败与慢请求快捷筛选，以及自定义业务成功规则。
- 新增原始请求 cURL 复制；Query 和 FormData 支持逐项复制，文件字段支持复制文件名。
- 无损保留 JSON 长整数、高精度小数和指数数字，修复重复参数及部分编码值的复制问题。
- 大数组按需展开，搜索统计全部命中；切换请求后恢复 JSON 展开、搜索及滚动位置。
- 优化紧凑布局与复制按钮，全部复制操作集中排列，窄窗口自动切换为图标。
- 设置统一收进分类抽屉；参数标题去除重复提示；双击分隔线恢复默认比例。
- 请求列表更新不打断当前 JSON 阅读，方向键仅在列表获得焦点时切换请求。

数据继续在本地浏览器中处理，无需登录，不上传采集到的请求或响应。cURL 文件上传使用本地路径占位符，需要手动替换；复制命令不会自动执行。

## English

This update improves API debugging and the reading and copying of large JSON responses.

- Toggle oldest/newest-first request sorting by start time; the preference is remembered without interrupting the current JSON view.
- Keep Query/FormData names and values fully visible with wrapping; add editable business-rule presets that apply after saving.
- Add method, HTTP/business failure and slow-request filters, plus configurable business success rules.
- Add original-request cURL copying and per-value Query/FormData copying; file fields copy their names.
- Preserve long integers, high-precision decimals and exponent numbers without loss; fix duplicate-parameter and encoding-related copy issues.
- Expand large arrays on demand, count all search matches, and restore JSON expansion, search and scrolling when switching requests.
- Refine the compact layout and copy controls. All copy actions appear together and become icon-only in narrow windows.
- Organize settings in a tabbed drawer, remove redundant parameter summaries, and restore default proportions by double-clicking splitters.
- Keep the current JSON view stable as new requests arrive; request navigation keys only act when the list has focus.

Data remains local to the browser. No login is required and captured requests/responses are not uploaded. cURL file-upload placeholders must be replaced with local paths; copied commands are not executed automatically.
