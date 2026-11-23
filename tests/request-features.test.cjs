// 纯逻辑回归：不访问网络、不执行真实 cURL 请求，使用 shell 参数回显验证引用边界。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const os = require('node:os');

const context = { LosslessJSON: require('../vendor/lossless-json.js'), URLSearchParams, atob, TextDecoder };
vm.createContext(context);
for (const file of ['json', 'request-data', 'request-filters', 'business-rules']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file + '.js'), 'utf8'), context);
}
const data = context.ApiCopyRequestData;
const rules = context.ApiCopyBusinessRules;
const filters = context.ApiCopyRequestFilters;
const json = text => context.ApiCopyJson.parseJsonText(text);
const settings = { method:'all', httpFailure:false, businessFailure:false, slow:false, slowMs:1000 };
const record = { method:'GET', status:200, time:1500, businessState:'success' };

test('默认业务规则和无损数值状态码保持正确', () => {
  for (const text of ['{"code":200.0}', '{"code":2e2}', '{"isSuccess":"TRUE","code":0}']) {
    assert.equal(rules.evaluate(json(text), rules.defaults()).state, 'success');
  }
  assert.equal(rules.evaluate(json('{"isSuccess":false,"code":200}'), rules.defaults()).state, 'failure');
  assert.equal(rules.evaluate(json('{"value":1}'), rules.defaults()).state, 'unknown');
  assert.equal(rules.evaluate(json('{"code":2090730954778415427}'), rules.defaults()).reason, 'code=2090730954778415427');
});

test('自定义嵌套字段、成功值、缺失字段与关闭业务识别', () => {
  const custom = rules.validate({ enabled:true, flagPath:'data.ok',flagValue:'1', codePath:'data.status',successCodes:'SUCCESS, 201, SUCCESS' }).value;
  assert.equal(custom.successCodes.length, 2);
  assert.equal(rules.evaluate(json('{"data":{"ok":1,"status":"SUCCESS"}}'), custom).state, 'success');
  assert.equal(rules.evaluate(json('{"data":{"ok":0,"status":"SUCCESS"}}'), custom).state, 'failure');
  assert.equal(rules.evaluate(json('{"code":500}'), custom).state, 'unknown');
  assert.equal(rules.evaluate(json('{"data":{"ok":0}}'), { ...custom, enabled:false }).state, 'unknown');
  assert.equal(rules.evaluate(json('{"constructor":{"code":201}}'), { ...custom, flagPath:'',codePath:'constructor.code' }).state, 'success');
  assert.equal(rules.evaluate({}, { ...custom,flagPath:'toString',codePath:'' }).state, 'unknown');
});

test('规则验证拒绝表达式、空检查和无成功值', () => {
  for (const flagPath of ['data..ok','data[0]','data.ok()',' data .ok']) {
    // 字段是路径，不是可执行表达式；括号不能冒充访问语法。
    assert.equal(rules.validate({ ...rules.defaults(), flagPath }).error, 'businessRuleInvalidPath');
  }
  assert.equal(rules.validate({ ...rules.defaults(),flagPath:'',codePath:'' }).error,'businessRuleIncomplete');
  assert.equal(rules.validate({ ...rules.defaults(),flagValue:'' }).error,'businessRuleIncomplete');
  assert.equal(rules.validate({ ...rules.defaults(),successCodes:[] }).error,'businessRuleIncomplete');
  assert.equal(rules.validate({ ...rules.defaults(),enabled:false,flagPath:'data..bad' }).value.enabled,false);
});

test('业务预设识别 success 失败且不猜测 errorCode 约定', () => {
  const presets = rules.presets();
  assert.equal(presets.length, 3);
  for (const preset of presets) assert.ok(rules.validate(preset.rules).value);
  const success = presets.find(item => item.id === 'success').rules;
  assert.equal(rules.evaluate(json('{"success":false,"errorCode":"11021"}'), success).state, 'failure');
  assert.equal(rules.evaluate(json('{"success":true,"errorCode":"OK"}'), success).state, 'success');
  assert.equal(rules.evaluate(json('{"errorCode":"11021"}'), success).state, 'unknown');
  const code = presets.find(item => item.id === 'code').rules;
  assert.equal(rules.evaluate(json('{"code":0}'), code).state, 'success');
  assert.equal(rules.evaluate(json('{"code":400}'), code).state, 'failure');
  success.flagPath='changed';
  assert.equal(rules.presets().find(item => item.id === 'success').rules.flagPath, 'success');
});

test('方法、两类失败取并集，慢请求与其他条件取交集', () => {
  assert.equal(filters.matches(record,{...settings,method:'GET'}),true);
  assert.equal(filters.matches(record,{...settings,method:'POST'}),false);
  assert.equal(filters.matches({...record,method:'PATCH'},{...settings,method:'other'}),true);
  assert.equal(filters.matches({...record,status:500},{...settings,httpFailure:true}),true);
  assert.equal(filters.matches({...record,status:0},{...settings,httpFailure:true}),true);
  assert.equal(filters.matches({...record,businessState:'failure'},{...settings,httpFailure:true,businessFailure:true}),true);
  assert.equal(filters.matches(record,{...settings,httpFailure:true,businessFailure:true}),false);
  assert.equal(filters.matches({...record,status:500,time:100},{...settings,httpFailure:true,slow:true}),false);
  assert.equal(filters.matches(record,{...settings,slow:true}),true);
  assert.equal(filters.matches({...record,time:null},{...settings,slow:true}),false);
});

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'api-copy-curl-test-'));
const echoArgs = path.join(temporary, 'echo-args.cjs');
fs.writeFileSync(echoArgs, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
function curlArgs(record) {
  const command = data.formatCurl(record);
  const script = 'curl() { "$API_COPY_TEST_NODE" "$API_COPY_TEST_ECHO" "$@"; };\n' + command;
  return JSON.parse(execFileSync('/bin/sh', ['-c', script], {
    encoding:'utf8', env:{ ...process.env,API_COPY_TEST_NODE:process.execPath,API_COPY_TEST_ECHO:echoArgs },
  }));
}
function option(args,name) { return args[args.indexOf(name)+1]; }

test('cURL 引用特殊字符，保留完整 URL、凭证和原始 JSON，排除传输头', () => {
  const url = "https://example.test/path?tag=a&tag=b&_t=1&literal='\n$(echo unsafe)";
  const body = '{"id":2090730954778415427,"text":"quote\' and \\n `literal`"}';
  const args = curlArgs({method:'POST',url,requestHeaders:[
    {name:':authority',value:'example.test'}, {name:'Host',value:'example.test'},
    {name:'Content-Length',value:'99'}, {name:'Accept-Encoding',value:'gzip'},
    {name:'Authorization',value:"Bearer example'$(echo not-run)"},
  ],postData:{mimeType:'application/json',text:body}});
  assert.equal(option(args,'--url'),url);
  assert.equal(option(args,'--data-raw'),body);
  assert(args.includes("Authorization: Bearer example'$(echo not-run)"));
  assert(!args.some(x=>/^(Host|Content-Length|Accept-Encoding|:authority):/i.test(x)));
  assert(args.includes('Content-Type: application/json'));
});

test('cURL 的 URL 编码表单和重复字段保持完整，HEAD 使用 --head', () => {
  const args = curlArgs({method:'POST',url:'https://example.test/',postData:{mimeType:'application/x-www-form-urlencoded',params:[{name:'tag',value:'a'},{name:'tag',value:'b'},{name:'text',value:'C++ 中文'}]}});
  assert.equal(option(args,'--data-raw'),'tag=a&tag=b&text=C%2B%2B+%E4%B8%AD%E6%96%87');
  assert(curlArgs({method:'HEAD',url:'https://example.test/'}).includes('--head'));
});

test('仅有 HAR params 时，表单和 cURL 都保留字面百分号', () => {
  const params = [{ name: 'note%2F', value: '%2F' }, { name: 'note%2F', value: 'C++' }];
  for (const mimeType of [undefined, 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=demo']) {
    const request = { method: 'POST', url: 'https://example.test/', postData: { mimeType, params } };
    assert.equal(data.getRequestBody(request), 'note%2F: %2F\nnote%2F: C++');
    const args = curlArgs(request);
    if (mimeType?.startsWith('multipart/form-data')) {
      assert.deepEqual(args.filter((_, index) => args[index - 1] === '--form-string'), ['note%2F=%2F', 'note%2F=C++']);
    } else {
      const body = option(args, '--data-raw');
      assert.deepEqual([...new URLSearchParams(body)], [['note%2F', '%2F'], ['note%2F', 'C++']]);
    }
  }
});

test('cURL multipart 文本不读取本地文件，文件使用可替换路径且不复用旧 boundary', () => {
  const request = {method:'POST',url:'https://example.test/upload',requestHeaders:[{name:'Content-Type',value:'multipart/form-data; boundary=old'}],
    postData:{mimeType:'multipart/form-data; boundary=old',params:[
      {name:'tag',value:'@literal;type=text/plain'},{name:'tag',value:'<literal'},
      {name:'file',fileName:'demo; "quoted".pdf',contentType:'application/pdf'},
    ]}};
  const args = curlArgs(request);
  assert(args.includes('tag=@literal;type=text/plain'));
  assert(args.includes('tag=<literal'));
  assert.equal(args.filter(x=>x==='--form-string').length,2);
  assert(args.includes('--form'));
  assert(!args.some(x=>x.includes('boundary=old')));
  assert.equal(option(args,'--form'), String.raw`file=@"/path/to/demo; \"quoted\".pdf";filename="demo; \"quoted\".pdf";type=application/pdf`);
  assert(data.formatCurl(request).startsWith('# Replace /path/to/'));
  // 某些 HAR 提供空 params 和完整原文，不能把空数组当作已有解析结果。
  const rawForm = {method:'POST',url:request.url,postData:{mimeType:'multipart/form-data; boundary=sample',params:[],
    text:'--sample\r\nContent-Disposition: form-data; name="title"\r\n\r\n中文+文本\r\n--sample--\r\n'}};
  assert.equal(option(curlArgs(rawForm),'--form-string'),'title=中文+文本');
});

test('multipart 仅在完整分隔行切分，保留字段内的 boundary 和换行', () => {
  const value = 'hello--demo.boundary+1-world\r\n--demo.boundary+1suffix\r\n';
  const text = [
    'preamble',
    '--demo.boundary+1',
    'Content-Disposition: form-data; name="note"',
    '',
    value,
    '--demo.boundary+1',
    'Content-Disposition: form-data; name="note"',
    '',
    '',
    '--demo.boundary+1--',
    'epilogue',
  ].join('\r\n');
  const request = {
    method: 'POST',
    url: 'https://example.test/',
    postData: { mimeType: 'multipart/form-data; boundary = "demo.boundary+1"', text },
  };
  assert.equal(data.getRequestBody(request), 'note: ' + value + '\nnote: ');
  const args = curlArgs(request);
  assert(args.includes('note=' + value));
  assert(args.includes('note='));
});

test('multipart 缺少 boundary 或结束分隔线时，复制保留原始正文', () => {
  const text = '--demo\r\nContent-Disposition: form-data; name="note"\r\n\r\nhello';
  for (const mimeType of ['multipart/form-data', 'multipart/form-data; boundary=demo']) {
    const request = { method: 'POST', url: 'https://example.test/', postData: { mimeType, text } };
    assert.equal(data.getFormDataItems(request), null);
    assert.equal(data.getRequestBody(request), text);
    const args = curlArgs(request);
    assert(args.includes('Content-Type: ' + mimeType));
    assert.equal(option(args, '--data-raw'), text);
  }
});

test('getRequestBody 对表单输出解码键值与文件元数据，并保留无损 JSON 精度', () => {
  const urlEncoded = {
    postData: {
      mimeType: 'application/x-www-form-urlencoded',
      text: 'tag=a&tag=b&name=%E4%B8%AD%E6%96%87&literal=%2520',
      params: [{ name: 'fallback', value: 'ignored' }],
    },
  };
  assert.equal(data.getRequestBody(urlEncoded), 'tag: a\ntag: b\nname: 中文\nliteral: %20');

  const multipart = {
    postData: {
      mimeType: 'multipart/form-data; boundary=x',
      params: [
        { name: 'projectId', value: 'demo-1025' },
        { name: 'attachment', fileName: '需求说明.pdf', contentType: 'application/pdf', fileSize: 248576 },
      ],
    },
  };
  assert.equal(data.getRequestBody(multipart), 'projectId: demo-1025\nattachment: 需求说明.pdf · application/pdf · 242.8 KB');
  assert.equal(data.getRequestBody({ postData: { mimeType: 'multipart/form-data; boundary=x', params: [] } }), '');

  const paramsOnly = {
    postData: { params: [{ name: 'tag', value: 'a' }, { name: 'tag', value: 'b' }] },
  };
  assert.equal(data.getFormDataItems(paramsOnly)?.length, 2);
  assert.equal(data.getRequestBody(paramsOnly), 'tag: a\ntag: b');

  const losslessJson = {
    postData: { mimeType: 'application/json', text: '{"id":2090730954778415427}' },
  };
  assert.equal(data.getRequestBody(losslessJson), '{\n  "id": 2090730954778415427\n}');
});

test('copyableJsonPair 按字段名: 字段值格式输出，保持无损数字和对象缩进', () => {
  const { copyableJsonPair } = context.ApiCopyJson;
  const parsed = json('{"functionId":1123,"bigId":2090730954778415427,"name":"demo","ok":true,"empty":null,"nested":{"a":1}}');
  assert.equal(copyableJsonPair('functionId', parsed.functionId), 'functionId: 1123');
  assert.equal(copyableJsonPair('bigId', parsed.bigId), 'bigId: 2090730954778415427');
  assert.equal(copyableJsonPair('name', parsed.name), 'name: demo');
  assert.equal(copyableJsonPair('ok', parsed.ok), 'ok: true');
  assert.equal(copyableJsonPair('empty', parsed.empty), 'empty: null');
  assert.equal(copyableJsonPair('nested', parsed.nested), 'nested: {\n  "a": 1\n}');
});

test('格式化响应复用已解析的 JSON，保留精度和纯文本原样', () => {
  const body = ' {"id":2090730954778415427} ';
  const parsed = json(body);
  const originalJson = context.LosslessJSON;
  let parseCalls = 0;
  context.LosslessJSON = {
    ...originalJson,
    parse(...args) {
      parseCalls++;
      return originalJson.parse(...args);
    },
  };
  try {
    assert.equal(data.tryPretty(body, 'application/json', parsed), '{\n  "id": 2090730954778415427\n}');
    assert.equal(data.tryPretty(' null ', 'application/json', null), 'null');
    assert.equal(data.tryPretty(' false ', 'text/plain', false), ' false ');
    assert.equal(parseCalls, 0);
  } finally {
    context.LosslessJSON = originalJson;
  }
});

test('decodeResponseContent 区分可读文本、二进制、空正文与坏 Base64', () => {
  // 1x1 透明 PNG 的 Base64 数据。
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const pngTyped = data.decodeResponseContent(pngBase64, 'base64', 'image/png');
  assert.equal(pngTyped.state, 'binary');
  assert.equal(pngTyped.text, '');
  assert.equal(pngTyped.byteLength, 68);

  // 未标明 MIME 的 PNG 字节流也通过严格 UTF-8 校验归类为二进制，不解码成乱码。
  const pngUntyped = data.decodeResponseContent(pngBase64, 'base64', '');
  assert.equal(pngUntyped.state, 'binary');
  assert.equal(pngUntyped.text, '');
  assert.equal(pngUntyped.byteLength, 68);

  const utf8JsonBase64 = Buffer.from('{"msg":"中文成功"}', 'utf8').toString('base64');
  const utf8Decoded = data.decodeResponseContent(utf8JsonBase64, 'base64', 'application/json');
  assert.equal(utf8Decoded.state, 'ready');
  assert.equal(utf8Decoded.text, '{"msg":"中文成功"}');

  const svgBase64 = Buffer.from('<svg></svg>', 'utf8').toString('base64');
  assert.equal(data.decodeResponseContent(svgBase64, 'base64', 'image/svg+xml').state, 'ready');

  assert.equal(data.decodeResponseContent('not-valid-base64!!!', 'base64', 'text/plain').state, 'decode_error');
  assert.equal(data.decodeResponseContent('', '', 'application/json').state, 'empty');
  assert.deepEqual({ ...data.decodeResponseContent('[正在读取响应内容…]', '', 'text/plain') }, {
    state: 'ready', text: '[正在读取响应内容…]', byteLength: Buffer.byteLength('[正在读取响应内容…]', 'utf8'),
  });
  const emojiText = '中文😀';
  const emojiPlain = data.decodeResponseContent(emojiText, '', 'text/plain');
  const emojiBase64 = data.decodeResponseContent(Buffer.from(emojiText, 'utf8').toString('base64'), 'base64', 'text/plain');
  assert.equal(emojiPlain.byteLength, 10);
  assert.equal(emojiBase64.byteLength, 10);
  assert.equal(data.decodeResponseContent('abc\0def', '', '').state, 'binary');
});

test('markDuplicateRequests 按方法、过滤 URL 和请求体在时间窗口内识别重复请求', () => {
  const base = Date.parse('2026-11-23T08:00:00.000Z');
  const iso = offset => new Date(base + offset).toISOString();
  const stripT = url => url.replace(/[?&]_t=[^&]+/, '');
  const list = [
    { id: 1, method: 'GET', url: 'https://example.test/list?_t=1', startedDateTime: iso(0) },
    { id: 2, method: 'GET', url: 'https://example.test/list?_t=2', startedDateTime: iso(120) },
    { id: 3, method: 'GET', url: 'https://example.test/list?_t=3', startedDateTime: iso(500) },
    { id: 4, method: 'GET', url: 'https://example.test/list?_t=4', startedDateTime: iso(2200) },
    { id: 5, method: 'POST', url: 'https://example.test/q', startedDateTime: iso(0), postData: { mimeType: 'application/json', text: '{"page":1}' } },
    { id: 6, method: 'POST', url: 'https://example.test/q', startedDateTime: iso(80), postData: { mimeType: 'application/json', text: '{"page":2}' } },
    { id: 7, method: 'POST', url: 'https://example.test/q', startedDateTime: iso(150), postData: { mimeType: 'application/json', text: '{"page":1}' } },
  ];
  data.markDuplicateRequests(list, { enabled: true, windowMs: 1000, getFilteredUrl: stripT });
  assert.equal(list[0].duplicateOfId, null);
  assert.equal(list[0].duplicateIndex, 1);
  assert.equal(list[0].duplicateTotal, 3);
  assert.equal(list[1].duplicateOfId, 1);
  assert.equal(list[1].duplicateGroupId, list[0].duplicateGroupId);
  assert.equal(list[1].duplicateGapMs, 120);
  assert.equal(list[1].duplicateIndex, 2);
  assert.equal(list[1].duplicateTotal, 3);
  assert.equal(list[2].duplicateOfId, 2);
  assert.equal(list[2].duplicateIndex, 3);
  assert.equal(list[2].duplicateTotal, 3);
  assert.equal(list[3].duplicateTotal, 1);
  assert.equal(list[4].duplicateIndex, 1);
  assert.equal(list[4].duplicateTotal, 2);
  assert.equal(list[5].duplicateTotal, 1);
  assert.equal(list[6].duplicateOfId, 5);
  assert.equal(list[6].duplicateGapMs, 150);
  assert.equal(list[6].duplicateIndex, 2);
  assert.equal(list[6].duplicateTotal, 2);

  // 快捷筛选支持按重复请求过滤，同组全部请求均命中以便对照查看。
  assert.equal(filters.matches(list[0], { ...settings, duplicate: true }), true);
  assert.equal(filters.matches(list[1], { ...settings, duplicate: true }), true);
  assert.equal(filters.matches(list[3], { ...settings, duplicate: true }), false);

  // 关闭检测时清空全部重复标记。
  data.markDuplicateRequests(list, { enabled: false, windowMs: 1000, getFilteredUrl: stripT });
  assert.equal(list.some(item => item.duplicateTotal > 1), false);
});

test.after(() => fs.rmSync(temporary,{recursive:true,force:true}));
