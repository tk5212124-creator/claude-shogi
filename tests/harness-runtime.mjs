// harness.html の自己テスト（Runtime回帰 + Provider契約）をブラウザで実行して結果を読む
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await (await b.newContext({viewport:{width:1100,height:900}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
const URL_='file://'+new URL('../harness.html',import.meta.url).pathname;
await p.goto(URL_);
await p.waitForFunction(()=>window.__selfTest,null,{timeout:30000});
const r=await p.evaluate(()=>window.__selfTest);
console.log(r.lines.join('\n'));
console.log(`\n${r.pass}/${r.total} PASS  SKIP=${r.skip||0}  pageerror=${errs.length}`);
if(errs.length)console.log(errs.join('\n'));
await b.close();
process.exit(r.pass+(r.skip||0)===r.total&&errs.length===0?0:1);
