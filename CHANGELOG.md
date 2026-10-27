# Changelog

[English](./CHANGELOG.md) | [简体中文](./CHANGELOG.zh-CN.md)

All notable changes to API Copy are documented here.

## 0.5.0 - 2026-10-22

- Add persistent oldest/newest-first request sorting by start time, preserving the selected request and JSON view when toggled.

- Refine toolbar wrapping: shrink search and switch Settings/Help to icons first. Only search moves to a separate row in very narrow windows.

- Increase toolbar, search, section heading and helper text sizes; align copy-button borders and backgrounds with a consistent height in text and icon modes. Preserve the existing request-list, JSON and parameter content density.

- Add editable business-rule presets that apply after saving; keep Query/FormData names and values fully visible with wrapping.

- Introduce a compact workbench with 12px request paths, 11px JSON and parameter content, 26px request rows and 17px JSON lines.
- Move settings into Display, Filters and Business rules drawer tabs; keep all copy actions together and show icons only in narrow windows.
- Use 12px borderless field copy icons and in-place checkmark feedback; report clipboard failures accurately without shifting content.
- Add per-value Query and FormData copy actions; file fields copy their file names.
- Scope request navigation keys to the focused request list and hide empty parameter sections.
- Summarize only non-empty Query/FormData counts; double-click splitters to restore the main 40% / 60% and list/parameters 65% / 35% proportions.

- Add method, HTTP/business failure and slow-request filters with a configurable time threshold.
- Add configurable business success fields, nested paths and successful codes; saving re-evaluates existing records.
- Copy original requests as POSIX-shell cURL commands, including JSON, URL-encoded forms and multipart file placeholders.
- Split request parsing, JSON trees, filters, business rules and localization into focused modules sharing the existing UI theme.
- Preserve long integers, precise decimals and exponent numbers in JSON previews, request bodies and copies with a locally packaged lossless parser.
- Preserve duplicate Query/form fields and avoid decoding plus signs and percent escapes twice.
- Keep large-array ranges during search, count all matches independently and reveal the current match lazily.
- Restore each request’s JSON expansion, search, match position and scroll state.
- Batch request-list updates, reuse unchanged rows and ignore response callbacks from cleared records.

## 0.4.1 - 2026-09-23

- Fixed percent-encoded Chinese text in Query parameters, URL-encoded forms, and optionally displayed request paths and Query strings.
- Kept URL encoding intact in copied raw requests so copied addresses remain usable.

## 0.4.0 - 2026-09-23

- Improved large JSON Preview handling, preserving complete responses and creating tree nodes on demand.
- Refined collapsed object summaries to prioritize name, code, ID, and status while using the available row width for more fields.
- Tightened JSON tree layout and refined disclosure arrows, hover highlighting, and array range labels.
- Added FormData and URL-encoded form parameter inspection, including available file metadata.
- Removed redundant empty-state messages from the request parameter panel.

## 0.3.0 - 2026-09-16

- Added a resizable request parameter panel with URL Query parameters and request Body inspection.
- Added global path-prefix trimming and an option to show or hide URL Query parameters in the request list.
- Added request sequence numbers and reset recorded requests after page navigation.
- Improved JSON Preview with focused default expansion, match navigation, preserved expansion states, type-aware summaries, and clearer string values.
- Refined responsive panel sizing, headers, search controls, and JSON layout.

## 0.2.0 - 2026-09-14

- Added automatic, side-by-side, and stacked layout controls with remembered selection.
- Stacked request method and status in one compact column, simplified the splitter to one line, and allowed Preview values to use the available row width.

## 0.1.0 - 2026-09-12

Initial public release.

- Added high-frequency copy workflow: path, path + params/body, simplified request, full request, and token.
- Added keyboard navigation and shortcuts.
- Added hover copy actions on request rows.
- Added business-failure highlighting based on `isSuccess` and `code`.
- Added configurable Query parameter filtering, defaulting to `_t`.
- Added searchable, sortable JSON Preview with compact long-value handling.
- Added resizable adaptive request/response panels.
- Added unified icons for common actions.
- Added English and Simplified Chinese interfaces that follow Chrome's UI language.
