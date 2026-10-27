// 响应和请求 Body 共用的 JSON 树：折叠摘要、范围分组与搜索索引都在这里维护。
globalThis.ApiCopyJsonTree = {
  create({ t, copyText, createSvgIcon, getSortOrder }) {
    const { isJsonContainer, valueClass, primitiveText, formatJsonPrimitive, textMatches, copyableJsonValue } = ApiCopyJson;
    // 分组只影响展示，逻辑字段路径始终指向原始 JSON。
    const MAX_VISIBLE_ARRAY_ITEMS = 100;
    const ARRAY_GROUP_SIZE = 100;
    const keyCollator = new Intl.Collator('en', {
      numeric: true,
      sensitivity: 'base',
    });

    // 对象支持展示排序，数组永远保留原始顺序。
    function sortedEntries(value) {
      const entries = Object.entries(value);
      if (Array.isArray(value) || getSortOrder() === 'original') return entries;
      return entries.sort(([a], [b]) => keyCollator.compare(a, b));
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
      copyValueBtn.append(copyIcon);
      copyValueBtn.title = t('copyFullFieldValue');
      copyValueBtn.setAttribute('aria-label', t('copyFieldValue', String(key)));

      copyValueBtn.addEventListener('pointerdown', stopToggle);
      copyValueBtn.addEventListener('click', event => {
        stopToggle(event);
        copyText(copyableJsonValue(value), copyValueBtn);
      });

      actions.append(copyValueBtn);
      return actions;
    }

    function appendPrimitive(parent, value, key = null, query = '', path = '') {
      const line = document.createElement('div');
      line.className = 'json-line';
      line.dataset.matchPath = path;
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
      if (value === null || isJsonContainer(value)) return false;
      return typeof value !== 'string' || value.trim() !== '';
    }

    function appendJsonSummaryPreview(parent, value) {
      if (Array.isArray(value) || !isJsonContainer(value)) return;

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
        if (isJsonContainer(childValue)) {
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
          const arrayPath = path.slice(0, path.lastIndexOf('/'));
          const childPath = `${arrayPath}/${escapeJsonPathSegment(childKey)}`;
          details.appendChild(buildJsonNode(childValue, childKey, depth + 1, query, openStates, childPath));
        }
      };

      details.addEventListener('toggle', () => {
        if (details.open) populate();
      });
      details.addEventListener('json-reveal', populate);
      if (details.open) populate();

      wrapper.appendChild(details);
      return wrapper;
    }

    function buildJsonNode(value, key = null, depth = 0, query = '', openStates = null, path = '') {
      const wrapper = document.createElement('div');
      wrapper.className = depth === 0 ? 'json-node json-root' : 'json-node';

      if (!isJsonContainer(value)) {
        appendPrimitive(wrapper, value, key, query, path);
        return wrapper;
      }

      const isArray = Array.isArray(value);
      const allEntries = sortedEntries(value);
      const keyMatched = key !== null && textMatches(key, query);

      const details = document.createElement('details');
      details.className = 'json-details';
      details.dataset.jsonPath = path;
      // 节点沿用阅读状态；搜索定位时仅补开当前命中的祖先路径。
      details.open = openStates?.get(path) ?? getDefaultNodeOpen(value, key, depth);

      const summary = document.createElement('summary');
      summary.className = 'json-summary';
      if (keyMatched) summary.classList.add('json-match');
      summary.dataset.matchPath = path;

      // 字段、摘要和操作共用一行；无摘要时按钮跟随字段，有摘要时贴近可见末尾。
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
      if (actions) summaryContent.appendChild(actions);
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
        if (isArray && allEntries.length > MAX_VISIBLE_ARRAY_ITEMS) {
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
      details.addEventListener('json-reveal', populate);
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

    // 命中索引与 DOM 独立，搜索只遍历一次原始数据。
    function collectJsonSearchMatches(data, query) {
      const matches = [];
      const visit = (value, key, path, parents) => {
        const container = isJsonContainer(value);
        if ((key !== null && textMatches(key, query)) || (!container && textMatches(primitiveText(value), query))) {
          matches.push({ path, parents });
        }
        if (!container) return;
        const entries = sortedEntries(value);
        for (const [childKey, childValue] of entries) {
          const childPath = `${path}/${escapeJsonPathSegment(childKey)}`;
          const childParents = [...parents, path];
          if (Array.isArray(value) && entries.length > MAX_VISIBLE_ARRAY_ITEMS) {
            const start = Math.floor(Number(childKey) / ARRAY_GROUP_SIZE) * ARRAY_GROUP_SIZE;
            childParents.push(`${path}/@${start}-${Math.min(start + ARRAY_GROUP_SIZE - 1, entries.length - 1)}`);
          }
          visit(childValue, childKey, childPath, childParents);
        }
      };
      visit(data, null, '', []);
      return matches;
    }

    return { buildJsonNode, appendHighlightedRaw, collectJsonSearchMatches };
  },
};
