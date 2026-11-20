// 入口只负责请求采集、选中状态与面板协调；具体解析和树渲染交给功能模块。
const { t, localizeDocument } = ApiCopyI18n;
const { parseJsonText } = ApiCopyJson;
const {
  normalizeResourceType, isFetchXhrType, headersToObject,
  tryPretty, getResponseJson, getRequestBody, formatFileSize,
  getFormDataItems, getRequestBodyValue, decodeUrlComponent, decodeUrlPath,
  formatReadableSearch, getTokenFromRecord, formatCurl,
} = ApiCopyRequestData;
localizeDocument();

const MAX_RECORDS = 500;
const PREVIEW_SEARCH_DELAY = 180;
const STACK_BREAKPOINT = 1100;
const DEFAULT_IGNORED_QUERY_PARAMS = ['_t'];
const DEFAULT_IGNORED_URL_PATHS = ['/jsfulldatasave-be/savedatasfromjs'];
const DEFAULT_PATH_PREFIX_SEGMENTS = 3;
const IGNORED_PARAMS_STORAGE_KEY = 'apiCopyIgnoredQueryParams';
const IGNORED_PATHS_STORAGE_KEY = 'apiCopyIgnoredUrlPaths';
const PATH_PREFIX_SEGMENTS_STORAGE_KEY = 'apiCopyPathPrefixSegments';
const SHOW_URL_QUERY_STORAGE_KEY = 'apiCopyShowUrlQuery';
const LAYOUT_MODE_STORAGE_KEY = 'apiCopyLayoutMode';
const REQUEST_LIST_SIZE_STORAGE_KEY = 'apiCopyRequestListSize';
const REQUEST_SORT_STORAGE_KEY = 'apiCopyRequestSortOrder';

function loadIgnoredQueryParams() {
  try {
    const saved = JSON.parse(localStorage.getItem(IGNORED_PARAMS_STORAGE_KEY) || 'null');
    if (Array.isArray(saved)) return saved.map(String).map(v => v.trim()).filter(Boolean);
  } catch {}
  return [...DEFAULT_IGNORED_QUERY_PARAMS];
}

function loadIgnoredUrlPaths() {
  try {
    const saved = JSON.parse(localStorage.getItem(IGNORED_PATHS_STORAGE_KEY) || 'null');
    if (Array.isArray(saved)) return saved.map(normalizeIgnoredUrlPath).filter(Boolean);
  } catch {}
  return [...DEFAULT_IGNORED_URL_PATHS];
}

function loadLayoutMode() {
  const saved = localStorage.getItem(LAYOUT_MODE_STORAGE_KEY);
  return ['auto', 'horizontal', 'vertical'].includes(saved) ? saved : 'auto';
}

function loadPathPrefixSegments() {
  const raw = localStorage.getItem(PATH_PREFIX_SEGMENTS_STORAGE_KEY);
  if (raw === null) return DEFAULT_PATH_PREFIX_SEGMENTS;
  const saved = Number(raw);
  return Number.isInteger(saved) && saved >= 0 && saved <= 50 ? saved : DEFAULT_PATH_PREFIX_SEGMENTS;
}

function loadShowUrlQuery() {
  return localStorage.getItem(SHOW_URL_QUERY_STORAGE_KEY) === 'true';
}

const state = {
  records: [],
  selectedId: null,
  nextId: 1,
  ignoredQueryParams: loadIgnoredQueryParams(),
  // 埋点、统计等非业务请求按 URL 路径排除。
  ignoredUrlPaths: loadIgnoredUrlPaths(),
  // 请求列表与复制共用全局路径前缀截断配置。
  pathPrefixSegments: loadPathPrefixSegments(),
  // 请求列表默认隐藏 Query，参数区仍保留完整参数。
  showUrlQuery: loadShowUrlQuery(),
  // 默认沿用较早请求在前，用户切换后在刷新和重新打开面板时恢复。
  requestSortOrder: localStorage.getItem(REQUEST_SORT_STORAGE_KEY) === 'newest' ? 'newest' : 'oldest',
  // Preview 默认按字母排列字段，切换请求时保留当前排序方式。
  previewSortOrder: 'alphabetical',
  // 搜索清空时暂存当前 JSON 节点的展开状态，避免视图突然折叠。
  previewOpenStates: null,
  // 长文本与 JSON 折叠分别记录，搜索或切换请求后继续保持阅读位置。
  previewExpandedValues: new Set(),
  // 用于判断本次输入是否从有搜索词切换为清空状态。
  previewSearchQuery: '',
  // 当前 JSON 搜索命中项及其在列表中的位置。
  previewMatches: [],
  // 搜索结果独立于 DOM，按当前命中位置惰性展开数组范围。
  previewSearchIndex: null,
  requestListFrame: null,
  previewMatchIndex: -1,
  // 当前预览对应的请求，用于区分“列表刷新”和“切换接口”。
  previewRecordId: null,
  // 搜索延迟执行，避免每次输入都重建整棵 JSON 树。
  previewSearchTimer: null,
  // 自动模式响应面板宽度，手动模式固定用户选择的布局方向。
  layoutMode: loadLayoutMode(),
};

const el = {
  filterInput: document.querySelector('#filterInput'),
  filterClearBtn: document.querySelector('#filterClearBtn'),
  copyFullBtn: document.querySelector('#copyFullBtn'),
  copySimpleBtn: document.querySelector('#copySimpleBtn'),
  copyPathBtn: document.querySelector('#copyPathBtn'),
  copyPathQueryBtn: document.querySelector('#copyPathQueryBtn'),
  copyTokenBtn: document.querySelector('#copyTokenBtn'),
  copyCurlBtn: document.querySelector('#copyCurlBtn'),
  ignoredParamsInput: document.querySelector('#ignoredParamsInput'),
  ignoredPathsInput: document.querySelector('#ignoredPathsInput'),
  pathPrefixSegmentsInput: document.querySelector('#pathPrefixSegmentsInput'),
  showUrlQueryInput: document.querySelector('#showUrlQueryInput'),
  resetIgnoredParamsBtn: document.querySelector('#resetIgnoredParamsBtn'),
  clearBtn: document.querySelector('#clearBtn'),
  requestList: document.querySelector('#requestList'),
  requestSortBtn: document.querySelector('#requestSortBtn'),
  requestParamsSplitter: document.querySelector('#requestParamsSplitter'),
  requestParamsContent: document.querySelector('#requestParamsContent'),
  requestParamsMeta: document.querySelector('#requestParamsMeta'),
  countText: document.querySelector('#countText'),
  detailMeta: document.querySelector('#detailMeta'),
  previewContent: document.querySelector('#previewContent'),
  previewSearchInput: document.querySelector('#previewSearchInput'),
  previewSearchMatches: document.querySelector('#previewSearchMatches'),
  previewMatchCount: document.querySelector('#previewMatchCount'),
  previewMatchPrevBtn: document.querySelector('#previewMatchPrevBtn'),
  previewMatchNextBtn: document.querySelector('#previewMatchNextBtn'),
  // JSON 字段排序切换控件。
  previewSortBtn: document.querySelector('#previewSortBtn'),
  content: document.querySelector('#content'),
  listPane: document.querySelector('#listPane'),
  splitter: document.querySelector('#splitter'),
  layoutModeButtons: [...document.querySelectorAll('[data-layout-mode]')],
  helpBtn: document.querySelector('#helpBtn'),
  helpOverlay: document.querySelector('#helpOverlay'),
  helpCloseBtn: document.querySelector('#helpCloseBtn'),
};

// 面板控件只协调弹层与反馈，配置值仍沿用原有存储和业务处理入口。
const panelUi = ApiCopyPanelUi.create({
  t, createSvgIcon,
  onSettingsOpen() {
    el.ignoredParamsInput.value = state.ignoredQueryParams.join(',');
    el.ignoredPathsInput.value = state.ignoredUrlPaths.join(',');
    el.pathPrefixSegmentsInput.value = String(state.pathPrefixSegments);
    el.showUrlQueryInput.checked = state.showUrlQuery;
  },
});

const requestFilters = ApiCopyRequestFilters.create({ onChange: renderRequestList });
const businessRules = ApiCopyBusinessRules.createSettings({
  t,
  onSave(rules) {
    // 复用已解析 JSON，修改规则不会重新读取响应或重建当前预览。
    for (const record of state.records) {
      if (record.businessState === 'pending') continue;
      const result = ApiCopyBusinessRules.evaluate(getResponseJson(record, record.responseBody), rules);
      record.businessState = result.state;
      record.businessReason = result.reason;
    }
    renderRequestList();
    renderDetailMeta(getSelectedRecord());
  },
});

const { buildJsonNode, appendHighlightedRaw, collectJsonSearchMatches } = ApiCopyJsonTree.create({
  t, copyText, createSvgIcon, getSortOrder: () => state.previewSortOrder,
});

function normalizeIgnoredUrlPath(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  try {
    const path = new URL(text).pathname;
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
  } catch {
    const path = text.split(/[?#]/, 1)[0].trim();
    if (!path) return '';
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
  }
}

function isIgnoredRequestUrl(rawUrl) {
  let pathname;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    pathname = normalizeIgnoredUrlPath(rawUrl);
  }
  pathname = normalizeIgnoredUrlPath(pathname);
  return state.ignoredUrlPaths.includes(pathname);
}

function evaluateBusinessResult(body, parsedBody = undefined) {
  const data = parsedBody === undefined ? parseJsonText(body) : parsedBody;
  return ApiCopyBusinessRules.evaluate(data, businessRules.getRules());
}

function decodeContent(content, encoding) {
  if (!content) return '';
  if (encoding !== 'base64') return content;

  try {
    const binary = atob(content);
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return t('base64DecodeFailed');
  }
}

function addRequest(request) {
  if (!request?.request?.url) return;
  const resourceType = normalizeResourceType(request);
  if (!isFetchXhrType(resourceType)) return;
  if (isIgnoredRequestUrl(request.request.url)) return;

  // 使用请求特征去重，避免 DevTools 重复回调导致列表重复。
  const signature = `${request.startedDateTime || ''}|${request.request.method}|${request.request.url}|${request.time || ''}`;
  if (state.records.some(item => item.signature === signature)) return;

  const record = {
    id: state.nextId++,
    signature,
    url: request.request.url,
    method: request.request.method || 'GET',
    status: request.response?.status ?? 0,
    statusText: request.response?.statusText || '',
    requestHeaders: request.request.headers || [],
    queryString: request.request.queryString || [],
    postData: request.request.postData || null,
    responseHeaders: request.response?.headers || [],
    mimeType: request.response?.content?.mimeType || '',
    resourceType,
    time: request.time ?? null,
    startedDateTime: request.startedDateTime || '',
    responseBody: t('loadingResponse'),
    responseEncoding: '',
    // 响应 JSON 只解析一次，预览、搜索和排序复用同一份数据。
    parsedResponseJson: undefined,
    responseJsonParsed: false,
    businessState: 'pending',
    businessReason: '',
  };

  state.records.push(record);
  if (state.records.length > MAX_RECORDS) {
    const removed = state.records.shift();
    if (removed?.id === state.selectedId) state.selectedId = null;
  }

  scheduleRequestList();
  if (!state.selectedId && state.previewRecordId !== null) renderDetail();

  if (typeof request.getContent === 'function') {
    request.getContent((content, encoding) => {
      // 页面清空或记录淘汰后，旧回调不再解析大响应或触发渲染。
      if (!state.records.includes(record)) return;
      record.responseEncoding = encoding || '';
      const decodedContent = decodeContent(content || '', encoding);
      const parsedJson = parseJsonText(decodedContent);
      // 完整响应正文始终保留；JSON 缓存解析结果，树节点按需创建。
      record.responseBody = decodedContent;
      record.parsedResponseJson = parsedJson;
      record.responseJsonParsed = parsedJson !== undefined;
      if (!content) record.responseBody = t('noReadableResponse');
      const business = evaluateBusinessResult(record.responseBody, parsedJson);
      record.businessState = business.state;
      record.businessReason = business.reason;
      scheduleRequestList();
      renderDetailIfSelected(record.id);
    });
  } else {
    record.responseBody = t('unsupportedResponse');
    record.businessState = 'unknown';
    record.businessReason = '';
    scheduleRequestList();
    renderDetailIfSelected(record.id);
  }
}

function formatRecord(record) {
  if (!record) return t('noApiRecords');

  const requestHeaders = headersToObject(record.requestHeaders);
  const responseHeaders = headersToObject(record.responseHeaders);
  const requestBody = getRequestBody(record);
  const responseBody = tryPretty(record.responseBody, record.mimeType);
  const queryItems = filteredQueryItems(record);
  const bodyLabel = getFormDataItems(record) !== null ? 'FormData:' : 'Request Body:';
  const lines = [
    '================ REQUEST ================',
    `${record.method} ${filterUrlQuery(record.url)}`,
  ];

  if (queryItems.length) {
    const hasRepeatedNames = new Set(queryItems.map(item => item.name)).size !== queryItems.length;
    const query = hasRepeatedNames ? queryItems : Object.fromEntries(queryItems.map(item => [item.name, item.value ?? '']));
    lines.push('', 'Query Parameters:', JSON.stringify(query, null, 2));
  }

  lines.push('', 'Request Headers:', JSON.stringify(requestHeaders, null, 2));

  if (requestBody) {
    lines.push('', bodyLabel, requestBody);
  }

  lines.push(
    '',
    '================ RESPONSE ===============',
    `Status: ${record.status}${record.statusText ? ` ${record.statusText}` : ''}`,
    '',
    'Response Headers:',
    JSON.stringify(responseHeaders, null, 2),
    '',
    'Response:',
    responseBody || t('emptyResponse'),
  );

  return lines.join('\n');
}

function normalizeIgnoredParamName(name) {
  return String(name || '').trim().toLowerCase();
}

function getIgnoredParamSet() {
  return new Set(state.ignoredQueryParams.map(normalizeIgnoredParamName).filter(Boolean));
}

function isIgnoredQueryParam(name) {
  return getIgnoredParamSet().has(normalizeIgnoredParamName(name));
}

function setIgnoredQueryParamsFromInput(value) {
  const seen = new Set();
  const names = String(value || '')
    .split(/[,，\s]+/)
    .map(v => v.trim())
    .filter(Boolean)
    .filter(name => {
      const normalized = normalizeIgnoredParamName(name);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

  state.ignoredQueryParams = names;
  localStorage.setItem(IGNORED_PARAMS_STORAGE_KEY, JSON.stringify(names));
  render();
}

function setIgnoredUrlPathsFromInput(value) {
  const paths = [...new Set(
    String(value || '')
      .split(/[,，\s]+/)
      .map(normalizeIgnoredUrlPath)
      .filter(Boolean),
  )];

  state.ignoredUrlPaths = paths;
  localStorage.setItem(IGNORED_PATHS_STORAGE_KEY, JSON.stringify(paths));

  // 新规则命中当前请求时同步清空详情，避免列表与 Preview 显示不一致。
  const selected = getSelectedRecord();
  if (selected && isIgnoredRequestUrl(selected.url)) {
    state.selectedId = null;
    el.detailMeta.textContent = t('selectRequest');
    el.detailMeta.classList.remove('business-failed-meta');
    el.previewContent.innerHTML = '';
    const placeholder = document.createElement('div');
    placeholder.className = 'preview-placeholder';
    placeholder.textContent = t('currentRequestExcluded');
    el.previewContent.appendChild(placeholder);
  }
  render();
}

function setPathPrefixSegments(value) {
  const count = Math.min(Math.max(Math.trunc(Number(value)), 0), 50);
  if (!Number.isFinite(count)) return;
  state.pathPrefixSegments = count;
  el.pathPrefixSegmentsInput.value = String(count);
  localStorage.setItem(PATH_PREFIX_SEGMENTS_STORAGE_KEY, String(count));
  render();
}

function filterUrlQuery(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const ignored = getIgnoredParamSet();
    for (const name of [...url.searchParams.keys()]) {
      if (ignored.has(normalizeIgnoredParamName(name))) url.searchParams.delete(name);
    }
    return url.toString();
  } catch {
    const value = String(rawUrl || '');
    const hashIndex = value.indexOf('#');
    const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
    const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
    const qIndex = withoutHash.indexOf('?');
    if (qIndex < 0) return value;
    const pathname = withoutHash.slice(0, qIndex);
    const query = withoutHash.slice(qIndex + 1);
    const params = new URLSearchParams(query);
    const ignored = getIgnoredParamSet();
    for (const name of [...params.keys()]) {
      if (ignored.has(normalizeIgnoredParamName(name))) params.delete(name);
    }
    const filtered = params.toString();
    return `${pathname}${filtered ? `?${filtered}` : ''}${hash}`;
  }
}

function filteredQueryItems(record) {
  let items = record.queryString || [];
  try {
    // URL 是唯一可确定编码层数的来源，URLSearchParams 负责且只负责一次表单解码。
    const url = new URL(record.url);
    items = [...url.searchParams].map(([name, value]) => ({ name, value }));
  } catch {
    items = items.map(item => ({
      ...item,
      name: decodeUrlComponent(item.name),
      value: item.value == null ? item.value : decodeUrlComponent(item.value),
    }));
  }
  return items.filter(item => !isIgnoredQueryParam(item.name));
}

function formatPathWithParams(record) {
  if (!record) return '';
  const path = getCopyPathWithQuery(record.url);
  const body = getRequestBody(record);

  if (!body) return path;

  const label = getFormDataItems(record) !== null ? 'FormData:' : 'Body:';
  return [path, '', label, body].join('\n');
}

function formatRecordSimple(record) {
  if (!record) return t('noApiRecords');

  const requestBody = getRequestBody(record);
  const responseBody = tryPretty(record.responseBody, record.mimeType);
  const bodyLabel = getFormDataItems(record) !== null ? 'FormData:' : 'Body:';
  const requestLines = [
    '================ REQUEST ================',
    `${record.method} ${getCopyPathWithQuery(record.url)}`,
  ];
  if (requestBody) requestLines.push('', bodyLabel, requestBody);

  return [
    ...requestLines,
    '',
    '================ RESPONSE ===============',
    `Status: ${record.status}${record.statusText ? ` ${record.statusText}` : ''}`,
    '',
    responseBody || t('emptyResponse'),
  ].join('\n');
}

// 从过滤后的 URL 提取路径和 Query，兼容相对 URL。
function getRequestUrlParts(rawUrl) {
  const filteredUrl = filterUrlQuery(rawUrl);
  try {
    const url = new URL(filteredUrl);
    return { pathname: url.pathname, search: url.search };
  } catch {
    const hashIndex = filteredUrl.indexOf('#');
    const withoutHash = hashIndex >= 0 ? filteredUrl.slice(0, hashIndex) : filteredUrl;
    const queryIndex = withoutHash.indexOf('?');
    const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
    const search = queryIndex >= 0 ? withoutHash.slice(queryIndex) : '';
    return { pathname, search };
  }
}

function getDisplayUrl(rawUrl, includeQuery = state.showUrlQuery) {
  const { pathname, search } = getRequestUrlParts(rawUrl);
  return `${trimPathPrefix(decodeUrlPath(pathname))}${includeQuery ? formatReadableSearch(search) : ''}`;
}

// 可粘贴使用的请求路径保留 Query 与路径的百分号编码。
function getCopyPathWithQuery(rawUrl) {
  const { pathname, search } = getRequestUrlParts(rawUrl);
  return trimPathPrefix(pathname) + search;
}

function trimPathPrefix(pathname) {
  const path = pathname || '/';
  if (!state.pathPrefixSegments) return path;

  // 按非空段计数，至少保留最后一段，并保留剩余路径中的斜杠。
  const segments = [...path.matchAll(/[^/]+/g)];
  const removeCount = Math.min(state.pathPrefixSegments, segments.length - 1);
  return removeCount > 0 ? `/${path.slice(segments[removeCount].index)}` : path;
}

function filteredRecords() {
  const keyword = el.filterInput.value.trim().toLowerCase();
  return state.records.filter(record => {
    if (!isFetchXhrType(record.resourceType) || !requestFilters.matches(record)) return false;
    if (isIgnoredRequestUrl(record.url)) return false;
    if (!keyword) return true;
    // 原始 URL 可搜索域名、截断的路径前缀和隐藏的 Query 参数。
    if (record.url.toLowerCase().includes(keyword)) return true;
    const businessText = record.businessState === 'failure' ? `${t('businessFailure')} ${record.businessReason || ''}` : '';
    return `${record.method} ${record.status} ${getDisplayUrl(record.url, true)} ${businessText}`.toLowerCase().includes(keyword);
  });
}

function recordsInDisplayOrder(records = filteredRecords()) {
  const ordered = [...records].sort((a, b) => {
    const aTime = Date.parse(a.startedDateTime);
    const bTime = Date.parse(b.startedDateTime);
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
    return a.id - b.id;
  });
  // 只改变显示顺序，采集记录仍按原顺序保存，淘汰旧记录与详情缓存不受影响。
  return state.requestSortOrder === 'newest' ? ordered.reverse() : ordered;
}

function hasTextSelection() {
  const selection = window.getSelection?.();
  return Boolean(selection && !selection.isCollapsed && selection.toString());
}

// 动态按钮沿用页面统一的线性图标，避免字符图标因系统字体产生视觉偏差。
function createSvgIcon(paths) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon-svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  for (const pathData of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
  }
  return svg;
}

function createRowCopyButton(kind, title, onCopy) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `row-copy-btn row-copy-${kind}`;
  const iconPaths = {
    path: ['M10 13a4 4 0 0 0 5.7 0l2.3-2.3A4 4 0 0 0 12.3 5L11 6.3', 'M14 11a4 4 0 0 0-5.7 0L6 13.3A4 4 0 0 0 11.7 19l1.3-1.3'],
    query: ['M10 13a4 4 0 0 0 5.7 0l2.3-2.3A4 4 0 0 0 12.3 5L11 6.3', 'M14 11a4 4 0 0 0-5.7 0L6 13.3A4 4 0 0 0 11.7 19l1.3-1.3', 'M19 16v6M16 19h6'],
    simple: ['M6 4h12v16H6zM9 8h6M9 12h6M9 16h3'],
  };
  button.appendChild(createSvgIcon(iconPaths[kind]));
  button.title = title;
  button.setAttribute('aria-label', title);

  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    onCopy(button);
  });
  return button;
}

// 请求进入和正文读取完成可能密集回调，同一帧只协调一次列表更新。
function scheduleRequestList() {
  if (state.requestListFrame !== null) return;
  state.requestListFrame = requestAnimationFrame(() => {
    state.requestListFrame = null;
    renderRequestList();
  });
}

function createRequestRow(record, index) {
  const row = document.createElement('div');
  const isBusinessFailure = record.businessState === 'failure';
  row.className = `request-row${record.id === state.selectedId ? ' selected' : ''}${isBusinessFailure ? ' business-failed' : ''}`;
  row.title = isBusinessFailure
    ? `${getDisplayUrl(record.url)}\n${record.businessReason ? t('businessFailureWithReason', record.businessReason) : t('businessFailure')}`
    : getDisplayUrl(record.url);

  const requestIndex = document.createElement('span');
  requestIndex.className = 'request-index';
  requestIndex.textContent = String(index + 1);

  const method = document.createElement('span');
  method.className = 'method';
  method.textContent = record.method;

  const status = document.createElement('span');
  status.className = `status ${record.status >= 200 && record.status < 400 ? 'ok' : 'bad'}`;
  status.textContent = String(record.status || '-');

  const requestMeta = document.createElement('span');
  requestMeta.className = 'request-meta';
  requestMeta.append(method, status);

  const urlCell = document.createElement('span');
  urlCell.className = 'url-cell';

  const url = document.createElement('span');
  url.className = 'url';
  url.textContent = getDisplayUrl(record.url);
  urlCell.appendChild(url);

  if (isBusinessFailure) {
    const badge = document.createElement('span');
    badge.className = 'business-fail-badge';
    badge.textContent = t('businessFailure');
    badge.title = record.businessReason || t('businessResponseFailed');
    urlCell.appendChild(badge);
}

  const rowActions = document.createElement('span');
  rowActions.className = 'row-copy-actions';
  rowActions.append(
    createRowCopyButton('path', t('copyPath'), button => copyText(getDisplayUrl(record.url), button)),
    createRowCopyButton('query', t('copyPathWithParams'), button => copyText(formatPathWithParams(record), button)),
    createRowCopyButton('simple', t('copySimpleRequest'), button => copyText(formatRecordSimple(record), button)),
  );

  row.append(requestIndex, requestMeta, urlCell, rowActions);
  row.addEventListener('click', () => {
    // 鼠标拖拽框选列表文字时，不要因为 click 重新渲染而破坏选区。
    if (hasTextSelection()) return;
    selectRecord(record.id);
    el.requestList.focus({ preventScroll: true });
  });
  return row;
}

function renderRequestList() {
  const newestFirst = state.requestSortOrder === 'newest';
  el.requestSortBtn.setAttribute('aria-pressed', String(newestFirst));
  el.requestSortBtn.setAttribute('aria-label', t(newestFirst ? 'requestNewestFirst' : 'requestOldestFirst'));
  el.requestSortBtn.title = t(newestFirst ? 'requestNewestFirstTitle' : 'requestOldestFirstTitle');
  el.requestSortBtn.querySelector('.request-sort-arrow').setAttribute('d', newestFirst
    ? 'M7 20V4m-3 3 3-3 3 3'
    : 'M7 4v16m-3-3 3 3 3-3');
  const records = filteredRecords();
  const displayRecords = recordsInDisplayOrder(records);
  const total = state.records.filter(record => !isIgnoredRequestUrl(record.url)).length;
  const businessFailureCount = records.filter(record => record.businessState === 'failure').length;
  el.countText.textContent = records.length !== total
    ? t('filteredRequestCount', [records.length, total])
    : businessFailureCount ? t('requestCountWithFailures', [records.length, businessFailureCount]) : t('requestCount', records.length);

  const existing = new Map([...el.requestList.querySelectorAll('.request-row')].map(row => [Number(row.dataset.recordId), row]));
  const visibleIds = new Set(displayRecords.map(record => record.id));
  for (const [id, row] of existing) {
    if (!visibleIds.has(id)) row.remove();
  }
  el.requestList.querySelector('.empty')?.remove();
  if (!displayRecords.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = t('noMatchingRequests');
    el.requestList.appendChild(empty);
    return;
  }

  let anchor = el.requestList.firstElementChild;
  for (const [index, record] of displayRecords.entries()) {
    const rowKey = JSON.stringify([index, getDisplayUrl(record.url), record.businessState, record.businessReason]);
    let row = existing.get(record.id);
    if (!row || row.dataset.rowKey !== rowKey) {
      const replacement = createRequestRow(record, index);
      replacement.dataset.recordId = String(record.id);
      replacement.dataset.rowKey = rowKey;
      if (row) {
        if (anchor === row) anchor = replacement;
        row.replaceWith(replacement);
      }
      row = replacement;
    }
    row.classList.toggle('selected', record.id === state.selectedId);
    // 保留没有变化的 DOM 节点、滚动位置与用户文字选区。
    if (row !== anchor) el.requestList.insertBefore(row, anchor);
    anchor = row.nextElementSibling;
  }
}

function render() {
  renderRequestList();
  renderDetail();
}

// 每条请求独立保存阅读状态；记录被淘汰时随对象一起释放。
function saveRequestView() {
  const record = getSelectedRecord();
  if (!record || state.previewRecordId !== record.id) return;
  record.viewState = {
    openStates: getPreviewOpenStates(),
    expandedValues: new Set([...el.previewContent.querySelectorAll('.json-long-value.expanded')]
      .map(node => node.parentElement.dataset.matchPath)),
    searchQuery: el.previewSearchInput.value,
    matchIndex: state.previewMatchIndex,
    previewScroll: el.previewContent.scrollTop,
    paramsScroll: el.requestParamsContent.scrollTop,
    paramsOpenStates: new Map([...el.requestParamsContent.querySelectorAll('details[data-json-path]')]
      .map(details => [details.dataset.jsonPath, details.open])),
  };
}

function selectRecord(id) {
  if (state.selectedId === id) return;
  saveRequestView();
  state.selectedId = id;
  const view = getSelectedRecord()?.viewState;
  state.previewOpenStates = view?.openStates || null;
  state.previewExpandedValues = view?.expandedValues || new Set();
  el.previewSearchInput.value = view?.searchQuery || '';
  state.previewSearchQuery = el.previewSearchInput.value.trim().toLowerCase();
  state.previewMatchIndex = view?.matchIndex ?? 0;
  state.previewRecordId = null;
  state.previewSearchIndex = null;
  clearTimeout(state.previewSearchTimer);
  render();
  requestAnimationFrame(() => {
    if (state.selectedId !== id) return;
    el.previewContent.scrollTop = view?.previewScroll || 0;
    el.requestParamsContent.scrollTop = view?.paramsScroll || 0;
  });
}

function getSelectedRecord() {
  return state.records.find(r => r.id === state.selectedId) || null;
}

function scrollSelectedRowIntoView() {
  const selected = el.requestList.querySelector('.request-row.selected');
  selected?.scrollIntoView({ block: 'nearest' });
}

function moveSelection(delta) {
  const records = recordsInDisplayOrder();
  if (!records.length) return;

  let index = records.findIndex(record => record.id === state.selectedId);
  if (index < 0) {
    index = delta > 0 ? 0 : records.length - 1;
  } else {
    index = Math.min(Math.max(index + delta, 0), records.length - 1);
  }

  selectRecord(records[index].id);
  requestAnimationFrame(scrollSelectedRowIntoView);
}

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function renderDetailIfSelected(id) {
  if (state.selectedId === id) renderDetail();
}

function getPreviewOpenStates() {
  const openStates = new Map();
  for (const details of el.previewContent.querySelectorAll('details[data-json-path]')) {
    openStates.set(details.dataset.jsonPath, details.open);
  }
  return openStates;
}

function preservePreviewOpenStates(record) {
  // 搜索展开与手动展开统一记录，清除搜索时不回退用户正在阅读的节点。
  if (!record || state.previewRecordId !== record.id) return;
  state.previewOpenStates = getPreviewOpenStates();
  state.previewExpandedValues = new Set([...el.previewContent.querySelectorAll('.json-long-value.expanded')]
    .map(node => node.parentElement.dataset.matchPath));
}

function appendRequestParamSection(title, value, count = null) {
  const section = document.createElement('section');
  section.className = 'request-param-section';

  const heading = document.createElement('div');
  heading.className = 'request-param-title';
  heading.textContent = title;
  if (count !== null) {
    const badge = document.createElement('span');
    badge.className = 'request-param-count';
    badge.textContent = String(count);
    heading.appendChild(badge);
  }
  section.appendChild(heading);

  // 调用方已排除缺失 Body；显式提交的 null 等 JSON 标量仍需正常展示。
  if (typeof value === 'string') {
    const raw = document.createElement('pre');
    raw.className = 'request-param-raw';
    // 显式 JSON 空字符串保留引号，避免看起来像缺失 Body。
    raw.textContent = value === '' ? '""' : value;
    section.appendChild(raw);
  } else {
    const jsonNode = buildJsonNode(value, null, 0, '', getSelectedRecord()?.viewState?.paramsOpenStates);
    jsonNode.classList.add('request-param-json');
    section.appendChild(jsonNode);
  }

  el.requestParamsContent.appendChild(section);
}

// Query 和表单共用列表，保留同名参数的每一行；文件字段只复制文件名。
function appendParameterList(title, items, isFormData = false) {
  const section = document.createElement('section');
  section.className = 'request-param-section';
  const heading = document.createElement('div');
  heading.className = 'request-param-title';
  heading.textContent = title;
  const badge = document.createElement('span');
  badge.className = 'request-param-count';
  badge.textContent = String(items.length);
  heading.appendChild(badge);
  section.appendChild(heading);

  const list = document.createElement('div');
  list.className = isFormData ? 'request-query-list request-form-data-list' : 'request-query-list';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'request-query-row';
    const key = document.createElement('span');
    key.className = 'request-query-key';
    key.textContent = item.name || '';
    const value = document.createElement('span');
    value.className = 'request-query-value';
    const text = document.createElement('span');
    text.className = 'request-param-value-text';
    const copyValue = item.isFile ? item.fileName || '' : item.value ?? '';
    text.textContent = item.isFile
      ? [t('formDataFile', item.fileName), item.contentType, formatFileSize(item.fileSize)].filter(Boolean).join(' · ')
      : copyValue;

    const actions = document.createElement('span');
    actions.className = 'json-field-actions';
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'json-copy-btn';
    copyButton.dataset.copyField = 'value';
    copyButton.title = item.isFile ? t('copyFileName') : t('copyFullFieldValue');
    copyButton.setAttribute('aria-label', item.isFile
      ? `${t('copyFileName')} (${item.name})` : t('copyFieldValue', item.name));
    copyButton.appendChild(createSvgIcon(['M9 9h10v10H9zM5 15H4V5h10v1']));
    copyButton.addEventListener('click', () => copyText(String(copyValue), copyButton));

    const copyPairButton = document.createElement('button');
    copyPairButton.type = 'button';
    copyPairButton.className = 'json-copy-btn';
    copyPairButton.dataset.copyField = 'pair';
    copyPairButton.title = t('copyFieldNameAndValue');
    copyPairButton.setAttribute('aria-label', t('copyFieldPair', item.name || ''));
    copyPairButton.appendChild(createSvgIcon(['M8 8h12v12H8zM4 16V4h12', 'M14 11v6M11 14h6']));
    copyPairButton.addEventListener('click', () => copyText(`${item.name || ''}: ${copyValue}`, copyPairButton));

    actions.append(copyButton, copyPairButton);
    value.append(text, actions);
    row.append(key, value);
    list.appendChild(row);
  }
  section.appendChild(list);
  el.requestParamsContent.appendChild(section);
}

// 同时展示 URL Query 与请求 Body，让选中接口的请求和响应无需切换即可核对。
function renderRequestParameters(record) {
  const cacheKey = record ? `${record.id}|${state.ignoredQueryParams.join(',')}` : '';
  if (cacheKey && el.requestParamsContent.dataset.cacheKey === cacheKey) return;
  el.requestParamsContent.dataset.cacheKey = cacheKey;
  el.requestParamsContent.innerHTML = '';
  el.requestParamsMeta.textContent = '';
  if (!record) {
    const placeholder = document.createElement('div');
    placeholder.className = 'preview-placeholder';
    placeholder.textContent = t('selectRequestForParams');
    el.requestParamsContent.appendChild(placeholder);
    return;
  }

  const queryItems = filteredQueryItems(record);
  const formDataItems = getFormDataItems(record);
  const body = formDataItems === null ? getRequestBodyValue(record) : formDataItems;
  // 空表单没有字段；JSON 的空对象、空数组和显式 null 则都是实际 Body。
  const hasBody = formDataItems !== null
    ? formDataItems.length > 0
    : body !== null || Boolean(record.postData?.text?.trim());
  // 标题只汇总非空参数数量，普通 Body 已有分区标题，不再重复提示有无。
  const parameterCounts = [];
  if (queryItems.length) parameterCounts.push(t('queryParameterCount', queryItems.length));
  if (formDataItems?.length) parameterCounts.push(t('formDataParameterCount', formDataItems.length));
  el.requestParamsMeta.textContent = !queryItems.length && !hasBody
    ? t('noRequestParameters')
    : parameterCounts.join(' · ');
  if (queryItems.length) appendParameterList(t('queryParameters'), queryItems);
  if (hasBody) {
    if (formDataItems !== null) appendParameterList(t('formData'), formDataItems, true);
    else appendRequestParamSection(t('requestBody'), body);
  }
}

function clearPreviewSearchMatches() {
  state.previewMatches = [];
  state.previewMatchIndex = -1;
  el.previewSearchMatches.hidden = true;
  el.previewMatchCount.textContent = '';
  el.previewMatchPrevBtn.disabled = true;
  el.previewMatchNextBtn.disabled = true;
}

function setPreviewMatchIndex(index, shouldScroll = true) {
  const matches = state.previewMatches;
  if (!matches.length) return;
  state.previewMatchIndex = (index + matches.length) % matches.length;
  const match = matches[state.previewMatchIndex];
  if (match.parents) {
    // 按父级顺序打开所需范围；其他范围及手动展开状态保持原样。
    for (const path of match.parents) {
      const details = [...el.previewContent.querySelectorAll('details[data-json-path]')]
        .find(node => node.dataset.jsonPath === path);
      if (details) {
        details.open = true;
        details.dispatchEvent(new Event('json-reveal'));
      }
    }
  }
  for (const node of el.previewContent.querySelectorAll('.json-match-active')) node.classList.remove('json-match-active');
  const current = match.element || [...el.previewContent.querySelectorAll('[data-match-path]')]
    .find(node => node.dataset.matchPath === match.path);
  current?.classList.add('json-match-active');
  el.previewMatchCount.textContent = t('searchMatchCount', [state.previewMatchIndex + 1, matches.length]);
  if (current && shouldScroll) {
    const recordId = state.selectedId;
    requestAnimationFrame(() => {
      if (state.selectedId === recordId && current.isConnected) current.scrollIntoView({ block: 'center' });
    });
  }
}

function renderPreviewSearchMatches(query, data) {
  if (!query) {
    clearPreviewSearchMatches();
    return;
  }
  if (data !== undefined) {
    const cached = state.previewSearchIndex;
    if (!cached || cached.data !== data || cached.query !== query || cached.sort !== state.previewSortOrder) {
      state.previewSearchIndex = { data, query, sort: state.previewSortOrder, matches: collectJsonSearchMatches(data, query) };
    }
    state.previewMatches = state.previewSearchIndex.matches;
  } else {
    state.previewMatches = [...el.previewContent.querySelectorAll('.text-match')].map(element => ({ element }));
  }
  el.previewSearchMatches.hidden = false;
  el.previewMatchPrevBtn.disabled = state.previewMatches.length < 2;
  el.previewMatchNextBtn.disabled = state.previewMatches.length < 2;
  if (!state.previewMatches.length) {
    state.previewMatchIndex = -1;
    el.previewMatchCount.textContent = t('searchMatchCount', [0, 0]);
    return;
  }
  setPreviewMatchIndex(Math.max(state.previewMatchIndex, 0));
}

function renderPreview(record) {
  el.previewContent.innerHTML = '';
  const matchIndex = state.previewMatchIndex;
  clearPreviewSearchMatches();
  state.previewMatchIndex = matchIndex;
  const raw = record.responseBody || '';
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const query = el.previewSearchInput.value.trim().toLowerCase();
  // 搜索和清空搜索时都沿用原有展开状态，仅对命中路径作额外展开。
  const openStates = state.previewOpenStates;

  const placeholderResponses = new Set([t('loadingResponse'), t('noReadableResponse'), t('unsupportedResponse')]);
  if (!trimmed || placeholderResponses.has(raw)) {
    const placeholder = document.createElement('div');
    placeholder.className = 'preview-placeholder';
    placeholder.textContent = raw || t('emptyResponse');
    el.previewContent.appendChild(placeholder);
    return;
  }

  if (record.mimeType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const data = getResponseJson(record, trimmed);
    if (data !== undefined) {
      el.previewContent.appendChild(buildJsonNode(data, null, 0, query, openStates));
      for (const line of el.previewContent.querySelectorAll('.json-long-line[data-match-path]')) {
        if (state.previewExpandedValues.has(line.dataset.matchPath)) line.querySelector('.json-expand-btn')?.click();
      }
      state.previewRecordId = record.id;
      renderPreviewSearchMatches(query, data);
      return;
    }
  }

  const rawText = tryPretty(raw, record.mimeType) || t('emptyResponse');
  if (query && !rawText.toLowerCase().includes(query)) {
    const placeholder = document.createElement('div');
    placeholder.className = 'preview-placeholder';
    placeholder.textContent = t('noMatchingResponse');
    el.previewContent.appendChild(placeholder);
    return;
  }

  const pre = document.createElement('pre');
  pre.className = 'preview-raw';
  appendHighlightedRaw(pre, rawText, query);
  el.previewContent.appendChild(pre);
  state.previewRecordId = record.id;
  renderPreviewSearchMatches(query);
}

// 修改规则只更新状态文案，不重建当前 JSON 或请求 Body。
function renderDetailMeta(record) {
  if (!record) return;
  const businessMeta = record.businessState === 'failure'
    ? ` · ${record.businessReason ? t('businessFailureMetaWithReason', record.businessReason) : t('businessFailureMeta')}`
    : '';
  el.detailMeta.textContent = `${record.status}${record.statusText ? ` ${record.statusText}` : ''}${record.mimeType ? ` · ${record.mimeType}` : ''}${record.time != null ? ` · ${Math.round(record.time)} ms` : ''}${businessMeta}`;
  el.detailMeta.title = el.detailMeta.textContent;
  el.detailMeta.classList.toggle('business-failed-meta', record.businessState === 'failure');
}

function renderDetail() {
  const record = getSelectedRecord();
  el.copyFullBtn.disabled = !record;
  el.copySimpleBtn.disabled = !record;
  el.copyPathBtn.disabled = !record;
  el.copyPathQueryBtn.disabled = !record;
  el.copyTokenBtn.disabled = !record || !getTokenFromRecord(record);
  el.copyCurlBtn.disabled = !record;
  renderRequestParameters(record);
  if (!record) {
    clearPreviewSearchMatches();
    state.previewSearchIndex = null;
    if (state.previewRecordId !== null) {
      el.previewContent.innerHTML = '';
      el.detailMeta.textContent = t('selectRequest');
      state.previewRecordId = null;
    }
    return;
  }

  preservePreviewOpenStates(record);

  renderDetailMeta(record);
  const scrollTop = el.previewContent.scrollTop;
  const sameRecord = state.previewRecordId === record.id;
  renderPreview(record);
  if (sameRecord && !el.previewSearchInput.value.trim()) el.previewContent.scrollTop = scrollTop;
}

function copyText(text, trigger = null) {
  return panelUi.copyText(text, trigger);
}

el.filterInput.addEventListener('input', () => {
  el.filterClearBtn.hidden = !el.filterInput.value;
  renderRequestList();
});

el.filterClearBtn.addEventListener('click', () => {
  el.filterInput.value = '';
  el.filterClearBtn.hidden = true;
  el.filterInput.focus();
  renderRequestList();
});
el.previewSearchInput.addEventListener('input', () => {
  const query = el.previewSearchInput.value.trim().toLowerCase();
  if (!state.previewSearchQuery && query) {
    state.previewOpenStates = getPreviewOpenStates();
  } else if (state.previewSearchQuery && !query) {
    state.previewOpenStates = getPreviewOpenStates();
  }
  state.previewSearchQuery = query;
  state.previewMatchIndex = query ? 0 : -1;
  clearTimeout(state.previewSearchTimer);
  state.previewSearchTimer = setTimeout(() => {
    state.previewSearchTimer = null;
    renderDetail();
  }, PREVIEW_SEARCH_DELAY);
});
el.previewSearchInput.addEventListener('keydown', event => {
  // 中文输入法确认候选词时不切换命中项；快捷键只作用于搜索框。
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229
    || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  // 输入后立即回车时，先完成当前搜索，避免沿用上一个关键词的结果。
  if (state.previewSearchTimer !== null) {
    clearTimeout(state.previewSearchTimer);
    state.previewSearchTimer = null;
    renderDetail();
  }
  if (!el.previewSearchInput.value.trim()) return;
  setPreviewMatchIndex(state.previewMatchIndex + (event.shiftKey ? -1 : 1));
});
el.previewMatchPrevBtn.addEventListener('click', () => setPreviewMatchIndex(state.previewMatchIndex - 1));
el.previewMatchNextBtn.addEventListener('click', () => setPreviewMatchIndex(state.previewMatchIndex + 1));
// 切换排序后立即刷新当前响应，沿用已有搜索条件。
el.requestSortBtn.addEventListener('click', () => {
  state.requestSortOrder = state.requestSortOrder === 'newest' ? 'oldest' : 'newest';
  try { localStorage.setItem(REQUEST_SORT_STORAGE_KEY, state.requestSortOrder); } catch {}
  // 仅重排列表，不重建请求参数和 JSON；选中行在新顺序中继续保持可见。
  renderRequestList();
  scrollSelectedRowIntoView();
});

el.previewSortBtn.addEventListener('click', () => {
  // 字母模式高亮显示 A–Z 图标，原始模式显示带序号的列表图标。
  const alphabetical = state.previewSortOrder !== 'alphabetical';
  state.previewSortOrder = alphabetical ? 'alphabetical' : 'original';
  el.previewSortBtn.setAttribute('aria-pressed', String(alphabetical));
  el.previewSortBtn.setAttribute('aria-label', alphabetical ? t('sortAlphabetically') : t('sortOriginal'));
  el.previewSortBtn.querySelector('.sort-label').textContent = alphabetical ? 'A–Z' : t('originalOrderShort');
  el.previewSortBtn.title = alphabetical
    ? t('sortAlphabeticallyTitle')
    : t('sortOriginalTitle');
  renderDetail();
});

el.copyFullBtn.addEventListener('click', event => {
  const record = getSelectedRecord();
  if (record) copyText(formatRecord(record), event.currentTarget);
});

el.copySimpleBtn.addEventListener('click', event => {
  const record = getSelectedRecord();
  if (record) copyText(formatRecordSimple(record), event.currentTarget);
});

el.copyPathBtn.addEventListener('click', event => {
  const record = getSelectedRecord();
  if (record) copyText(getDisplayUrl(record.url), event.currentTarget);
});

el.copyPathQueryBtn.addEventListener('click', event => {
  const record = getSelectedRecord();
  if (record) copyText(formatPathWithParams(record), event.currentTarget);
});

el.copyCurlBtn.addEventListener('click', event => {
  const record = getSelectedRecord();
  if (record) copyText(formatCurl(record), event.currentTarget);
});

el.copyTokenBtn.addEventListener('click', event => {
  const record = getSelectedRecord();
  const token = getTokenFromRecord(record);
  if (token) copyText(token, event.currentTarget);
});

el.ignoredParamsInput.value = state.ignoredQueryParams.join(',');
el.ignoredPathsInput.value = state.ignoredUrlPaths.join(',');
el.pathPrefixSegmentsInput.value = String(state.pathPrefixSegments);
el.showUrlQueryInput.checked = state.showUrlQuery;
el.ignoredParamsInput.addEventListener('input', event => {
  setIgnoredQueryParamsFromInput(event.target.value);
});

el.ignoredPathsInput.addEventListener('input', event => {
  setIgnoredUrlPathsFromInput(event.target.value);
});

el.pathPrefixSegmentsInput.addEventListener('input', event => {
  if (event.target.value === '') return;
  setPathPrefixSegments(event.target.value);
});

el.pathPrefixSegmentsInput.addEventListener('blur', event => {
  if (event.target.value === '') event.target.value = String(state.pathPrefixSegments);
});

el.showUrlQueryInput.addEventListener('change', event => {
  state.showUrlQuery = event.target.checked;
  localStorage.setItem(SHOW_URL_QUERY_STORAGE_KEY, String(state.showUrlQuery));
  render();
});

el.resetIgnoredParamsBtn.addEventListener('click', () => {
  state.ignoredQueryParams = [...DEFAULT_IGNORED_QUERY_PARAMS];
  state.ignoredUrlPaths = [...DEFAULT_IGNORED_URL_PATHS];
  state.pathPrefixSegments = DEFAULT_PATH_PREFIX_SEGMENTS;
  state.showUrlQuery = false;
  localStorage.setItem(IGNORED_PARAMS_STORAGE_KEY, JSON.stringify(state.ignoredQueryParams));
  localStorage.setItem(IGNORED_PATHS_STORAGE_KEY, JSON.stringify(state.ignoredUrlPaths));
  localStorage.setItem(PATH_PREFIX_SEGMENTS_STORAGE_KEY, String(state.pathPrefixSegments));
  localStorage.setItem(SHOW_URL_QUERY_STORAGE_KEY, String(state.showUrlQuery));
  el.ignoredParamsInput.value = state.ignoredQueryParams.join(',');
  el.ignoredPathsInput.value = state.ignoredUrlPaths.join(',');
  el.pathPrefixSegmentsInput.value = String(state.pathPrefixSegments);
  el.showUrlQueryInput.checked = state.showUrlQuery;

  const selected = getSelectedRecord();
  if (selected && isIgnoredRequestUrl(selected.url)) {
    state.selectedId = null;
    el.detailMeta.textContent = t('selectRequest');
    el.detailMeta.classList.remove('business-failed-meta');
    el.previewContent.innerHTML = '';
    const placeholder = document.createElement('div');
    placeholder.className = 'preview-placeholder';
    placeholder.textContent = t('currentRequestExcluded');
    el.previewContent.appendChild(placeholder);
  }
  render();
});

function clearRequestRecords(placeholderText) {
  clearTimeout(state.previewSearchTimer);
  state.previewSearchIndex = null;
  state.previewExpandedValues = new Set();
  el.requestParamsContent.dataset.cacheKey = '';
  state.records = [];
  state.selectedId = null;
  state.nextId = 1;
  state.previewOpenStates = null;
  state.previewSearchQuery = '';
  state.previewMatches = [];
  state.previewMatchIndex = -1;
  state.previewRecordId = null;
  el.detailMeta.textContent = t('selectRequest');
  el.detailMeta.classList.remove('business-failed-meta');
  el.previewSearchInput.value = '';
  el.previewContent.innerHTML = '';
  const placeholder = document.createElement('div');
  placeholder.className = 'preview-placeholder';
  placeholder.textContent = placeholderText;
  el.previewContent.appendChild(placeholder);
  el.copyTokenBtn.disabled = true;
  render();
}

el.clearBtn.addEventListener('click', () => {
  clearRequestRecords(t('clearedPlaceholder'));
});

function openHelp() {
  el.helpOverlay.hidden = false;
  requestAnimationFrame(() => el.helpCloseBtn.focus());
}

function closeHelp() {
  el.helpOverlay.hidden = true;
  el.helpBtn.focus();
}

el.helpBtn.addEventListener('click', openHelp);
el.helpCloseBtn.addEventListener('click', closeHelp);
el.helpOverlay.addEventListener('click', event => {
  if (event.target === el.helpOverlay) closeHelp();
});

document.addEventListener('keydown', event => {
  if (!el.helpOverlay.hidden) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeHelp();
    }
    return;
  }

  if (panelUi.isOverlayOpen() || isTypingTarget(event.target)) return;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    // 仅列表焦点切换请求；JSON、参数和工具栏保留各自的键盘行为。
    if (!(event.target instanceof Element) || !el.requestList.contains(event.target)
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    moveSelection(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }

  const isCopyCommand = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'c';
  if (isCopyCommand) {
    // 有真实文字选区时保留浏览器原生复制，避免覆盖“框选某一段进行复制”。
    if (hasTextSelection()) return;
    const record = getSelectedRecord();
    if (!record) return;
    event.preventDefault();
    copyText(formatRecordSimple(record), el.copySimpleBtn);
    return;
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'c') {
    const record = getSelectedRecord();
    if (!record) return;
    event.preventDefault();
    copyText(formatPathWithParams(record), el.copyPathQueryBtn);
  }
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isStackedLayout() {
  return el.content.dataset.layout === 'vertical';
}

const layoutBreakpoint = window.matchMedia(`(max-width: ${STACK_BREAKPOINT}px)`);

// 将用户选项解析为实际方向，自动模式在面板跨过断点时即时更新。
function setLayoutMode(mode, shouldPersist = true) {
  const validMode = ['auto', 'horizontal', 'vertical'].includes(mode) ? mode : 'auto';
  state.layoutMode = validMode;
  el.content.dataset.layout = validMode === 'auto'
    ? (layoutBreakpoint.matches ? 'vertical' : 'horizontal')
    : validMode;

  for (const button of el.layoutModeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.layoutMode === validMode));
  }

  if (shouldPersist) localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, validMode);
}

function setListWidth(px) {
  const total = el.content.clientWidth;
  if (!total) return;
  const min = Math.min(260, total * 0.35);
  const max = Math.max(min, total - 266);
  const width = clamp(px, min, max);
  document.documentElement.style.setProperty('--list-width', `${width}px`);
  localStorage.setItem('apiCopyListWidth', String(width));
}

function setListHeight(px) {
  const total = el.content.clientHeight;
  if (!total) return;
  const min = Math.min(150, total * 0.35);
  const max = Math.max(min, total - 157);
  const height = clamp(px, min, max);
  document.documentElement.style.setProperty('--list-height', `${height}px`);
  localStorage.setItem('apiCopyListHeight', String(height));
}

const savedWidth = Number(localStorage.getItem('apiCopyListWidth'));
if (Number.isFinite(savedWidth) && savedWidth > 0) {
  document.documentElement.style.setProperty('--list-width', `${savedWidth}px`);
}

const savedHeight = Number(localStorage.getItem('apiCopyListHeight'));
if (Number.isFinite(savedHeight) && savedHeight > 0) {
  document.documentElement.style.setProperty('--list-height', `${savedHeight}px`);
}

const savedRequestListSize = Number(localStorage.getItem(REQUEST_LIST_SIZE_STORAGE_KEY));
if (Number.isFinite(savedRequestListSize) && savedRequestListSize >= 30 && savedRequestListSize <= 85) {
  document.documentElement.style.setProperty('--request-list-size', `${savedRequestListSize}%`);
}

setLayoutMode(state.layoutMode, false);

for (const button of el.layoutModeButtons) {
  button.addEventListener('click', () => setLayoutMode(button.dataset.layoutMode));
}

layoutBreakpoint.addEventListener('change', () => {
  if (state.layoutMode === 'auto') setLayoutMode('auto', false);
});

el.splitter.addEventListener('pointerdown', event => {
  event.preventDefault();
  el.splitter.setPointerCapture(event.pointerId);
  el.splitter.classList.add('dragging');
  document.body.classList.add(isStackedLayout() ? 'resizing-vertical' : 'resizing-horizontal');
});

el.splitter.addEventListener('pointermove', event => {
  if (!el.splitter.hasPointerCapture(event.pointerId)) return;
  const rect = el.content.getBoundingClientRect();
  if (isStackedLayout()) {
    setListHeight(event.clientY - rect.top);
  } else {
    setListWidth(event.clientX - rect.left);
  }
});

function endResize(event) {
  if (el.splitter.hasPointerCapture(event.pointerId)) {
    el.splitter.releasePointerCapture(event.pointerId);
  }
  el.splitter.classList.remove('dragging');
  document.body.classList.remove('resizing-horizontal', 'resizing-vertical');
}

el.splitter.addEventListener('pointerup', endResize);
el.splitter.addEventListener('pointercancel', endResize);
el.splitter.addEventListener('dblclick', () => {
  // 清除当前方向的手动尺寸，交回 CSS 百分比，使窗口缩放后仍保持默认比例。
  const stacked = isStackedLayout();
  document.documentElement.style.removeProperty(stacked ? '--list-height' : '--list-width');
  localStorage.removeItem(stacked ? 'apiCopyListHeight' : 'apiCopyListWidth');
});

function setRequestListSize(px) {
  const total = isStackedLayout() ? el.listPane.clientWidth : el.listPane.clientHeight;
  if (!total) return;
  const min = Math.min(120, total * 0.35);
  const max = Math.max(min, total - 127);
  const percentage = clamp(px, min, max) / total * 100;
  document.documentElement.style.setProperty('--request-list-size', `${percentage}%`);
  localStorage.setItem(REQUEST_LIST_SIZE_STORAGE_KEY, String(percentage));
}

// 主面板为上下布局时，请求列表与参数左右分隔；否则在左侧区域内上下分隔。
el.requestParamsSplitter.addEventListener('pointerdown', event => {
  event.preventDefault();
  el.requestParamsSplitter.setPointerCapture(event.pointerId);
  el.requestParamsSplitter.classList.add('dragging');
  document.body.classList.add(isStackedLayout() ? 'resizing-request-horizontal' : 'resizing-request-vertical');
});

el.requestParamsSplitter.addEventListener('pointermove', event => {
  if (!el.requestParamsSplitter.hasPointerCapture(event.pointerId)) return;
  const rect = el.listPane.getBoundingClientRect();
  setRequestListSize(isStackedLayout() ? event.clientX - rect.left : event.clientY - rect.top);
});

function endRequestParamsResize(event) {
  if (el.requestParamsSplitter.hasPointerCapture(event.pointerId)) {
    el.requestParamsSplitter.releasePointerCapture(event.pointerId);
  }
  el.requestParamsSplitter.classList.remove('dragging');
  document.body.classList.remove('resizing-request-horizontal', 'resizing-request-vertical');
}

el.requestParamsSplitter.addEventListener('pointerup', endRequestParamsResize);
el.requestParamsSplitter.addEventListener('pointercancel', endRequestParamsResize);
el.requestParamsSplitter.addEventListener('dblclick', () => {
  // 列表与参数共用比例，恢复后横向和纵向布局都使用默认的 65% / 35%。
  document.documentElement.style.removeProperty('--request-list-size');
  localStorage.removeItem(REQUEST_LIST_SIZE_STORAGE_KEY);
});

// 普通网页预览使用本地样例走同一套渲染流程，不发送任何模拟网络请求。
async function loadPreviewRequests() {
  // 响应字段故意不按字母排列，便于检查排序切换、搜索和复杂值展示。
  const samples = [
    {
      path: '/jsfulldatasave-be/savedatasfromjs?event=page_view', method: 'POST', status: 200, time: 12,
      requestBody: { event: 'page_view' }, body: { code: 200 },
    },
    {
      path: '/api/projects/overview', method: 'GET', status: 200, time: 86,
      body: { isSuccess: true, message: '查询成功', code: 200, data: { total: 24, active: 18, archived: 6 } },
    },
    {
      path: '/api/projects/create', method: 'POST', status: 200, time: 245,
      requestBody: { name: '接口调试工具', owner: '示例用户', tags: ['前端', '开发工具'] },
      body: { isSuccess: true, message: '创建成功', code: 200, data: { id: 'demo-1025', name: '接口调试工具', createdAt: '2026-09-12 10:30:00' } },
    },
    {
      path: '/api/projects/upload', method: 'POST', status: 200, time: 418,
      postData: {
        mimeType: 'multipart/form-data; boundary=----ApiCopyDemoBoundary',
        params: [
          { name: 'projectId', value: 'demo-1025' },
          { name: 'remark', value: '项目需求说明' },
          { name: 'attachment', fileName: '需求说明.pdf', contentType: 'application/pdf', fileSize: 248_576 },
        ],
      },
      body: { isSuccess: true, message: '上传成功', code: 200, data: { fileId: 'file-demo-1' } },
    },
    {
      path: '/api/projects/demo-1025', method: 'PUT', status: 200, time: 132,
      requestBody: { name: '重复的项目名称', version: 1 },
      body: { isSuccess: false, message: '项目名称已存在，请修改后重试', code: 409, data: null },
    },
    {
      path: '/api/reports/export', method: 'POST', status: 500, time: 1532,
      requestBody: { projectId: 'demo-1025', format: 'xlsx' },
      body: { message: '报表服务暂时不可用', requestId: 'demo-request-500', details: { retryable: true, retryAfter: 30 } },
    },
    {
      path: '/api/health', method: 'GET', status: 200, time: 18,
      body: 'Service is healthy. This is a plain text response.',
    },
    {
      path: '/api/his/his/his/networkConfigSpec/view/cuOwnership?page=1&pageSize=20&keyword=demo&_t=1789180200000', method: 'GET', status: 200, time: 168,
      body: {
        isSuccess: true, message: '查询成功', code: 200,
        data: {
          total: 3, page: 1, pageSize: 20,
          items: [
            { id: 'demo-1025', name: '接口调试工具', status: '进行中', owner: { name: '示例用户甲', department: '研发中心' }, progress: 76.5, enabled: true, tags: ['前端', '开发工具'], remark: '这是一段用于检查长文本展示的模拟说明。支持双击展开与收起，也可以通过字段右侧按钮复制完整内容。'.repeat(3) },
            { id: 'demo-1024', name: '数据分析平台', status: '待开始', owner: { name: '示例用户乙', department: '数据团队' }, progress: 0, enabled: false, tags: [], remark: null },
            { id: 'demo-1023', name: '用户管理模块', status: '已完成', owner: { name: '示例用户丙', department: '研发中心' }, progress: 100, enabled: true, tags: ['后台管理'], remark: '' },
          ],
        },
      },
    },
  ];

  try {
    // 使用脱敏的大响应 fixture 验证性能；它不进入扩展安装包。
    const response = await fetch('./fixtures/large-cost-analysis-response.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load large response fixture: ${response.status}`);
    samples.push({
      path: '/his/his/vehicleFunction/cost/analysis/list', method: 'POST', status: 200, time: 1864,
      requestBody: { vehicleCode: 'P567', versionId: '23' },
      body: await response.json(),
    });
  } catch (error) {
    // fixture 缺失不影响正常预览，方便只打开单个 HTML 文件进行样式调试。
    console.warn('Unable to load large response fixture.', error);
  }

  for (const sample of samples) {
    // 使用保留域名和明确的假 Token，复制结果也不会包含真实凭据。
    const url = new URL(sample.path, 'https://api.example.test');
    const mimeType = typeof sample.body === 'string' ? 'text/plain' : 'application/json';
    addRequest({
      _resourceType: 'fetch',
      time: sample.time,
      request: {
        url: url.href, method: sample.method,
        headers: [{ name: 'Authorization', value: 'Bearer demo-token-not-a-real-credential' }],
        queryString: [...url.searchParams].map(([name, value]) => ({ name, value })),
        postData: sample.postData || (sample.requestBody ? { mimeType: 'application/json', text: JSON.stringify(sample.requestBody) } : null),
      },
      response: {
        status: sample.status, statusText: sample.status === 200 ? 'OK' : 'Internal Server Error',
        headers: [{ name: 'Content-Type', value: mimeType }], content: { mimeType },
      },
      getContent(callback) {
        callback(typeof sample.body === 'string' ? sample.body : JSON.stringify(sample.body), '');
      },
    });
  }
  // 默认选中最后一条样例；本地服务可用时即为大响应，便于性能调试。
  selectRecord(state.records[state.records.length - 1].id);
}

if (globalThis.chrome?.devtools?.network) {
  // 只记录面板打开后的新请求，刷新面板后从空列表开始。
  chrome.devtools.network.onRequestFinished.addListener(addRequest);
  // 被调试页面刷新或跳转时清空旧页面记录，避免两次请求混在一起。
  chrome.devtools.network.onNavigated.addListener(() => {
    clearRequestRecords(t('pageReloadedPlaceholder'));
  });
} else if (location.protocol === 'http:' || location.protocol === 'https:' || location.protocol === 'file:') {
  // 明确标记网页预览，避免把样例误认为实际抓取的接口。
  const previewBadge = document.createElement('span');
  previewBadge.className = 'count-badge';
  previewBadge.textContent = t('previewData');
  document.querySelector('.panel-title').appendChild(previewBadge);
  void loadPreviewRequests();
}

render();
