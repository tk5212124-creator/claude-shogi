import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const HTML = (process.argv[2]==='old' && process.env.OLD_HTML) ? process.env.OLD_HTML
                                                              : new URL('../shogi.html',import.meta.url).pathname;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+HTML); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  // 王手は「どの層のどの royal に掛かっているか」で見る。
  // 座標だけで持つと、マスと交点に別々の royal が居るとき片方の王手で両方が光る。
  const R={};
  const B=()=>Array.from({length:9},()=>Array(9).fill(null));
  const P=()=>Array.from({length:10},()=>Array(10).fill(null));
  const D=()=>Array.from({length:9},()=>Array(9).fill(null));
  const mk=(bd,pts,dg,pm)=>JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
    RULES:{drops:true,captureAll:false,pointMode:pm||'auto',allowPass:false,banSennichite:false,
      sennichiteMode:'none',nifu:false,palaceEscape:false},
    board:bd,pts:pts||P(),diag:dg||D(),capYou:[],capEnemy:[]});
  const lit=()=>({マス:[...document.querySelectorAll('#board .cell.check')].map(e=>
                    (+e.dataset.r+1)+'行'+(+e.dataset.c+1)+'列'),
                  交点:[...document.querySelectorAll('#board .pt-slot.check')].length});

  // ① 交点の royal だけが王手のとき、同じ座標のマスの royal は光らない
  {
    const bd=B(), pts=P();
    bd[0][4]={t:'hK',p:-1};                 // マスの玉将（王手されていない）
    bd[8][4]={t:'hK',p:1};
    pts[0][4]={t:'JK',p:-1};                // 交点の將（包に狙われている）
    pts[0][3]={t:'JP',p:-1};                // 包の台
    pts[0][2]={t:'JC',p:1};                 // 先手の包
    loadState(mk(bd,pts)); SFX.on=false; render();
    const ci=checkInfo(-1);
    R['①王手の場所']=ci.cells;
    R['①赤くなる場所']=lit();
  }
  // ② マスの royal だけが王手のとき、同じ座標の交点の royal は光らない
  {
    const bd=B(), pts=P();
    bd[0][4]={t:'hK',p:-1}; bd[8][4]={t:'hK',p:1};
    bd[4][4]={t:'hR',p:1};                  // 飛車が縦に玉将を狙う
    pts[0][4]={t:'JK',p:-1};                // 交点の將（狙われていない）
    loadState(mk(bd,pts)); SFX.on=false; render();
    R['②王手の場所']=checkInfo(-1).cells;
    R['②赤くなる場所']=lit();
  }
  // ③ 両方に王手が掛かっていれば両方
  {
    const bd=B(), pts=P();
    bd[0][4]={t:'hK',p:-1}; bd[8][4]={t:'hK',p:1};
    bd[4][4]={t:'hR',p:1};
    pts[0][4]={t:'JK',p:-1}; pts[0][3]={t:'JP',p:-1}; pts[0][2]={t:'JC',p:1};
    loadState(mk(bd,pts)); SFX.on=false; render();
    R['③王手の場所']=checkInfo(-1).cells.slice().sort();
    R['③赤くなる場所']=lit();
    R['③同時王手の数（点の計算に使う）']=checkInfo(-1).cells.length;
  }
  // ④ 層をまたぐ手（×へ入る手）は「行き先の層」の royal を王手にする
  {
    const dg=D(); dg[4][4]='x';
    const bd=B(), pts=P();
    bd[4][4]={t:'hK',p:-1};                 // × のマスに居る敵の玉将
    bd[8][8]={t:'hK',p:1};
    pts[4][4]={t:'hB',p:1};                 // 半歩ななめの隣に居る角行（先手）
    loadState(mk(bd,pts,dg)); SFX.on=false; render();
    R['④×のマスの玉将']={王手:checkInfo(-1).cells, 赤くなる場所:lit()};
  }
  // ⑤ 同じ座標の「交点」の royal は、その手では王手にならない
  {
    const dg=D(); dg[4][4]='x';
    const bd=B(), pts=P();
    bd[8][8]={t:'hK',p:1};
    pts[4][4]={t:'JK',p:1};                 // 先手の漢（斜めの動きは持たない）
    pts[3][4]={t:'JK',p:-1};                // 交点の敵の楚（宮の外なので漢は行けない）
    loadState(mk(bd,pts,dg)); SFX.on=false; render();
    R['⑤交点の楚は王手か']=checkInfo(-1).cells.length?checkInfo(-1).cells:'王手なし（正しい）';
    // × のマスに敵 royal を置くと、そこだけが王手になる（交点側は王手にしない）
    board[4][4]={t:'hK',p:-1}; render();
    R['⑤×のマスに玉将を置くと']=checkInfo(-1).cells.slice().sort();
    // 赤くなるのはマス側だけ。×のマスに居るのはマスの駒（玉将）なので交点へは出られず、
    // 交点(5行5列)に居る先手の漢に王手は掛からない
    R['⑤赤くなる場所']=lit();
    R['⑤先手側への王手']=checkInfo(1).cells;
  }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
