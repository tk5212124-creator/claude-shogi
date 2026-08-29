import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const HTML = (process.argv[2]==='old' && process.env.OLD_HTML) ? process.env.OLD_HTML
                                                              : new URL('../shogi.html',import.meta.url).pathname;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+HTML); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  /* ふつうの「王を取ったら終わり」は盤上から royal がぜんぶ消えたときなので、
     王が複数居るときは残りが居るあいだ続く。
     ルール「王を1枚でも取った時点で終わる」（endOnRoyalCapture）はその1枚目で終わらせる。 */
  const R={};
  const B=()=>Array.from({length:9},()=>Array(9).fill(null));
  const P=()=>Array.from({length:10},()=>Array(10).fill(null));
  const D=()=>Array.from({length:9},()=>Array(9).fill(null));
  const mk=(bd,ru,pts,dg)=>JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
    RULES:Object.assign({drops:true,captureAll:false,endByScore:false,endOnRoyalCapture:false,scoreOnly:false,
      pointMode:'auto',allowPass:false,banSennichite:false,sennichiteMode:'none',
      jishogiMode:'points',checkPoints:false,capturedPoints:true,nifu:false,palaceEscape:false},ru||{}),
    board:bd,pts:pts||P(),diag:dg||D(),capYou:[],capEnemy:[]});
  const st=()=>document.getElementById('status').textContent;

  // 王が2枚（玉将＋太子）ある盤。1枚目を取ったところで終わるかどうかを見る
  const two=()=>{ const bd=B();
    bd[8][4]={t:'hK',p:1};                       // 自分の玉将
    bd[0][4]={t:'hKw',p:-1}; bd[0][0]={t:'hK',p:-1};   // 相手は王将と玉将の2枚
    bd[1][4]={t:'hR',p:1};                       // すぐ上の飛車で1枚目を取れる
    return bd; };

  // ① 既定（OFF）＝1枚取っても続く。2枚目を取ったところで終わる
  {
    loadState(mk(two())); SFX.on=false; gameOver=false;
    turn=1; applyMoveSilent(1,{fr:1,fc:4,tr:0,tc:4});           // 王将を取る
    R['①1枚目を取ったあと']={終局:gameOver, 盤に残る相手の王:countRoyalsOnBoard(-1), 状態:st()};
    turn=1; applyMoveSilent(1,{fr:0,fc:4,tr:0,tc:0});           // 残る玉将も取る
    R['①2枚目を取ったあと']={終局:gameOver, 状態:st()};
  }
  // ② ONなら1枚目で終わる
  {
    loadState(mk(two(),{endOnRoyalCapture:true})); SFX.on=false; gameOver=false;
    turn=1; applyMoveSilent(1,{fr:1,fc:4,tr:0,tc:4});
    R['②1枚目を取ったあと']={終局:gameOver, 盤に残る相手の王:countRoyalsOnBoard(-1), 状態:st()};
  }
  // ③ 「取り切るまで」「点数がなくなるまで」がONでも、この設定は別条件として効く
  {
    for(const ru of [{captureAll:true},{endByScore:true},{captureAll:true,endByScore:true}]){
      const key='③'+Object.keys(ru).join('＋');
      loadState(mk(two(),Object.assign({endOnRoyalCapture:false},ru))); SFX.on=false; gameOver=false;
      turn=1; applyMoveSilent(1,{fr:1,fc:4,tr:0,tc:4});
      const off=gameOver;
      loadState(mk(two(),Object.assign({endOnRoyalCapture:true},ru))); SFX.on=false; gameOver=false;
      turn=1; applyMoveSilent(1,{fr:1,fc:4,tr:0,tc:4});
      R[key]={王1枚取ったとき:{OFF:off?'終局':'続く', ON:gameOver?'終局':'続く'}, 状態:st()};
    }
  }
  // ④ 「点数だけで勝負する」と併せると、王を取った側が点数で負けることもある
  {
    const bd=B();
    bd[8][4]={t:'hK',p:1}; bd[7][4]={t:'hR',p:1};                  // 先手：飛車5点
    bd[0][4]={t:'hKw',p:-1}; bd[0][0]={t:'hK',p:-1};
    bd[0][8]={t:'hR',p:-1}; bd[1][8]={t:'hB',p:-1};                // 後手：飛車5＋角5＝10点
    loadState(mk(bd,{endOnRoyalCapture:true,scoreOnly:true})); SFX.on=false; gameOver=false;
    turn=1; applyMoveSilent(1,{fr:7,fc:4,tr:0,tc:4});
    R['④点数だけONで1枚取る']={終局:gameOver, 点:{あなた:currentScore(1),相手:currentScore(-1)}, 状態:st()};
  }
  // ⑤ 取り以外（囲み）で王が減っても終わる
  {
    const bd=B(), pts=P();
    bd[8][8]={t:'hK',p:1};
    bd[4][4]={t:'hKw',p:-1}; bd[0][0]={t:'hK',p:-1};               // 相手の王は2枚
    // 囲みで取れるのは碁石だけ。玉将のまわりの交点を白石で塞ぐ（あと1つで呼吸点0）
    pts[4][4]={t:'GOB',p:1}; pts[4][5]={t:'GOB',p:1};
    pts[5][4]={t:'GOB',p:1};
    loadState(mk(bd,{endOnRoyalCapture:true},pts)); SFX.on=false; gameOver=false;
    capYou.push('GOB');
    turn=1; applyMoveSilent(1,{drop:'GOB',tr:5,tc:5,pt:true});     // 最後の1つを打って囲む
    R['⑤囲みで王が減ったら']={終局:gameOver, 盤に残る相手の王:countRoyalsOnBoard(-1), 状態:st()};
  }
  // ⑥ CPUの読みも同じ条件で王を取る手を「勝ち」と見る
  {
    const bd=two();
    for(const on of [false,true]){
      loadState(mk(bd,{endOnRoyalCapture:on})); SFX.on=false; gameOver=false;
      const s=simulate(board,{fr:1,fc:4,tr:0,tc:4},1,capYou,capEnemy);
      R['⑥読みで king 判定（1枚目を取る手）'+(on?'ON':'OFF')]=s.king;
    }
  }
  // ⑦ 王が1枚だけの盤では、ONでもOFFでも同じ（ふつうの本将棋に影響しない）
  {
    for(const on of [false,true]){
      const bd=B(); bd[8][4]={t:'hK',p:1}; bd[0][4]={t:'hKw',p:-1}; bd[1][4]={t:'hR',p:1};
      loadState(mk(bd,{endOnRoyalCapture:on})); SFX.on=false; gameOver=false;
      turn=1; applyMoveSilent(1,{fr:1,fc:4,tr:0,tc:4});
      R['⑦王1枚の盤 '+(on?'ON':'OFF')]={終局:gameOver, 状態:st()};
    }
  }
  // ⑧ 設定はUIと保存に往復する
  {
    const cb=document.getElementById('rEndOnRoyalCapture');
    cb.checked=true; cb.dispatchEvent(new Event('change'));
    const saved=JSON.stringify(stateJSON());
    RULES.endOnRoyalCapture=false;
    loadState(saved);
    R['⑧保存して読み直す']={RULES:RULES.endOnRoyalCapture, チェック:cb.checked};
    cb.checked=false; cb.dispatchEvent(new Event('change'));
  }
  // ⑨ ふつうの対局に影響しない（初期配置で王が2枚以上ある形はどれか）
  {
    for(const k of ['hon','chess','chu','xiangqi','janggi','doubutsu','taikyoku']){
      document.getElementById('presetSel').value=k;
      document.getElementById('presetSel').dispatchEvent(new Event('change'));
      document.getElementById('applyPresetBtn').click(); SFX.on=false;
      R['⑨'+k+'の王の数']={あなた:countRoyalsOnBoard(1), 相手:countRoyalsOnBoard(-1)};
    }
  }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
