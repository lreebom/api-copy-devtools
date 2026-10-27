// 面板级交互：设置抽屉和就地反馈独立维护，不读取请求或 JSON 状态。
globalThis.ApiCopyPanelUi = {
  create({ t, createSvgIcon, onSettingsOpen }) {
    const overlay = document.querySelector('#settingsOverlay');
    const drawer = document.querySelector('#paramFilterPanel');
    const settingsButton = document.querySelector('#paramFilterBtn');
    const closeButton = document.querySelector('#settingsCloseBtn');
    const tabs = [...drawer.querySelectorAll('[data-settings-tab]')];
    const panels = [...drawer.querySelectorAll('[data-settings-panel]')];
    const filterReset = drawer.querySelector('#resetIgnoredParamsBtn');
    const status = document.querySelector('#copyStatus');
    // 同一个按钮连续复制时先恢复旧图标，避免把勾选图标误存成原始图标。
    const feedbacks = new WeakMap();
    let statusTimer;

    function selectTab(tab) {
      for (const item of tabs) {
        item.setAttribute('aria-selected', String(item === tab));
        item.tabIndex = item === tab ? 0 : -1;
      }
      for (const panel of panels) panel.hidden = panel.dataset.settingsPanel !== tab.dataset.settingsTab;
      // 业务规则有自己的草稿恢复入口，避免把“恢复筛选默认”误认为恢复业务规则。
      filterReset.hidden = tab.dataset.settingsTab === 'business';
    }

    function setSettings(open) {
      if (open) onSettingsOpen();
      overlay.hidden = !open;
      settingsButton.setAttribute('aria-expanded', String(open));
      if (open) drawer.querySelector('[aria-selected="true"]').focus();
      else settingsButton.focus();
    }

    settingsButton.setAttribute('aria-expanded', 'false');
    settingsButton.setAttribute('aria-haspopup', 'dialog');
    settingsButton.setAttribute('aria-controls', drawer.id);
    settingsButton.addEventListener('click', () => setSettings(overlay.hidden));
    closeButton.addEventListener('click', () => setSettings(false));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) setSettings(false);
    });
    for (const tab of tabs) tab.addEventListener('click', () => selectTab(tab));
    selectTab(tabs[0]);
    // 弹层处理自己的导航键和焦点边界，防止误触请求列表的上下切换快捷键。
    document.addEventListener('keydown', event => {
      if (overlay.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setSettings(false);
        return;
      }
      const tabIndex = tabs.indexOf(document.activeElement);
      if (tabIndex >= 0 && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
          : (tabIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        selectTab(tabs[next]);
        tabs[next].focus();
      }
      if (event.key === 'Tab') {
        const focusable = [...drawer.querySelectorAll('button, input, [tabindex]')]
          .filter(item => !item.disabled && item.tabIndex >= 0 && item.getClientRects().length);
        const target = event.shiftKey && document.activeElement === focusable[0] ? focusable.at(-1)
          : !event.shiftKey && document.activeElement === focusable.at(-1) ? focusable[0] : null;
        if (target) { event.preventDefault(); target.focus(); }
      }
    }, true);

    function announce(message, showToast, failed = false) {
      clearTimeout(statusTimer);
      status.textContent = message;
      status.classList.toggle('visible', showToast);
      status.classList.toggle('failed', failed);
      statusTimer = setTimeout(() => { status.textContent = ''; status.classList.remove('visible'); }, 1800);
    }

    function showCopied(button) {
      feedbacks.get(button)?.reset();
      const originalIcon = button.querySelector('svg');
      const originalTitle = button.title;
      const check = createSvgIcon(['M5 12l4 4L19 6']);
      if (originalIcon) originalIcon.replaceWith(check);
      button.classList.add('copy-complete');
      button.title = t('copied');
      const feedback = {
        timer: null,
        reset() {
          clearTimeout(feedback.timer);
          if (originalIcon) check.replaceWith(originalIcon);
          button.classList.remove('copy-complete');
          button.title = originalTitle;
          feedbacks.delete(button);
        },
      };
      feedback.timer = setTimeout(feedback.reset, 1200);
      feedbacks.set(button, feedback);
    }

    async function copyText(text, trigger = null) {
      try {
        try {
          if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
          await navigator.clipboard.writeText(text);
        } catch {
          // 普通 HTTP 预览等环境使用旧剪贴板入口，失败时明确反馈，不能误报成功。
          const previousFocus = document.activeElement;
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.className = 'clipboard-fallback';
          document.body.appendChild(textarea);
          try {
            textarea.select();
            if (!document.execCommand('copy')) throw new Error('Copy command failed');
          } finally {
            textarea.remove();
            previousFocus?.focus({ preventScroll: true });
          }
        }
        if (trigger?.isConnected && !trigger.disabled) showCopied(trigger);
        announce(t('copied'), !trigger);
        return true;
      } catch {
        announce(t('copyFailed'), true, true);
        return false;
      }
    }

    return { copyText, isOverlayOpen: () => !overlay.hidden };
  },
};
