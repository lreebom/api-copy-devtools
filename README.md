# API Copy

Current version: **0.5.2**.

[English](./README.md) | [简体中文](./README.zh-CN.md)

API Copy is a Chrome DevTools extension for API integration and debugging. It lists XHR / Fetch requests together, shows a selected request's path, parameters, and response in one panel, and makes them quick to copy.

In the Network panel, reviewing a full request often means opening requests one by one and switching between detail sections. Copying paths, parameters, and responses takes repeated steps too. API Copy brings those details into one panel, reducing back-and-forth so API issues can be shared with developers or AI-assisted tools faster.

## Features

- Compact workbench: 12px request paths and 11px JSON/parameter content, 9px method/status labels, and a settings drawer for Display, Filters and Business rules.
- Keep all copy actions together on the toolbar; narrow windows show icons with hover descriptions.
- Response and Body fields share borderless copy icons with in-place checkmark feedback.

- Matches Chrome Network's Fetch/XHR category (XHR, Fetch, and EventSource), including requests that return files.
- Filter by request method, HTTP/business failure, or a configurable slow-request threshold.
- Automatically follows Chrome's UI language, with English and Simplified Chinese included.
- Fast copy actions:
  - **Copy Path**: copies the path as shown in the request list, including Query parameters when enabled.
  - **Copy Path + Params**: includes Query parameters; requests with a Body also include the Body.
  - **Copy Simplified Request**: request + response without headers.
  - **Copy Full Request**: request + response with headers.
  - **Copy cURL**: generates a POSIX Shell command from the original URL, headers and Body, unaffected by display trimming or Query filtering. Replace file-upload placeholders with local file paths.
  - **Copy Token**: copies the full Authorization / Token header value, such as `Bearer eyJ...`.
- Shows three high-frequency copy actions when hovering a request row.
- Toggle the sort icon at the start of the list filter bar to show oldest or newest requests first by start time. Oldest-first is the default; the choice is remembered. Filters and keyboard navigation follow the displayed order without resetting the selected request or JSON view.
- Supports keyboard navigation through requests while the request list has focus.
- Business failure detection:
  - `isSuccess === false`
  - `code` exists and is not `0` / `200`
- Configurable filtering: `_t` is removed by default, and `/jsfulldatasave-be/savedatasfromjs` is excluded as a telemetry endpoint.
- Request parameters: shows URL Query, FormData/URL-encoded forms, and JSON or raw request Bodies beside the request list. Copy individual parameter values or file names directly.
- Request-list display: supports globally trimming leading path segments and optionally showing URL Query parameters; Query parameters are hidden by default.
- JSON Preview:
  - Sorts object keys A-Z or preserves original field order
  - Preserves long integers, high-precision decimals and exponent numbers when previewing and copying
  - Lazily expands large arrays in index ranges; counts all search matches and reveals only the required paths
  - Restores expansion, search, current match and scrolling when switching requests
  - Searches keys and values, shows match count, and moves through matches
  - Expands / collapses objects and arrays
  - Defaults to expanding the root and top-level `data`; search expands only matched paths
  - Distinguishes strings, numbers, booleans, nulls, objects, and arrays
  - Copies field values with one click
  - Collapses long strings and supports expand / collapse through a field action or double-click
- Automatic, side-by-side, and stacked panel layouts, with remembered mode and draggable sizing. Double-click splitters to restore the main 40% / 60% and list/parameters 65% / 35% proportions.

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
| `↑ / ↓` | Move through filtered requests while the request list has focus |
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

Open **Settings → Filters** in the toolbar to configure telemetry, analytics, or health-check endpoints that should not appear. Separate multiple paths with commas. Matching uses the exact URL path and ignores Query parameters.

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

In **Settings → Business rules**, configure the success flag, expected value, status-code field and successful codes. Nested paths such as `data.code` are supported. Save to apply rules to existing and future requests; HTTP failure detection remains independent.

Business rules include editable `isSuccess + code`, `success`, and `code` presets. Save to apply. The `success` preset checks only `success = true`, without assuming an `errorCode` success value.

Query/FormData names and values remain fully visible with wrapping. The request list and parameters use the configured proportion and can be resized by dragging the splitter.

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
dist/api-copy-devtools-v0.5.2.zip
```

The ZIP root contains `manifest.json` directly and can be uploaded to the Chrome Web Store.

## Privacy

API Copy reads network request data from the currently inspected page in DevTools, including URLs, headers, bodies, and responses. All processing happens locally in the browser. API Copy does not upload request or response data to a developer server or third-party service.

See [PRIVACY.md](./PRIVACY.md) for details.

## License

MIT License. See [LICENSE](./LICENSE).

## Local regression checks

Serve the repository with a local static server and open `tests/panel-regression.html` to check numeric precision, repeated parameters, large-array search and per-request view restoration. Tests are excluded from the extension package. The pinned lossless JSON parser and its license are included in `vendor/` and run entirely locally.

## Request filters, business rules and cURL

Use the compact request filters to combine method, HTTP/business failure and slow-request conditions. The slow threshold is configurable. Filtering leaves the selected response intact.

Settings → Business success rules supports dot-separated field paths, a successful flag value and multiple successful codes. Save to re-evaluate current records and apply the rules to future requests. HTTP status is checked independently.

Copy cURL exports the original full URL, headers and Body for a POSIX shell; display trimming and ignored Query parameters do not alter the command. Multipart file metadata uses /path/to/ placeholders that must be replaced with local files.

Feature modules live in src/. Run pure logic checks with node --test tests/request-features.test.cjs; run the browser checks through tests/panel-regression.html on a local static server.

Release notes for store submissions: [0.5.2 release notes](./store-assets/RELEASE_NOTES.md). Packages include local runtime modules and third-party licenses, excluding tests, large JSON fixtures, screenshots and store materials.
