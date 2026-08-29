import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const HTML = (process.argv[2]==='old' && process.env.OLD_HTML) ? process.env.OLD_HTML
                                                              : new URL('../shogi.html',import.meta.url).pathname;
import fs from 'fs';
const C54=JSON.parse(fs.readFileSync(new URL('./case54-cross-cell.json',import.meta.url).pathname,'utf8'));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+HTML); await p.waitForTimeout(900);
const out=await p.evaluate((C54)=>{
  /* ×（交差宮マス）は「マスであり交点でもある」中心。だから
       ・交点の駒だけが ×の中へ入れる（打ちも移動も）
       ・×の中に居る交点の駒は、交点か他の×にしか行けない
       ・×の中に居るマスの駒は、交点へは出られない
       ・マスの駒が交点へ出られるのは「行き来できる」ルールで、×を経由するときだけ
     また「斜めの通り道の駒を取れる」ルールでは、斜めに動く駒が通り道の相手レイヤーの駒を取る。 */
  const R={};
  const B=()=>Array.from({length:9},()=>Array(9).fill(null));
  const P=()=>Array.from({length:10},()=>Array(10).fill(null));
  const D=()=>Array.from({length:9},()=>Array(9).fill(null));
  const mk=(bd,pts,dg,pm)=>JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
    RULES:{drops:true,captureAll:false,pointMode:pm||'auto',allowPass:false,banSennichite:false,
      sennichiteMode:'none',nifu:false,palaceEscape:false},
    board:bd,pts:pts||P(),diag:dg||D(),capYou:[],capEnemy:[]});
  const X=()=>{ const d=D(); d[4][4]='x'; return d; };
  const cell=m=>'マス('+(m[0]+1)+'行'+(m[1]+1)+'列)';
  const pt  =m=>'交点('+(m[0]+1)+'行'+(m[1]+1)+'列)';

  // ① 持ち駒：マスの駒は交点へ打てない（×の四隅も含めて1つも無いのが正しい）
  {
    const bd=B(); bd[8][8]={t:'hK',p:1}; bd[0][0]={t:'hK',p:-1};
    loadState(JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
      RULES:{drops:true,captureAll:false,pointMode:'auto',allowPass:false,banSennichite:false,
        sennichiteMode:'none',nifu:false,palaceEscape:false},
      board:bd,pts:P(),diag:X(),capYou:['hP','hB','JC'],capEnemy:[]}));
    SFX.on=false;
    R['①マスの駒（歩）を交点へ打てるか']=dropTargets(board,'hP',1).filter(x=>x[2]).map(pt);
    R['①マスの駒（角）を交点へ打てるか']=dropTargets(board,'hB',1).filter(x=>x[2]).map(pt);
    R['①交点の駒（包）を×のマスへ打てるか']=dropTargets(ptsBoard,'JC',1).filter(x=>x[2]).map(cell);
    // 合法判定（人・CPU共通）も同じ答えになるか
    R['①合法判定：歩を×の四隅の交点へ']=[[4,4],[4,5],[5,4],[5,5]]
      .map(([r,c])=>isLegalMove({drop:'hP',tr:r,tc:c,pt:true},1));
    R['①合法判定：包を×のマスへ']=isLegalMove({drop:'JC',tr:4,tc:4},1);
    R['①CPUがマスの駒を交点へ打つ手を作るか']=
      genMoves(board,1,capYou,capEnemy).filter(g=>g.drop&&g.pt&&!goesOnPoint(g.drop)).length;
  }
  // ② 移動：マスの駒はどこからも交点へ行けない（×の上に居ても）
  {
    const bd=B(); bd[3][3]={t:'hB',p:1};
    loadState(mk(bd,P(),X(),'auto')); SFX.on=false;
    R['②ふつうのマスの角行→交点']=moves(board,3,3).filter(m=>m[2]).map(pt);
    board[3][3]=null; board[4][4]={t:'hB',p:1};
    R['②×のマスに居る角行→交点']=moves(board,4,4).filter(m=>m[2]).map(pt);
  }
  // ③ 交点の駒は×の中へ入れる。入ったあとは交点か他の×にしか行けない
  {
    // シャンチーの仕（交点の駒。斜め1歩）。× があるので、そのマスは宮のマスになる
    const pts=P(); pts[4][4]={t:'XA',p:1};
    loadState(mk(B(),pts,X(),'auto')); SFX.on=false;
    R['③交点の仕→入れる×']=moves(ptsBoard,4,4).filter(m=>m[2]).map(cell);
    const bd=B(); bd[4][4]={t:'XA',p:1};
    loadState(mk(bd,P(),X(),'auto')); SFX.on=false;
    R['③×の中の仕→戻れる交点']=moves(board,4,4).filter(m=>m[2]).map(pt);
    R['③×の中の仕→行けるマス']=moves(board,4,4).filter(m=>!m[2]).map(cell);
    // すべての駒を交点に置くルールなら、角行も同じように扱われる
    const d2=X(); d2[6][6]='x';               // もう1つ ×（走ってなら届く）
    const bd2=B(); bd2[4][4]={t:'hB',p:1};
    loadState(mk(bd2,P(),d2,'point')); SFX.on=false;
    R['③point：×の中の角行→行けるマス']=moves(board,4,4).filter(m=>!m[2]).map(cell);
    R['③point：×の中の角行→戻れる交点']=moves(board,4,4).filter(m=>m[2]).map(pt).sort();
    const pts2=P(); pts2[4][4]={t:'hB',p:1};
    loadState(mk(B(),pts2,d2,'point')); SFX.on=false;
    R['③point：交点の角行→入れる×']=moves(ptsBoard,4,4).filter(m=>m[2]).map(cell);
  }
  // ④ 「行き来できる」ルール（free）＝×の中に居るときだけ、マスの駒も交点へ出られる
  {
    const bd=B(); bd[4][4]={t:'hB',p:1};
    loadState(mk(bd,P(),X(),'free')); SFX.on=false;
    R['④free：×の中の角行→交点']=moves(board,4,4).filter(m=>m[2]).map(pt).length;
    bd[4][4]=null; bd[3][3]={t:'hB',p:1};
    loadState(mk(bd,P(),X(),'free')); SFX.on=false;
    R['④free：ふつうのマスの角行→交点']=moves(board,3,3).filter(m=>m[2]).map(pt);
  }
  // ⑤ 斜めの通り道：ふつうは塞がれるだけ。crossCap なら取って進める
  {
    const run=(pm)=>{
      const bd=B(); bd[4][4]={t:'hB',p:1}; bd[8][8]={t:'hK',p:1}; bd[0][0]={t:'hK',p:-1};
      const pts=P(); pts[4][4]={t:'GOW',p:-1};   // 左上へ出る通り道にいる相手の碁石
      loadState(mk(bd,pts,D(),pm)); SFX.on=false; gameOver=false;
      return moves(board,4,4).filter(m=>!m[2]&&m[0]<4&&m[1]<4).map(cell);
    };
    R['⑤auto：左上へ走れるマス']=run('auto');
    R['⑤crossCap：左上へ走れるマス']=run('crossCap');
    // 実際に指すと通り道の碁石を取る
    const bd=B(); bd[4][4]={t:'hB',p:1}; bd[8][8]={t:'hK',p:1}; bd[0][0]={t:'hK',p:-1};
    const pts=P(); pts[4][4]={t:'GOW',p:-1};
    loadState(mk(bd,pts,D(),'crossCap')); SFX.on=false; gameOver=false;
    const m={fr:4,fc:4,tr:2,tc:2};
    R['⑤crossCap：合法か']=isLegalMove(m,1);
    R['⑤crossCap：CPUも生成するか']=genMoves(board,1,capYou,capEnemy)
      .some(g=>!g.drop&&g.fr===4&&g.fc===4&&g.tr===2&&g.tc===2);
    turn=1; applyMoveSilent(1,m);
    R['⑤crossCap：指したあと']={通り道の碁石:ptsBoard[4][4]?'★残る':'取れた',
      持ち駒:capYou.slice(), 棋譜:kifuToText().split('\n').pop()};
  }
  // ⑥ crossCap でも味方の駒は通り抜けられない
  {
    const bd=B(); bd[4][4]={t:'hB',p:1};
    const pts=P(); pts[4][4]={t:'GOB',p:1};      // 自分の碁石
    loadState(mk(bd,pts,D(),'crossCap')); SFX.on=false;
    R['⑥crossCap：味方が通り道なら']=moves(board,4,4).filter(m=>!m[2]&&m[0]<4&&m[1]<4).map(cell);
  }
  // ⑦ crossCap は逆向きにも効く（交点の駒から見たマスの駒）
  {
    const pts=P(); pts[4][4]={t:'hB',p:1};
    const bd=B(); bd[3][3]={t:'hP',p:-1};        // 交点の角行から見た左上の通り道のマスの駒
    loadState(mk(bd,pts,D(),'crossCap')); SFX.on=false; gameOver=false;
    R['⑦crossCap：交点の角行が左上へ走れる交点']=moves(ptsBoard,4,4).filter(m=>!m[2]&&m[0]<4&&m[1]<4).map(pt);
    const m={fr:4,fc:4,tr:2,tc:2,pt:true};
    turn=1; applyMoveSilent(1,m);
    R['⑦crossCap：指したあと']={通り道のマスの駒:board[3][3]?'★残る':'取れた', 持ち駒:capYou.slice()};
  }
  // ⑧ 報告の54手。× に交点でない駒（歩）を打った14手目だけが、いまは合法でないのが正しい
  {
    loadState(JSON.stringify({v:2,NR:C54.NR,NC:C54.NC,PZ:C54.PZ,turn:C54.start.turn,
      youAreSente:C54.youAreSente,gameOver:false,RULES:C54.RULES,
      board:C54.start.board,pts:C54.start.pts,diag:C54.start.diag,
      capYou:C54.start.capYou,capEnemy:C54.start.capEnemy}));
    SFX.on=false; kifu.length=0; gameOver=false;
    const bad=[];
    for(let i=0;i<C54.kifu.length;i++){
      const k=C54.kifu[i];
      const m = k.drop ? {drop:k.drop,tr:k.to[0],tc:k.to[1],pt:k.pt||undefined}
                       : {fr:k.from[0],fc:k.from[1],tr:k.to[0],tc:k.to[1],pt:k.pt||undefined,
                          promo:!!k.promo,promoTo:k.promoTo};
      turn=k.side;
      if(!isLegalMove(m,k.side)) bad.push((i+1)+'手目 '+JSON.stringify(m));
      applyMoveSilent(k.side,m); turn=-k.side;
    }
    const cs=x=>x?x.t+':'+x.p:null, eq=(a,bb)=>JSON.stringify(a.map(r=>r.map(cs)))===JSON.stringify(bb.map(r=>r.map(cs)));
    const srt=a=>a.slice().sort().join(',');
    R['⑧54手の再生']={手数:kifu.length, マスの盤:eq(board,C54.board)?'一致':'★食い違い',
      交点の盤:eq(ptsBoard,C54.pts)?'一致':'★食い違い',
      持ち駒:(srt(capYou)===srt(C54.capYou)&&srt(capEnemy)===srt(C54.capEnemy))?'一致':'★食い違い',
      いまは合法でない手:bad};
  }
  // ⑨ 宮マスの無いふつうの対局には影響しない
  {
    let cross=0;
    for(const k of ['hon','chess','chu','xiangqi','janggi','go','othello']){
      document.getElementById('presetSel').value=k;
      document.getElementById('presetSel').dispatchEvent(new Event('change'));
      document.getElementById('applyPresetBtn').click(); SFX.on=false;
      for(const side of [1,-1]){
        const g=genMoves(board,side,capYou,capEnemy);
        cross += g.filter(m=>m.toPt!==undefined).length + g.filter(m=>m.drop&&m.pt&&!goesOnPoint(m.drop)).length;
      }
      R['⑨'+k+'の層をまたぐ手']=cross;
    }
  }
  return R;
},C54);
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
