// 无损 JSON 与类型格式化：响应、Body、树节点及复制共用同一套数字语义。
globalThis.ApiCopyJson = (() => {
  function isJsonText(text) {
    const trimmed = String(text || '').trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  }

  // 数字保留字面量，重复对象键沿用原生最后值语义。
  function parseJsonValue(text) {
    return LosslessJSON.parse(text, null, { onDuplicateKey: ({ newValue }) => newValue });
  }

  function parseJsonText(text) {
    try { return parseJsonValue(text); } catch { return undefined; }
  }

  function isJsonContainer(value) {
    return value !== null && typeof value === 'object' && !LosslessJSON.isLosslessNumber(value);
  }

  function valueClass(value) {
    if (value === null) return 'json-null';
    if (typeof value === 'string') return 'json-string';
    if (typeof value === 'number' || LosslessJSON.isLosslessNumber(value)) return 'json-number';
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

  function copyableJsonValue(value) {
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    if (isJsonContainer(value)) {
      try { return LosslessJSON.stringify(value, null, 2); } catch { return String(value); }
    }
    return String(value);
  }

  return { isJsonText, parseJsonValue, parseJsonText, isJsonContainer, valueClass, primitiveText, formatJsonPrimitive, textMatches, copyableJsonValue };
})();
