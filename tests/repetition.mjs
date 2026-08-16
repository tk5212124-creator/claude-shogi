import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
import fs from 'fs';
const D=new URL('.',import.meta.url).pathname;          // tests/ ディレクトリ
const C=JSON.parse(fs.readFileSync(D+'case273-repetition.json','utf8'));
const FILE = process.argv[2]==='old' ? process.env.OLD_HTML || (D+'old.html') : new URL('../shogi.html',import.meta.url).pathname;
const PLIES = +(process.argv[3]||48);   // ここまで棋譜どおり進めてから、あとはCPUに任せる
const RUNS  = +(process.argv[4]||6);
const START=JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
  RULES:C.RULES, board:C.start.board, pts:C.start.pts, diag:C.start.diag, capYou:[], capEnemy:[]});
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+FILE); await p.waitForTimeout(800);
const out=await p.evaluate(([START,KIFU,PLIES,RUNS])=>{
  const R=[];
  for(let g=0; g<RUNS; g++){
    loadState(START); SFX.on=false; kifu.length=0;
    autoYou=true; autoEnemy=true; paused=false; gameOver=false; speedIdx=3;
    // 報告された棋譜どおりに PLIES 手だけ進める（人間と同じ着手経路）
    for(let i=0;i<PLIES;i++){
      const k=KIFU[i]; turn=k.side;
      applyMoveSilent(k.side,{fr:k.from[0],fc:k.from[1],tr:k.to[0],tc:k.to[1],promo:!!k.promo});
      turn=-k.side;
    }
    const base=kifu.length;
    let t=0,n=0,nodes=0;
    while(!gameOver && kifu.length<base+160){
      const t0=performance.now();
      if(!doAutoMove()) break;
      t+=performance.now()-t0; n++;
      nodes+=(typeof lastSearchNodes==='number'?lastSearchNodes:0);
    }
    // 引き継いだ後の部分だけを見る
    const after=kifu.slice(base);
    let firstCap=null, caps=0;
    after.forEach((k,i)=>{ if(k.cap||(k.xcaps&&k.xcaps.length)||(k.caps&&k.caps.length)){ if(firstCap===null) firstCap=i+1; caps++; }});
    const runOf=(side)=>{
      const mv=after.filter(k=>k.side===side&&k.from&&k.to);
      let run=0,mx=0,worst=null;
      for(let i=1;i<mv.length;i++){
        const a=mv[i-1],c=mv[i];
        if(a.to[0]===c.from[0]&&a.to[1]===c.from[1]&&a.from[0]===c.to[0]&&a.from[1]===c.to[1]){
          run++; if(run>mx){mx=run; worst=c.code+' '+JSON.stringify(c.from)+'⇄'+JSON.stringify(c.to);} }
        else run=0;
      }
      return {mx,worst};
    };
    const s1=runOf(1), s2=runOf(-1);
    R.push({続けた手数:after.length, 終局:gameOver,
      先手の最大連続逆戻り:s1.mx, 先手の中身:s1.worst,
      後手の最大連続逆戻り:s2.mx,
      最初の捕獲:firstCap, 捕獲数:caps,
      平均ms:Math.round(t/Math.max(1,n)*100)/100, 平均nodes:Math.round(nodes/Math.max(1,n))});
  }
  return R;
},[START,C.kifu,PLIES,RUNS]);
const avg=k=>Math.round(out.reduce((s,x)=>s+(x[k]||0),0)/out.length*100)/100;
const mx=k=>Math.max(...out.map(x=>x[k]||0));
console.log(JSON.stringify(out,null,1));
console.log('== まとめ ==', JSON.stringify({
  先手の最大連続逆戻り:{平均:avg('先手の最大連続逆戻り'),最悪:mx('先手の最大連続逆戻り')},
  後手の最大連続逆戻り:{平均:avg('後手の最大連続逆戻り'),最悪:mx('後手の最大連続逆戻り')},
  最初の捕獲:avg('最初の捕獲'), 捕獲数:avg('捕獲数'),
  平均ms:avg('平均ms'), 平均nodes:avg('平均nodes')}));
console.log('errs',errs);
await b.close();
