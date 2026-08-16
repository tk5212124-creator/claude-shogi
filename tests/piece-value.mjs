import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+new URL('../shogi.html',import.meta.url).pathname); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  const want={
    // 4人チェス
    cP:1, cN:3, cB:5, cR:5, cQ:9, cK:20,
    // 本将棋
    hP:1, hL:1, hN:1, hS:1, hG:1, hB:5, hR:5, hK:20, hKw:20,
    // チャンギ
    JP:2, JPb:2, JA:3, JAb:3, JE:3, JEb:3, JH:5, JHb:5, JC:7, JCb:7, JR:13, JRb:13, JK:20, JKb:20,
    // 囲碁・オセロ
    GOB:1, GOW:1, OTH:1
  };
  const rows=[], bad=[];
  for(const t of Object.keys(want)){
    const pt=pieceValueParts(t);
    if(!pt){ bad.push(t+': 駒が無い'); continue; }
    rows.push({駒:(KANJI[t]||t)+'('+t+')', I:pt.I,S:pt.S,R:pt.R,C:pt.C,N:pt.N,L:pt.L,Q:pt.Q, V:pt.V, 期待:want[t], 一致:pt.V===want[t]});
    if(pt.V!==want[t]) bad.push(t+': '+pt.V+' ≠ '+want[t]);
  }
  return {rows, 不一致:bad};
});
console.log(out.rows.map(r=>`${r.駒.padEnd(16)} I=${r.I} S=${r.S} R=${r.R} C=${r.C} N=${r.N} L=${r.L} Q=${r.Q}  V=${String(r.V).padStart(2)} 期待=${String(r.期待).padStart(2)} ${r.一致?'OK':'★NG'}`).join('\n'));
console.log('\n不一致:', out.不一致.length? out.不一致 : 'なし');
console.log('errs',errs);
await b.close();
