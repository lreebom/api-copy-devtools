const MAX_RECORDS = 500;
const MAX_VISIBLE_ARRAY_ITEMS = 100;
const ARRAY_GROUP_SIZE = 100;
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

// WebStorm 普通网页预览无法调用 chrome.i18n，动态文案使用中文作为本地回退。
const I18N_FALLBACKS = {
  businessResponseFailed: '业务返回失败',
  base64DecodeFailed: '[响应内容为 Base64，解码失败]',
  loadingResponse: '[正在读取响应内容…]',
  noReadableResponse: '[无可读取的响应正文]',
  unsupportedResponse: '[当前请求不支持读取响应正文]',
  noApiRecords: '暂无接口记录',
  none: '(无)',
  currentRequestExcluded: '当前请求已被排除。',
  selectRequest: '请选择一个请求',
  requestCount: '$1 条',
  requestCountWithFailures: '$1 条 · $2 业务失败',
  noMatchingRequests: '暂无匹配请求',
  businessFailure: '业务失败',
  businessFailureWithReason: '业务失败：$1',
  copyPath: '复制路径',
  copyPathWithParams: '复制路径+参数',
  copySimpleRequest: '复制精简请求',
  expand: '展开',
  collapse: '收起',
  expandFullValue: '展开完整字段值',
  collapseFullValue: '收起完整字段值',
  toggleFieldValue: '$1字段 $2 的完整值',
  copy: '复制',
  copyFullFieldValue: '复制完整字段值',
  copyFieldValue: '复制字段 $1 的值',
  doubleClickToggle: '双击展开 / 收起',
  longTextAria: '长文本，双击展开或收起',
  emptyResponse: '(无返回内容)',
  noMatchingJson: '没有匹配的响应字段或值',
  noMatchingResponse: '没有匹配的响应内容',
  businessFailureMeta: '业务失败',
  businessFailureMetaWithReason: '业务失败 ($1)',
  copied: '已复制',
  sortAlphabetically: '按字母排序',
  sortOriginal: '按原始 JSON 排序',
  sortAlphabeticallyTitle: '当前：按字母排序；点击切换为原始 JSON 顺序',
  sortOriginalTitle: '当前：原始 JSON 顺序；点击切换为按字母排序',
  originalOrderShort: '原序',
  previousMatch: '上一个匹配项',
  nextMatch: '下一个匹配项',
  searchMatchCount: '$1 / $2',
  requestParameters: '请求参数',
  selectRequestForParams: '选择一条请求后查看 Query 和 Body 参数。',
  queryParameters: 'Query 参数',
  requestBody: '请求 Body',
  formData: 'FormData',
  noFormData: '无 FormData 字段',
  formDataFile: '文件：$1',
  formDataFileMeta: '$1 · $2',
  noQueryParameters: '无 Query 参数',
  noRequestBody: '无请求 Body',
  parameterSummary: 'Query $1 项 · Body $2',
  bodyPresent: '有',
  bodyAbsent: '无',
  pageReloadedPlaceholder: '页面已刷新，正在记录新请求。',
  clearedPlaceholder: '已清空。重新触发接口后会继续记录。',
  previewData: '模拟数据',
};

function t(key, substitutions = []) {
  const values = Array.isArray(substitutions) ? substitutions.map(String) : [String(substitutions)];
  const i18n = globalThis.chrome?.i18n;
  const message = values.length ? i18n?.getMessage?.(key, values) : i18n?.getMessage?.(key);
  if (message) return message;

  return (I18N_FALLBACKS[key] || key).replace(/\$(\d+)/g, (_, index) => values[Number(index) - 1] ?? '');
}

// 静态 HTML 通过 data-i18n 属性映射消息，避免在脚本中维护重复的节点清单。
function localizeDocument() {
  const getMessage = globalThis.chrome?.i18n?.getMessage;
  if (!getMessage) return;

  const language = globalThis.chrome.i18n.getUILanguage?.();
  if (language) document.documentElement.lang = language;

  const mappings = [
    ['data-i18n', 'textContent'],
    ['data-i18n-title', 'title'],
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-aria-label', 'aria-label'],
  ];

  for (const [attribute, property] of mappings) {
    for (const element of document.querySelectorAll(`[${attribute}]`)) {
      const message = getMessage.call(globalThis.chrome.i18n, element.getAttribute(attribute));
      if (message) element[property] = message;
    }
  }
}

localizeDocument();

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
  // 请求列表隐藏统一网关前缀，复制时仍使用真实路径。
  pathPrefixSegments: loadPathPrefixSegments(),
  // 请求列表默认隐藏 Query，参数区仍保留完整参数。
  showUrlQuery: loadShowUrlQuery(),
  // Preview 默认按字母排列字段，切换请求时保留当前排序方式。
  previewSortOrder: 'alphabetical',
  // 搜索清空时暂存当前 JSON 节点的展开状态，避免视图突然折叠。
  previewOpenStates: null,
  // 用于判断本次输入是否从有搜索词切换为清空状态。
  previewSearchQuery: '',
  // 当前 JSON 搜索命中项及其在列表中的位置。
  previewMatches: [],
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
  paramFilterBtn: document.querySelector('#paramFilterBtn'),
  paramFilterPanel: document.querySelector('#paramFilterPanel'),
  ignoredParamsInput: document.querySelector('#ignoredParamsInput'),
  ignoredPathsInput: document.querySelector('#ignoredPathsInput'),
  pathPrefixSegmentsInput: document.querySelector('#pathPrefixSegmentsInput'),
  showUrlQueryInput: document.querySelector('#showUrlQueryInput'),
  resetIgnoredParamsBtn: document.querySelector('#resetIgnoredParamsBtn'),
  clearBtn: document.querySelector('#clearBtn'),
  requestList: document.querySelector('#requestList'),
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
  copyStatus: document.querySelector('#copyStatus'),
  helpBtn: document.querySelector('#helpBtn'),
  helpOverlay: document.querySelector('#helpOverlay'),
  helpCloseBtn: document.querySelector('#helpCloseBtn'),
};

function normalizeResourceType(request) {
  return String(request?._resourceType || request?.request?._resourceType || '').toLowerCase();
}

function isApiRequest(record) {
  return record.resourceType === 'xhr' || record.resourceType === 'fetch';
}

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

function isJsonText(text) {
  const trimmed = String(text || '').trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function parseJsonText(text) {
  if (!isJsonText(text)) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

function evaluateBusinessResult(body, parsedBody = undefined) {
  if (typeof body !== 'string' || !isJsonText(body)) {
    return { state: 'unknown', reason: '' };
  }

  const data = parsedBody === undefined ? parseJsonText(body) : parsedBody;
  if (data === undefined) return { state: 'unknown', reason: '' };
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    return { state: 'unknown', reason: '' };
  }

  const checks = [];
  const reasons = [];

  if (Object.hasOwn(data, 'isSuccess')) {
    const raw = data.isSuccess;
    const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
    if (normalized === true || normalized === 'true') {
      checks.push(true);
    } else if (normalized === false || normalized === 'false') {
      checks.push(false);
      reasons.push(`isSuccess=${String(raw)}`);
    }
  }

  if (Object.hasOwn(data, 'code')) {
    const raw = data.code;
    const normalized = String(raw ?? '').trim();
    if (normalized) {
      const ok = normalized === '0' || normalized === '200';
      checks.push(ok);
      if (!ok) reasons.push(`code=${normalized}`);
    }
  }

  if (!checks.length) return { state: 'unknown', reason: '' };
  if (checks.some(item => item === false)) {
    return { state: 'failure', reason: reasons.join(' · ') || t('businessResponseFailed') };
  }
  return { state: 'success', reason: '' };
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
    resourceType: normalizeResourceType(request),
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

  renderRequestList();

  if (typeof request.getContent === 'function') {
    request.getContent((content, encoding) => {
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
      renderRequestList();
      renderDetailIfSelected(record.id);
    });
  } else {
    record.responseBody = t('unsupportedResponse');
    record.businessState = 'unknown';
    record.businessReason = '';
    render();
  }
}

function headersToObject(headers = []) {
  const result = {};
  for (const item of headers) {
    const name = item.name || '';
    const value = item.value ?? '';
    if (Object.hasOwn(result, name)) {
      result[name] = Array.isArray(result[name]) ? [...result[name], value] : [result[name], value];
    } else {
      result[name] = value;
    }
  }
  return result;
}

function tryPretty(text, mimeType = '') {
  if (text == null || text === '') return '';
  if (typeof text !== 'string') return JSON.stringify(text, null, 2);

  const trimmed = text.trim();
  if (!trimmed) return '';

  if (mimeType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.stringify(JSON.parse(trimmed), null, 2); } catch {}
  }
  return text;
}

function getResponseJson(record, text) {
  if (record.responseJsonParsed) return record.parsedResponseJson;

  record.responseJsonParsed = true;
  record.parsedResponseJson = parseJsonText(text);
  return record.parsedResponseJson;
}

function getRequestBody(record) {
  const postData = record.postData;
  if (!postData) return '';

  if (postData.text) return tryPretty(postData.text, postData.mimeType || '');

  if (Array.isArray(postData.params)) {
    const obj = {};
    for (const p of postData.params) obj[p.name] = p.value ?? '';
    return JSON.stringify(obj, null, 2);
  }
  return '';
}

function isFormDataMimeType(mimeType = '') {
  const normalized = mimeType.toLowerCase();
  return normalized.includes('multipart/form-data') || normalized.includes('application/x-www-form-urlencoded');
}

function createFormDataItem(param = {}) {
  const fileName = param.fileName || param.filename || '';
  return {
    name: param.name || '',
    value: param.value ?? '',
    fileName,
    contentType: param.contentType || '',
    fileSize: Number.isFinite(Number(param.fileSize ?? param.size)) ? Number(param.fileSize ?? param.size) : null,
    isFile: Boolean(fileName),
  };
}

function formatFileSize(size) {
  if (size === null || size === undefined) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function parseUrlEncodedFormData(text) {
  return [...new URLSearchParams(text)].map(([name, value]) => createFormDataItem({ name, value }));
}

function parseMultipartFormData(text, mimeType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(mimeType);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) return [];

  const parts = text.split(`--${boundary}`);
  const fields = [];
  for (const part of parts) {
    const normalized = part.replace(/^\r?\n|\r?\n--$/g, '');
    const separatorIndex = normalized.search(/\r?\n\r?\n/);
    if (separatorIndex < 0) continue;

    const headers = normalized.slice(0, separatorIndex);
    const content = normalized.slice(separatorIndex).replace(/^\r?\n\r?\n/, '').replace(/\r?\n$/, '');
    const disposition = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(headers)?.[1] || '';
    const name = /name="([^"]*)"/i.exec(disposition)?.[1] || '';
    if (!name) continue;
    const fileName = /filename="([^"]*)"/i.exec(disposition)?.[1] || '';
    const contentType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || '';
    fields.push(createFormDataItem({ name, value: fileName ? '' : content, fileName, contentType }));
  }
  return fields;
}

// DevTools 的 postData.params 可直接提供表单字段；缺失时再解析可读取的标准表单文本。
function getFormDataItems(record) {
  const postData = record?.postData;
  if (!postData || !isFormDataMimeType(postData.mimeType || '')) return null;

  if (Array.isArray(postData.params)) return postData.params.map(createFormDataItem);

  const text = postData.text || '';
  if (!text) return [];
  if (postData.mimeType.toLowerCase().includes('application/x-www-form-urlencoded')) {
    return parseUrlEncodedFormData(text);
  }
  return parseMultipartFormData(text, postData.mimeType);
}

// 请求参数面板优先按 JSON 展示，表单参数转为键值对象，其他正文保留原文。
function getRequestBodyValue(record) {
  const postData = record?.postData;
  if (!postData) return null;

  if (postData.text) {
    const text = postData.text.trim();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return postData.text; }
  }

  if (Array.isArray(postData.params) && postData.params.length) {
    return Object.fromEntries(postData.params.map(param => [param.name, param.value ?? '']));
  }
  return null;
}

function formatRecord(record) {
  if (!record) return t('noApiRecords');

  const requestHeaders = headersToObject(record.requestHeaders);
  const responseHeaders = headersToObject(record.responseHeaders);
  const requestBody = getRequestBody(record);
  const responseBody = tryPretty(record.responseBody, record.mimeType);
  const query = Object.fromEntries(filteredQueryItems(record).map(i => [i.name, i.value ?? '']));

  return [
    '================ REQUEST ================',
    '',
    'URL:',
    filterUrlQuery(record.url),
    '',
    'Method:',
    record.method,
    '',
    'Query Parameters:',
    Object.keys(query).length ? JSON.stringify(query, null, 2) : t('none'),
    '',
    'Request Headers:',
    JSON.stringify(requestHeaders, null, 2),
    '',
    'Request Body:',
    requestBody || t('none'),
    '',
    '================ RESPONSE ===============',
    '',
    'Status:',
    `${record.status}${record.statusText ? ` ${record.statusText}` : ''}`,
    '',
    'Response Headers:',
    JSON.stringify(responseHeaders, null, 2),
    '',
    'Response:',
    responseBody || t('none'),
  ].join('\n');
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
  return (record.queryString || []).filter(item => !isIgnoredQueryParam(item.name));
}

function getSimpleUrl(rawUrl) {
  const filteredUrl = filterUrlQuery(rawUrl);
  try {
    const url = new URL(filteredUrl);
    let path = url.pathname || '/';

    // 常见后端基础路径 /api 不需要带给 AI，只保留实际接口路径。
    if (path === '/api') {
      path = '/';
    } else if (path.startsWith('/api/')) {
      path = path.slice(4);
    }

    return `${path}${url.search || ''}`;
  } catch {
    // 相对 URL 也兼容处理。
    const value = String(filteredUrl || '');
    return value.startsWith('/api/') ? value.slice(4) : value;
  }
}

function getSimplePath(rawUrl, includeQuery = false) {
  const filteredUrl = filterUrlQuery(rawUrl);
  try {
    const url = new URL(filteredUrl);
    let path = url.pathname || '/';

    if (path === '/api') {
      path = '/';
    } else if (path.startsWith('/api/')) {
      path = path.slice(4);
    }

    return includeQuery ? `${path}${url.search || ''}` : path;
  } catch {
    const value = String(filteredUrl || '');
    const [pathname, query = ''] = value.split('?');
    let path = pathname;
    if (path === '/api') path = '/';
    else if (path.startsWith('/api/')) path = path.slice(4);
    return includeQuery && query ? `${path}?${query}` : path;
  }
}


function getTokenFromRecord(record) {
  if (!record) return '';
  const headers = record.requestHeaders || [];

  // 优先 Authorization，其次兼容常见 Token Header。
  const preferredNames = [
    'authorization',
    'x-access-token',
    'access-token',
    'x-auth-token',
    'token',
  ];

  for (const preferred of preferredNames) {
    const item = headers.find(header => String(header.name || '').toLowerCase() === preferred);
    if (!item) continue;
    const value = String(item.value ?? '').trim();
    if (!value) continue;
    // Authorization 原样复制，例如：Bearer eyJ...
    // 其他常见 Token Header 也直接复制完整值。
    return value;
  }
  return '';
}

function formatPathWithParams(record) {
  if (!record) return '';
  const path = getSimplePath(record.url, true);
  const body = getRequestBody(record);

  if (!body) return path;

  const method = String(record.method || '').toUpperCase();
  const bodyMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  if (!bodyMethods.has(method)) return path;

  return [path, '', 'Body:', body].join('\n');
}

function formatRecordSimple(record) {
  if (!record) return t('noApiRecords');

  const requestBody = getRequestBody(record);
  const responseBody = tryPretty(record.responseBody, record.mimeType);

  return [
    '================ REQUEST ================',
    '',
    'URL:',
    getSimpleUrl(record.url),
    '',
    'Method:',
    record.method,
    '',
    'Request Body:',
    requestBody || t('none'),
    '',
    '================ RESPONSE ===============',
    '',
    'Status:',
    `${record.status}${record.statusText ? ` ${record.statusText}` : ''}`,
    '',
    'Response:',
    responseBody || t('none'),
  ].join('\n');
}

function getDisplayUrl(rawUrl, includeQuery = state.showUrlQuery) {
  const filteredUrl = filterUrlQuery(rawUrl);
  try {
    const url = new URL(filteredUrl);
    return `${trimDisplayPath(url.pathname || '/')}${includeQuery ? url.search || '' : ''}`;
  } catch {
    const value = String(filteredUrl || '');
    const queryIndex = value.indexOf('?');
    const hashIndex = value.indexOf('#');
    const suffixIndex = [queryIndex, hashIndex].filter(index => index >= 0).sort((a, b) => a - b)[0] ?? -1;
    const pathname = suffixIndex >= 0 ? value.slice(0, suffixIndex) : value;
    const suffix = includeQuery && suffixIndex >= 0 ? value.slice(suffixIndex) : hashIndex >= 0 ? value.slice(hashIndex) : '';
    return `${trimDisplayPath(pathname)}${suffix}`;
  }
}

function trimDisplayPath(pathname) {
  const segments = String(pathname || '').split('/').filter(Boolean);
  const count = state.pathPrefixSegments;
  if (!count || !segments.length) return pathname || '/';
  // 从第一段开始截断，短路径至少保留最后一段接口名。
  const removeCount = Math.min(count, segments.length - 1);
  return `/${segments.slice(removeCount).join('/')}`;
}

function filteredRecords() {
  const keyword = el.filterInput.value.trim().toLowerCase();
  return state.records.filter(record => {
    if (!isApiRequest(record)) return false;
    if (isIgnoredRequestUrl(record.url)) return false;
    if (!keyword) return true;
    const businessText = record.businessState === 'failure' ? `${t('businessFailure')} ${record.businessReason || ''}` : '';
    return `${record.method} ${record.status} ${getDisplayUrl(record.url, true)} ${businessText}`.toLowerCase().includes(keyword);
  });
}

function recordsInDisplayOrder(records = filteredRecords()) {
  return [...records].sort((a, b) => {
    const aTime = Date.parse(a.startedDateTime);
    const bTime = Date.parse(b.startedDateTime);
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
    return a.id - b.id;
  });
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
    onCopy();
  });
  return button;
}

function renderRequestList() {
  const records = filteredRecords();
  // 按请求发起时间从早到晚展示；缺少时间时使用采集顺序兜底。
  const displayRecords = recordsInDisplayOrder(records);
  const businessFailureCount = records.filter(record => record.businessState === 'failure').length;
  el.countText.textContent = businessFailureCount
    ? t('requestCountWithFailures', [records.length, businessFailureCount])
    : t('requestCount', records.length);

  if (records.length === 0) {
    el.requestList.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = t('noMatchingRequests');
    el.requestList.appendChild(empty);
  } else {
    el.requestList.innerHTML = '';
    for (const [index, record] of displayRecords.entries()) {
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
        createRowCopyButton('path', t('copyPath'), () => copyText(getSimplePath(record.url, false))),
        createRowCopyButton('query', t('copyPathWithParams'), () => copyText(formatPathWithParams(record))),
        createRowCopyButton('simple', t('copySimpleRequest'), () => copyText(formatRecordSimple(record))),
      );

      row.append(requestIndex, requestMeta, urlCell, rowActions);
      row.addEventListener('click', () => {
        // 鼠标拖拽框选列表文字时，不要因为 click 重新渲染而破坏选区。
        if (hasTextSelection()) return;
        selectRecord(record.id);
      });
      el.requestList.appendChild(row);
    }
  }
}

function render() {
  renderRequestList();
  renderDetail();
}

function selectRecord(id) {
  state.selectedId = id;
  state.previewOpenStates = null;
  state.previewSearchQuery = el.previewSearchInput.value.trim().toLowerCase();
  state.previewMatchIndex = 0;
  state.previewRecordId = null;
  el.copyFullBtn.disabled = false;
  el.copySimpleBtn.disabled = false;
  el.copyPathBtn.disabled = false;
  el.copyPathQueryBtn.disabled = false;
  el.copyTokenBtn.disabled = !getTokenFromRecord(getSelectedRecord());
  render();
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

const keyCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

function valueClass(value) {
  if (value === null) return 'json-null';
  if (typeof value === 'string') return 'json-string';
  if (typeof value === 'number') return 'json-number';
  if (typeof value === 'boolean') return 'json-boolean';
  return '';
}

function primitiveText(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  return String(value);
}

function formatJsonPrimitive(value) {
  return typeof value === 'string' ? JSON.stringify(value) : primitiveText(value);
}

function textMatches(value, query) {
  if (!query) return false;
  return String(value ?? '').toLowerCase().includes(query);
}

// 仅调整 Preview 对象字段的展示顺序，数组始终保留元素顺序。
function sortedEntries(value) {
  const entries = Object.entries(value);
  if (Array.isArray(value) || state.previewSortOrder === 'original') return entries;
  return entries.sort(([a], [b]) => keyCollator.compare(a, b));
}

function nodeMatches(value, key, query) {
  if (!query) return true;
  if (key !== null && key !== undefined && textMatches(key, query)) return true;
  if (value === null || typeof value !== 'object') {
    return textMatches(primitiveText(value), query);
  }
  return sortedEntries(value).some(([childKey, childValue]) => nodeMatches(childValue, childKey, query));
}

function copyableJsonValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  }
  return String(value);
}

function createFieldActions(key, value, longValueEl = null) {
  if (key === null || key === undefined) return null;

  const actions = document.createElement('span');
  actions.className = 'json-field-actions';
  const stopToggle = event => {
    event.preventDefault();
    event.stopPropagation();
  };

  if (longValueEl) {
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'json-copy-btn json-expand-btn';
    const expandIcon = createSvgIcon(['M7 9l5 5 5-5']);
    const expandLabel = document.createElement('span');
    expandLabel.textContent = t('expand');
    expandBtn.append(expandIcon, expandLabel);

    // 按钮和双击共用状态更新，确保图标、文案与文本展示始终一致。
    const setExpanded = expanded => {
      longValueEl.classList.toggle('expanded', expanded);
      longValueEl.parentElement?.classList.toggle('long-value-expanded', expanded);
      expandIcon.querySelector('path').setAttribute('d', expanded ? 'M7 15l5-5 5 5' : 'M7 9l5 5 5-5');
      const action = expanded ? t('collapse') : t('expand');
      expandLabel.textContent = action;
      expandBtn.title = expanded ? t('collapseFullValue') : t('expandFullValue');
      expandBtn.setAttribute('aria-label', t('toggleFieldValue', [action, String(key)]));
      expandBtn.setAttribute('aria-expanded', String(expanded));
    };

    setExpanded(false);
    expandBtn.addEventListener('pointerdown', stopToggle);
    expandBtn.addEventListener('click', event => {
      stopToggle(event);
      setExpanded(!longValueEl.classList.contains('expanded'));
    });
    longValueEl.addEventListener('dblclick', event => {
      event.stopPropagation();
      setExpanded(!longValueEl.classList.contains('expanded'));
    });
    actions.append(expandBtn);
  }

  const copyValueBtn = document.createElement('button');
  copyValueBtn.type = 'button';
  copyValueBtn.className = 'json-copy-btn';
  const copyIcon = createSvgIcon(['M9 9h10v10H9zM5 15H4V5h10v1']);
  copyIcon.classList.add('json-copy-icon');
  const copyLabel = document.createElement('span');
  copyLabel.textContent = t('copy');
  copyValueBtn.append(copyIcon, copyLabel);
  copyValueBtn.title = t('copyFullFieldValue');
  copyValueBtn.setAttribute('aria-label', t('copyFieldValue', String(key)));

  copyValueBtn.addEventListener('pointerdown', stopToggle);
  copyValueBtn.addEventListener('click', event => {
    stopToggle(event);
    copyText(copyableJsonValue(value));
  });

  actions.append(copyValueBtn);
  return actions;
}

function appendPrimitive(parent, value, key = null, query = '') {
  const line = document.createElement('div');
  line.className = 'json-line';
  const matched = query && (
    (key !== null && textMatches(key, query)) ||
    textMatches(primitiveText(value), query)
  );
  if (matched) line.classList.add('json-match');

  if (key !== null) {
    const keyEl = document.createElement('span');
    keyEl.className = 'json-key';
    keyEl.textContent = `${String(key)}: `;
    line.appendChild(keyEl);
  }
  const valueEl = document.createElement('span');
  const rawValueText = primitiveText(value);
  // 仅展示时补全字符串引号，复制和长文本判断仍使用原始值。
  const displayValueText = formatJsonPrimitive(value);
  valueEl.className = `json-value ${valueClass(value)}`.trim();
  valueEl.textContent = displayValueText;

  if (typeof value === 'string' && rawValueText.length > 80) {
    line.classList.add('json-long-line');
    valueEl.classList.add('json-long-value');
    valueEl.title = `${rawValueText}\n\n${t('doubleClickToggle')}`;
    valueEl.setAttribute('aria-label', t('longTextAria'));
  }

  line.appendChild(valueEl);

  const actions = createFieldActions(key, value, valueEl.classList.contains('json-long-value') ? valueEl : null);
  if (actions) line.appendChild(actions);

  parent.appendChild(line);
}

function getPreviewOpenStates() {
  const openStates = new Map();
  for (const details of el.previewContent.querySelectorAll('details[data-json-path]')) {
    openStates.set(details.dataset.jsonPath, details.open);
  }
  return openStates;
}

function preservePreviewOpenStates(record) {
  const query = el.previewSearchInput.value.trim();
  // 仅在同一条接口、未搜索时保存手动展开状态；搜索中的展开规则由匹配路径决定。
  if (!record || state.previewRecordId !== record.id || query) return;
  state.previewOpenStates = getPreviewOpenStates();
}

function normalizeSummaryKey(key) {
  return String(key).replace(/[\s_-]/g, '').toLowerCase();
}

function isTechnicalSummaryKey(key) {
  return /^(create|created|update|updated|modify|modified|delete|deleted|audit)/.test(key)
    || /(time|date|timestamp|version)$/.test(key);
}

function summaryEntryPriority(key) {
  const normalized = normalizeSummaryKey(key);
  // 创建人、更新时间等技术字段仅在没有其他可用字段时作为兜底展示。
  if (isTechnicalSummaryKey(normalized)) return 100;
  if (normalized === 'name' || normalized.endsWith('name') || normalized.endsWith('names')
    || normalized === 'title' || normalized.endsWith('title') || normalized.endsWith('label')) return 0;
  if (normalized === 'code' || normalized.endsWith('code')) return 1;
  if (normalized === 'id' || normalized.endsWith('id')) return 2;
  if (normalized === 'status' || normalized.endsWith('status') || normalized.endsWith('state')) return 3;
  return 10;
}

function summaryEntrySpecificity(key) {
  const normalized = normalizeSummaryKey(key);
  // 同类字段中，优先精确名称和单数名称，避免 Names 等集合字段占满整段摘要。
  if (normalized === 'name' || normalized === 'title' || normalized === 'label' || normalized === 'displayname') return 0;
  if (normalized.endsWith('names')) return 2;
  if (normalized.endsWith('name') || normalized.endsWith('title') || normalized.endsWith('label')) return 1;
  if (normalized === 'code' || normalized === 'id' || normalized === 'status' || normalized === 'state') return 0;
  return 1;
}

function canUseInJsonSummary(value) {
  if (value === null || typeof value === 'object') return false;
  return typeof value !== 'string' || value.trim() !== '';
}

function appendJsonSummaryPreview(parent, value) {
  if (Array.isArray(value) || !value || typeof value !== 'object') return;

  // 摘要不受字母排序影响：按名称、编码、ID、状态、原始字段的业务优先级稳定展示。
  const primitiveEntries = Object.entries(value)
    .map(([key, childValue], index) => ({ key, childValue, index }))
    .filter(({ childValue }) => canUseInJsonSummary(childValue));
  // 基础字段缺失时才回退到对象或数组，保证折叠节点仍有可识别的信息。
  const sourceEntries = primitiveEntries.length
    ? primitiveEntries
    : Object.entries(value).map(([key, childValue], index) => ({ key, childValue, index }));
  const sortedEntries = sourceEntries.sort((a, b) => {
    const priorityDifference = summaryEntryPriority(a.key) - summaryEntryPriority(b.key);
    if (priorityDifference) return priorityDifference;
    return summaryEntrySpecificity(a.key) - summaryEntrySpecificity(b.key) || a.index - b.index;
  });
  const entries = [];
  const usedBusinessCategories = new Set();
  // 摘要由可用行宽自然截断，字段数量只保留性能上限，避免大数组创建过多节点。
  const maxEntries = 12;

  for (const entry of sortedEntries) {
    const priority = summaryEntryPriority(entry.key);
    // 名称、编码、ID、状态各保留一个，避免同类长字段遮住后续关键信息。
    if (priority <= 3 && usedBusinessCategories.has(priority)) continue;
    if (priority <= 3) usedBusinessCategories.add(priority);
    entries.push([entry.key, entry.childValue]);
    if (entries.length === maxEntries) break;
  }
  if (!entries.length) return;

  const preview = document.createElement('span');
  preview.className = 'json-summary-preview';

  for (const [index, [childKey, childValue]] of entries.slice(0, maxEntries).entries()) {
    if (index) preview.appendChild(document.createTextNode(', '));

    const keyEl = document.createElement('span');
    keyEl.className = 'json-key';
    keyEl.textContent = `${childKey}: `;
    preview.appendChild(keyEl);

    const valueEl = document.createElement('span');
    if (childValue !== null && typeof childValue === 'object') {
      valueEl.className = 'json-type';
      valueEl.textContent = Array.isArray(childValue) ? '[…]' : '{…}';
    } else {
      valueEl.className = `json-value ${valueClass(childValue)}`.trim();
      valueEl.textContent = formatJsonPrimitive(childValue);
    }
    preview.appendChild(valueEl);
  }

  if (entries.length === maxEntries && sortedEntries.length > entries.length) {
    preview.appendChild(document.createTextNode(', …'));
  }
  parent.appendChild(preview);
}

function escapeJsonPathSegment(key) {
  return String(key).replaceAll('~', '~0').replaceAll('/', '~1');
}

function getDefaultNodeOpen(value, key, depth) {
  if (depth === 0) return true;
  // 大型 data 数组默认折叠，避免刚打开预览就创建数千个节点。
  return depth === 1 && key === 'data' && (!Array.isArray(value) || value.length <= MAX_VISIBLE_ARRAY_ITEMS);
}

function buildArrayRangeNode(entries, start, end, depth, query, openStates, path) {
  const wrapper = document.createElement('div');
  wrapper.className = 'json-node json-array-range';

  const details = document.createElement('details');
  details.className = 'json-details';
  details.dataset.jsonPath = path;
  details.open = openStates?.get(path) ?? false;

  const summary = document.createElement('summary');
  summary.className = 'json-summary json-range-summary';
  // 与 Chrome DevTools 一致，直接使用数组下标范围表达分组。
  summary.textContent = `[${start} … ${end}]`;
  details.appendChild(summary);

  const populate = () => {
    if (details.dataset.childrenRendered) return;
    details.dataset.childrenRendered = 'true';
    for (const [childKey, childValue] of entries.slice(start, end + 1)) {
      const childPath = `${path}/${escapeJsonPathSegment(childKey)}`;
      details.appendChild(buildJsonNode(childValue, childKey, depth + 1, query, openStates, childPath));
    }
  };

  details.addEventListener('toggle', () => {
    if (details.open) populate();
  });
  if (details.open) populate();

  wrapper.appendChild(details);
  return wrapper;
}

function buildJsonNode(value, key = null, depth = 0, query = '', openStates = null, path = '') {
  const wrapper = document.createElement('div');
  wrapper.className = depth === 0 ? 'json-node json-root' : 'json-node';

  if (value === null || typeof value !== 'object') {
    appendPrimitive(wrapper, value, key, query);
    return wrapper;
  }

  const isArray = Array.isArray(value);
  const allEntries = sortedEntries(value);
  const keyMatched = key !== null && textMatches(key, query);

  const details = document.createElement('details');
  details.className = 'json-details';
  details.dataset.jsonPath = path;
  // 搜索仅强制展开命中节点及其父级路径，未命中节点保留搜索前的展开状态。
  details.open = query && nodeMatches(value, key, query)
    ? true
    : openStates?.get(path) ?? getDefaultNodeOpen(value, key, depth);

  const summary = document.createElement('summary');
  summary.className = 'json-summary';
  if (keyMatched) summary.classList.add('json-match');

  // 让键、类型和折叠摘要共享一段可伸缩行宽，避免摘要按内容宽度提前截断。
  const summaryContent = document.createElement('span');
  summaryContent.className = 'json-summary-content';

  if (key !== null) {
    const keyEl = document.createElement('span');
    keyEl.className = 'json-key';
    keyEl.textContent = `${String(key)}: `;
    summaryContent.appendChild(keyEl);
  }

  const type = document.createElement('span');
  type.className = 'json-type json-summary-count';
  // 使用 DevTools 风格的紧凑标识，保留元素或字段数量但不重复显示类型名称。
  type.textContent = isArray ? `[${allEntries.length}]` : `{${allEntries.length}}`;
  summaryContent.appendChild(type);
  appendJsonSummaryPreview(summaryContent, value);
  summary.appendChild(summaryContent);

  const actions = createFieldActions(key, value);
  if (actions) summary.appendChild(actions);
  details.appendChild(summary);

  const populate = () => {
    if (details.dataset.childrenRendered) return;
    details.dataset.childrenRendered = 'true';

    if (allEntries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'json-node json-empty';
      empty.textContent = isArray ? '[]' : '{}';
      details.appendChild(empty);
      return;
    }

    // 大数组按范围分组，单次最多创建一个范围内的节点。
    if (isArray && allEntries.length > MAX_VISIBLE_ARRAY_ITEMS && !query) {
      for (let start = 0; start < allEntries.length; start += ARRAY_GROUP_SIZE) {
        const end = Math.min(start + ARRAY_GROUP_SIZE - 1, allEntries.length - 1);
        const rangePath = `${path}/@${start}-${end}`;
        details.appendChild(buildArrayRangeNode(allEntries, start, end, depth, query, openStates, rangePath));
      }
      return;
    }

    for (const [childKey, childValue] of allEntries) {
      const childPath = `${path}/${escapeJsonPathSegment(childKey)}`;
      details.appendChild(buildJsonNode(childValue, childKey, depth + 1, query, openStates, childPath));
    }
  };

  details.addEventListener('toggle', () => {
    if (details.open) populate();
  });
  if (details.open) populate();

  wrapper.appendChild(details);
  return wrapper;
}

function appendHighlightedRaw(parent, text, query) {
  if (!query) {
    parent.textContent = text;
    return;
  }

  const lower = text.toLowerCase();
  let cursor = 0;
  let matches = 0;
  const maxHighlights = 300;

  while (cursor < text.length && matches < maxHighlights) {
    const index = lower.indexOf(query, cursor);
    if (index < 0) break;
    if (index > cursor) parent.appendChild(document.createTextNode(text.slice(cursor, index)));

    const mark = document.createElement('span');
    mark.className = 'text-match';
    mark.textContent = text.slice(index, index + query.length);
    parent.appendChild(mark);

    cursor = index + query.length;
    matches += 1;
  }

  if (cursor < text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
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

  // 空参数仅保留标题和计数，避免重复的空状态文案占用面板高度。
  if (typeof value === 'string') {
    const raw = document.createElement('pre');
    raw.className = 'request-param-raw';
    raw.textContent = value;
    section.appendChild(raw);
  } else if (value !== null) {
    const jsonNode = buildJsonNode(value);
    jsonNode.classList.add('request-param-json');
    section.appendChild(jsonNode);
  }

  el.requestParamsContent.appendChild(section);
}

function appendQueryParameters(queryItems) {
  const section = document.createElement('section');
  section.className = 'request-param-section';

  const heading = document.createElement('div');
  heading.className = 'request-param-title';
  heading.textContent = t('queryParameters');
  const badge = document.createElement('span');
  badge.className = 'request-param-count';
  badge.textContent = String(queryItems.length);
  heading.appendChild(badge);
  section.appendChild(heading);

  if (queryItems.length) {
    const list = document.createElement('div');
    list.className = 'request-query-list';
    for (const item of queryItems) {
      const row = document.createElement('div');
      row.className = 'request-query-row';
      const key = document.createElement('span');
      key.className = 'request-query-key';
      key.textContent = item.name || '';
      const value = document.createElement('span');
      value.className = 'request-query-value';
      value.textContent = item.value ?? '';
      row.append(key, value);
      list.appendChild(row);
    }
    section.appendChild(list);
  }

  el.requestParamsContent.appendChild(section);
}

function appendFormDataParameters(items) {
  const section = document.createElement('section');
  section.className = 'request-param-section';

  const heading = document.createElement('div');
  heading.className = 'request-param-title';
  heading.textContent = t('formData');
  const badge = document.createElement('span');
  badge.className = 'request-param-count';
  badge.textContent = String(items.length);
  heading.appendChild(badge);
  section.appendChild(heading);

  if (items.length) {
    const list = document.createElement('div');
    list.className = 'request-query-list request-form-data-list';
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'request-query-row';
      const key = document.createElement('span');
      key.className = 'request-query-key';
      key.textContent = item.name;
      const value = document.createElement('span');
      value.className = 'request-query-value';

      if (item.isFile) {
        const fileInfo = [t('formDataFile', item.fileName), item.contentType, formatFileSize(item.fileSize)].filter(Boolean);
        value.textContent = fileInfo.join(' · ');
      } else {
        value.textContent = item.value;
      }
      row.append(key, value);
      list.appendChild(row);
    }
    section.appendChild(list);
  }

  el.requestParamsContent.appendChild(section);
}

// 同时展示 URL Query 与请求 Body，让选中接口的请求和响应无需切换即可核对。
function renderRequestParameters(record) {
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
  el.requestParamsMeta.textContent = t('parameterSummary', [
    queryItems.length,
    body === null ? t('bodyAbsent') : t('bodyPresent'),
  ]);
  appendQueryParameters(queryItems);
  if (formDataItems !== null) {
    appendFormDataParameters(formDataItems);
  } else {
    appendRequestParamSection(t('requestBody'), body);
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
  for (const item of matches) item.classList.remove('json-match-active');

  const current = matches[state.previewMatchIndex];
  current.classList.add('json-match-active');
  el.previewMatchCount.textContent = t('searchMatchCount', [state.previewMatchIndex + 1, matches.length]);

  if (shouldScroll) {
    requestAnimationFrame(() => current.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }
}

function renderPreviewSearchMatches(query) {
  if (!query) {
    clearPreviewSearchMatches();
    return;
  }

  state.previewMatches = [...el.previewContent.querySelectorAll('.json-match, .text-match')];
  if (!state.previewMatches.length) {
    clearPreviewSearchMatches();
    return;
  }

  el.previewSearchMatches.hidden = false;
  el.previewMatchPrevBtn.disabled = state.previewMatches.length < 2;
  el.previewMatchNextBtn.disabled = state.previewMatches.length < 2;
  if (state.previewMatchIndex < 0 || state.previewMatchIndex >= state.previewMatches.length) {
    state.previewMatchIndex = 0;
  }
  setPreviewMatchIndex(state.previewMatchIndex);
}

function renderPreview(record) {
  el.previewContent.innerHTML = '';
  clearPreviewSearchMatches();
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
      if (query && !nodeMatches(data, null, query)) {
        const placeholder = document.createElement('div');
        placeholder.className = 'preview-placeholder';
        placeholder.textContent = t('noMatchingJson');
        el.previewContent.appendChild(placeholder);
        return;
      }
      el.previewContent.appendChild(buildJsonNode(data, null, 0, query, openStates));
      state.previewRecordId = record.id;
      renderPreviewSearchMatches(query);
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

function renderDetail() {
  const record = getSelectedRecord();
  el.copyFullBtn.disabled = !record;
  el.copySimpleBtn.disabled = !record;
  el.copyPathBtn.disabled = !record;
  el.copyPathQueryBtn.disabled = !record;
  el.copyTokenBtn.disabled = !record || !getTokenFromRecord(record);
  renderRequestParameters(record);
  if (!record) {
    clearPreviewSearchMatches();
    return;
  }

  preservePreviewOpenStates(record);

  const businessMeta = record.businessState === 'failure'
    ? ` · ${record.businessReason ? t('businessFailureMetaWithReason', record.businessReason) : t('businessFailureMeta')}`
    : '';
  el.detailMeta.textContent = `${record.status}${record.statusText ? ` ${record.statusText}` : ''}${record.mimeType ? ` · ${record.mimeType}` : ''}${record.time != null ? ` · ${Math.round(record.time)} ms` : ''}${businessMeta}`;
  el.detailMeta.classList.toggle('business-failed-meta', record.businessState === 'failure');
  renderPreview(record);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  el.copyStatus.textContent = t('copied');
  clearTimeout(copyText.timer);
  copyText.timer = setTimeout(() => { el.copyStatus.textContent = ''; }, 1200);
}

el.filterInput.addEventListener('input', () => {
  el.filterClearBtn.hidden = !el.filterInput.value;
  render();
});

el.filterClearBtn.addEventListener('click', () => {
  el.filterInput.value = '';
  el.filterClearBtn.hidden = true;
  el.filterInput.focus();
  render();
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
el.previewMatchPrevBtn.addEventListener('click', () => setPreviewMatchIndex(state.previewMatchIndex - 1));
el.previewMatchNextBtn.addEventListener('click', () => setPreviewMatchIndex(state.previewMatchIndex + 1));
// 切换排序后立即刷新当前响应，沿用已有搜索条件。
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

el.copyFullBtn.addEventListener('click', () => {
  const record = getSelectedRecord();
  if (record) copyText(formatRecord(record));
});

el.copySimpleBtn.addEventListener('click', () => {
  const record = getSelectedRecord();
  if (record) copyText(formatRecordSimple(record));
});

el.copyPathBtn.addEventListener('click', () => {
  const record = getSelectedRecord();
  if (record) copyText(getSimplePath(record.url, false));
});

el.copyPathQueryBtn.addEventListener('click', () => {
  const record = getSelectedRecord();
  if (record) copyText(formatPathWithParams(record));
});

el.copyTokenBtn.addEventListener('click', () => {
  const record = getSelectedRecord();
  const token = getTokenFromRecord(record);
  if (token) copyText(token);
});

el.ignoredParamsInput.value = state.ignoredQueryParams.join(',');
el.ignoredPathsInput.value = state.ignoredUrlPaths.join(',');
el.pathPrefixSegmentsInput.value = String(state.pathPrefixSegments);
el.showUrlQueryInput.checked = state.showUrlQuery;
el.paramFilterBtn.setAttribute('aria-expanded', 'false');

el.paramFilterBtn.addEventListener('click', () => {
  const willShow = el.paramFilterPanel.hidden;
  el.paramFilterPanel.hidden = !willShow;
  el.paramFilterBtn.setAttribute('aria-expanded', String(willShow));
  if (willShow) {
    el.ignoredParamsInput.value = state.ignoredQueryParams.join(',');
    el.ignoredPathsInput.value = state.ignoredUrlPaths.join(',');
    el.pathPrefixSegmentsInput.value = String(state.pathPrefixSegments);
    el.showUrlQueryInput.checked = state.showUrlQuery;
    el.ignoredParamsInput.focus();
    el.ignoredParamsInput.select();
  }
});

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

  if (isTypingTarget(event.target)) return;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
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
    copyText(formatRecordSimple(record));
    return;
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'c') {
    const record = getSelectedRecord();
    if (!record) return;
    event.preventDefault();
    copyText(formatPathWithParams(record));
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
