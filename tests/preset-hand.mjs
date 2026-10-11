import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const HTML = (process.argv[2]==='old' && process.env.OLD_HTML) ? process.env.OLD_HTML
                                                              : new URL('../shogi.html',import.meta.url).pathname;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+HTML); await p.waitForTimeout(800);
const out=await p.evaluate(()=>{
  /* 囲碁・オセロは盤に並べるだけでは打つ石が足りない。
     「適用」でも、編集ツールの「プリセット配置」でも同じ数の持ち駒が付くこと。 */
  const R={};
  const cnt=(a,t)=>a.filter(x=>x===t).length;
  // ① 「適用」での持ち駒（今までどおり）
  for(const k of ['go','othello']){
    document.getElementById('presetSel').value=k;
    document.getElementById('presetSel').dispatchEvent(new Event('change'));
    document.getElementById('applyPresetBtn').click(); SFX.on=false;
    R['①適用 '+k]={あなた:capYou.length, 相手:capEnemy.length, 盤:(()=>{let n=0;
      for(let r=0;r<NR;r++)for(let c=0;c<NC;c++) if(board[r][c])n++; return n;})()};
  }
  // ② 編集の「プリセット配置」（空盤から）
  const empty=()=>{ makeEmptyBoard(19,19); capYou.length=0; capEnemy.length=0; ensurePts(); };
  for(const k of ['go','othello']){
    empty(); editSide=1;
    const a=stampPresetSide(k,0,0,1);
    const bside=stampPresetSide(k,0,0,-1);
    R['②プリセット配置 '+k]={あなた側:a, 相手側:bside,
      持ち駒あなた:capYou.length, 持ち駒相手:capEnemy.length};
  }
  // ③ 2回押しても増えすぎない（足りないぶんだけ足す）
  { empty(); stampPresetSide('go',0,0,1); const one=capYou.length;
    stampPresetSide('go',0,0,1); R['③囲碁を2回押す']={'1回目':one, '2回目':capYou.length}; }
  // ④ すでに少し持っているときは足りないぶんだけ
  { empty(); capYou.push('GOB','GOB','GOB'); stampPresetSide('go',0,0,1);
    R['④3個持っているとき']=capYou.length; }
  // ⑤ 他のプリセットには持ち駒を足さない
  { empty(); const r=stampPresetSide('hon',5,0,1);
    R['⑤本将棋']={置いた枚数:r, 持ち駒:capYou.length}; }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
