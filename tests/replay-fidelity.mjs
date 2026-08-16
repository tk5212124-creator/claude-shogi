import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
import fs from 'fs';
const D=new URL('.',import.meta.url).pathname;          // tests/ ディレクトリ
const C=JSON.parse(fs.readFileSync(D+'case273-repetition.json','utf8'));
const START=JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
  RULES:C.RULES, board:C.start.board, pts:C.start.pts, diag:C.start.diag, capYou:[], capEnemy:[]});
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+new URL('../shogi.html',import.meta.url).pathname); await p.waitForTimeout(800);
const out=await p.evaluate(([START,KIFU,FINAL])=>{
  loadState(START); SFX.on=false; kifu.length=0; gameOver=false;
  for(const k of KIFU){ turn=k.side;
    applyMoveSilent(k.side,{fr:k.from[0],fc:k.from[1],tr:k.to[0],tc:k.to[1],promo:!!k.promo});
    turn=-k.side; }
  const cur=board.map(r=>r.map(x=>x?x.t+':'+x.p:null));
  const want=FINAL.map(r=>r.map(x=>x?x.t+':'+x.p:null));
  const diff=[];
  for(let r=0;r<9;r++)for(let c=0;c<9;c++) if(cur[r][c]!==want[r][c])
    diff.push({行:r+1,列:c+1,再生:cur[r][c],報告:want[r][c]});
  return {手数:kifu.length, 一致:diff.length===0, 食い違い:diff,
    持ち駒あなた:capYou.slice(), 持ち駒相手:capEnemy.slice(), 対局終了:gameOver};
},[START,C.kifu,C.board]);
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
