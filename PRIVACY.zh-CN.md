# 隐私政策

[English](./PRIVACY.md) | [简体中文](./PRIVACY.zh-CN.md)

API Copy 是一个 Chrome DevTools 扩展，用于在开发和调试过程中查看和复制 XHR / Fetch 请求与响应信息。

## 处理的数据

当 Chrome DevTools 已打开并使用 API Copy 面板时，扩展可能会处理当前检查页面产生的网络请求信息，包括：

- 请求 URL 和 Query 参数
- 请求方法
- 请求 Header，包括存在时的 Authorization / Token Header
- 请求 Body
- 响应状态和 Header
- 响应 Body

## 数据如何使用

所有网络数据仅在用户本地浏览器中处理，用于展示、筛选、搜索、业务失败识别，以及用户主动触发的复制操作。

API Copy **不会**：

- 将请求或响应数据上传到开发者服务器
- 将请求或响应数据发送给第三方服务
- 存储分析统计或追踪标识
- 出售或共享用户数据

扩展仅会在浏览器本地存储少量界面偏好，例如需要忽略的 Query 参数名和面板尺寸。

## 敏感数据

请求 Header 和响应内容中可能包含凭证、Token、Cookie、个人数据或其他敏感信息。用户在将复制内容分享给其他人或其他服务之前，应自行检查内容。

## 联系方式

如有隐私相关问题，请在本项目的 GitHub 仓库中提交 Issue。
