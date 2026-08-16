import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+new URL('../shogi.html',import.meta.url).pathname); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  const R={};
  const mk=(bd,pts,cy,ce,ru)=>JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
    RULES:Object.assign({drops:true,captureAll:false,pointMode:'point',allowPass:false,
      jishogiMode:'points',checkPoints:false,drawBothEnter:false,banSennichite:false,sennichiteMode:'none'},ru||{}),
    board:bd||Array.from({length:9},()=>Array(9).fill(null)),
    pts:pts||Array.from({length:10},()=>Array(10).fill(null)),
    diag:Array.from({length:9},()=>Array(9).fill(null)),capYou:cy||[],capEnemy:ce||[]});
  const B=()=>Array.from({length:9},()=>Array(9).fill(null));
  const P=()=>Array.from({length:10},()=>Array(10).fill(null));

  // ① 本将棋の点数（王は盤上集計から除外、飛角5・他1）
  {
    const bd=B();
    bd[8][4]={t:'hK',p:1}; bd[7][1]={t:'hR',p:1}; bd[7][7]={t:'hB',p:1};
    for(let c=0;c<9;c++) bd[6][c]={t:'hP',p:1};
    loadState(mk(bd)); SFX.on=false;
    R['①盤上のみ']={点:calcPositionScore(1), 内訳:'飛5+角5+歩9 = 19'};
  }
  // ② 取った駒（王を含む）が加算される
  {
    const bd=B(); bd[8][4]={t:'hK',p:1};
    loadState(mk(bd,null,['hR','hK'],[])); SFX.on=false;
    R['②持ち駒に飛車と王']={点:jishogiPoints(1), 内訳:'盤上0 + 飛5 + 王20 = 25'};
  }
  // ③ 囲碁の領域点
  {
    const pts=P();
    // 左上の3×3(9点)を黒で囲い、右下の2×2(4点)を白で囲う。残りは両方に接するので誰の地でもない
    for(let i=0;i<=3;i++){ pts[3][i]={t:'GOB',p:1}; pts[i][3]={t:'GOB',p:1}; }
    for(let i=7;i<=10;i++){ if(i<=9){ pts[7][i]={t:'GOW',p:-1}; pts[i][7]={t:'GOW',p:-1}; } }
    loadState(mk(null,pts)); SFX.on=false;
    let nb=0,nw=0;
    for(let r=0;r<=NR;r++)for(let c=0;c<=NC;c++){const q=ptsBoard[r][c];
      if(q&&q.t==='GOB')nb++; if(q&&q.t==='GOW')nw++;}
    R['③領域点']={黒石:nb, 白石:nw, 黒の地:goTerritory(1), 白の地:goTerritory(-1),
      黒の合計:calcPositionScore(1), 白の合計:calcPositionScore(-1)};
  }
  // ④ 碁石が無ければ領域点は0
  {
    const bd=B(); bd[4][4]={t:'hP',p:1};
    loadState(mk(bd)); SFX.on=false;
    R['④碁石なし']={領域:goTerritory(1), 合計:calcPositionScore(1)};
  }
  // ⑤ 王手で加点
  {
    const bd=B(); bd[8][4]={t:'hK',p:1}; bd[0][4]={t:'hK',p:-1}; bd[4][4]={t:'hR',p:1};
    loadState(mk(bd,null,[],[],{checkPoints:true})); SFX.on=false;
    const before=jishogiPoints(1);
    turn=1; applyMoveSilent(1,{fr:4,fc:4,tr:1,tc:4,promo:false});   // 王手をかける
    R['⑤王手で加点']={前:before, 後:jishogiPoints(1), 王手回数:checkCount[1]};
  }
  // ⑥ 双方入玉でないときは単純に点数の多い方の勝ち
  {
    const bd=B(); bd[8][4]={t:'hK',p:1}; bd[0][4]={t:'hK',p:-1};
    bd[7][1]={t:'hR',p:1};                     // 先手だけ飛車を持つ
    loadState(mk(bd,null,[],[],{drawBothEnter:false})); SFX.on=false;
    resolveJishogi('テスト');
    R['⑥点数の多い方']={状態:document.getElementById('status').textContent.slice(0,40)};
  }
  // ⑦ 引き分け設定なら点数を見ない
  {
    const bd=B(); bd[8][4]={t:'hK',p:1}; bd[0][4]={t:'hK',p:-1}; bd[7][1]={t:'hR',p:1};
    loadState(mk(bd,null,[],[],{jishogiMode:'draw'})); SFX.on=false;
    resolveJishogi('テスト');
    R['⑦引き分け設定']={状態:document.getElementById('status').textContent.slice(0,30)};
  }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
