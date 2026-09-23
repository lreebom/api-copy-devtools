# API Copy

[English](./README.md) | [简体中文](./README.zh-CN.md)

API Copy is a Chrome DevTools extension for API integration and debugging. It lists XHR / Fetch requests together, shows a selected request's path, parameters, and response in one panel, and makes them quick to copy.

In the Network panel, reviewing a full request often means opening requests one by one and switching between detail sections. Copying paths, parameters, and responses takes repeated steps too. API Copy brings those details into one panel, reducing back-and-forth so API issues can be shared with developers or AI-assisted tools faster.

## Features

- Shows XHR / Fetch requests only.
- Automatically follows Chrome's UI language, with English and Simplified Chinese included.
- Fast copy actions:
  - **Copy Path**: copies only the API path.
  - **Copy Path + Params**: includes Query parameters; requests with a Body also include the Body.
  - **Copy Simplified Request**: request + response without headers.
  - **Copy Full Request**: request + response with headers.
  - **Copy Token**: copies the full Authorization / Token header value, such as `Bearer eyJ...`.
- Shows three high-frequency copy actions when hovering a request row.
- Supports keyboard navigation through requests.
- Business failure detection:
  - `isSuccess === false`
  - `code` exists and is not `0` / `200`
- Configurable filtering: `_t` is removed by default, and `/jsfulldatasave-be/savedatasfromjs` is excluded as a telemetry endpoint.
- Request parameters: shows URL Query parameters as a list and shows JSON or raw request Bodies beside the request list.
- Request-list display: supports globally trimming leading path segments and optionally showing URL Query parameters; Query parameters are hidden by default.
- JSON Preview:
  - Sorts object keys A-Z
  - Searches keys and values, shows match count, and moves through matches
  - Expands / collapses objects and arrays
  - Defaults to expanding the root and top-level `data`; search expands only matched paths
  - Distinguishes strings, numbers, booleans, nulls, objects, and arrays
  - Copies field values with one click
  - Collapses long strings and supports expand / collapse through a field action or double-click
- Automatic, side-by-side, and stacked panel layouts, with remembered mode and draggable sizing.

## Install for Development

1. Clone or download this repository.
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository root directory.
6. Open any target page and reopen DevTools.
7. Open the **API Copy** tab in DevTools.

> After updating local source files, click **Reload** for the extension on `chrome://extensions/`, then reopen DevTools.

## Common Shortcuts

| Action | Result |
| --- | --- |
| `↑ / ↓` | Move through the currently filtered request list |
| `C` | Copy Path + Params; includes Body when present |
| `Cmd + C` / `Ctrl + C` | Copy Simplified Request when no text is selected |
| Select text + system copy | Copy the selected text normally |
| Hover request row | Show Path, Path + Params, and Simplified Request quick actions |

The **Help** button in the panel also lists these shortcuts.

## Query Parameter Filtering

Ignored by default:

```text
_t
```

Example:

```text
/his/his/task/getTaskRestartApplyInfo?taskId=127494&_t=1789114449248
```

Displayed and copied as:

```text
/his/his/task/getTaskRestartApplyInfo?taskId=127494
```

You can configure multiple parameter names, for example:

```text
_t,timestamp,nonce
```

Filtering applies only to URL Query parameters. Fields with the same names inside a POST Body are not removed.

## Excluded Endpoints

Open **Filter Settings** in the toolbar to configure telemetry, analytics, or health-check endpoints that should not appear. Separate multiple paths with commas. Matching uses the exact URL path and ignores Query parameters.

Excluded by default:

```text
/jsfulldatasave-be/savedatasfromjs
```

## Business Failure Detection

Some backend APIs return HTTP `200` even when the business operation failed. API Copy additionally inspects JSON responses such as:

```json
{
  "isSuccess": false,
  "code": 500,
  "message": "Save failed"
}
```

A request is marked **Business Failed** when either condition is true:

- `isSuccess === false`
- `code` exists and is not `0` or `200`

This makes it easy to locate APIs that are HTTP-successful but business-failed.

## Project Structure

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

The project has no npm dependency and no build step. The source files are the extension runtime files.

## Package

Run:

```bash
./scripts/package.sh
```

Output:

```text
dist/api-copy-devtools-v0.4.0.zip
```

The ZIP root contains `manifest.json` directly and can be uploaded to the Chrome Web Store.

## Privacy

API Copy reads network request data from the currently inspected page in DevTools, including URLs, headers, bodies, and responses. All processing happens locally in the browser. API Copy does not upload request or response data to a developer server or third-party service.

See [PRIVACY.md](./PRIVACY.md) for details.

## License

MIT License. See [LICENSE](./LICENSE).
