# Changelog

[English](./CHANGELOG.md) | [简体中文](./CHANGELOG.zh-CN.md)

All notable changes to API Copy are documented here.

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
