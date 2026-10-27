# Edge Add-ons 0.5.0 submission

Submitted on 2026-10-27. The Partner Center dashboard confirmed version 0.5.0 is In review. Version 0.4.1 remains Live while review is pending.

Product ID: d9a9a370-f7cc-4858-b17e-968e107fece8
Store ID: 0RDCKDPS9WP1
CRX ID: fanjhflkpmlbkbgbkadjopbhjfplagjj

Uploaded dist/api-copy-devtools-v0.5.0.zip and verified package validation completed. Updated Chinese and English descriptions and added current 1280x800 PNG screenshots for Query/JSON and FormData to both languages, retaining the earlier screenshots. Existing local-data privacy disclosures were checked and preserved.

Submission option: additional testing information is required; no account/password is needed. The actual notes are saved in EDGE_CERTIFICATION_NOTES.en.txt (1,847 characters, below the 2,000-character limit).

## Chinese description

API Copy 在 Microsoft Edge 开发者工具（F12）中提供独立的“API Copy”面板，不通过浏览器工具栏弹窗使用。如果没有看到面板，请在顶部“>>”菜单中找到它。请先打开面板，再刷新网页或触发请求。无需账号或登录。

在 Microsoft Edge 自带的 Network 面板中，通常需要逐条选择请求，再切换不同区域查看路径、Query、请求 Body 和响应；复制这些信息也要反复操作。API Copy 将页面产生的 XHR / Fetch 请求集中列出，选中请求后即可在同一面板查看参数与响应，并快速复制常用内容。

它适合前端开发、接口联调和问题排查：更快核对接口路径、请求参数和返回结果，并把需要的信息复制给同事或 AI 工具分析。

主要功能：
• 集中查看请求方法、状态码、路径、耗时、参数与响应；完整请求复制包含请求头
• 一键复制接口路径、路径与参数、精简请求、完整请求、cURL 或 Token
• 在接口行内快速复制常用内容
• 查看 Query、FormData 和 JSON Body，逐项复制参数值或文件名
• 请求列表支持较早或最新请求在前，并记住排序选择
• 按请求方法、HTTP／业务失败和慢请求快速筛选
• 自定义业务成功字段、嵌套路径及成功状态码
• 搜索 JSON 字段和值，显示命中数量，并在命中项之间切换
• 按字母顺序或原始 JSON 顺序查看响应字段
• 无损保留 JSON 长整数和高精度数字；大数组按需展开
• 折叠对象时查看字段摘要，展开长文本并复制完整字段值
• 切换请求时恢复 JSON 展开、搜索和滚动状态；新请求到达不打断当前阅读
• 过滤指定 Query 参数，排除埋点、统计等非业务接口
• 配置列表路径前缀截断及 Query 参数显示
• 支持自动、左右和上下布局，拖动调整尺寸，双击分隔线恢复默认比例
• 支持键盘快捷操作；窄窗口中的复制按钮自动以图标显示
• 界面自动跟随 Microsoft Edge 语言，支持简体中文和英文

使用方法：
1. 打开需要调试的网页，按 F12 打开 Microsoft Edge DevTools。
2. 选择“API Copy”面板；如果未显示，可在顶部“>>”菜单中找到。
3. 在打开 API Copy 后刷新网页或触发接口请求。
4. 选择列表中的请求，同时查看参数与响应，或使用复制按钮。

API Copy 是 DevTools 面板扩展，没有浏览器工具栏弹窗。仅捕获打开面板后产生的 XHR / Fetch 请求，静态资源和文件下载不会作为业务接口展示。复制 cURL 只生成文本，不会自动执行命令；文件上传内容使用需要手动替换的本地路径占位符。

无需登录。请求和响应数据仅在用户本地浏览器中处理，不会上传到开发者服务器或第三方服务。

## English description

API Copy adds an "API Copy" tab INSIDE Microsoft Edge DevTools (F12). It has no browser-toolbar popup. If the tab is hidden, use the >> overflow menu. Open API Copy before reloading the page or triggering requests. No account or login is required.

Microsoft Edge's Network panel usually requires selecting a request and switching between sections to inspect its path, Query parameters, request body and response. Copying those details also takes repeated steps. API Copy gathers XHR and Fetch requests in one list. Select a request to inspect its parameters and response together, then copy the details you need.

Built for frontend development, API integration and debugging, API Copy helps you check request paths, inputs and results with less back-and-forth, and copy relevant details to a teammate or AI assistant.

Key features:
• Review request methods, status codes, paths, timing, parameters and responses together; full-request copies include headers
• Copy a path, path with parameters, concise request, full request, cURL or Token
• Use quick-copy actions directly from request rows
• Inspect Query, FormData and JSON Body; copy individual values or file names
• Show oldest or newest requests first and remember your choice
• Filter by method, HTTP/business failure and slow requests
• Configure business success fields, nested paths and successful status codes
• Search JSON keys and values, view match counts and navigate between matches
• Switch between alphabetical and original JSON field order
• Preserve long integers and precise JSON numbers; expand large arrays on demand
• Preview fields in collapsed objects, expand long text and copy complete field values
• Restore JSON expansion, search and scrolling when switching requests; new requests do not interrupt the current view
• Filter Query parameters and exclude analytics or tracking endpoints
• Configure path-prefix trimming and Query visibility in the request list
• Choose automatic, side-by-side or stacked layouts; drag splitters to resize and double-click to reset
• Use keyboard shortcuts; copy actions become icons with tooltips in narrow windows
• Follow Microsoft Edge's UI language with English and Simplified Chinese interfaces

Getting started:
1. Open the page you want to debug and press F12 to open Microsoft Edge DevTools.
2. Select the API Copy tab. If it is hidden, look in the >> overflow menu.
3. With API Copy open, reload the page or trigger an API request.
4. Select a request to inspect its parameters and response, or use the copy actions.

API Copy is a DevTools panel extension and has no browser-toolbar popup. It captures XHR/Fetch requests made after opening the panel. Static resources and file downloads are excluded from the API list. Copy cURL generates text without executing commands; file-upload placeholders must be replaced with local paths manually.

No account is required. Captured request and response data is processed locally in your browser and is not uploaded to developer-operated servers or third-party services.
