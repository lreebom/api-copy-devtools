# Privacy Policy

[English](./PRIVACY.md) | [简体中文](./PRIVACY.zh-CN.md)

API Copy is a Chrome DevTools extension for inspecting and copying XHR / Fetch request and response information during development and debugging.

## Data processed

When Chrome DevTools is open and the API Copy panel is used, the extension may process network request information from the inspected page, including:

- Request URL and query parameters
- Request method
- Request headers, including Authorization / Token headers when present
- Request body
- Response status and headers
- Response body

## How data is used

All network data is processed locally in the user's browser for display, filtering, searching, business-failure detection, and copy operations initiated by the user.

API Copy does **not**:

- Upload request or response data to a developer-operated server
- Send request or response data to third-party services
- Store analytics or tracking identifiers
- Sell or share user data

The extension stores only local UI preferences such as ignored query-parameter names and panel sizing in browser local storage.

## Sensitive data

Request headers and response content may contain credentials, tokens, cookies, personal data, or other sensitive information. Users should review copied content before sharing it with other people or services.

## Contact

For privacy questions, please open an issue in the project's GitHub repository.
