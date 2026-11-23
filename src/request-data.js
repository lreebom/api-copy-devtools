// HAR 请求数据解析与复制格式，不读取 DOM 或页面筛选状态。
globalThis.ApiCopyRequestData = (() => {
  const { parseJsonValue, parseJsonText } = ApiCopyJson;

  function normalizeResourceType(request) {
    return String(request?._resourceType || request?.request?._resourceType || '').toLowerCase();
  }

  // 与 Chromium Network 的 Fetch/XHR 分类一致，使用 HAR 中的资源类型。
  function isFetchXhrType(resourceType) {
    return ['xhr', 'fetch', 'eventsource'].includes(resourceType);
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

  // 仅根据响应类型或首字符判断是否值得尝试按 JSON 解析，避免纯文本和大文件无谓进入解析器。
  function looksLikeJson(text, mimeType = '') {
    if (typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    return String(mimeType || '').toLowerCase().includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[');
  }

  // 区分常见二进制媒体/下载类型，避免把图片、PDF、压缩包等字节流硬解成 UTF-8 乱码。
  function isBinaryMimeType(mimeType = '') {
    const type = String(mimeType || '').split(';', 1)[0].trim().toLowerCase();
    if (!type) return false;
    if (type.startsWith('text/') || type.includes('json') || type.includes('xml')
      || type.includes('javascript') || type.includes('ecmascript')
      || type === 'application/x-www-form-urlencoded' || type === 'application/graphql') {
      return false;
    }
    return type.startsWith('image/') || type.startsWith('audio/') || type.startsWith('video/')
      || type.startsWith('font/') || type.startsWith('application/vnd.')
      || type === 'application/octet-stream' || type === 'application/pdf'
      || type === 'application/zip' || type === 'application/gzip' || type === 'application/x-gzip'
      || type === 'application/x-tar' || type === 'application/x-7z-compressed'
      || type === 'application/x-rar-compressed' || type === 'application/wasm'
      || type === 'application/msword' || type === 'application/protobuf'
      || type === 'application/x-protobuf' || type === 'application/grpc';
  }

  // 按 UTF-8 计算字符串真实字节数，与 Base64 字节口径一致且不分配整段拷贝缓冲。
  function utf8ByteLength(text) {
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 0x80) {
        bytes += 1;
      } else if (code < 0x800) {
        bytes += 2;
      } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
        const next = text.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          bytes += 4;
          i++;
        } else {
          bytes += 3;
        }
      } else {
        bytes += 3;
      }
    }
    return bytes;
  }

  // 解码响应正文并明确区分空正文、可读文本、二进制与解码失败，不再把提示文案混入正文。
  function decodeResponseContent(content, encoding = '', mimeType = '') {
    if (content == null || content === '') {
      return { state: 'empty', text: '', byteLength: 0 };
    }

    if (encoding !== 'base64') {
      const text = String(content);
      const byteLength = utf8ByteLength(text);
      if (isBinaryMimeType(mimeType) || text.includes('\0')) {
        return { state: 'binary', text: '', byteLength };
      }
      return { state: 'ready', text, byteLength };
    }

    let binary;
    try {
      binary = atob(content);
    } catch {
      return { state: 'decode_error', text: '', byteLength: 0 };
    }

    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    if (isBinaryMimeType(mimeType)) {
      return { state: 'binary', text: '', byteLength: bytes.byteLength };
    }

    // 未声明二进制类型时做严格 UTF-8 校验，发现非法字节或 NUL 字符则按二进制处理。
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.includes('\0')) return { state: 'binary', text: '', byteLength: bytes.byteLength };
      return { state: 'ready', text, byteLength: bytes.byteLength };
    } catch {
      return { state: 'binary', text: '', byteLength: bytes.byteLength };
    }
  }

  // 复制响应时复用采集阶段解析的无损 JSON。
  function tryPretty(text, mimeType = '', parsedJson = undefined) {
    if (text == null || text === '') return '';
    if (typeof text !== 'string') return LosslessJSON.stringify(text, null, 2);

    const trimmed = text.trim();
    if (!trimmed) return '';

    if (looksLikeJson(trimmed, mimeType)) {
      try {
        const value = parsedJson === undefined ? parseJsonValue(trimmed) : parsedJson;
        return LosslessJSON.stringify(value, null, 2);
      } catch {}
    }
    return text;
  }

  function getResponseJson(record, text) {
    if (record.responseJsonParsed) return record.parsedResponseJson;

    record.responseJsonParsed = true;
    record.parsedResponseJson = parseJsonText(text);
    return record.parsedResponseJson;
  }

  // 将表单项格式化为与面板展示一致的键值行，文件项附带类型与大小信息。
  function formatFormDataItems(items = []) {
    return items.map(item => {
      const valueText = item.isFile
        ? [item.fileName, item.contentType, formatFileSize(item.fileSize)].filter(Boolean).join(' · ')
        : String(item.value ?? '');
      return `${item.name}: ${valueText}`;
    }).join('\n');
  }

  function getRequestBody(record) {
    const postData = record?.postData;
    if (!postData) return '';

    const formItems = getFormDataItems(record);
    if (formItems !== null) return formatFormDataItems(formItems);

    if (postData.text) return tryPretty(postData.text, postData.mimeType || '');

    if (Array.isArray(postData.params)) {
      // 字段列表保留同名参数、原始顺序和文件元数据，避免转为对象后相互覆盖。
      return formatFormDataItems(postData.params.map(createFormDataItem));
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

  // 只识别完整的 multipart 分隔行，解析不完整时返回 null 以保留原始正文。
  function parseMultipartFormData(text, mimeType) {
    const boundaryMatch = /(?:^|;)\s*boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(mimeType);
    const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
    if (!boundary) return null;

    const escapedBoundary = boundary.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
    const delimiter = new RegExp(`(?:^|\\r?\\n)--${escapedBoundary}(--)?[ \\t]*(?=\\r?\\n|$)`, 'g');
    const delimiters = [...text.matchAll(delimiter)];
    const fields = [];
    for (let index = 0; index < delimiters.length; index++) {
      const current = delimiters[index];
      if (current[1]) return fields;

      const next = delimiters[index + 1];
      if (!next) return null;

      const part = text.slice(current.index + current[0].length, next.index).replace(/^\r?\n/, '');
      const separator = /\r?\n\r?\n/.exec(part);
      if (!separator) return null;

      const headers = part.slice(0, separator.index);
      const content = part.slice(separator.index + separator[0].length);
      const disposition = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(headers)?.[1] || '';
      const name = /(?:^|;)\s*name="([^"]*)"/i.exec(disposition);
      if (!name) return null;
      const fileName = /(?:^|;)\s*filename="([^"]*)"/i.exec(disposition)?.[1] || '';
      const contentType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || '';
      fields.push(createFormDataItem({ name: name[1], value: fileName ? '' : content, fileName, contentType }));
    }
    return null;
  }

  function getFormDataItems(record) {
    const postData = record?.postData;
    if (!postData) return null;
    const mimeType = postData.mimeType || '';
    const hasParamsOnly = !mimeType && !postData.text && Array.isArray(postData.params);
    if (!isFormDataMimeType(mimeType) && !hasParamsOnly) return null;

    // 仅对 URL 编码的原始正文解码。HAR params 已按字段拆分，保留字面百分号和加号。
    if (postData.text && mimeType.toLowerCase().includes('application/x-www-form-urlencoded')) {
      return parseUrlEncodedFormData(postData.text);
    }
    if (Array.isArray(postData.params) && postData.params.length) {
      return postData.params.map(createFormDataItem);
    }
    return postData.text ? parseMultipartFormData(postData.text, mimeType) : [];
  }

  function getRequestBodyValue(record) {
    const postData = record?.postData;
    if (!postData) return null;

    if (postData.text) {
      const text = postData.text.trim();
      if (!text) return null;
      if (!Object.hasOwn(record, 'parsedRequestBody')) {
        try { record.parsedRequestBody = parseJsonValue(text); } catch { record.parsedRequestBody = postData.text; }
      }
      return record.parsedRequestBody;
    }

    if (Array.isArray(postData.params) && postData.params.length) {
      return postData.params.map(param => ({ ...param, value: param.value ?? '' }));
    }
    return null;
  }

  function decodeUrlComponent(value) {
    const text = String(value ?? '');
    try {
      // Network 元数据中的 Query 值可能仍是百分号编码；只解码一次，坏编码则保留原文。
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  }

  function decodeUrlPath(pathname) {
    try { return decodeURI(pathname); } catch { return pathname; }
  }

  function formatReadableSearch(search) {
    if (!search) return '';
    const params = new URLSearchParams(search);
    const readable = [...params].map(([name, value]) => `${name}=${value}`).join('&');
    return readable ? `?${readable}` : '';
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

  // cURL 面向 POSIX Shell：每个参数独立引用，单引号、换行和命令替换均保留为数据。
  function quoteShell(value) {
    return "'" + String(value).replaceAll("'", "'\"'\"'") + "'";
  }

  function formatCurl(record) {
    if (!record) return '';
    const method = String(record.method || 'GET').toUpperCase();
    const postData = record.postData;
    const multipartItems = postData?.mimeType?.toLowerCase().includes('multipart/form-data')
      ? getFormDataItems(record)
      : null;
    // 仅在取得实际字段后重建 multipart，否则保留原始 Content-Type 和正文。
    const rebuildMultipart = Boolean(multipartItems?.length);
    const options = ['curl --globoff', method === 'HEAD' ? '--head' : '--request ' + quoteShell(method),
      '--url ' + quoteShell(record.url)];
    // 传输长度、连接信息和 HTTP/2 伪头由 cURL 生成，避免与重新编码后的正文冲突。
    const excludedHeaders = new Set(['host', 'content-length', 'connection', 'proxy-connection', 'transfer-encoding', 'accept-encoding']);
    let hasContentType = false;
    for (const header of record.requestHeaders || []) {
      const name = String(header.name || '');
      const lower = name.toLowerCase();
      if (!name || name.startsWith(':') || excludedHeaders.has(lower)) continue;
      if (lower === 'content-type') {
        hasContentType = true;
        if (rebuildMultipart) continue;
      }
      options.push('--header ' + quoteShell(name + ': ' + (header.value ?? '')));
    }
    if (postData?.mimeType && !hasContentType && !rebuildMultipart) {
      options.push('--header ' + quoteShell('Content-Type: ' + postData.mimeType));
    }

    let hasFiles = false;
    if (rebuildMultipart) {
      // 文本字段用 --form-string，避免以 @ 或 < 开头的实际内容被当作文件读取。
      for (const item of multipartItems) {
        if (item.isFile) {
          hasFiles = true;
          const quotedFile = value => '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
          const name = item.fileName.split(/[\\/]/).pop();
          let form = item.name + '=@' + quotedFile('/path/to/' + name) + ';filename=' + quotedFile(item.fileName);
          if (/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(item.contentType)) form += ';type=' + item.contentType;
          options.push('--form ' + quoteShell(form));
        } else {
          options.push('--form-string ' + quoteShell(item.name + '=' + item.value));
        }
      }
    } else if (postData && (typeof postData.text === 'string' || postData.params?.length)) {
      let body = postData.text;
      if (typeof body !== 'string') {
        body = new URLSearchParams((getFormDataItems(record) || postData.params)
          .map(item => [item.name, item.value ?? ''])).toString();
      }
      // 原始正文直接复制，JSON 的数字精度、空白、重复字段及 URL 编码均不被重写。
      options.push('--data-raw ' + quoteShell(body));
    }
    const command = options.join(' \\\n  ');
    return hasFiles ? '# Replace /path/to/ with your local file paths before running.\n' + command : command;
  }

  // 生成请求体指纹用于识别短时间内的重复请求；文件字段只取元数据，超大正文取头尾和长度。
  function getRequestBodyFingerprint(record) {
    if (record && Object.hasOwn(record, 'bodyFingerprint')) return record.bodyFingerprint;
    const postData = record?.postData;
    let fingerprint = '';
    if (postData) {
      const formItems = getFormDataItems(record);
      if (formItems !== null) {
        fingerprint = `form:${formItems.map(item => (
          item.isFile
            ? `${item.name}=[file:${item.fileName}:${item.contentType}:${item.fileSize ?? ''}]`
            : `${item.name}=${item.value}`
        )).join('\0')}`;
      } else if (typeof postData.text === 'string' && postData.text.length) {
        const text = postData.text;
        fingerprint = text.length > 8192
          ? `text:${text.length}:${text.slice(0, 4096)}:${text.slice(-4096)}`
          : `text:${text}`;
      } else if (Array.isArray(postData.params) && postData.params.length) {
        fingerprint = `params:${postData.params.map(item => `${item.name || ''}=${item.value ?? ''}`).join('\0')}`;
      }
    }
    if (record) record.bodyFingerprint = fingerprint;
    return fingerprint;
  }

  function getDuplicateRequestFingerprint(record, filteredUrl = record?.url || '') {
    const method = String(record?.method || 'GET').toUpperCase();
    return `${method}\n${filteredUrl}\n${getRequestBodyFingerprint(record)}`;
  }

  // 按时间顺序将窗口内连续出现的相同请求归为同一重复组，组内全部请求均标记序号与总数，方便对照查看。
  function markDuplicateRequests(records, { enabled = true, windowMs = 1000, getFilteredUrl = url => url } = {}) {
    for (const record of records) {
      record.duplicateOfId = null;
      record.duplicateGroupId = null;
      record.duplicateGapMs = null;
      record.duplicateIndex = 1;
      record.duplicateTotal = 1;
    }
    if (!enabled || !Number.isFinite(windowMs) || windowMs <= 0) return;

    const ordered = [...records].sort((a, b) => {
      const aTime = Date.parse(a.startedDateTime);
      const bTime = Date.parse(b.startedDateTime);
      const aTs = Number.isFinite(aTime) ? aTime : (a.capturedAt ?? 0);
      const bTs = Number.isFinite(bTime) ? bTime : (b.capturedAt ?? 0);
      if (aTs !== bTs) return aTs - bTs;
      return (a.id ?? 0) - (b.id ?? 0);
    });

    let nextGroupId = 1;
    const lastByFingerprint = new Map();
    for (const record of ordered) {
      const parsedTime = Date.parse(record.startedDateTime);
      const timeMs = Number.isFinite(parsedTime) ? parsedTime : (record.capturedAt ?? NaN);
      const fingerprint = getDuplicateRequestFingerprint(record, getFilteredUrl(record.url));
      const previous = lastByFingerprint.get(fingerprint);
      const gapMs = previous && Number.isFinite(timeMs) && Number.isFinite(previous.timeMs)
        ? timeMs - previous.timeMs
        : NaN;

      if (previous && Number.isFinite(gapMs) && gapMs >= 0 && gapMs <= windowMs) {
        if (previous.groupId === null) {
          previous.groupId = nextGroupId++;
          previous.members[0].duplicateGroupId = previous.groupId;
          previous.members[0].duplicateIndex = 1;
        }
        previous.members.push(record);
        record.duplicateOfId = previous.lastId;
        record.duplicateGroupId = previous.groupId;
        record.duplicateGapMs = Math.round(gapMs);
        record.duplicateIndex = previous.members.length;
        const total = previous.members.length;
        for (const member of previous.members) {
          member.duplicateTotal = total;
        }
        previous.lastId = record.id;
        previous.timeMs = timeMs;
      } else {
        lastByFingerprint.set(fingerprint, {
          groupId: null,
          lastId: record.id,
          timeMs,
          members: [record],
        });
      }
    }
  }

  return { normalizeResourceType, isFetchXhrType, headersToObject, looksLikeJson, isBinaryMimeType, decodeResponseContent, tryPretty, getResponseJson, getRequestBody, isFormDataMimeType, createFormDataItem, formatFileSize, parseUrlEncodedFormData, parseMultipartFormData, getFormDataItems, getRequestBodyValue, decodeUrlComponent, decodeUrlPath, formatReadableSearch, getTokenFromRecord, formatCurl, getRequestBodyFingerprint, getDuplicateRequestFingerprint, markDuplicateRequests };
})();
