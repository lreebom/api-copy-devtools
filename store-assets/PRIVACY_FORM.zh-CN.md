# Chrome Web Store 隐私权规范填写稿

以下内容用于后台填写，最终选项应与后台实际字段保持一致。

## 单一用途说明

在 Chrome DevTools 中查看、筛选、搜索并复制当前检查页面产生的 XHR / Fetch 请求与响应信息，帮助开发者调试接口。

## 权限说明

当前 `manifest.json` 未声明额外的 `permissions` 或 `host_permissions`。扩展通过 Chrome DevTools Network API 读取当前检查页面在 DevTools 中可见的网络请求。

## 远程代码

选择：否，不使用远程代码。

所有 HTML、CSS、JavaScript 和图标均包含在扩展安装包中，不加载或执行远程脚本，也不使用 `eval` 或动态代码执行。

## 数据披露建议

由于扩展会在本地读取和展示接口内容，即使不会上传，也应根据后台现有选项如实披露可能处理的数据类型：

- 网络活动或浏览记录：请求 URL、路径和 Query 参数
- 网站内容：请求体、响应体和 Header
- 身份验证信息：Authorization 或 Token Header 存在时可能被处理

用途：仅用于扩展的核心接口调试、展示、搜索、筛选和用户主动复制功能。

数据处理说明：

- 不向开发者服务器或第三方传输请求与响应数据
- 不出售或共享用户数据
- 不将数据用于广告、信用评估或与核心功能无关的用途
- 请求记录仅保留在当前 DevTools 面板运行期间
- 本地持久化内容仅包括过滤规则和面板尺寸等界面偏好

## 隐私政策地址

https://github.com/lreebom/api-copy-devtools/blob/main/PRIVACY.md

提交前请用退出登录或无痕窗口确认该地址可以公开访问。
