import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+new URL('../shogi.html',import.meta.url).pathname); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  // 4人チェスの王手加点。royal が複数あると1手で同時に王手を掛けられる。
  //   1つ=1点 ／ 2つ=クイーン1点・それ以外5点 ／ 3つ以上=クイーン5点・それ以外20点
  const R={};
  const B=()=>Array.from({length:9},()=>Array(9).fill(null));
  const mk=(bd)=>JSON.stringify({v:2,NR:9,NC:9,PZ:0,turn:1,youAreSente:true,gameOver:false,
    RULES:{drops:false,captureAll:true,pointMode:'cell',allowPass:false,banSennichite:false,
      sennichiteMode:'none',checkPoints:true,capturedPoints:true,jishogiMode:'points'},
    board:bd, pts:Array.from({length:10},()=>Array(10).fill(null)),
    diag:Array.from({length:9},()=>Array(9).fill(null)),capYou:[],capEnemy:[]});
  // 攻め駒 t を (4,6)→(4,4) と動かし、敵 royal を kings の位置に置いて同時王手を作る
  const run=(t,kings)=>{
    const bd=B();
    bd[8][8]={t:'cK',p:1};
    bd[4][6]={t,p:1};
    for(const [r,c] of kings) bd[r][c]={t:'cK',p:-1};
    loadState(mk(bd)); SFX.on=false; gameOver=false;
    checkCount={1:0,'-1':0};
    turn=1; applyMoveSilent(1,{fr:4,fc:6,tr:4,tc:4});
    return {同時王手:checkInfo(-1).cells.length, 点:checkCount[1]||0};
  };
  R['クイーン系か cQ']=isQueenLike('cQ');
  R['クイーン系か cR']=isQueenLike('cR');
  R['クイーン系か 奔王(Q)']=isQueenLike('Q');
  R['クイーン系か 歩兵(hP)']=isQueenLike('hP');
  R['クイーン系か 包(JC)']=isQueenLike('JC');
  R['①単発 クイーン']=run('cQ',[[4,0]]);
  R['①単発 飛車']=run('cR',[[4,0]]);
  R['②ダブル クイーン']=run('cQ',[[4,0],[0,4]]);
  R['②ダブル クイーン以外(飛車)']=run('cR',[[4,0],[0,4]]);
  R['③トリプル クイーン']=run('cQ',[[4,0],[0,4],[0,0]]);
  R['③トリプル クイーン以外(飛車)']=run('cR',[[4,0],[0,4],[8,4]]);
  R['④王手なし']=run('cR',[[0,0]]);
  // ⑤ 点数に効いているか（ルールOFFなら足さない）
  {
    const bd=B(); bd[8][8]={t:'cK',p:1}; bd[4][6]={t:'cR',p:1};
    bd[4][0]={t:'cK',p:-1}; bd[0][4]={t:'cK',p:-1};
    loadState(mk(bd)); SFX.on=false; gameOver=false; checkCount={1:0,'-1':0};
    turn=1; applyMoveSilent(1,{fr:4,fc:6,tr:4,tc:4});
    const on=jishogiPoints(1);
    RULES.checkPoints=false;
    R['⑤加点ON/OFFの差']={ON:on, OFF:jishogiPoints(1), 差:on-jishogiPoints(1)};
  }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
