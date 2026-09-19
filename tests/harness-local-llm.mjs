// harness.html を実際のブラウザで動かし、OpenAI互換のローカルサーバ（Ollama相当）に本物のHTTPで繋いで
// streaming / usage / 実推論中のcancel（サーバ側で切断を観測）まで確認する。
import http from 'node:http';
import { readFileSync } from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;

const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const TOKENS=['ローカル','LLM','が','ブラウザ','から','動いた','。'];
const FULL=TOKENS.join('');
const llm={requests:0,aborted:0,finished:0,lastBody:null};

// ---- 疑似ローカルLLM（OpenAI互換・SSE・1tokenずつ遅延送出） ----
const llmSrv=http.createServer(async (req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,CORS);return res.end();}
  if(req.url.endsWith('/models')){
    res.writeHead(200,{...CORS,'Content-Type':'application/json'});
    return res.end(JSON.stringify({data:[{id:'test-model',object:'model'}]}));
  }
  if(!req.url.endsWith('/chat/completions')){res.writeHead(404,CORS);return res.end('no');}
  const body=await new Promise(r=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>r(b));});
  llm.requests++;llm.lastBody=JSON.parse(body);
  res.writeHead(200,{...CORS,'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
  let stopped=false;
  res.on('close',()=>{if(!stopped){stopped=true;llm.aborted++;}});   // クライアント切断＝decode中の停止
  for(const t of TOKENS){
    if(stopped)return;
    res.write(`data: ${JSON.stringify({choices:[{delta:{content:t}}]})}\n\n`);
    await new Promise(r=>setTimeout(r,120));
  }
  if(stopped)return;
  res.write(`data: ${JSON.stringify({choices:[],usage:{prompt_tokens:17,completion_tokens:TOKENS.length}})}\n\n`);
  res.write('data: [DONE]\n\n');
  stopped=true;llm.finished++;res.end();
});
// ---- harness.html を http で配信（file:// ではCORSが面倒なため） ----
const html=readFileSync(new URL('../harness.html',import.meta.url));
const pageSrv=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
await new Promise(r=>llmSrv.listen(0,'127.0.0.1',r));
await new Promise(r=>pageSrv.listen(0,'127.0.0.1',r));
const LLM=`http://127.0.0.1:${llmSrv.address().port}/v1`;
const PAGE=`http://127.0.0.1:${pageSrv.address().port}/harness.html`;

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await (await b.newContext({viewport:{width:1100,height:1000}})).newPage();
const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.goto(PAGE);
await p.waitForFunction(()=>window.__selfTest,null,{timeout:30000});

const R={};
const st=()=>p.textContent('#stateline');

// ① Provider を openai_local にして実サーバへ接続確認
await p.click('#adapterSeg button[data-ad="openai_local"]');
await p.fill('#endpoint',LLM);
await p.fill('#model','test-model');
await p.click('#probe');
await p.waitForFunction(()=>document.querySelector('#provState').textContent.trim()==='ready',null,{timeout:10000});
R['① 接続/モデルロード']=await p.textContent('#provState');

// ② ローカル直列Harnessを実サーバで完走
await p.click('#exSeg button[data-ex="exL1"]');
await p.click('#writeSpec');
R['② Specのproviders.local']=await p.evaluate(()=>JSON.parse(document.querySelector('#spec').value).providers.local);
await p.click('#run');
await p.waitForFunction(()=>/^state: success/.test(document.querySelector('#stateline').textContent),null,{timeout:20000});
R['③ state']=(await st()).slice(0,60);
R['③ ストリーミング表示']=(await p.textContent('#stream')).replace(/\s+/g,' ').trim();
R['③ result']=await p.evaluate(()=>{const m=document.querySelector('#stateline').textContent.match(/result=(.*)$/);return m?m[1]:null;});
R['③ 使用量']=(await p.textContent('#totals')).replace(/\s+/g,' ').trim();
R['③ ノード表']=await p.$$eval('#nodeTable tbody tr',rs=>rs.map(r=>[...r.children].map(c=>c.textContent).join(' | ')));
R['③ サーバが受けたprompt']=llm.lastBody.messages;
R['③ サーバ側 stream/max_tokens']={stream:llm.lastBody.stream,max_tokens:llm.lastBody.max_tokens,temperature:llm.lastBody.temperature};

// ④ 実推論中に Cancel → サーバ側で切断が観測されること
await p.click('#reset');
await p.click('#run');
await p.waitForFunction(()=>document.querySelector('#stream').textContent.length>3,null,{timeout:10000});
await p.click('#cancel');
await p.waitForFunction(()=>/^state: cancelled/.test(document.querySelector('#stateline').textContent),null,{timeout:10000});
await new Promise(r=>setTimeout(r,300));
R['④ state']=(await st()).slice(0,40);
R['④ サーバ: 完走/中断']={requests:llm.requests,finished:llm.finished,aborted:llm.aborted};
R['④ 部分出力はdata-flowに載らない']=await p.evaluate(()=>{
  const nodes=[...document.querySelectorAll('#nodeTable tbody tr')].map(r=>r.children[0].textContent+':'+r.children[1].textContent);
  return nodes;
});

// ⑤ モデル名を存在しないものに変えたら MODEL_LOAD_FAILED
await p.fill('#model','no-such-model');
await p.click('#probe');
await p.waitForFunction(()=>document.querySelector('#provState').textContent.trim()==='error',null,{timeout:10000});
R['⑤ 未取得モデル']=(await p.textContent('#log')).split('\n').filter(l=>l.includes('MODEL_LOAD_FAILED')).slice(-1)[0]||'(なし)';

R['pageerror']=errs;
for(const [k,v] of Object.entries(R))console.log(k+': '+(typeof v==='string'?v:JSON.stringify(v,null,1)));

const okAll=
  R['① 接続/モデルロード'].trim()==='ready' &&
  R['③ state'].startsWith('state: success') &&
  R['③ result'].includes(FULL) &&
  R['③ 使用量'].includes('in tokens 17') &&
  R['④ state'].startsWith('state: cancelled') &&
  llm.aborted===1 && llm.finished===1 &&
  R['④ 部分出力はdata-flowに載らない'].some(x=>x.startsWith('write:cancelled')) &&
  !R['④ 部分出力はdata-flowに載らない'].some(x=>x.startsWith('out:')) &&
  R['⑤ 未取得モデル'].includes('MODEL_LOAD_FAILED') &&
  errs.length===0;
console.log('\n'+(okAll?'ALL PASS':'FAIL'));
await b.close();llmSrv.close();pageSrv.close();
process.exit(okAll?0:1);
