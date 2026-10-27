// 中英文文案及普通网页预览回退，统一供所有功能模块使用。
globalThis.ApiCopyI18n = (() => {
  // WebStorm 普通网页预览无法调用 chrome.i18n，动态文案使用中文作为本地回退。
  const I18N_FALLBACKS = {
    globalSettings: "全局设置",
    closeSettings: "关闭设置",
    settingsCategories: "设置分类",
    displaySettings: "显示",
    filterSettingsTab: "过滤",
    settingsImmediateHint: "显示与过滤设置即时生效；业务规则保存后生效。",
    copyFailed: "复制失败，请重试。",
    copyCurl: "复制 cURL",
    copyCurlTitle: "复制原始请求为 cURL（POSIX Shell），保留完整 URL、请求头与 Body",
    quickFilters: "请求快捷筛选",
    requestMethodFilter: "请求方法",
    requestOldestFirst: "较早请求在前",
    requestNewestFirst: "最新请求在前",
    requestOldestFirstTitle: "当前：较早请求在前；点击切换为最新请求在前",
    requestNewestFirstTitle: "当前：最新请求在前；点击切换为较早请求在前",
    requestResultFilter: "请求结果",
    allMethods: "全部",
    otherMethods: "其他",
    httpFailureFilter: "HTTP失败",
    httpFailureFilterTitle: "只看 HTTP 失败（状态码 0 或 ≥400）；与业务失败同时开启时显示任一失败",
    businessFailureFilter: "业务失败",
    businessFailureFilterTitle: "只看不符合业务成功规则的请求；与 HTTP 失败同时开启时显示任一失败",
    slowRequests: "慢请求",
    slowThreshold: "耗时 ≥",
    slowThresholdLabel: "慢请求阈值（毫秒）",
    resetQuickFilters: "重置筛选",
    filteredRequestCount: "$1 / $2 条",
    businessRules: "业务成功规则",
    businessRuleEnabled: "识别业务失败",
    businessPresets: "常用预设",
    businessPresetsLabel: "常用业务规则预设",
    businessPresetsHelp: "选择预设填入常用字段和成功值，可继续编辑，保存后生效。",
    businessPresetSaveHint: "已填入预设，可继续编辑，保存后生效。",
    businessFlagPath: "成功标识字段",
    businessFlagValue: "标识成功值",
    businessCodePath: "状态码字段",
    businessSuccessCodes: "成功状态码",
    businessRulesHelp: "字段支持点号路径；留空可忽略该类检查。成功状态码用逗号分隔。保存后对当前及后续请求生效，HTTP 状态独立判断。",
    saveBusinessRules: "保存规则",
    resetBusinessRules: "恢复默认规则",
    businessRuleSaveHint: "已恢复默认内容，保存后生效。",
    businessRuleSaved: "规则已保存，并已更新当前记录。",
    businessRuleInvalidPath: "字段路径格式有误，请使用 code 或 data.code 这样的点号路径。",
    businessRuleIncomplete: "至少配置一类检查，并填写对应的成功值。",
    businessRuleSaveFailed: "规则未保存，请检查本地存储是否可用。",

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
    copyFileName: '复制文件名',
    jsonPreview: 'JSON 预览',
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
    noRequestParameters: '无请求参数',
    queryParameterCount: 'Query $1 项',
    formDataParameterCount: 'FormData $1 项',
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


  return { t, localizeDocument };
})();
