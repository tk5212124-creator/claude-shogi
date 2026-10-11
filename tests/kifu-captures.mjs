import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const HTML = (process.argv[2]==='old' && process.env.OLD_HTML) ? process.env.OLD_HTML
                                                              : new URL('../shogi.html',import.meta.url).pathname;
import fs from 'fs';
const C=JSON.parse(fs.readFileSync(new URL('./case103-kifu-caps.json',import.meta.url).pathname,'utf8'));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+HTML); await p.waitForTimeout(900);
const out=await p.evaluate(([st,K,WB,WP,WCY,WCE])=>{
  /* 棋譜は「盤から消えた駒」をぜんぶ書けていなければならない。
     取り方は5通りあって、どれも持ち駒に入る。
       cap        … 移動先の駒
       capsCodes  … 移動の途中で取った駒（獅子型の2枚取り・居喰い）
       xcapCodes  … 相手レイヤーの駒（交差宮マスの共有点・斜めの飛び越え）
       enclCap    … 囲みで取った駒
       enclLost   … 自分の手で自分の群が死んだぶん（失: として出す）
     報告の103手は、56手目の「途中取り」だけが棋譜に出ていなかった。 */
  const R={};
  loadState(st); SFX.on=false; kifu.length=0; gameOver=false;
  // 1手ごとに「持ち駒が増えた数」と「棋譜が取ったと書いた数」を突き合わせる
  const bad=[];
  for(let i=0;i<K.length;i++){
    const k=K[i];
    const m = k.drop ? {drop:k.drop,tr:k.to[0],tc:k.to[1],pt:k.pt||undefined}
                     : {fr:k.from[0],fc:k.from[1],tr:k.to[0],tc:k.to[1],pt:k.pt||undefined,
                        promo:!!k.promo,promoTo:k.promoTo,caps:k.caps||undefined};
    const capY=capYou.length, capE=capEnemy.length;
    turn=k.side; applyMoveSilent(k.side,m); turn=-k.side;
    // 打ちは持ち駒が1枚減るので、そのぶんを戻してから数える
    const got=(capYou.length-capY)+(capEnemy.length-capE)+(k.drop?1:0);
    const rec=kifu[kifu.length-1]||{};
    const shown=(rec.cap?1:0)+((rec.capsCodes||[]).length)
               +((rec.xcapCodes||[]).length)+((rec.enclCap||[]).length);
    if(got!==shown) bad.push({手:i+1, 棋譜:kifuToText().split('\n')[i],
      持ち駒に入った数:got, 棋譜が書いた数:shown});
  }
  const cs=x=>x?x.t+':'+x.p:null, eq=(a,bb)=>JSON.stringify(a.map(r=>r.map(cs)))===JSON.stringify(bb.map(r=>r.map(cs)));
  const srt=a=>a.slice().sort().join(',');
  R['①103手の再生']={手数:kifu.length,
    マスの盤:eq(board,WB)?'一致':'★食い違い', 交点の盤:eq(ptsBoard,WP)?'一致':'★食い違い',
    持ち駒:(srt(capYou)===srt(WCY)&&srt(capEnemy)===srt(WCE))?'一致':'★食い違い',
    棋譜に出ていない取り:bad.length?bad:'なし'};
  R['②報告された56手目']=kifuToText().split('\n')[55];
  R['③その前後']=[kifuToText().split('\n')[54], kifuToText().split('\n')[56]];
  // 途中取りを1つずつ作って、取り方5通りがすべて棋譜に出るか
  const B=()=>Array.from({length:9},()=>Array(9).fill(null));
  const P=()=>Array.from({length:10},()=>Array(10).fill(null));
  const D=()=>Array.from({length:9},()=>Array(9).fill(null));
  const mk=(bd,ru,pts,dg,cy)=>JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
    RULES:Object.assign({drops:true,captureAll:false,pointMode:'auto',allowPass:false,
      banSennichite:false,sennichiteMode:'none',nifu:false,palaceEscape:false},ru||{}),
    board:bd,pts:pts||P(),diag:dg||D(),capYou:cy||[],capEnemy:[]});
  // ④ 獅子型の2枚取り（caps）
  {
    const bd=B(); bd[8][4]={t:'hK',p:1}; bd[0][0]={t:'hK',p:-1};
    bd[4][4]={t:'zLion',p:1};                 // 獅子型（どうぶつしょうぎのライオン）
    bd[3][4]={t:'hP',p:-1}; bd[2][4]={t:'hL',p:-1};
    loadState(mk(bd)); SFX.on=false; kifu.length=0; gameOver=false;
    turn=1; applyMoveSilent(1,{fr:4,fc:4,tr:2,tc:4,caps:[[3,4]]});
    R['④途中取り（獅子型）']={棋譜:kifuToText().split('\n')[0], 持ち駒:capYou.slice()};
  }
  // ⑤ 共有点（×）の相手レイヤーの駒（xcaps）
  {
    const dg=D(); dg[4][4]='x';
    const bd=B(); bd[8][8]={t:'hK',p:1}; bd[0][0]={t:'hK',p:-1}; bd[4][4]={t:'hP',p:-1};
    const pts=P(); pts[4][4]={t:'hB',p:1};
    loadState(mk(bd,null,pts,dg)); SFX.on=false; kifu.length=0; gameOver=false;
    turn=1; applyMoveSilent(1,{fr:4,fc:4,tr:4,tc:4,pt:true,toPt:false});
    R['⑤共有点の取り']={棋譜:kifuToText().split('\n')[0], 持ち駒:capYou.slice()};
  }
  // ⑥ 囲みで取った駒（enclCap）
  {
    const bd=B(); bd[8][8]={t:'hK',p:1}; bd[0][0]={t:'hK',p:-1}; bd[4][4]={t:'hP',p:-1};
    const pts=P();
    pts[4][4]={t:'GOB',p:1}; pts[4][5]={t:'GOB',p:1}; pts[5][4]={t:'GOB',p:1};
    loadState(mk(bd,null,pts,null,['GOB'])); SFX.on=false; kifu.length=0; gameOver=false;
    turn=1; applyMoveSilent(1,{drop:'GOB',tr:5,tc:5,pt:true});
    R['⑥囲みの取り']={棋譜:kifuToText().split('\n')[0], 持ち駒:capYou.slice()};
  }
  return R;
},[JSON.stringify({v:2,NR:C.NR,NC:C.NC,PZ:C.PZ,turn:C.start.turn,youAreSente:C.youAreSente,gameOver:false,
   RULES:C.RULES,board:C.start.board,pts:C.start.pts,diag:C.start.diag,
   capYou:C.start.capYou,capEnemy:C.start.capEnemy}),C.kifu,C.board,C.pts,C.capYou,C.capEnemy]);
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
