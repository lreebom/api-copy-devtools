// HAR 请求数据解析与复制格式，不读取 DOM 或页面筛选状态。
globalThis.ApiCopyRequestData = (() => {
  const { parseJsonValue, parseJsonText } = ApiCopyJson;

  function normalizeResourceType(request) {
    return String(request?._resourceType || request?.request?._resourceType || '').toLowerCase();
  }

  function isApiRequest(record) {
    return record.resourceType === 'xhr' || record.resourceType === 'fetch';
  }

  function isFileDownload(request) {
    const headers = request.response?.headers || [];
    const disposition = headers.find(item => item.name?.toLowerCase() === 'content-disposition')?.value || '';
    if (/\battachment\b|\bfilename\*?\s*=/i.test(disposition)) return true;

    const contentType = headers.find(item => item.name?.toLowerCase() === 'content-type')?.value
      || request.response?.content?.mimeType
      || '';
    const mimeType = contentType.split(';', 1)[0].trim().toLowerCase();
    return mimeType.startsWith('image/')
      || mimeType.startsWith('audio/')
      || mimeType.startsWith('video/')
      || mimeType.startsWith('font/')
      || mimeType.startsWith('application/vnd.openxmlformats-officedocument.')
      || mimeType.startsWith('application/vnd.oasis.opendocument.')
      || mimeType.startsWith('application/vnd.ms-excel')
      || mimeType.startsWith('application/vnd.ms-powerpoint')
      || ['application/octet-stream', 'application/pdf', 'application/zip', 'application/x-zip-compressed',
        'application/gzip', 'application/x-tar', 'application/msword', 'application/x-download',
        'application/force-download', 'text/csv', 'text/tab-separated-values'].includes(mimeType);
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
    if (typeof text !== 'string') return LosslessJSON.stringify(text, null, 2);

    const trimmed = text.trim();
    if (!trimmed) return '';

    if (mimeType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return LosslessJSON.stringify(parseJsonValue(trimmed), null, 2); } catch {}
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
      // 字段列表保留同名参数、原始顺序和文件元数据，避免转为对象后相互覆盖。
      return LosslessJSON.stringify(postData.params, null, 2);
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

  function getFormDataItems(record) {
    const postData = record?.postData;
    if (!postData || !isFormDataMimeType(postData.mimeType || '')) return null;

    if (Array.isArray(postData.params) && postData.params.length) {
      if (postData.text && postData.mimeType.toLowerCase().includes('application/x-www-form-urlencoded')) {
        return parseUrlEncodedFormData(postData.text);
      }
      // HAR 字段可能已经解码；加号在这里是实际内容，不能再按表单空格转换。
      return postData.params.map(param => createFormDataItem({
        ...param, name: decodeUrlComponent(param.name), value: decodeUrlComponent(param.value),
      }));
    }

    const text = postData.text || '';
    if (!text) return [];
    if (postData.mimeType.toLowerCase().includes('application/x-www-form-urlencoded')) {
      return parseUrlEncodedFormData(text);
    }
    return parseMultipartFormData(text, postData.mimeType);
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
    const multipart = postData?.mimeType?.toLowerCase().includes('multipart/form-data');
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
        if (multipart) continue;
      }
      options.push('--header ' + quoteShell(name + ': ' + (header.value ?? '')));
    }
    if (postData?.mimeType && !hasContentType && !multipart) {
      options.push('--header ' + quoteShell('Content-Type: ' + postData.mimeType));
    }

    let hasFiles = false;
    if (multipart) {
      // 文本字段用 --form-string，避免以 @ 或 < 开头的实际内容被当作文件读取。
      const items = getFormDataItems(record) || [];
      for (const item of items) {
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

  return { normalizeResourceType, isApiRequest, isFileDownload, headersToObject, tryPretty, getResponseJson, getRequestBody, isFormDataMimeType, createFormDataItem, formatFileSize, parseUrlEncodedFormData, parseMultipartFormData, getFormDataItems, getRequestBodyValue, decodeUrlComponent, decodeUrlPath, formatReadableSearch, getTokenFromRecord, formatCurl };
})();
