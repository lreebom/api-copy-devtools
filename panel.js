const MAX_RECORDS = 500;
const MAX_CONTENT_CHARS = 2_000_000;
const STACK_BREAKPOINT = 1100;
const DEFAULT_IGNORED_QUERY_PARAMS = ['_t'];
const DEFAULT_IGNORED_URL_PATHS = ['/jsfulldatasave-be/savedatasfromjs'];
const IGNORED_PARAMS_STORAGE_KEY = 'apiCopyIgnoredQueryParams';
const IGNORED_PATHS_STORAGE_KEY = 'apiCopyIgnoredUrlPaths';

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

const state = {
  records: [],
  selectedId: null,
  nextId: 1,
  ignoredQueryParams: loadIgnoredQueryParams(),
  // 埋点、统计等非业务请求按 URL 路径排除。
  ignoredUrlPaths: loadIgnoredUrlPaths(),
  // Preview 默认按字母排列字段，切换请求时保留当前排序方式。
  previewSortOrder: 'alphabetical',
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
  resetIgnoredParamsBtn: document.querySelector('#resetIgnoredParamsBtn'),
  clearBtn: document.querySelector('#clearBtn'),
  requestList: document.querySelector('#requestList'),
  countText: document.querySelector('#countText'),
  detailMeta: document.querySelector('#detailMeta'),
  previewContent: document.querySelector('#previewContent'),
  previewSearchInput: document.querySelector('#previewSearchInput'),
  // JSON 字段排序切换控件。
  previewSortBtn: document.querySelector('#previewSortBtn'),
  content: document.querySelector('#content'),
  listPane: document.querySelector('#listPane'),
  splitter: document.querySelector('#splitter'),
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

function evaluateBusinessResult(body) {
  if (typeof body !== 'string') return { state: 'unknown', reason: '' };
  const trimmed = body.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return { state: 'unknown', reason: '' };
  }

  let data;
  try { data = JSON.parse(trimmed); } catch { return { state: 'unknown', reason: '' }; }
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
    return { state: 'failure', reason: reasons.join(' · ') || '业务返回失败' };
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
    return '[响应内容为 Base64，解码失败]';
  }
}

function truncate(text) {
  if (!text) return '';
  if (text.length <= MAX_CONTENT_CHARS) return text;
  return `${text.slice(0, MAX_CONTENT_CHARS)}\n\n[内容过大，仅保留前 ${MAX_CONTENT_CHARS.toLocaleString()} 个字符]`;
}

function addRequest(request) {
  if (!request?.request?.url) return;
  if (isIgnoredRequestUrl(request.request.url)) return;

  // 避免 getHAR + onRequestFinished 对同一条产生明显重复。
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
    responseBody: '[正在读取响应内容…]',
    responseEncoding: '',
    businessState: 'pending',
    businessReason: '',
  };

  state.records.push(record);
  if (state.records.length > MAX_RECORDS) {
    const removed = state.records.shift();
    if (removed?.id === state.selectedId) state.selectedId = null;
  }

  render();

  if (typeof request.getContent === 'function') {
    request.getContent((content, encoding) => {
      record.responseEncoding = encoding || '';
      record.responseBody = truncate(decodeContent(content || '', encoding));
      if (!content) record.responseBody = '[无可读取的响应正文]';
      const business = evaluateBusinessResult(record.responseBody);
      record.businessState = business.state;
      record.businessReason = business.reason;
      render();
    });
  } else {
    record.responseBody = '[当前请求不支持读取响应正文]';
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

function formatRecord(record) {
  if (!record) return '暂无接口记录';

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
    Object.keys(query).length ? JSON.stringify(query, null, 2) : '(无)',
    '',
    'Request Headers:',
    JSON.stringify(requestHeaders, null, 2),
    '',
    'Request Body:',
    requestBody || '(无)',
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
    responseBody || '(无)',
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
    el.detailMeta.textContent = '请选择一个请求';
    el.detailMeta.classList.remove('business-failed-meta');
    el.previewContent.innerHTML = '<div class="preview-placeholder">当前请求已被排除。</div>';
  }
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
  if (!record) return '暂无接口记录';

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
    requestBody || '(无)',
    '',
    '================ RESPONSE ===============',
    '',
    'Status:',
    `${record.status}${record.statusText ? ` ${record.statusText}` : ''}`,
    '',
    'Response:',
    responseBody || '(无)',
  ].join('\n');
}

function getDisplayUrl(rawUrl) {
  const filteredUrl = filterUrlQuery(rawUrl);
  try {
    const url = new URL(filteredUrl);
    return `${url.pathname || '/'}${url.search || ''}`;
  } catch {
    return String(filteredUrl || '');
  }
}

function filteredRecords() {
  const keyword = el.filterInput.value.trim().toLowerCase();
  return state.records.filter(record => {
    if (!isApiRequest(record)) return false;
    if (isIgnoredRequestUrl(record.url)) return false;
    if (!keyword) return true;
    const businessText = record.businessState === 'failure' ? `业务失败 ${record.businessReason || ''}` : '';
    return `${record.method} ${record.status} ${getDisplayUrl(record.url)} ${businessText}`.toLowerCase().includes(keyword);
  });
}

function visibleRecordsInDisplayOrder() {
  return [...filteredRecords()].reverse();
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

function render() {
  const records = filteredRecords();
  const displayRecords = [...records].reverse();
  const businessFailureCount = records.filter(record => record.businessState === 'failure').length;
  el.countText.textContent = businessFailureCount
    ? `${records.length} 条 · ${businessFailureCount} 业务失败`
    : `${records.length} 条`;

  if (records.length === 0) {
    el.requestList.innerHTML = '<div class="empty">暂无匹配请求</div>';
  } else {
    el.requestList.innerHTML = '';
    for (const record of displayRecords) {
      const row = document.createElement('div');
      const isBusinessFailure = record.businessState === 'failure';
      row.className = `request-row${record.id === state.selectedId ? ' selected' : ''}${isBusinessFailure ? ' business-failed' : ''}`;
      row.title = isBusinessFailure
        ? `${getDisplayUrl(record.url)}\n业务失败${record.businessReason ? `：${record.businessReason}` : ''}`
        : getDisplayUrl(record.url);

      const method = document.createElement('span');
      method.className = 'method';
      method.textContent = record.method;

      const status = document.createElement('span');
      status.className = `status ${record.status >= 200 && record.status < 400 ? 'ok' : 'bad'}`;
      status.textContent = String(record.status || '-');

      const urlCell = document.createElement('span');
      urlCell.className = 'url-cell';

      const url = document.createElement('span');
      url.className = 'url';
      url.textContent = getDisplayUrl(record.url);
      urlCell.appendChild(url);

      if (isBusinessFailure) {
        const badge = document.createElement('span');
        badge.className = 'business-fail-badge';
        badge.textContent = '业务失败';
        badge.title = record.businessReason || '业务返回失败';
        urlCell.appendChild(badge);
      }

      const rowActions = document.createElement('span');
      rowActions.className = 'row-copy-actions';
      rowActions.append(
        createRowCopyButton('path', '复制路径', () => copyText(getSimplePath(record.url, false))),
        createRowCopyButton('query', '复制路径+参数', () => copyText(formatPathWithParams(record))),
        createRowCopyButton('simple', '复制精简请求', () => copyText(formatRecordSimple(record))),
      );

      row.append(method, status, urlCell, rowActions);
      row.addEventListener('click', () => {
        // 鼠标拖拽框选列表文字时，不要因为 click 重新渲染而破坏选区。
        if (hasTextSelection()) return;
        selectRecord(record.id);
      });
      el.requestList.appendChild(row);
    }
  }

  renderDetail();
}

function selectRecord(id) {
  state.selectedId = id;
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
  const records = visibleRecordsInDisplayOrder();
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
    expandLabel.textContent = '展开';
    expandBtn.append(expandIcon, expandLabel);

    // 按钮和双击共用状态更新，确保图标、文案与文本展示始终一致。
    const setExpanded = expanded => {
      longValueEl.classList.toggle('expanded', expanded);
      longValueEl.parentElement?.classList.toggle('long-value-expanded', expanded);
      expandIcon.querySelector('path').setAttribute('d', expanded ? 'M7 15l5-5 5 5' : 'M7 9l5 5 5-5');
      expandLabel.textContent = expanded ? '收起' : '展开';
      expandBtn.title = expanded ? '收起完整字段值' : '展开完整字段值';
      expandBtn.setAttribute('aria-label', `${expanded ? '收起' : '展开'}字段 ${String(key)} 的完整值`);
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
  copyLabel.textContent = '复制';
  copyValueBtn.append(copyIcon, copyLabel);
  copyValueBtn.title = '复制完整字段值';
  copyValueBtn.setAttribute('aria-label', `复制字段 ${String(key)} 的值`);

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
  valueEl.className = `json-value ${valueClass(value)}`.trim();
  valueEl.textContent = rawValueText;

  if (typeof value === 'string' && rawValueText.length > 80) {
    line.classList.add('json-long-line');
    valueEl.classList.add('json-long-value');
    valueEl.title = `${rawValueText}\n\n双击展开 / 收起`;
    valueEl.setAttribute('aria-label', '长文本，双击展开或收起');
  }

  line.appendChild(valueEl);

  const actions = createFieldActions(key, value, valueEl.classList.contains('json-long-value') ? valueEl : null);
  if (actions) line.appendChild(actions);

  parent.appendChild(line);
}

function buildJsonNode(value, key = null, depth = 0, query = '') {
  const wrapper = document.createElement('div');
  wrapper.className = depth === 0 ? 'json-node json-root' : 'json-node';

  if (value === null || typeof value !== 'object') {
    appendPrimitive(wrapper, value, key, query);
    return wrapper;
  }

  const isArray = Array.isArray(value);
  const allEntries = sortedEntries(value);
  const keyMatched = key !== null && textMatches(key, query);
  const entries = query && !keyMatched
    ? allEntries.filter(([childKey, childValue]) => nodeMatches(childValue, childKey, query))
    : allEntries;

  const details = document.createElement('details');
  details.className = 'json-details';
  details.open = query ? true : depth < 4;

  const summary = document.createElement('summary');
  summary.className = 'json-summary';
  if (keyMatched) summary.classList.add('json-match');

  if (key !== null) {
    const keyEl = document.createElement('span');
    keyEl.className = 'json-key';
    keyEl.textContent = `${String(key)}: `;
    summary.appendChild(keyEl);
  }

  const bracket = document.createElement('span');
  bracket.className = 'json-bracket';
  bracket.textContent = isArray ? '[' : '{';
  summary.appendChild(bracket);

  const type = document.createElement('span');
  type.className = 'json-type';
  type.textContent = allEntries.length
    ? ` ${isArray ? `Array(${allEntries.length})` : `{${allEntries.length}}`}`
    : ` ${isArray ? '[]' : '{}'}`;
  summary.appendChild(type);

  const actions = createFieldActions(key, value);
  if (actions) summary.appendChild(actions);

  details.appendChild(summary);

  if (allEntries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'json-node json-empty';
    empty.textContent = isArray ? '[]' : '{}';
    details.appendChild(empty);
  } else {
    for (const [childKey, childValue] of entries) {
      details.appendChild(buildJsonNode(childValue, childKey, depth + 1, query));
    }
  }

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

function renderPreview(record) {
  el.previewContent.innerHTML = '';
  const raw = record.responseBody || '';
  const pretty = tryPretty(raw, record.mimeType);
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const query = el.previewSearchInput.value.trim().toLowerCase();

  if (!trimmed || raw.startsWith('[正在读取') || raw.startsWith('[无可读取') || raw.startsWith('[当前请求')) {
    const placeholder = document.createElement('div');
    placeholder.className = 'preview-placeholder';
    placeholder.textContent = raw || '(无返回内容)';
    el.previewContent.appendChild(placeholder);
    return;
  }

  if (record.mimeType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const data = JSON.parse(trimmed);
      if (query && !nodeMatches(data, null, query)) {
        const placeholder = document.createElement('div');
        placeholder.className = 'preview-placeholder';
        placeholder.textContent = '没有匹配的响应字段或值';
        el.previewContent.appendChild(placeholder);
        return;
      }
      el.previewContent.appendChild(buildJsonNode(data, null, 0, query));
      return;
    } catch {}
  }

  const rawText = pretty || '(无返回内容)';
  if (query && !rawText.toLowerCase().includes(query)) {
    const placeholder = document.createElement('div');
    placeholder.className = 'preview-placeholder';
    placeholder.textContent = '没有匹配的响应内容';
    el.previewContent.appendChild(placeholder);
    return;
  }

  const pre = document.createElement('pre');
  pre.className = 'preview-raw';
  appendHighlightedRaw(pre, rawText, query);
  el.previewContent.appendChild(pre);
}

function renderDetail() {
  const record = getSelectedRecord();
  el.copyFullBtn.disabled = !record;
  el.copySimpleBtn.disabled = !record;
  el.copyPathBtn.disabled = !record;
  el.copyPathQueryBtn.disabled = !record;
  el.copyTokenBtn.disabled = !record || !getTokenFromRecord(record);
  if (!record) return;

  const businessMeta = record.businessState === 'failure'
    ? ` · 业务失败${record.businessReason ? ` (${record.businessReason})` : ''}`
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

  el.copyStatus.textContent = '已复制';
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
el.previewSearchInput.addEventListener('input', renderDetail);
// 切换排序后立即刷新当前响应，沿用已有搜索条件。
el.previewSortBtn.addEventListener('click', () => {
  // 字母模式高亮显示 A–Z 图标，原始模式显示带序号的列表图标。
  const alphabetical = state.previewSortOrder !== 'alphabetical';
  state.previewSortOrder = alphabetical ? 'alphabetical' : 'original';
  el.previewSortBtn.setAttribute('aria-pressed', String(alphabetical));
  el.previewSortBtn.setAttribute('aria-label', alphabetical ? '按字母排序' : '按原始 JSON 排序');
  el.previewSortBtn.querySelector('.sort-label').textContent = alphabetical ? 'A–Z' : '原序';
  el.previewSortBtn.title = alphabetical
    ? '当前：按字母排序；点击切换为原始 JSON 顺序'
    : '当前：原始 JSON 顺序；点击切换为按字母排序';
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
el.paramFilterBtn.setAttribute('aria-expanded', 'false');

el.paramFilterBtn.addEventListener('click', () => {
  const willShow = el.paramFilterPanel.hidden;
  el.paramFilterPanel.hidden = !willShow;
  el.paramFilterBtn.setAttribute('aria-expanded', String(willShow));
  if (willShow) {
    el.ignoredParamsInput.value = state.ignoredQueryParams.join(',');
    el.ignoredPathsInput.value = state.ignoredUrlPaths.join(',');
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

el.resetIgnoredParamsBtn.addEventListener('click', () => {
  state.ignoredQueryParams = [...DEFAULT_IGNORED_QUERY_PARAMS];
  state.ignoredUrlPaths = [...DEFAULT_IGNORED_URL_PATHS];
  localStorage.setItem(IGNORED_PARAMS_STORAGE_KEY, JSON.stringify(state.ignoredQueryParams));
  localStorage.setItem(IGNORED_PATHS_STORAGE_KEY, JSON.stringify(state.ignoredUrlPaths));
  el.ignoredParamsInput.value = state.ignoredQueryParams.join(',');
  el.ignoredPathsInput.value = state.ignoredUrlPaths.join(',');

  const selected = getSelectedRecord();
  if (selected && isIgnoredRequestUrl(selected.url)) {
    state.selectedId = null;
    el.detailMeta.textContent = '请选择一个请求';
    el.detailMeta.classList.remove('business-failed-meta');
    el.previewContent.innerHTML = '<div class="preview-placeholder">当前请求已被排除。</div>';
  }
  render();
});

el.clearBtn.addEventListener('click', () => {
  state.records = [];
  state.selectedId = null;
  el.detailMeta.textContent = '请选择一个请求';
  el.detailMeta.classList.remove('business-failed-meta');
  el.previewSearchInput.value = '';
  el.previewContent.innerHTML = '<div class="preview-placeholder">已清空。重新触发接口后会继续记录。</div>';
  el.copyTokenBtn.disabled = true;
  render();
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
  return window.matchMedia(`(max-width: ${STACK_BREAKPOINT}px)`).matches;
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

// 普通网页预览使用本地样例走同一套渲染流程，不发送任何模拟网络请求。
function loadPreviewRequests() {
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
      path: '/api/projects/list?page=1&pageSize=20&keyword=demo&_t=1789180200000', method: 'GET', status: 200, time: 168,
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
        postData: sample.requestBody ? { mimeType: 'application/json', text: JSON.stringify(sample.requestBody) } : null,
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
  // 默认选中包含嵌套对象和数组的列表响应，打开预览即可查看 JSON。
  selectRecord(state.records[state.records.length - 1].id);
}

if (globalThis.chrome?.devtools?.network) {
  // 扩展环境先读取已有请求，再监听后续请求，不加载样例。
  chrome.devtools.network.getHAR(log => {
    for (const entry of log.entries || []) addRequest(entry);
  });
  chrome.devtools.network.onRequestFinished.addListener(addRequest);
} else if (location.protocol === 'http:' || location.protocol === 'https:' || location.protocol === 'file:') {
  // 明确标记网页预览，避免把样例误认为实际抓取的接口。
  const previewBadge = document.createElement('span');
  previewBadge.className = 'count-badge';
  previewBadge.textContent = '模拟数据';
  document.querySelector('.panel-title').appendChild(previewBadge);
  loadPreviewRequests();
}

render();
