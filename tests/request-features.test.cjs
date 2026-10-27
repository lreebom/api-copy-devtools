// 纯逻辑回归：不访问网络、不执行真实 cURL 请求，使用 shell 参数回显验证引用边界。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const os = require('node:os');

const context = { LosslessJSON: require('../vendor/lossless-json.js'), URLSearchParams };
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

test.after(() => fs.rmSync(temporary,{recursive:true,force:true}));
