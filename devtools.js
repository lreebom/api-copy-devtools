chrome.devtools.panels.create(
  chrome.i18n.getMessage('panelTitle') || 'API Copy',
  'icon16.png',
  'panel.html',
  panel => {
    // 隐藏标签时暂停读取 HAR，完成事件仍由面板继续接收。
    let panelWindow;
    panel.onShown.addListener(currentWindow => {
      panelWindow = currentWindow;
      panelWindow?.setHarPollingEnabled?.(true);
    });
    panel.onHidden.addListener(() => panelWindow?.setHarPollingEnabled?.(false));
  }
);
