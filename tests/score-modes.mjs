import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+new URL('../shogi.html',import.meta.url).pathname); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  const R={};
  const B=()=>Array.from({length:9},()=>Array(9).fill(null));
  const mk=(bd,ru,cy,ce)=>JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
    RULES:Object.assign({drops:true,captureAll:false,pointMode:'cell',allowPass:false,banSennichite:false,
      sennichiteMode:'none',jishogiMode:'points',checkPoints:false,capturedPoints:true,drawNoMove:true,
      drawBothEnter:false,nifu:false},ru||{}),
    board:bd, pts:Array.from({length:10},()=>Array(10).fill(null)),
    diag:Array.from({length:9},()=>Array(9).fill(null)),capYou:cy||[],capEnemy:ce||[]});
  const chips=()=>[...document.querySelectorAll('.cap-score')].map(e=>e.textContent);

  // ① 点数は常に出る（点数計算・点数だけ）／引き分け設定では出さない
  {
    document.getElementById('presetSel').value='hon';
    document.getElementById('presetSel').dispatchEvent(new Event('change'));
    document.getElementById('applyPresetBtn').click(); SFX.on=false;
    RULES.jishogiMode='points'; RULES.captureAll=false; RULES.scoreOnly=false; render();
    R['①点数計算のとき']=chips();
    RULES.scoreOnly=true; render(); R['①点数だけがONのとき']=chips();
    RULES.captureAll=true; render(); R['①両方ONのとき']=chips();
    RULES.captureAll=false; RULES.scoreOnly=false;
    RULES.jishogiMode='draw'; RULES.scoreOnly=false; render(); R['①引き分け設定のとき']=chips();
    RULES.jishogiMode='points'; render();
  }
  // ② 出る中身。点数計算＝持将棋点（取った駒こみ）／点数だけ＝盤上の点数
  {
    const bd=B(); bd[8][4]={t:'hK',p:1}; bd[7][1]={t:'hR',p:1};
    bd[0][4]={t:'hK',p:-1}; bd[1][1]={t:'hP',p:-1};
    loadState(mk(bd,{jishogiMode:'points'},['hB'],[])); SFX.on=false;
    R['②点数計算 あなた']={表示:chips()[1], 内訳:'飛5＋取った角5＝10'};
    loadState(mk(bd,{scoreOnly:true},['hB'],[])); SFX.on=false;
    R['②点数だけ あなた']={表示:chips()[1], 内訳:'盤上の飛5だけ'};
  }
  // ③ 点数だけのモードでは王を取っても終わらない
  {
    const bd=B(); bd[8][4]={t:'hK',p:1}; bd[7][4]={t:'hR',p:1};
    bd[0][4]={t:'hK',p:-1}; bd[1][4]={t:'hP',p:-1}; bd[2][8]={t:'hL',p:-1};
    loadState(mk(bd,{captureAll:true,scoreOnly:true})); SFX.on=false; gameOver=false;
    turn=1; applyMoveSilent(1,{fr:7,fc:4,tr:1,tc:4});     // 歩を取る
    R['③歩を取ったところ']={終局:gameOver, 盤上:{あなた:calcPositionScore(1), 相手:calcPositionScore(-1)}};
    turn=1; applyMoveSilent(1,{fr:1,fc:4,tr:0,tc:4});     // 玉を取っても終わらない
    R['③玉を取っても']={終局:gameOver, 相手の盤上:calcPositionScore(-1)};
    turn=1; applyMoveSilent(1,{fr:0,fc:4,tr:2,tc:4});
    turn=1; applyMoveSilent(1,{fr:2,fc:4,tr:2,tc:8});     // 最後の香を取ると相手の点数が0
    R['③最後の駒を取ったら']={終局:gameOver, 相手の盤上:calcPositionScore(-1),
      状態:document.getElementById('status').textContent};
  }
  // ③' 「点数だけで勝負する」だけON＝王を取った時点で終わるが、勝敗は点数で決まる
  {
    const bd=B();
    bd[8][4]={t:'hK',p:1}; bd[7][4]={t:'hR',p:1};              // 先手：飛車5点
    bd[0][4]={t:'hK',p:-1};
    bd[0][0]={t:'hR',p:-1}; bd[0][8]={t:'hB',p:-1};             // 後手：飛車5＋角5＝10点
    loadState(mk(bd,{scoreOnly:true,captureAll:false})); SFX.on=false; gameOver=false;
    turn=1; applyMoveSilent(1,{fr:7,fc:4,tr:0,tc:4});           // 先手が相手の玉を取る
    R["③'点数だけON・王を取った側が点数で負け"]={
      終局:gameOver, 点:{あなた:currentScore(1), 相手:currentScore(-1)},
      状態:document.getElementById('status').textContent};
  }
  // ③'' 同じ形でも「点数だけで勝負する」がOFFなら、王を取った側の勝ち
  {
    const bd=B();
    bd[8][4]={t:'hK',p:1}; bd[7][4]={t:'hR',p:1};
    bd[0][4]={t:'hK',p:-1}; bd[0][0]={t:'hR',p:-1}; bd[0][8]={t:'hB',p:-1};
    loadState(mk(bd,{scoreOnly:false,captureAll:false})); SFX.on=false; gameOver=false;
    turn=1; applyMoveSilent(1,{fr:7,fc:4,tr:0,tc:4});
    R["③''点数だけOFF"]={終局:gameOver, 状態:document.getElementById('status').textContent};
  }
  // ③''' 取り切りONだけ（点数だけOFF）＝王を取っても終わらず、全滅で決着
  {
    const bd=B(); bd[8][4]={t:'hK',p:1}; bd[7][4]={t:'hR',p:1};
    bd[0][4]={t:'hK',p:-1}; bd[1][4]={t:'hP',p:-1}; bd[2][8]={t:'hL',p:-1};
    loadState(mk(bd,{scoreOnly:false,captureAll:true})); SFX.on=false; gameOver=false;
    turn=1; applyMoveSilent(1,{fr:7,fc:4,tr:1,tc:4});
    turn=1; applyMoveSilent(1,{fr:1,fc:4,tr:0,tc:4});
    turn=1; applyMoveSilent(1,{fr:0,fc:4,tr:2,tc:4});
    turn=1; applyMoveSilent(1,{fr:2,fc:4,tr:2,tc:8});
    R["③'''取り切りONだけ"]={終局:gameOver, 相手の盤上:calcPositionScore(-1),
      内訳:'点数は0だが、取り切りは全滅で決着なのでまだ続く'};
  }
  // ⑤ 王手の加点は「点数だけ」モードでは点数に入らない（盤上の点だけを見るため）
  {
    const bd=B(); bd[8][4]={t:'hK',p:1}; bd[7][1]={t:'hR',p:1}; bd[0][4]={t:'hK',p:-1};
    loadState(mk(bd,{scoreOnly:true,checkPoints:true})); SFX.on=false;
    checkCount={1:9,'-1':0};
    R['⑤王手9回ぶんを足すか']={点数だけ:currentScore(1), 内訳:'盤上の飛5のみ＝5'};
    RULES.scoreOnly=false;
    R['⑤点数計算なら']={点:currentScore(1), 内訳:'飛5＋王手9＝14'};
  }
  // ⑥ 古い保存の jishogiMode:'zero' を読み替える
  {
    const bd=B(); bd[8][4]={t:'hK',p:1};
    loadState(JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
      RULES:{jishogiMode:'zero'}, board:bd, pts:Array.from({length:10},()=>Array(10).fill(null)),
      diag:Array.from({length:9},()=>Array(9).fill(null)),capYou:[],capEnemy:[]}));
    R['⑥古い保存の読み替え']={jishogiMode:RULES.jishogiMode, captureAll:RULES.captureAll,
      scoreOnly:RULES.scoreOnly, 選択欄:document.getElementById('rJishogiMode').value,
      選択肢:[...document.getElementById('rJishogiMode').options].map(o=>o.value)};
  }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
