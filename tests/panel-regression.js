// 本地浏览器回归入口；测试页不进入扩展安装包，不依赖 npm 或测试框架。
const frame = document.querySelector('#panel');
const output = document.querySelector('#results');
const results = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  results.push(`通过：${message}`);
  output.textContent = results.join('\n');
}
async function waitFor(predicate) {
  for (let count = 0; count < 100; count++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error('等待页面状态超时');
}
frame.addEventListener('load', async () => {
  // 回归使用固定初始规则，完成后恢复偏好，避免上次测试影响本轮判定。
  const savedPreferences=new Map(Object.keys(localStorage).filter(key=>key.startsWith('apiCopy')).map(key=>[key,localStorage.getItem(key)]));
  try {
    const panel = frame.contentWindow;
    const doc = frame.contentDocument;
    const rows = () => doc.querySelectorAll('.request-row');
    await waitFor(() => rows().length === 8);
    const requestSort=doc.querySelector('#requestSortBtn');
    check(requestSort.getAttribute('aria-pressed')===String(panel.localStorage.getItem('apiCopyRequestSortOrder')==='newest'),
      '列表排序正确读取已保存的顺序，默认较早请求在前');
    if(requestSort.getAttribute('aria-pressed')==='true') requestSort.click();
    doc.querySelector('[data-rule-preset="default"]').click();
    doc.querySelector('#businessRuleSettings form').dispatchEvent(new panel.Event('submit',{cancelable:true}));
    let copied='';
    Object.defineProperty(panel.navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});
    panel.selectRecord(7);
    const params = doc.querySelector('#requestParamsContent');
    check(params.querySelectorAll('.request-param-title').length===1
      && params.querySelector('.request-param-title').textContent.includes('Query')
      && doc.querySelector('#requestParamsMeta').textContent==='Query 3 项', '只有 Query 时显示实际数量并隐藏缺失 Body 分区');
    params.querySelectorAll('.request-query-row')[2].querySelector('button').click();
    await Promise.resolve();
    check(copied==='demo', 'Query 逐项复制实际值，不包含字段名或展示文案');
    panel.selectRecord(3);
    check(params.querySelectorAll('.request-param-title').length===1
      && params.querySelector('.request-form-data-list')
      && doc.querySelector('#requestParamsMeta').textContent==='FormData 3 项', 'FormData 请求只汇总实际字段数量，隐藏空 Query 分区');
    params.querySelectorAll('.request-query-row')[2].querySelector('button').click();
    await Promise.resolve();
    check(copied==='需求说明.pdf', '文件字段只复制文件名，不复制文件描述或伪造文件内容');
    panel.selectRecord(6);
    check(!params.children.length && doc.querySelector('#requestParamsMeta').textContent==='无请求参数', '无 Query 和 Body 时仅在标题旁显示提示');
    panel.selectRecord(7);
    doc.querySelector('#previewContent details[data-json-path="/data/items"]').open=true;
    // details 的 toggle 事件异步创建子节点，等待实际渲染完成后再测量。
    await waitFor(()=>doc.querySelectorAll('#previewContent .json-summary').length>=6);
    const summaryRows=[...doc.querySelectorAll('#previewContent .json-summary')].filter(node=>node.getClientRects().length);
    // 浏览器缩放会产生亚像素取整，按整数 CSS 像素核对尺寸。
    check(summaryRows.length>=6 && summaryRows.every(node=>Math.round(node.getBoundingClientRect().height)===17), '折叠摘要与普通节点保持 17px 行高，不被背景边框撑高');
    const itemSummaries=[...doc.querySelectorAll('#previewContent details[data-json-path^="/data/items/"] > summary')];
    check(itemSummaries.length===3 && itemSummaries.every(summary=>{
      const key=summary.querySelector('.json-key').getBoundingClientRect();
      const copy=summary.querySelector('.json-copy-btn').getBoundingClientRect();
      return key.width>=12 && copy.right<=summary.getBoundingClientRect().right+1;
    }), '长摘要不会挤压数组序号，复制按钮保留在面板可见范围内');
    const originalOrder=[...rows()].map(row=>row.dataset.recordId);
    const sortPreview=doc.querySelector('#previewContent').firstElementChild;
    const sortParams=params.firstElementChild;
    requestSort.click();
    check([...rows()].map(row=>row.dataset.recordId).join(',')===[...originalOrder].reverse().join(',')
      && [...rows()].every((row,index)=>row.querySelector('.request-index').textContent===String(index+1))
      && panel.getSelectedRecord().id===7 && doc.querySelector('#previewContent').firstElementChild===sortPreview
      && params.firstElementChild===sortParams && doc.querySelector('#previewContent details[data-json-path="/data/items"]').open,
      '切换倒序只重排列表与序号，保持选中接口、参数和 JSON 展开状态');
    check(panel.localStorage.getItem('apiCopyRequestSortOrder')==='newest'
      && requestSort.title.includes('当前：最新请求在前'), '倒序偏好持久化且按钮提示当前方向');
    doc.querySelector('[data-method="GET"]').click();
    check([...rows()].map(row=>row.dataset.recordId).join(',')==='7,6,1', '筛选结果沿用最新请求在前的顺序');
    doc.querySelector('[data-method="all"]').click();
    requestSort.click();
    check([...rows()].map(row=>row.dataset.recordId).join(',')===originalOrder.join(','), '再次点击恢复正序');
    const requestSearch = doc.querySelector('#filterInput');
    const originalUrl = panel.getSelectedRecord().url;
    const displayPath = rows()[6].querySelector('.url').textContent;
    for (const keyword of [new URL(originalUrl).hostname.toUpperCase(), '/api/his/his/', '_t=1789180200000', originalUrl, 'cuOwnership']) {
      requestSearch.value = keyword;
      requestSearch.dispatchEvent(new panel.Event('input', { bubbles: true }));
      check([...rows()].some(row => row.dataset.recordId === '7' && row.querySelector('.url').textContent === displayPath),
        `请求筛选匹配 ${keyword} 并保持路径展示`);
    }
    doc.querySelector('[data-method="POST"]').click();
    check(rows().length === 0, 'URL 搜索与请求方法筛选同时生效');
    doc.querySelector('[data-method="all"]').click();
    doc.querySelector('#filterClearBtn').click();
    check(rows().length === 8, '清空请求筛选后恢复列表');
    const prefixInput = doc.querySelector('#pathPrefixSegmentsInput');
    const queryToggle = doc.querySelector('#showUrlQueryInput');
    const savedPrefix = prefixInput.value;
    const savedShowQuery = queryToggle.checked;
    prefixInput.value = '3';
    prefixInput.dispatchEvent(new panel.Event('input'));
    for (const showQuery of [false, true]) {
      queryToggle.checked = showQuery;
      queryToggle.dispatchEvent(new panel.Event('change'));
      const row = doc.querySelector('.request-row[data-record-id="7"]');
      const displayedUrl = row.querySelector('.url').textContent;
      check(displayedUrl.startsWith('/his/networkConfigSpec/') && displayedUrl.includes('?') === showQuery,
        '列表按配置截断前缀和显示 Query');
      doc.querySelector('#copyPathBtn').click();
      await Promise.resolve();
      check(copied === displayedUrl, '工具栏复制路径与列表显示一致');
      row.querySelector('.row-copy-path').click();
      await Promise.resolve();
      check(copied === displayedUrl, '行内复制路径与列表显示一致');
    }
    prefixInput.value = savedPrefix;
    prefixInput.dispatchEvent(new panel.Event('input'));
    queryToggle.checked = savedShowQuery;
    queryToggle.dispatchEvent(new panel.Event('change'));
    const parsed = panel.ApiCopyJson.parseJsonText('{"id":2090730954778415427,"decimal":1.0000000000000000001,"huge":1e400,"text":"2090730954778415427"}');
    const formatted = panel.ApiCopyJson.copyableJsonValue(parsed);
    check(formatted.includes('2090730954778415427') && formatted.includes('1.0000000000000000001') && formatted.includes('1e400'), '长整数、高精度小数和大指数无损复制');
    check(panel.ApiCopyJson.valueClass(parsed.id) === 'json-number' && panel.ApiCopyJson.valueClass(parsed.text) === 'json-string', '数值和字符串保持类型区别');
    check(panel.ApiCopyRequestData.tryPretty('{"id":2090730954778415427}', 'application/json').includes('2090730954778415427'), '响应和 Body 格式化不丢精度');
    check(panel.ApiCopyJson.primitiveText(panel.ApiCopyJson.parseJsonText('{"code":0,"code":200}').code) === '200', '重复 JSON 对象键兼容原生最后值语义');
    check(panel.evaluateBusinessResult('{"code":2e2}').state === 'success' && panel.evaluateBusinessResult('{"code":200.0}').state === 'success', '业务状态码保持数字语义，不因无损包装误报');
    const query = panel.filteredQueryItems({ url:'https://example.test/?tag=a&tag=b&language=C%2B%2B&name=%E4%B8%AD%E6%96%87&literal=%2520', queryString:[] });
    check(query.length === 5 && query[2].value === 'C++' && query[3].value === '中文' && query[4].value === '%20', '中文、加号和百分号只解码一次，并保留重复 Query');
    check(panel.filteredQueryItems({queryString:[{name:'language',value:'C++'}]})[0].value === 'C++', 'HAR 元数据保留实际加号');
    const form = {postData:{mimeType:'application/x-www-form-urlencoded', text:'tag=a&tag=b&language=C%2B%2B&name=%E4%B8%AD%E6%96%87',params:[{name:'incorrect',value:'fallback'}]}};
    check(panel.ApiCopyRequestData.getFormDataItems(form)[2].value === 'C++' && panel.ApiCopyRequestData.getFormDataItems(form).length === 4, '表单优先解析原文并保留同名字段');
    check(JSON.parse(panel.ApiCopyRequestData.getRequestBody({postData:{params:[{name:'tag',value:'a'},{name:'tag',value:'b'}]}})).length === 2, '复制表单不覆盖同名字段');

    panel.clearRequestRecords('回归测试');
    let callback;
    const request = (url, body, delayed = false) => ({
      _resourceType:'fetch',startedDateTime:new Date().toISOString(),time:10,
      request:{url,method:'POST',headers:[],queryString:[{name:'tag',value:'a'},{name:'tag',value:'b'}],postData:{mimeType:'application/json',text:'{"id":2090730954778415427,"nested":{"name":"body"}}'}},
      response:{status:200,headers:[],content:{mimeType:'application/json'}},
      getContent: done => { if (delayed) callback = done; else done(body,''); },
    });
    const exportRequest = request('https://example.test/export.csv', 'id,name\n1,Demo');
    exportRequest.response.headers = [
      { name: 'Content-Type', value: 'text/csv' },
      { name: 'Content-Disposition', value: 'attachment; filename=export.csv' },
    ];
    exportRequest.response.content.mimeType = 'text/csv';
    panel.addRequest(exportRequest);
    panel.addRequest({ ...request('https://example.test/events', 'data: demo'), _resourceType: 'EventSource' });
    panel.addRequest({ ...request('https://example.test/preflight', ''), _resourceType: 'preflight' });
    await waitFor(() => rows().length >= 2);
    check([...rows()].map(row => row.querySelector('.url').textContent).join(',') === '/export.csv,/events',
      'Fetch/XHR 分类收录导出请求和 EventSource，排除预检请求');
    panel.clearRequestRecords('回归测试');
    const data = Array.from({length:10000},(_,id)=>({id,name:`item-${id}`,nested:{label:'shared'}}));
    panel.addRequest(request('https://example.test/a?tag=a&tag=b',JSON.stringify({data})));
    panel.addRequest(request('https://example.test/b',JSON.stringify({data:{name:'second',remark:'x'.repeat(200)}})));
    await waitFor(()=>rows().length===2);
    const pressArrow = (target,key) => {
      target.focus();
      const event=new panel.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    panel.selectRecord(2);
    const treeBeforeArrow=doc.querySelector('#previewContent').firstElementChild;
    const otherTargets=[doc.querySelector('#previewContent'),doc.querySelector('#previewContent summary'),
      params,params.querySelector('button'),doc.querySelector('#copyPathBtn'),doc.querySelector('#previewSearchInput')];
    check(otherTargets.every(target=>!pressArrow(target,'ArrowUp') && panel.getSelectedRecord().id===2)
      && doc.querySelector('#previewContent').firstElementChild===treeBeforeArrow,
      'JSON、参数、搜索和工具栏的上下键不切换请求，也不阻止原生行为');
    check(pressArrow(doc.querySelector('#requestList'),'ArrowUp') && panel.getSelectedRecord().id===1
      && pressArrow(doc.querySelector('#requestList'),'ArrowDown') && panel.getSelectedRecord().id===2,
      '请求列表获得焦点后，上下键正常切换请求');
    rows()[0].click();
    check(doc.activeElement===doc.querySelector('#requestList') && panel.getSelectedRecord().id===1,
      '鼠标选中请求后焦点进入列表，可直接用键盘继续切换');
    panel.selectRecord(1);
    check(panel.formatRecord(panel.getSelectedRecord()).includes('"name": "tag"'), '完整请求复制使用列表保留重复 Query');
    const search = doc.querySelector('#previewSearchInput');
    search.value='item-9999';search.dispatchEvent(new panel.Event('input'));
    await waitFor(()=>doc.querySelector('#previewMatchCount').textContent === '1 / 1');
    check(doc.querySelector('.json-match-active')?.textContent.includes('item-9999'), '搜索自动跳转到末尾分组的命中项');
    check(doc.querySelector('#previewContent').querySelectorAll('*').length < 10000, '一万条数组单命中时保持惰性分组，不渲染全部元素');
    search.value='name';search.dispatchEvent(new panel.Event('input'));
    await waitFor(()=>doc.querySelector('#previewMatchCount').textContent === '1 / 10000');
    const pressSearchEnter = (options = {}) => {
      search.focus();
      search.dispatchEvent(new panel.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...options}));
    };
    pressSearchEnter();
    check(doc.querySelector('#previewMatchCount').textContent==='2 / 10000' && doc.activeElement===search
      && panel.getSelectedRecord().id===1, '搜索框回车切换下一个命中，保留输入焦点和选中请求');
    pressSearchEnter({shiftKey:true});
    pressSearchEnter({shiftKey:true});
    check(doc.querySelector('#previewMatchCount').textContent==='10000 / 10000'
      && doc.querySelector('.json-match-active')?.textContent.includes('item-9999'), 'Shift+Enter 循环到上一个命中并展开所在数组分组');
    pressSearchEnter();
    pressSearchEnter({isComposing:true});
    pressSearchEnter({ctrlKey:true});
    check(doc.querySelector('#previewMatchCount').textContent==='1 / 10000', '回车可循环回首项，输入法确认与组合快捷键不切换命中');
    search.value='item-9999';search.dispatchEvent(new panel.Event('input'));
    pressSearchEnter();
    check(doc.querySelector('#previewMatchCount').textContent==='1 / 1'
      && doc.querySelector('.json-match-active')?.textContent.includes('item-9999'), '快速输入后回车使用最新关键词，单命中保持稳定');
    search.value='name';search.dispatchEvent(new panel.Event('input'));
    await waitFor(()=>doc.querySelector('#previewMatchCount').textContent === '1 / 10000');
    panel.setPreviewMatchIndex(9999, false);
    check(doc.querySelector('.json-match-active')?.textContent.includes('item-9999'), '一万条命中总数准确，跨组导航不遗漏');
    const openPaths = [...doc.querySelectorAll('#previewContent details[open]')].map(node=>node.dataset.jsonPath);
    search.value='';search.dispatchEvent(new panel.Event('input'));
    await waitFor(()=>doc.querySelector('#previewSearchMatches').hidden);
    check(openPaths.every(path=>[...doc.querySelectorAll('#previewContent details[open]')].some(node=>node.dataset.jsonPath===path)), '清除搜索保持既有展开状态');
    const preview = doc.querySelector('#previewContent');preview.scrollTop=200;
    const bodyDetails = doc.querySelector('#requestParamsContent details[data-json-path="/nested"]');bodyDetails.open=true;
    await new Promise(resolve=>panel.requestAnimationFrame(resolve));
    const scroll = preview.scrollTop;
    panel.selectRecord(2);panel.selectRecord(1);
    await new Promise(resolve=>panel.requestAnimationFrame(resolve));
    check(preview.scrollTop === scroll && doc.querySelector('#requestParamsContent details[data-json-path="/nested"]').open, '切换接口恢复响应滚动位置和 Body 展开状态');
    panel.selectRecord(2);
    const shortLine = doc.querySelector('#previewContent .json-line');
    const shortValue = shortLine.querySelector('.json-value');
    const shortActions = shortLine.querySelector('.json-field-actions');
    check(Math.abs(shortActions.getBoundingClientRect().left-shortValue.getBoundingClientRect().right-4)<1,
      '短字段复制按钮紧跟字段值，间距为 4px');
    const openSummary = doc.querySelector('#previewContent details[data-json-path="/data"] > summary');
    check(Math.abs(openSummary.querySelector('.json-field-actions').getBoundingClientRect().left
      -openSummary.querySelector('.json-summary-count').getBoundingClientRect().right-4)<1,
      '展开对象的复制按钮跟随字段数量，不再远离字段');
    doc.querySelector('#previewContent .json-expand-btn').click();
    const longLine = doc.querySelector('#previewContent .json-long-line');
    check(longLine.querySelector('.json-field-actions').getBoundingClientRect().top===longLine.getBoundingClientRect().top
      && longLine.querySelector('.json-long-value').getBoundingClientRect().top>longLine.getBoundingClientRect().top,
      '长文本展开后操作跟随字段名，完整文本独占下一行');
    panel.selectRecord(1);panel.selectRecord(2);
    check(doc.querySelector('#previewContent .json-long-value').classList.contains('expanded'), '切换请求后保留长文本展开状态');
    panel.selectRecord(1);
    check(doc.querySelector('#requestParamsContent').textContent.includes('2090730954778415427'), '请求 Body 展示完整长数字');
    search.value='name';search.dispatchEvent(new panel.Event('input'));
    await waitFor(()=>doc.querySelector('#previewMatchCount').textContent === '1 / 10000');
    panel.setPreviewMatchIndex(9999, false);
    panel.selectRecord(2);panel.selectRecord(1);
    await new Promise(resolve=>panel.requestAnimationFrame(resolve));
    check(search.value === 'name' && doc.querySelector('#previewMatchCount').textContent === '10000 / 10000', '每条请求分别恢复搜索词和当前命中序号');
    search.value='not-found';search.dispatchEvent(new panel.Event('input'));
    await waitFor(()=>doc.querySelector('#previewMatchCount').textContent === '0 / 0');
    pressSearchEnter();
    pressSearchEnter({shiftKey:true});
    check(doc.querySelector('#previewMatchCount').textContent==='0 / 0', '零命中时回车与 Shift+Enter 不产生无效切换');
    check(doc.querySelector('#previewContent').querySelector('details'), '零命中时保留完整 JSON 树');
    search.value='';search.dispatchEvent(new panel.Event('input'));
    await waitFor(()=>doc.querySelector('#previewSearchMatches').hidden);
    const firstRow = rows()[0];
    const firstPreview = preview.firstElementChild;
    panel.addRequest(request('https://example.test/c','{}'));
    await waitFor(()=>rows().length===3);
    check(rows()[0] === firstRow && preview.firstElementChild === firstPreview, '新增请求复用旧列表行，保持当前 JSON DOM');
    requestSort.click();
    check(pressArrow(doc.querySelector('#requestList'),'ArrowUp') && panel.getSelectedRecord().id===2
      && pressArrow(doc.querySelector('#requestList'),'ArrowDown') && panel.getSelectedRecord().id===1,
      '倒序时上下键按当前显示顺序切换请求');
    const descendingPreview=preview.firstElementChild;
    panel.addRequest({...request('https://example.test/earlier','{}'),startedDateTime:'2000-01-01T00:00:00.000Z'});
    panel.addRequest({...request('https://example.test/latest','{}'),startedDateTime:'2099-01-01T00:00:00.000Z'});
    await waitFor(()=>rows().length===5);
    check(rows()[0].dataset.recordId==='5' && rows()[4].dataset.recordId==='4'
      && panel.getSelectedRecord().id===1 && preview.firstElementChild===descendingPreview,
      '倒序新增请求按开始时间插入，延迟到达的旧请求不置顶且当前 JSON 不刷新');
    requestSort.click();
    panel.addRequest(request('https://example.test/d','{}',true));
    panel.clearRequestRecords('已清空');
    callback('{"data":"old"}','');
    await new Promise(resolve=>panel.requestAnimationFrame(resolve));
    check(rows().length === 0 && !preview.textContent.includes('old'), '清空后旧请求异步返回不会污染新会话');
    // 新功能使用真实控件事件，验证筛选、保存规则与复制不会重建当前 JSON。
    const quick = doc.querySelector('#requestQuickFilters');
    const clickFilter = selector => quick.querySelector(selector).click();
    const getRequest = {...request('https://example.test/http','{"code":0}'),request:{url:'https://example.test/http',method:'GET',headers:[],queryString:[]},response:{status:500,content:{mimeType:'application/json'}}};
    panel.addRequest(getRequest);
    panel.addRequest(request('https://example.test/business','{"data":{"ok":1,"status":"SUCCESS"}}'));
    panel.addRequest({...request('https://example.test/slow','{"code":409}'),time:2000});
    await waitFor(()=>rows().length===3);
    panel.selectRecord(2);
    const selectedTree = preview.firstElementChild;
    clickFilter('[data-method="GET"]');
    check(rows().length === 1 && rows()[0].querySelector('.method').textContent === 'GET', '方法快捷筛选生效');
    check(preview.firstElementChild === selectedTree, '筛选不会打断正在阅读的 JSON');
    clickFilter('[data-method="all"]');
    clickFilter('[data-filter="httpFailure"]');
    check(rows().length===1, 'HTTP 失败独立筛选');
    clickFilter('[data-filter="businessFailure"]');
    check(rows().length===2, '两类失败同时开启显示任一失败');
    clickFilter('[data-filter="slow"]');
    check(rows().length===1 && rows()[0].textContent.includes('/slow'), '慢请求与失败筛选组合生效');
    const threshold = quick.querySelector('input');
    threshold.value='3000';threshold.dispatchEvent(new panel.Event('input'));
    check(rows().length===0, '修改慢请求阈值即时生效');
    clickFilter('[data-filter-reset]');
    check(rows().length===3, '重置筛选恢复全部记录');
    // 抽屉只覆盖视图，不能改变已选请求、正文 DOM 或布局尺寸。
    const content = doc.querySelector('#content');
    const beforeDrawer = content.getBoundingClientRect();
    doc.querySelector('#paramFilterBtn').click();
    const overlay = doc.querySelector('#settingsOverlay');
    const afterDrawer = content.getBoundingClientRect();
    check(!overlay.hidden && beforeDrawer.top===afterDrawer.top && beforeDrawer.height===afterDrawer.height
      && preview.firstElementChild===selectedTree, '设置抽屉打开后保持内容尺寸与当前 JSON');
    doc.querySelector('[data-settings-tab="filter"]').click();
    check(!doc.querySelector('#settingsFilterPanel').hidden && doc.querySelector('#settingsDisplayPanel').hidden, '设置分类正确切换且沿用原字段');
    doc.querySelector('[data-settings-tab="filter"]').focus();
    doc.activeElement.dispatchEvent(new panel.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    check(doc.querySelector('[data-settings-tab="business"]').getAttribute('aria-selected')==='true'
      && panel.getSelectedRecord().id===2, '抽屉键盘导航不会切换请求');
    const ruleRoot = doc.querySelector('#businessRuleSettings');
    const setRule = (name,value) => { const input=ruleRoot.querySelector('[name="'+name+'"]');input.value=value;input.dispatchEvent(new panel.Event('input',{bubbles:true})); };
    const beforePreset=panel.localStorage.getItem('apiCopyBusinessRules');
    const beforePresetState=panel.getSelectedRecord().businessState;
    ruleRoot.querySelector('[data-rule-preset="success"]').click();
    check(ruleRoot.querySelector('[name="flagPath"]').value==='success'
      && ruleRoot.querySelector('[name="codePath"]').value===''
      && ruleRoot.querySelector('[data-rule-preset="success"]').getAttribute('aria-pressed')==='true'
      && panel.localStorage.getItem('apiCopyBusinessRules')===beforePreset
      && panel.getSelectedRecord().businessState===beforePresetState && preview.firstElementChild===selectedTree,
      '选择预设只修改草稿，当前记录和 JSON 不变');
    setRule('flagPath','data.success');
    check(!ruleRoot.querySelector('[aria-pressed="true"]'), '自定义编辑后清除不匹配的预设选中态');
    ruleRoot.querySelector('[data-rule-preset="code"]').click();
    check(ruleRoot.querySelector('[name="flagPath"]').value===''
      && ruleRoot.querySelector('[name="successCodes"]').value==='0, 200', '纯状态码预设清除成功标识检查');
    ruleRoot.querySelector('[data-rule-preset="default"]').click();
    setRule('flagPath','data..ok');
    ruleRoot.querySelector('form').dispatchEvent(new panel.Event('submit',{cancelable:true}));
    check(ruleRoot.querySelector('[role="status"]').classList.contains('settings-error') && ruleRoot.querySelector('[type="submit"]').disabled, '无效业务路径在保存前被拦截并提示');
    setRule('flagPath','data.ok');setRule('flagValue','1');setRule('codePath','data.status');setRule('successCodes','SUCCESS, 201');
    ruleRoot.querySelector('form').dispatchEvent(new panel.Event('submit',{cancelable:true}));
    check(panel.getSelectedRecord().businessState==='success' && JSON.parse(panel.localStorage.getItem('apiCopyBusinessRules')).codePath==='data.status', '保存自定义规则立即重新判定并持久化');
    check(preview.firstElementChild===selectedTree, '更新业务规则只刷新状态，不重建 JSON');
    const enabled=ruleRoot.querySelector('[name="enabled"]');
    enabled.checked=false;enabled.dispatchEvent(new panel.Event('change'));
    ruleRoot.querySelector('form').dispatchEvent(new panel.Event('submit',{cancelable:true}));
    clickFilter('[data-filter="httpFailure"]');
    check(rows().length===1, '关闭业务识别不影响 HTTP 失败判断');
    clickFilter('[data-filter-reset]');
    doc.dispatchEvent(new panel.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    check(overlay.hidden && doc.activeElement===doc.querySelector('#paramFilterBtn'), 'Esc 关闭设置并返回触发按钮');
    const collapsedBody=doc.querySelector('#requestParamsContent details[data-json-path="/nested"]');
    collapsedBody.querySelector('.json-copy-btn').click();
    await Promise.resolve();
    check(!collapsedBody.open && JSON.parse(copied).name==='body', '摘要中的复制按钮复制完整对象，不触发展开');
    doc.querySelector('#copyCurlBtn').click();
    await Promise.resolve();
    check(copied.includes('curl --globoff') && copied.includes('https://example.test/business'), 'cURL 按钮复制所选请求');
    const quickPath=rows()[0].querySelector('.row-copy-path');
    quickPath.click();
    await waitFor(()=>quickPath.classList.contains('copy-complete'));
    check(copied==='/http' && panel.getSelectedRecord().id===2
      && Math.round(rows()[0].querySelector('.row-copy-actions').getBoundingClientRect().width)===70, '列表快捷复制保持选中请求并使用紧凑行内图标组');
    const jsonCopy = preview.querySelector('.json-copy-btn:not(.json-expand-btn)');
    const beforeCopy = jsonCopy.getBoundingClientRect();
    const originalPath = jsonCopy.querySelector('path').getAttribute('d');
    await panel.copyText('字段内容',jsonCopy);
    await panel.copyText('字段内容二次复制',jsonCopy);
    const afterCopy = jsonCopy.getBoundingClientRect();
    check(copied==='字段内容二次复制' && jsonCopy.classList.contains('copy-complete')
      && beforeCopy.width===afterCopy.width && beforeCopy.height===afterCopy.height, '连续复制就地反馈且按钮尺寸不变');
    await waitFor(()=>!jsonCopy.classList.contains('copy-complete'));
    check(jsonCopy.querySelector('path').getAttribute('d')===originalPath, '连续复制后正确恢复原图标');
    const svgRect=jsonCopy.querySelector('svg').getBoundingClientRect();
    const bodyCopy=doc.querySelector('#requestParamsContent .request-param-json .json-copy-btn:not(.json-expand-btn)');
    check(Math.round(beforeCopy.width)===20 && Math.round(beforeCopy.height)===17 && Math.round(svgRect.width)===12 && Math.round(svgRect.height)===12
      && Math.round(bodyCopy.getBoundingClientRect().width)===20 && Math.round(bodyCopy.querySelector('svg').getBoundingClientRect().width)===12,
      '响应与 Body 共用 12px 图标和 20px 宽复制按钮，保持 17px 行高');
    const bodyValue=bodyCopy.closest('.json-line').querySelector('.json-value');
    check(Math.abs(bodyCopy.getBoundingClientRect().left-bodyValue.getBoundingClientRect().right-4)<1,
      '请求 Body 的复制按钮同样紧跟字段值');
    check(Math.round(rows()[0].getBoundingClientRect().height)===26 && panel.getComputedStyle(rows()[0].querySelector('.method')).fontSize==='10px'
      && panel.getComputedStyle(preview).fontSize==='11px' && panel.getComputedStyle(preview.querySelector('.json-summary')).lineHeight==='17px', '实际渲染符合紧凑字号、列表行高与 JSON 行距');
    const fullCopy=doc.querySelector('#copyFullBtn');
    const fullWidth=fullCopy.getBoundingClientRect().width;
    check(fullCopy.parentElement===doc.querySelector('.copy-actions')
      && doc.querySelector('#copyTokenBtn').parentElement===fullCopy.parentElement, '完整请求和 Token 直接位于同一复制按钮组');
    fullCopy.click();
    await waitFor(()=>fullCopy.classList.contains('copy-complete'));
    check(copied.includes('REQUEST') && fullCopy.getBoundingClientRect().width===fullWidth, '完整请求直接复制并在原按钮反馈，不改变宽度');
    const command=doc.execCommand;
    Object.defineProperty(panel.navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('模拟剪贴板不可用');}}});
    doc.execCommand=()=>false;
    const failed=await panel.copyText('失败测试',jsonCopy);
    check(failed===false && doc.querySelector('#copyStatus').classList.contains('failed')
      && !jsonCopy.classList.contains('copy-complete'), '剪贴板与兼容入口均失败时不会误报复制成功');
    let fallbackValue='';
    doc.execCommand=name=>{fallbackValue=doc.activeElement.value;return name==='copy';};
    const fallbackSuccess=await panel.copyText('中文+兼容复制',jsonCopy);
    check(fallbackSuccess && fallbackValue==='中文+兼容复制' && !doc.querySelector('.clipboard-fallback'), '兼容剪贴板入口保留内容并清理临时节点');
    doc.execCommand=command;
    Object.defineProperty(panel.navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});
    ruleRoot.querySelector('[data-rule-action="reset"]').click();
    ruleRoot.querySelector('form').dispatchEvent(new panel.Event('submit',{cancelable:true}));
    panel.localStorage.removeItem('apiCopyBusinessRules');
    panel.localStorage.removeItem('apiCopySlowRequestMs');
    // 通过采集入口验证参数边界：空值和重复字段都必须保留原本的复制语义。
    const addParameterRequest = async (postData,url='https://example.test/params-'+rows().length) => {
      const count=rows().length;
      panel.addRequest({...request(url,'{}'),request:{url,method:'POST',headers:[],queryString:[],postData}});
      await waitFor(()=>rows().length===count+1);
      rows()[rows().length-1].click();
    };
    await addParameterRequest(null,'https://example.test/query?tag=a&tag=b&name=%E4%B8%AD%E6%96%87&empty=&literal=%2520');
    const queryValues=[];
    for (const button of params.querySelectorAll('button')) {
      button.click(); await Promise.resolve(); queryValues.push(copied);
    }
    check(JSON.stringify(queryValues)===JSON.stringify(['a','b','中文','','%20']),
      'Query 复制保留重复字段、中文、空值和只解码一次的百分号');
    await addParameterRequest({mimeType:'application/x-www-form-urlencoded',text:'tag=a&tag=b&name=%E4%B8%AD%E6%96%87&empty=&language=C%2B%2B'});
    const formValues=[];
    for (const button of params.querySelectorAll('button')) {
      button.click(); await Promise.resolve(); formValues.push(copied);
    }
    check(JSON.stringify(formValues)===JSON.stringify(['a','b','中文','','C++']),
      '表单复制保留重复字段、中文、空值和实际加号');
    const paramButton=params.querySelector('button');
    check(Math.round(paramButton.getBoundingClientRect().width)===20 && Math.round(paramButton.querySelector('svg').getBoundingClientRect().width)===12,
      '参数列表沿用 JSON 的 20px 宽按钮和 12px 图标');
    const explicitBodies=['{}','[]','0','false','null','""'];
    for (const text of explicitBodies) {
      await addParameterRequest({mimeType:'application/json',text});
      check((params.querySelector('.request-param-json') || (text==='""' && params.querySelector('.request-param-raw')?.textContent==='""'))
        && params.querySelectorAll('.request-param-title').length===1
        && doc.querySelector('#requestParamsMeta').textContent==='', '显式 JSON Body 保留展示且不重复提示有无：'+text);
    }
    await addParameterRequest({mimeType:'application/x-www-form-urlencoded',text:''});
    check(!params.children.length && doc.querySelector('#requestParamsMeta').textContent==='无请求参数', '空表单不留下空分区');
    await addParameterRequest({mimeType:'application/x-www-form-urlencoded',text:'tag=a&tag=b'},'https://example.test/counts?q=demo');
    check(doc.querySelector('#requestParamsMeta').textContent==='Query 1 项 · FormData 2 项', '混合参数汇总保留重复表单字段计数');
    // 重置必须清除持久化尺寸，恢复比例布局，同时保留另一方向的手动尺寸。
    for (const mode of ['horizontal','vertical']) {
      panel.setLayoutMode(mode);
      panel.setListWidth(420);
      panel.setListHeight(320);
      panel.setRequestListSize(200);
      const stacked=mode==='vertical';
      const property=stacked ? '--list-height' : '--list-width';
      const storageKey=stacked ? 'apiCopyListHeight' : 'apiCopyListWidth';
      const otherKey=stacked ? 'apiCopyListWidth' : 'apiCopyListHeight';
      const otherSize=panel.localStorage.getItem(otherKey);
      doc.querySelector('#splitter').dispatchEvent(new panel.MouseEvent('dblclick',{bubbles:true}));
      doc.querySelector('#requestParamsSplitter').dispatchEvent(new panel.MouseEvent('dblclick',{bubbles:true}));
      check(panel.getComputedStyle(doc.documentElement).getPropertyValue(property).trim()==='40%'
        && panel.getComputedStyle(doc.documentElement).getPropertyValue('--request-list-size').trim()==='65%'
        && panel.localStorage.getItem(storageKey)===null
        && panel.localStorage.getItem('apiCopyRequestListSize')===null
        && panel.localStorage.getItem(otherKey)===otherSize, mode+' 布局双击恢复默认比例并清除对应存储');
    }
    doc.documentElement.style.removeProperty('--list-width');
    panel.localStorage.removeItem('apiCopyListWidth');
    panel.selectRecord(2);
    const presetRequestCount=rows().length;
    panel.addRequest(request('https://example.test/business-preset','{"success":false,"errorCode":"11021"}'));
    await waitFor(()=>rows().length===presetRequestCount+1);
    rows()[rows().length-1].click();
    const presetTree=preview.firstElementChild;
    doc.querySelector('#paramFilterBtn').click();
    doc.querySelector('[data-settings-tab="business"]').click();
    ruleRoot.querySelector('[data-rule-preset="success"]').click();
    ruleRoot.querySelector('form').dispatchEvent(new panel.Event('submit',{cancelable:true}));
    check(panel.getSelectedRecord().businessState==='failure'
      && JSON.parse(panel.localStorage.getItem('apiCopyBusinessRules')).flagPath==='success'
      && preview.firstElementChild===presetTree, 'success 预设保存后识别现有失败记录，保留 JSON DOM');
    doc.querySelector('#settingsCloseBtn').click();
    const english = await fetch('../_locales/en/messages.json').then(response=>response.json());
    Object.defineProperty(panel,'chrome',{configurable:true,value:{i18n:{
      // Chrome 会先解析具名占位符，再代入参数；测试替身需使用同样的规则。
      getMessage: (key,values=[]) => (english[key]?.message || '')
        .replace(/\$([a-z][a-z0-9_]*)\$/gi,(_,name)=>english[key].placeholders?.[name.toLowerCase()]?.content || '')
        .replace(/\$(\d+)/g,(_,number)=>values[Number(number)-1] ?? ''),
      getUILanguage: ()=>'en',
    }}});
    panel.ApiCopyI18n.localizeDocument();
    doc.querySelector('.panel-title .count-badge').textContent=english.previewData.message;
    check(doc.querySelector('#copyCurlBtn').textContent.includes('Copy cURL') && doc.querySelector('#paramFilterBtn').textContent.includes('Settings')
      && requestSort.title.includes('oldest requests first')
      && ruleRoot.querySelector('[type="submit"]').textContent==='Save rules', '新增控件完整支持英文文案');
    doc.querySelector('#paramFilterBtn').click();
    doc.querySelector('[data-settings-tab="business"]').click();
    const responsive = [];
    const layoutChecks = [];
    const toolbarChecks = [];
    search.value='data';search.dispatchEvent(new panel.Event('input'));
    await waitFor(()=>!doc.querySelector('#previewSearchMatches').hidden);
    for (const width of [320,360,375,480,560,620,890,1280]) {
      frame.style.width=width+'px';
      frame.style.height='900px';
      await new Promise(resolve=>panel.requestAnimationFrame(()=>panel.requestAnimationFrame(resolve)));
      const root=doc.querySelector('#requestQuickFilters');
      const settingsPanel=doc.querySelector('#paramFilterPanel');
      const heading=doc.querySelector('.panel-title').getBoundingClientRect();
      const requestFilter=doc.querySelector('.filter-wrap').getBoundingClientRect();
      const utility=doc.querySelector('.toolbar-utility').getBoundingClientRect();
      const sameRow=Math.abs(heading.top+heading.height/2-utility.top-utility.height/2)<1;
      toolbarChecks.push({width,sameRow,
        searchPosition:width<=360 ? requestFilter.top>=heading.bottom : Math.abs(requestFilter.top+requestFilter.height/2-utility.top-utility.height/2)<1,
        fits:[heading,requestFilter,utility].every(rect=>rect.left>=0 && rect.right<=panel.innerWidth+1),
        compactUtility:width>640 || [...doc.querySelectorAll('.toolbar-utility button')].every(button=>Math.round(button.getBoundingClientRect().width)===24
          && panel.getComputedStyle(button.querySelector('span')).display==='none' && button.getAttribute('aria-label')),
        height:doc.querySelector('.toolbar-main').getBoundingClientRect().height});
      for(const tab of doc.querySelectorAll('[data-settings-tab]')) {
        tab.click();
        responsive.push({width:panel.innerWidth,overflow:doc.documentElement.scrollWidth>panel.innerWidth,
          filters:root.scrollWidth>root.clientWidth,settings:settingsPanel.scrollWidth>settingsPanel.clientWidth});
      }
      doc.querySelector('#settingsCloseBtn').click();
      for(const mode of ['auto','horizontal','vertical']) {
        doc.querySelector('[data-layout-mode="'+mode+'"]').click();
        await new Promise(resolve=>panel.requestAnimationFrame(resolve));
        const pane=doc.querySelector('.detail-pane').getBoundingClientRect();
        const clipped=[...doc.querySelectorAll('.layout-switch,#previewSortBtn,#previewSearchInput,#previewSearchMatches')]
          .filter(item=>!item.hidden).filter(item=>{const r=item.getBoundingClientRect();return r.left<pane.left-1 || r.right>pane.right+1;})
          .map(item=>item.id || item.className);
        const copyButtons=[...doc.querySelectorAll('.copy-actions > button')];
        const copiesFit=copyButtons.length===6 && copyButtons.every(button=>{
          const rect=button.getBoundingClientRect();
          const icon=button.querySelector('.action-icon').getBoundingClientRect();
          const label=button.querySelector('span:last-child');
          return rect.width>0 && rect.left>=0 && rect.right<=panel.innerWidth
            && Math.round(rect.height)===24 && Math.abs(icon.top+icon.height/2-rect.top-rect.height/2)<1
            && (width>800 || (panel.getComputedStyle(label).display==='none'
              && Math.abs(icon.left+icon.width/2-rect.left-rect.width/2)<1));
        });
        layoutChecks.push({width,mode,clipped,copiesFit});
      }
      doc.querySelector('#paramFilterBtn').click();
    }
    check(layoutChecks.every(item=>!item.clipped.length&&item.copiesFit), '320～1280 宽度下三种布局的预览控件和六个复制按钮完整可见，窄屏隐藏按钮文字：'+JSON.stringify(layoutChecks.filter(item=>item.clipped.length||!item.copiesFit)));
    check(toolbarChecks.every(item=>item.sameRow&&item.searchPosition&&item.fits&&item.compactUtility&&item.height<=(item.width<=360 ? 65 : 33)),
      '顶部设置与帮助始终与品牌同行，360px 以下仅搜索换行：'+JSON.stringify(toolbarChecks));
    doc.querySelector('#settingsCloseBtn').click();
    doc.querySelector('[data-layout-mode="auto"]').click();
    check(responsive.every(item=>!item.overflow&&!item.filters&&!item.settings)
      && [...new Set(responsive.map(item=>item.width))].join(',')==='320,360,375,480,560,620,890,1280', '英文界面 320～1280 宽度的筛选和规则设置无横向溢出：'+JSON.stringify(responsive.filter(item=>item.overflow||item.filters||item.settings)));
    frame.style.width='1200px';
    output.dataset.status='passed';
    output.textContent += `\n完成：${results.length} 项检查通过。`;
  } catch (error) {
    output.dataset.status='failed';
    output.textContent += `\n失败：${error.stack}`;
  } finally {
    for(const key of Object.keys(localStorage)) if(key.startsWith('apiCopy')) localStorage.removeItem(key);
    for(const [key,value] of savedPreferences) localStorage.setItem(key,value);
  }
});
