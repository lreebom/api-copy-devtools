// 业务成功规则：配置验证、持久化与响应判定放在同一处，HTTP 状态独立判断。
globalThis.ApiCopyBusinessRules = (() => {
  const STORAGE_KEY = 'apiCopyBusinessRules';

  function defaults() {
    return { enabled: true, flagPath: 'isSuccess', flagValue: 'true', codePath: 'code', successCodes: ['0', '200'] };
  }

  // 预设只提供明确的成功约定，success 不猜测不同系统的 errorCode 成功值。
  function presets() {
    return [
      { id: 'default', label: 'isSuccess + code', rules: defaults() },
      { id: 'success', label: 'success', rules: { enabled: true, flagPath: 'success', flagValue: 'true', codePath: '', successCodes: [] } },
      { id: 'code', label: 'code', rules: { enabled: true, flagPath: '', flagValue: '', codePath: 'code', successCodes: ['0', '200'] } },
    ];
  }

  function validate(rules) {
    const value = {
      enabled: rules.enabled !== false,
      flagPath: String(rules.flagPath ?? '').trim(),
      flagValue: String(rules.flagValue ?? '').trim(),
      codePath: String(rules.codePath ?? '').trim(),
      successCodes: [...new Set((Array.isArray(rules.successCodes) ? rules.successCodes : String(rules.successCodes || '').split(/[,，]/))
        .map(item => String(item).trim()).filter(Boolean))],
    };
    // 点号路径只读自有字段，支持 data.code 和 items.0.code，不执行表达式。
    const validPath = path => !path || /^[^.[\]\s()]+(?:\.[^.[\]\s()]+)*$/.test(path);
    if (value.enabled && (!validPath(value.flagPath) || !validPath(value.codePath))) return { error: 'businessRuleInvalidPath' };
    if (value.enabled && ((!value.flagPath && !value.codePath)
      || (value.flagPath && !value.flagValue)
      || (value.codePath && !value.successCodes.length))) return { error: 'businessRuleIncomplete' };
    return { value };
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') return validate(saved).value || defaults();
    } catch {}
    return defaults();
  }

  function readPath(data, path) {
    if (!path) return undefined;
    let current = data;
    for (const key of path.split('.')) {
      if (!ApiCopyJson.isJsonContainer(current) || !Object.hasOwn(current, key)) return undefined;
      current = current[key];
    }
    return current;
  }

  function scalarText(value) {
    if (LosslessJSON.isLosslessNumber(value) && LosslessJSON.isSafeNumber(value.value)) return String(Number(value.value));
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string'
      || LosslessJSON.isLosslessNumber(value)) return String(value).trim();
    return '';
  }

  function evaluate(data, rules) {
    if (!rules.enabled || !ApiCopyJson.isJsonContainer(data) || Array.isArray(data)) return { state: 'unknown', reason: '' };
    const checks = [];
    const reasons = [];
    const flag = scalarText(readPath(data, rules.flagPath));
    if (rules.flagPath && flag) {
      const ok = flag.toLowerCase() === rules.flagValue.toLowerCase();
      checks.push(ok);
      if (!ok) reasons.push(`${rules.flagPath}=${flag}`);
    }
    const code = scalarText(readPath(data, rules.codePath));
    if (rules.codePath && code) {
      const ok = rules.successCodes.includes(code);
      checks.push(ok);
      if (!ok) reasons.push(`${rules.codePath}=${code}`);
    }
    // 找不到约定字段时保持未知；任意已配置字段失败则判定为业务失败。
    if (!checks.length) return { state: 'unknown', reason: '' };
    return checks.includes(false)
      ? { state: 'failure', reason: reasons.join(' · ') }
      : { state: 'success', reason: '' };
  }

  function createSettings({ t, onSave }) {
    let rules = load();
    const root = document.querySelector('#businessRuleSettings');
    const enabled = root.querySelector('[name="enabled"]');
    const inputs = Object.fromEntries(['flagPath', 'flagValue', 'codePath', 'successCodes']
      .map(name => [name, root.querySelector(`[name="${name}"]`)]));
    const status = root.querySelector('[role="status"]');
    const saveButton = root.querySelector('[type="submit"]');
    // 选中态从草稿推导，手动改字段后不会保留过期的预设标记。
    const presetOptions = presets();
    const presetButtons = [];

    function validateDraft() {
      return validate({
        enabled: enabled.checked,
        ...Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, input.value])),
      });
    }

    // 编辑时先提示并禁用无效提交；submit 仍复查，防止绕过按钮触发。
    function updateValidation() {
      const { error, value } = validateDraft();
      saveButton.disabled = Boolean(error);
      saveButton.title = error ? t(error) : '';
      status.classList.toggle('settings-error', Boolean(error));
      status.textContent = error ? t(error) : '';
      presetOptions.forEach((preset, index) => {
        const selected = value && ['enabled', 'flagPath', 'flagValue', 'codePath'].every(key => value[key] === preset.rules[key])
          && value.successCodes.length === preset.rules.successCodes.length
          && value.successCodes.every(code => preset.rules.successCodes.includes(code));
        presetButtons[index].setAttribute('aria-pressed', String(Boolean(selected)));
      });
    }

    function renderDraft(value) {
      enabled.checked = value.enabled;
      for (const [name, input] of Object.entries(inputs)) {
        input.value = name === 'successCodes' ? value.successCodes.join(', ') : value[name];
        input.disabled = !enabled.checked;
      }
      updateValidation();
    }

    for (const preset of presetOptions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.rulePreset = preset.id;
      button.textContent = preset.label;
      button.addEventListener('click', () => {
        // 仅填写当前草稿，不写存储，也不重新判定正在查看的响应。
        renderDraft(preset.rules);
        status.textContent = t('businessPresetSaveHint');
      });
      presetButtons.push(button);
      root.querySelector('.business-preset-buttons').appendChild(button);
    }

    enabled.addEventListener('change', () => {
      for (const input of Object.values(inputs)) input.disabled = !enabled.checked;
      updateValidation();
    });
    root.addEventListener('input', updateValidation);
    root.querySelector('[data-rule-action="reset"]').addEventListener('click', () => {
      renderDraft(defaults());
      status.textContent = t('businessRuleSaveHint');
      status.classList.remove('settings-error');
    });
    root.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const result = validateDraft();
      status.classList.toggle('settings-error', Boolean(result.error));
      if (result.error) {
        status.textContent = t(result.error);
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(result.value));
      } catch {
        status.classList.add('settings-error');
        status.textContent = t('businessRuleSaveFailed');
        return;
      }
      rules = result.value;
      renderDraft(rules);
      status.textContent = t('businessRuleSaved');
      onSave(rules);
    });
    renderDraft(rules);
    return { getRules: () => rules };
  }

  return { defaults, presets, validate, load, evaluate, createSettings };
})();
