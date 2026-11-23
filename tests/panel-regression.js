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
    await waitFor(() => rows().length === 10);
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
    params.querySelectorAll('.request-query-row')[2].querySelector('[data-copy-field="value"]').click();
    await Promise.resolve();
    check(copied==='demo', 'Query 逐项复制实际值，不包含字段名或展示文案');
    params.querySelectorAll('.request-query-row')[2].querySelector('[data-copy-field="pair"]').click();
    await Promise.resolve();
    check(copied==='keyword: demo', 'Query 逐项复制字段名和字段值');
    panel.selectRecord(3);
    check(params.querySelectorAll('.request-param-title').length===1
      && params.querySelector('.request-form-data-list')
      && doc.querySelector('#requestParamsMeta').textContent==='FormData 3 项', 'FormData 请求只汇总实际字段数量，隐藏空 Query 分区');
    params.querySelectorAll('.request-query-row')[2].querySelector('[data-copy-field="value"]').click();
    await Promise.resolve();
    check(copied==='需求说明.pdf', '文件字段只复制文件名，不复制文件描述或伪造文件内容');
    params.querySelectorAll('.request-query-row')[2].querySelector('[data-copy-field="pair"]').click();
    await Promise.resolve();
    check(copied==='attachment: 需求说明.pdf', '文件字段支持复制字段名和文件名');
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
      const actions=summary.querySelector('.json-field-actions').getBoundingClientRect();
      return key.width>=12 && actions.right<=summary.getBoundingClientRect().right+1
        && summary.querySelectorAll('.json-copy-btn').length===2;
    }), '长摘要不会挤压数组序号，数组项的两个复制按钮都在可见范围内');
    const firstItem = itemSummaries[0].parentElement;
    itemSummaries[0].querySelector('[data-copy-field="pair"]').click();
    await Promise.resolve();
    check(!firstItem.open && copied.startsWith('0: {') && JSON.parse(copied.slice(3)).id==='demo-1025',
      '折叠数组项可复制下标和完整对象并保持折叠');
    firstItem.open=true;
    await waitFor(()=>Boolean(doc.querySelector('#previewContent details[data-json-path="/data/items/0/tags"]')));
    doc.querySelector('#previewContent details[data-json-path="/data/items/0/tags"]').open=true;
    await waitFor(()=>Boolean(doc.querySelector('#previewContent [data-match-path="/data/items/0/tags/0"]')));
    const tagPair = doc.querySelector('#previewContent [data-match-path="/data/items/0/tags/0"] [data-copy-field="pair"]');
    tagPair.click();
    await Promise.resolve();
    check(Boolean(doc.querySelector('#previewContent [data-match-path="/data/items/0/id"] [data-copy-field="pair"]'))
      && Boolean(doc.querySelector('#previewContent details[data-json-path="/data/items/0/tags"] > summary [data-copy-field="pair"]'))
      && copied==='0: 前端',
      '对象字段、数组字段和数组标量元素均可按行内名称或下标复制');
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
    const displayPath = doc.querySelector('.request-row[data-record-id="7"] .url').textContent;
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
    check(rows().length === 10, '清空请求筛选后恢复列表');
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
      const expectedWithQuery = '/his/networkConfigSpec/view/cuOwnership?page=1&pageSize=20&keyword=demo';
      doc.querySelector('#copyPathQueryBtn').click();
      await Promise.resolve();
      check(copied === expectedWithQuery, '工具栏复制路径+参数遵循全局前缀截断并保留 Query');
      row.querySelector('.row-copy-query').click();
      await Promise.resolve();
      check(copied === expectedWithQuery, '行内复制路径+参数遵循全局前缀截断并保留 Query');
      doc.querySelector('#copySimpleBtn').click();
      await Promise.resolve();
      check(copied.includes(`GET ${expectedWithQuery}\n`) && !copied.includes('Body:') && copied.includes('Status: 200 OK'),
        '工具栏复制精简请求遵循全局前缀截断并省略空 Body');
      row.querySelector('.row-copy-simple').click();
      await Promise.resolve();
      check(copied.includes(`GET ${expectedWithQuery}\n`) && !copied.includes('Body:') && copied.includes('Status: 200 OK'),
        '行内复制精简请求遵循全局前缀截断并省略空 Body');
    }
    check(panel.getDisplayUrl('/api/his/his/his/%E6%B5%8B%E8%AF%95?q=%E4%B8%AD%E6%96%87&_t=1#section', true) === '/his/测试?q=中文'
      && panel.getDisplayUrl('/api/his/his/his/%E6%B5%8B%E8%AF%95?q=%E4%B8%AD%E6%96%87&_t=1#section', false) === '/his/测试',
      '相对 URL 同样按前缀截断、去除 hash 并展示可读路径和 Query');
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
    const paramsOnlyRecord = {url:'https://example.test/form',method:'POST',postData:{params:[{name:'tag',value:'a'},{name:'tag',value:'b'}]}};
    check(panel.ApiCopyRequestData.getRequestBody(paramsOnlyRecord) === 'tag: a\ntag: b'
      && panel.ApiCopyRequestData.getFormDataItems(paramsOnlyRecord)?.length === 2
      && panel.formatPathWithParams(paramsOnlyRecord).includes('FormData:\ntag: a\ntag: b'),
      '无 mimeType 的 params 表单保持同名字段并与 FormData 标签对齐');
    panel.selectRecord(3);
    doc.querySelector('#copyPathQueryBtn').click();
    await Promise.resolve();
    check(copied.includes('FormData:\nprojectId: demo-1025\nremark: 项目需求说明\nattachment: 需求说明.pdf · application/pdf · 242.8 KB'),
      'FormData 复制路径+参数按键值行输出文件元数据');
    doc.querySelector('#copySimpleBtn').click();
    await Promise.resolve();
    check(copied.includes('POST ') && copied.includes('FormData:\nprojectId: demo-1025') && copied.includes('Status: 200 OK'),
      'FormData 精简请求合并方法路径并输出键值格式');
    doc.querySelector('#copyFullBtn').click();
    await Promise.resolve();
    check(copied.includes('POST ') && copied.includes('FormData:\nprojectId: demo-1025') && !copied.includes('Query Parameters:') && copied.includes('Status: 200 OK'),
      '完整请求省略空 Query 分区并使用紧凑头部');

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
    doc.querySelector('#previewContent details[data-json-path="/data/9999"] > summary [data-copy-field="pair"]').click();
    await Promise.resolve();
    check(copied.startsWith('9999: {') && JSON.parse(copied.slice('9999: '.length)).id===9999,
      '分组数组按元素的原始下标复制键值');
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
    const descendingRows=[...rows()];
    const focusedCopyButton=descendingRows[1].querySelector('.row-copy-query');
    focusedCopyButton.focus({preventScroll:true});
    panel.addRequest({...request('https://example.test/earlier','{}'),startedDateTime:'2000-01-01T00:00:00.000Z'});
    panel.addRequest({...request('https://example.test/latest','{}'),startedDateTime:'2099-01-01T00:00:00.000Z'});
    await waitFor(()=>rows().length===5);
    check(rows()[0].dataset.recordId==='5' && rows()[4].dataset.recordId==='4'
      && panel.getSelectedRecord().id===1 && preview.firstElementChild===descendingPreview,
      '倒序新增请求按开始时间插入，延迟到达的旧请求不置顶且当前 JSON 不刷新');
    check(descendingRows.every(row=>row.isConnected) && doc.activeElement===focusedCopyButton
      && [...rows()].every((row,index)=>row.querySelector('.request-index').textContent===String(index+1)),
      '倒序插入请求只调整现有行的序号，保留节点和复制按钮焦点');
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
    collapsedBody.querySelector('.json-copy-btn[data-copy-field="value"]').click();
    await Promise.resolve();
    check(!collapsedBody.open && JSON.parse(copied).name==='body', '摘要中的复制按钮复制完整对象，不触发展开');
    collapsedBody.querySelector('.json-copy-btn[data-copy-field="pair"]').click();
    await Promise.resolve();
    check(!collapsedBody.open && copied==='nested: {\n  "name": "body"\n}', '摘要中的键值复制按钮复制字段名和完整对象，不触发展开');
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
    const bodyPairCopy=doc.querySelector('#requestParamsContent .request-param-json .json-copy-btn[data-copy-field="pair"]');
    bodyPairCopy.click();
    await Promise.resolve();
    check(copied==='id: 2090730954778415427', 'JSON 字段键值复制按钮保留字段名与无损数字');
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
    for (const button of params.querySelectorAll('button[data-copy-field="value"]')) {
      button.click(); await Promise.resolve(); queryValues.push(copied);
    }
    check(JSON.stringify(queryValues)===JSON.stringify(['a','b','中文','','%20']),
      'Query 复制保留重复字段、中文、空值和只解码一次的百分号');
    const queryPairs=[];
    for (const button of params.querySelectorAll('button[data-copy-field="pair"]')) {
      button.click(); await Promise.resolve(); queryPairs.push(copied);
    }
    check(JSON.stringify(queryPairs)===JSON.stringify(['tag: a','tag: b','name: 中文','empty: ','literal: %20']),
      'Query 键值复制保留字段名、重复字段、中文、空值和只解码一次的百分号');

    // 实际复制入口要保留可重新解析的 URL，以及路径后缀中的斜杠。
    const encodedQuery = 'q=a%26b%3Dc%23d&language=C%2B%2B&literal=%2520';
    const encodedRequestPath = '/gateway/service/v1/demo//%E6%B5%8B%E8%AF%95/?' + encodedQuery + '&_t=1#section';
    const copiedPath = '/demo//%E6%B5%8B%E8%AF%95/?' + encodedQuery;
    prefixInput.value = '3';
    prefixInput.dispatchEvent(new panel.Event('input'));
    await addParameterRequest(null, 'https://example.test' + encodedRequestPath);
    const encodedRow = rows()[rows().length - 1];
    for (const button of [doc.querySelector('#copyPathQueryBtn'), encodedRow.querySelector('.row-copy-query')]) {
      button.click();
      await Promise.resolve();
      check(copied === copiedPath, '路径+参数在截断前缀和过滤 Query 后保留原编码及斜杠');
    }
    for (const button of [doc.querySelector('#copySimpleBtn'), encodedRow.querySelector('.row-copy-simple')]) {
      button.click();
      await Promise.resolve();
      check(copied.split('\n')[1] === 'POST ' + copiedPath, '精简请求保留原编码及斜杠');
    }
    check(panel.formatPathWithParams({url: encodedRequestPath}) === copiedPath, '相对 URL 复制保留编码及斜杠');
    prefixInput.value = savedPrefix;
    prefixInput.dispatchEvent(new panel.Event('input'));

    const multipartText = '--demo\r\nContent-Disposition: form-data; name="note"\r\n\r\nhello--demo-world\r\n--demo--\r\n';
    await addParameterRequest({mimeType:'multipart/form-data; boundary=demo',text:multipartText});
    for (const selector of ['#copyPathQueryBtn', '#copySimpleBtn', '#copyFullBtn']) {
      doc.querySelector(selector).click();
      await Promise.resolve();
      check(copied.includes('FormData:\nnote: hello--demo-world'), '各复制入口保留 multipart 字段内的 boundary 文本');
    }

    await addParameterRequest({mimeType:'application/x-www-form-urlencoded',text:'tag=a&tag=b&name=%E4%B8%AD%E6%96%87&empty=&language=C%2B%2B'});
    const formValues=[];
    for (const button of params.querySelectorAll('button[data-copy-field="value"]')) {
      button.click(); await Promise.resolve(); formValues.push(copied);
    }
    check(JSON.stringify(formValues)===JSON.stringify(['a','b','中文','','C++']),
      '表单复制保留重复字段、中文、空值和实际加号');
    const formPairs=[];
    for (const button of params.querySelectorAll('button[data-copy-field="pair"]')) {
      button.click(); await Promise.resolve(); formPairs.push(copied);
    }
    check(JSON.stringify(formPairs)===JSON.stringify(['tag: a','tag: b','name: 中文','empty: ','language: C++']),
      '表单键值复制保留字段名、重复字段、中文、空值和实际加号');
    const paramButtons=[...params.querySelectorAll('.request-query-row:first-child button')];
    check(paramButtons.length===2 && paramButtons.every(button=>Math.round(button.getBoundingClientRect().width)===20
      && Math.round(button.querySelector('svg').getBoundingClientRect().width)===12),
      '参数列表两个复制按钮均沿用 JSON 的 20px 宽按钮和 12px 图标');
    const explicitBodies=['{}','[]','0','false','null','""'];
    for (const text of explicitBodies) {
      await addParameterRequest({mimeType:'application/json',text});
      check((params.querySelector('.request-param-json') || (text==='""' && params.querySelector('.request-param-raw')?.textContent==='""'))
        && params.querySelectorAll('.request-param-title').length===1
        && doc.querySelector('#requestParamsMeta').textContent==='', '显式 JSON Body 保留展示且不重复提示有无：'+text);
    }
    await addParameterRequest({mimeType:'application/x-www-form-urlencoded',text:''});
    check(!params.children.length && doc.querySelector('#requestParamsMeta').textContent==='无请求参数', '空表单不留下空分区');
    await addParameterRequest({mimeType:'application/x-www-form-urlencoded',text:'tag=a&tag=b'},'https://example.test/counts?q=abc');
    check(doc.querySelector('#requestParamsMeta').textContent==='Query 1 项 · FormData 2 项', '混合参数汇总保留重复表单字段计数');
    // 在列表和参数左右分栏的窄面板中，核对 Query 与 FormData 按钮的可见区域。
    frame.style.width='320px';
    panel.setLayoutMode('auto', false);
    await new Promise(resolve=>panel.requestAnimationFrame(()=>panel.requestAnimationFrame(resolve)));
    const narrowLists = [...params.querySelectorAll('.request-query-list')];
    check(narrowLists.length === 2 && narrowLists.every(list => {
      const bounds = list.getBoundingClientRect();
      const buttons = [...list.querySelectorAll('.json-copy-btn')];
      return buttons.length === list.querySelectorAll('.request-query-row').length * 2 && buttons.every(button => {
        const rect = button.getBoundingClientRect();
        return rect.width === 20 && rect.left >= bounds.left && rect.right <= bounds.right;
      });
    }), '320px 下 Query 和 FormData 的两个复制按钮都在列表内');
    frame.style.width='1200px';
    await new Promise(resolve=>panel.requestAnimationFrame(resolve));
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
    // 1. 并发同地址、同时间戳、不同请求体的 POST 必须全部保留；仅同一事件对象或同 requestId 才去重。
    const beforeConcurrent = rows().length;
    const sameStamp = '2026-11-23T06:00:00.000Z';
    const postA = {
      ...request('https://example.test/concurrent', '{"ok":1}'),
      startedDateTime: sameStamp, time: 20,
      request: { url: 'https://example.test/concurrent', method: 'POST', headers: [], queryString: [], postData: { mimeType: 'application/json', text: '{"page":1}' } },
    };
    const postB = {
      ...request('https://example.test/concurrent', '{"ok":2}'),
      startedDateTime: sameStamp, time: 20,
      request: { url: 'https://example.test/concurrent', method: 'POST', headers: [], queryString: [], postData: { mimeType: 'application/json', text: '{"page":2}' } },
    };
    const withId1 = { ...request('https://example.test/dedupe-id', '{"ok":3}'), _requestId: 'req-same-id' };
    const withId2 = { ...request('https://example.test/dedupe-id', '{"ok":4}'), _requestId: 'req-same-id' };
    panel.addRequest(postA);
    panel.addRequest(postA);
    panel.addRequest(postB);
    panel.addRequest(withId1);
    panel.addRequest(withId2);
    await waitFor(() => rows().length === beforeConcurrent + 3);
    check(rows().length === beforeConcurrent + 3, '并发同地址不同请求体全部保留，仅同一事件对象或同 requestId 去重');
    check([...rows()].filter(row => row.textContent.includes('/concurrent')).every(row => !row.querySelector('.duplicate-warn-badge')),
      '同地址不同请求体的并发 POST 不误报重复请求警告');

    // 1.5 重复请求警告、时间间隔设置与快捷筛选。
    const beforeDup = rows().length;
    const dupBase = Date.now() - 5000;
    const dupIso = offset => new Date(dupBase + offset).toISOString();
    panel.addRequest({
      ...request('https://example.test/dup-check?page=1&_t=101', '{"ok":1}'),
      startedDateTime: dupIso(0),
      request: { url: 'https://example.test/dup-check?page=1&_t=101', method: 'GET', headers: [], queryString: [] },
    });
    panel.addRequest({
      ...request('https://example.test/dup-check?page=1&_t=102', '{"ok":1}'),
      startedDateTime: dupIso(250),
      request: { url: 'https://example.test/dup-check?page=1&_t=102', method: 'GET', headers: [], queryString: [] },
    });
    panel.addRequest({
      ...request('https://example.test/dup-check?page=1&_t=103', '{"ok":1}'),
      startedDateTime: dupIso(1800),
      request: { url: 'https://example.test/dup-check?page=1&_t=103', method: 'GET', headers: [], queryString: [] },
    });
    await waitFor(() => rows().length === beforeDup + 3);
    const dupRows = () => [...rows()].filter(row => row.textContent.includes('/dup-check'));
    check(dupRows().length === 3
      && dupRows()[0].querySelector('.duplicate-warn-badge')?.textContent === '重复 1/2'
      && dupRows()[1].querySelector('.duplicate-warn-badge')?.textContent === '重复 2/2'
      && !dupRows()[2].querySelector('.duplicate-warn-badge'),
      '默认 1000 ms 间隔下，过滤 _t 后为同组重复请求统一标注“重复 1/2、2/2”徽标');
    const dupRowActions = dupRows()[1].querySelector('.row-copy-actions').getBoundingClientRect();
    const dupBadgeRect = dupRows()[1].querySelector('.duplicate-warn-badge').getBoundingClientRect();
    check(dupRowActions.right >= dupBadgeRect.right - 0.5,
      '行内快捷复制按钮右边缘完全覆盖重复徽标，不漏出右侧边框');
    dupRows()[1].click();
    check(dupRows()[0].classList.contains('duplicate-peer') && dupRows()[1].classList.contains('duplicate-peer')
      && !dupRows()[2].classList.contains('duplicate-peer'),
      '选中重复请求时同组其他请求同步高亮便于对照');
    clickFilter('[data-filter="duplicate"]');
    check(rows().length === 2 && rows()[0].querySelector('.duplicate-warn-badge')?.textContent === '重复 1/2'
      && rows()[1].querySelector('.duplicate-warn-badge')?.textContent === '重复 2/2',
      '重复快捷筛选展示同组全部重复请求方便对比');
    clickFilter('[data-filter-reset]');
    const dupToggle = doc.querySelector('#duplicateWarningInput');
    const dupWindow = doc.querySelector('#duplicateWindowMsInput');
    dupWindow.value = '2000';
    dupWindow.dispatchEvent(new panel.Event('input'));
    check(dupRows()[0].querySelector('.duplicate-warn-badge')?.textContent === '重复 1/3'
      && dupRows()[1].querySelector('.duplicate-warn-badge')?.textContent === '重复 2/3'
      && dupRows()[2].querySelector('.duplicate-warn-badge')?.textContent === '重复 3/3'
      && panel.localStorage.getItem('apiCopyDuplicateWindowMs') === '2000',
      '设置中调大重复判定间隔即时更新为 1/3、2/3、3/3 并持久化');
    dupToggle.checked = false;
    dupToggle.dispatchEvent(new panel.Event('change'));
    check(!doc.querySelector('.duplicate-warn-badge') && dupWindow.disabled,
      '关闭重复请求警告后立即清除徽标并禁用间隔输入');
    dupToggle.checked = true;
    dupToggle.dispatchEvent(new panel.Event('change'));
    dupWindow.value = '1000';
    dupWindow.dispatchEvent(new panel.Event('input'));

    // 2. 只有当前选中行的快捷复制按钮进入 Tab 顺序，避免长列表产生大量 Tab 停靠点。
    panel.selectRecord(Number(rows()[0].dataset.recordId));
    const tabbableRowButtons = () => [...doc.querySelectorAll('.row-copy-btn')].filter(button => button.tabIndex >= 0);
    check(tabbableRowButtons().length === 3 && tabbableRowButtons().every(button => button.closest('.request-row').classList.contains('selected')),
      '仅选中行的 3 个快捷复制按钮可 Tab 聚焦');
    pressArrow(doc.querySelector('#requestList'), 'ArrowDown');
    check(tabbableRowButtons().length === 3 && tabbableRowButtons().every(button => button.closest('.request-row').classList.contains('selected')),
      '方向键切换选中行后，Tab 停靠点同步转移到新选中行');
    const selectedRowCopyBtn = tabbableRowButtons()[0];
    selectedRowCopyBtn.focus({ preventScroll: true });
    pressArrow(selectedRowCopyBtn, 'ArrowDown');
    check(doc.activeElement === doc.querySelector('#requestList'),
      '焦点在行内按钮时按方向键切行，焦点收回列表避免旧行继续高亮操作区');

    // 3. 二进制 PNG、异步加载中与接口真实返回占位同名文本各自独立处理。
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const beforeSpecial = rows().length;
    panel.addRequest({
      _resourceType: 'fetch', startedDateTime: new Date().toISOString(), time: 12,
      request: { url: 'https://example.test/download.png', method: 'GET', headers: [], queryString: [] },
      response: { status: 200, statusText: 'OK', headers: [{ name: 'Content-Type', value: 'image/png' }], content: { mimeType: 'image/png' } },
      getContent: done => done(pngBase64, 'base64'),
    });
    let finishPending;
    panel.addRequest({
      _resourceType: 'fetch', startedDateTime: new Date().toISOString(), time: 12,
      request: { url: 'https://example.test/still-loading', method: 'GET', headers: [], queryString: [] },
      response: { status: 200, statusText: 'OK', headers: [], content: { mimeType: 'application/json' } },
      getContent: done => { finishPending = done; },
    });
    panel.addRequest({
      _resourceType: 'fetch', startedDateTime: new Date().toISOString(), time: 12,
      request: { url: 'https://example.test/literal-loading-text', method: 'GET', headers: [], queryString: [] },
      response: { status: 200, statusText: 'OK', headers: [], content: { mimeType: 'text/plain' } },
      getContent: done => done('[正在读取响应内容…]', ''),
    });
    await waitFor(() => rows().length === beforeSpecial + 3);
    rows()[beforeSpecial].click();
    const pngRecord = panel.getSelectedRecord();
    check(pngRecord.responseState === 'binary' && pngRecord.responseBody === ''
      && preview.textContent.includes('二进制响应') && preview.textContent.includes('image/png')
      && panel.formatRecord(pngRecord).includes('Response Body Status: [二进制响应：image/png · 68 B]')
      && !panel.formatRecord(pngRecord).includes('\nResponse:\n'),
      '二进制 PNG 不按 UTF-8 解码成乱码，预览和复制均明确标注二进制状态');
    rows()[beforeSpecial + 1].click();
    const loadingRecord = panel.getSelectedRecord();
    check(loadingRecord.responseState === 'loading' && loadingRecord.responseBody === ''
      && preview.textContent.includes('[正在读取响应内容…]')
      && panel.formatRecord(loadingRecord).includes('Response Body Status: [响应尚未读取完成]')
      && !panel.formatRecord(loadingRecord).includes('[正在读取响应内容…]'),
      '异步读取期间，复制完整请求标注正文状态而非把界面加载文案写入 Response');
    finishPending('{"ready":true}', '');
    await waitFor(() => loadingRecord.responseState === 'ready');
    check(panel.formatRecord(loadingRecord).includes('Response:\n{\n  "ready": true\n}'),
      '异步读取完成后切换为实际正文并正常格式化复制');
    rows()[beforeSpecial + 2].click();
    check(Boolean(preview.querySelector('.preview-raw')) && preview.textContent === '[正在读取响应内容…]'
      && panel.formatRecord(panel.getSelectedRecord()).includes('Response:\n[正在读取响应内容…]'),
      '接口真实返回同名提示文本时仍按真实正文展示和复制');

    // 4. 超大 JSON 未选中时不触发同步解析，选中后按需解析并判定业务失败，切走释放对象树；切业务规则后自动重判；总正文超预算释放旧非选中记录，单条超预算不连带清旧缓存。
    const beforeLarge = rows().length;
    const largePayload = JSON.stringify({ success: true, code: 500, payload: 'x'.repeat(1_200_000) });
    const origLosslessParse = panel.LosslessJSON.parse;
    let largeParseCalls = 0;
    let largeRecord = null;
    panel.LosslessJSON.parse = function (...args) {
      largeParseCalls++;
      return origLosslessParse.apply(this, args);
    };
    try {
      panel.addRequest({
        ...request('https://example.test/large-unselected', largePayload),
        request: { url: 'https://example.test/large-unselected', method: 'GET', headers: [], queryString: [] },
      });
      check(largeParseCalls === 0, '超过 1 MiB 的未选中 JSON 响应不在采集回调中同步解析');
      await waitFor(() => rows().length === beforeLarge + 1);
      const largeRecordId = Number(rows()[rows().length - 1].dataset.recordId);
      const largeRowEl = () => doc.querySelector(`.request-row[data-record-id="${largeRecordId}"]`);
      await waitFor(() => largeRowEl()?.classList.contains('business-failed'));
      check(largeParseCalls === 1, '未选中大 JSON 在后台异步完成业务失败判定');
      panel.selectRecord(largeRecordId);
      largeRecord = panel.getSelectedRecord();
      check(largeParseCalls === 2 && largeRecord.responseJsonParsed && largeRecord.businessState === 'failure',
        '选中大响应后按需解析 JSON 展示，并保持业务失败状态');
      panel.selectRecord(2);
      check(largeRecord.parsedResponseJson === undefined && !largeRecord.responseJsonParsed,
        '切离大响应后释放其解析对象树，避免长期占用内存');
    } finally {
      panel.LosslessJSON.parse = origLosslessParse;
    }

    // 切离大响应后修改业务规则为 success 预设：旧失败标记立即失效，并在后台异步重判为成功，无需重新打开该记录。
    doc.querySelector('#paramFilterBtn').click();
    doc.querySelector('[data-settings-tab="business"]').click();
    ruleRoot.querySelector('[data-rule-preset="success"]').click();
    ruleRoot.querySelector('form').dispatchEvent(new panel.Event('submit', { cancelable: true }));
    const largeRow = () => doc.querySelector(`.request-row[data-record-id="${largeRecord.id}"]`);
    check(largeRecord.businessState === 'unknown' && !largeRow().classList.contains('business-failed'),
      '切换业务规则时立即作废未选中大响应的旧失败标记');
    await waitFor(() => largeRecord.businessState === 'success');
    check(largeRecord.businessState === 'success' && !largeRow().classList.contains('business-failed')
      && largeRecord.parsedResponseJson === undefined,
      '切换业务规则后在后台重判大响应，且不长期保留其解析对象树');
    ruleRoot.querySelector('[data-rule-preset="default"]').click();
    ruleRoot.querySelector('form').dispatchEvent(new panel.Event('submit', { cancelable: true }));
    await waitFor(() => largeRecord.businessState === 'failure');
    doc.querySelector('#settingsCloseBtn').click();

    const bigChunk = 'b'.repeat(6 * 1024 * 1024);
    const budgetStartCount = rows().length;
    for (let i = 0; i < 5; i++) {
      panel.addRequest({
        _resourceType: 'fetch', startedDateTime: new Date().toISOString(), time: 10,
        request: { url: `https://example.test/budget-${i}`, method: 'GET', headers: [], queryString: [] },
        response: { status: 200, statusText: 'OK', headers: [], content: { mimeType: 'text/plain' } },
        getContent: done => done(bigChunk, ''),
      });
    }
    await waitFor(() => rows().length === budgetStartCount + 5);
    check(panel.getSelectedRecord().responseState === 'ready', '触发正文容量淘汰时保留当前选中记录正文');
    rows()[budgetStartCount].click();
    const evictedRecord = panel.getSelectedRecord();
    check(evictedRecord.url === 'https://example.test/budget-0'
      && evictedRecord.responseState === 'evicted' && evictedRecord.responseBody === ''
      && preview.textContent.includes('超出缓存容量已释放')
      && panel.formatRecord(evictedRecord).includes('Response Body Status:'),
      '正文总容量超 24 MiB 预算时优先释放最早非选中记录正文，预览与复制明确标注已释放');
    rows()[budgetStartCount + 4].click();
    check(panel.getSelectedRecord().responseState === 'ready', '预算范围内的最新记录正文保持完整可用');

    // 单条超过 24 MiB 预算的新响应只淘汰自身，不能连带清掉之前已缓存的旧正文。
    panel.selectRecord(2);
    const oversizedChunk = 'z'.repeat(25 * 1024 * 1024);
    const beforeOversized = rows().length;
    panel.addRequest({
      _resourceType: 'fetch', startedDateTime: new Date().toISOString(), time: 10,
      request: { url: 'https://example.test/budget-oversized', method: 'GET', headers: [], queryString: [] },
      response: { status: 200, statusText: 'OK', headers: [], content: { mimeType: 'text/plain' } },
      getContent: done => done(oversizedChunk, ''),
    });
    await waitFor(() => rows().length === beforeOversized + 1);
    rows()[beforeOversized].click();
    check(panel.getSelectedRecord().responseState === 'evicted' && panel.getSelectedRecord().responseBody === '',
      '单条超过 24 MiB 预算的未选中响应直接释放自身正文');
    rows()[budgetStartCount + 3].click();
    const keptOldA = panel.getSelectedRecord().responseState;
    rows()[budgetStartCount + 4].click();
    const keptOldB = panel.getSelectedRecord().responseState;
    check(keptOldA === 'ready' && keptOldB === 'ready',
      '单条超预算响应不会连带清掉已缓存的旧正文');

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
