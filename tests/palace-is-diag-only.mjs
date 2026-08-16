import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const FILE=process.argv[2]==='old' ? (process.env.OLD_HTML||'') : new URL('../shogi.html',import.meta.url).pathname;
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+FILE); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  // 九宮は「宮マス（斜め線）」だけで表す。盤の位置から宮を決める仕組みは持たない。
  // 「九宮をつくる」は押した時点で標準の位置に宮マスを描くだけのボタン。
  const R={};
  const cnt=()=>{let n=0,x=0;for(let r=0;r<NR;r++)for(let c=0;c<NC;c++){const g=getDiag(r,c); if(g){n++; if(g==='x')x++;}} return n+'マス(うち×'+x+')';};
  const apply=(k)=>{document.getElementById('presetSel').value=k;
    document.getElementById('presetSel').dispatchEvent(new Event('change'));
    document.getElementById('applyPresetBtn').click(); SFX.on=false;};
  // 1) シャンチー／チャンギを適用したら宮マスができているか
  apply('xiangqi'); R['1_シャンチー適用後の宮マス']=cnt();
  R['1_仕の動ける先']=(()=>{for(let r=0;r<=NR;r++)for(let c=0;c<=NC;c++){const q=ptsBoard[r]&&ptsBoard[r][c];
    if(q&&q.t==='XA') return moves(ptsBoard,r,c).map(m=>(m[0]+1)+','+(m[1]+1));} return null;})();
  apply('janggi'); R['2_チャンギ適用後の宮マス']=cnt();
  // 3) 手で描いた宮マスが「作成」で消えないか
  apply('hon');
  setDiag(4,4,'x'); setDiag(3,3,'l'); render();
  R['3_手描き直後']=cnt();
  const cs=document.getElementById('colRange'); cs.value='11'; cs.dispatchEvent(new Event('change'));
  document.getElementById('applySizeBtn').click();
  R['3_作成(11列)のあと']=cnt();
  // 4) 「九宮をつくる」ボタンで即描かれるか
  apply('empty');
  R['4_空盤']=cnt();
  document.getElementById('bsMakePalace').click();
  R['4_ボタンを押した後']=cnt();
  R['4_ラベル']=document.getElementById('bsPalaceSize').textContent;
  // 5) 「宮マスを全部消す」
  document.getElementById('bsClearPalace').click();
  R['5_全部消した後']=cnt();
  // 6) 古い保存データ（palace:true が入っている）を読み込めるか
  const old={v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
    RULES:{drops:true,palace:true,pointMode:'auto',captureAll:false,banSennichite:true},
    board:Array.from({length:9},()=>Array(9).fill(null)),
    pts:Array.from({length:10},()=>Array(10).fill(null)),
    diag:(()=>{const d=Array.from({length:9},()=>Array(9).fill(null)); d[7][4]='x'; d[6][3]='l'; return d;})(),
    capYou:[],capEnemy:[]};
  loadState(JSON.stringify(old));
  R['6_古い保存を読み込んだ後の宮マス']=cnt();
  R['6_RULESにpalaceが残っているか']=('palace' in RULES);
  return R;
});
console.log('--- '+(process.argv[2]||'new')+' ---');
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
