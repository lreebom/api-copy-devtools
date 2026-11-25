// 快捷筛选只管理列表条件；正文、采集记录和复制使用的数据不受筛选影响。
globalThis.ApiCopyRequestFilters = (() => {
  const STORAGE_KEY = 'apiCopySlowRequestMs';

  function isHttpFailure(record) {
    return record.responseState !== 'pending' && (record.status === 0 || record.status >= 400);
  }

  function matches(record, filters) {
    const method = String(record.method).toUpperCase();
    if (filters.method === 'other' ? ['GET', 'POST'].includes(method)
      : filters.method !== 'all' && filters.method !== method) return false;
    // 两类失败同时开启时取并集；慢请求、重复请求与方法条件再取交集。
    if ((filters.httpFailure || filters.businessFailure)
      && !((filters.httpFailure && isHttpFailure(record))
        || (filters.businessFailure && record.businessState === 'failure'))) return false;
    if (filters.duplicate && !(record.duplicateTotal > 1)) return false;
    return !filters.slow || (Number.isFinite(record.time) && record.time >= filters.slowMs);
  }

  function create({ onChange, duplicateEnabled = true }) {
    let slowMs = Number(localStorage.getItem(STORAGE_KEY));
    if (!Number.isFinite(slowMs) || slowMs < 1) slowMs = 1000;
    let isDuplicateEnabled = Boolean(duplicateEnabled);
    const filters = { method: 'all', httpFailure: false, businessFailure: false, slow: false, duplicate: false, slowMs };
    const root = document.querySelector('#requestQuickFilters');
    const buttons = [...root.querySelectorAll('[data-method], [data-filter]')];
    const duplicateButton = root.querySelector('[data-filter="duplicate"]');
    const threshold = root.querySelector('input');
    const reset = root.querySelector('[data-filter-reset]');

    function render() {
      if (!isDuplicateEnabled) filters.duplicate = false;
      if (duplicateButton) duplicateButton.disabled = !isDuplicateEnabled;
      for (const button of buttons) {
        const active = button.dataset.method
          ? filters.method === button.dataset.method : filters[button.dataset.filter];
        button.setAttribute('aria-pressed', String(active));
      }
      threshold.value = String(filters.slowMs);
      root.querySelector('.slow-threshold').hidden = !filters.slow;
      reset.hidden = filters.method === 'all' && !filters.httpFailure && !filters.businessFailure && !filters.slow && !filters.duplicate;
    }

    function setDuplicateEnabled(enabled) {
      isDuplicateEnabled = Boolean(enabled);
      if (!isDuplicateEnabled) filters.duplicate = false;
      render();
    }

    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.method) filters.method = button.dataset.method;
      else if (button.dataset.filter) filters[button.dataset.filter] = !filters[button.dataset.filter];
      else if (button.hasAttribute('data-filter-reset')) {
        Object.assign(filters, { method: 'all', httpFailure: false, businessFailure: false, slow: false, duplicate: false });
      } else return;
      render();
      onChange();
    });
    threshold.addEventListener('input', () => {
      const value = Number(threshold.value);
      if (!Number.isFinite(value) || value < 1) return;
      filters.slowMs = Math.round(value);
      onChange();
    });
    threshold.addEventListener('change', () => {
      threshold.value = String(filters.slowMs);
      try { localStorage.setItem(STORAGE_KEY, String(filters.slowMs)); } catch {}
    });
    render();
    return { matches: record => matches(record, filters), setDuplicateEnabled };
  }

  return { create, matches, isHttpFailure };
})();
