import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+new URL('../shogi.html',import.meta.url).pathname); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  // 辺は「その辺を挟む別の層の2つ」でも塞がる。
  //   マスの辺  … 挟むのは辺の両端の交点2つ
  //   交点の辺  … 挟むのは辺の両側のマス2つ
  // これでマスの駒は4頂点の交点で、交点の駒はその点を囲む4マスで取れる。
  const R={};
  const mk=(bd,pts)=>JSON.stringify({v:2,NR:9,NC:9,PZ:0,turn:1,youAreSente:true,gameOver:false,
    RULES:{drops:true,keepPromoted:false,nifu:true,sennichiteMode:'none',captureAll:true,
      banSennichite:false,pointMode:'free',palaceEscape:false,allowPass:true},
    board:bd||Array.from({length:9},()=>Array(9).fill(null)),
    pts:pts||Array.from({length:10},()=>Array(10).fill(null)),
    diag:Array.from({length:9},()=>Array(9).fill(null)),capYou:[],capEnemy:[]});
  const B=()=>Array.from({length:9},()=>Array(9).fill(null));
  const P=()=>Array.from({length:10},()=>Array(10).fill(null));
  const live=(isPt,r,c)=>{const g=surroundedGroup(board,ptsBoard,isPt,r,c); return g?(g.free?'生き':'呼吸点0'):'駒なし';};

  // ① マスの駒：4頂点の交点で囲むと取られる（層をまたぐ囲み）
  {
    const bd=B(), pts=P();
    bd[4][4]={t:'hP',p:1};
    for(const [r,c] of [[4,4],[4,5],[5,4],[5,5]]) pts[r][c]={t:'GOW',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['①マスを4頂点で囲む']=live(false,4,4);
  }
  // ② 4頂点のうち3つだけ → まだ生き（辺が1つ空いている）
  {
    const bd=B(), pts=P();
    bd[4][4]={t:'hP',p:1};
    for(const [r,c] of [[4,4],[4,5],[5,4]]) pts[r][c]={t:'GOW',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['②4頂点のうち3つ']=live(false,4,4);
  }
  // ③ 交点の駒：その点を囲む4マスで取られる
  {
    const bd=B(), pts=P();
    pts[4][4]={t:'GOB',p:1};
    for(const [r,c] of [[3,3],[3,4],[4,3],[4,4]]) bd[r][c]={t:'hP',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['③交点を4マスで囲む']=live(true,4,4);
  }
  // ④ 4マスのうち3つだけ → まだ生き
  {
    const bd=B(), pts=P();
    pts[4][4]={t:'GOB',p:1};
    for(const [r,c] of [[3,3],[3,4],[4,3]]) bd[r][c]={t:'hP',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['④4マスのうち3つ']=live(true,4,4);
  }
  // ⑤ 辺ごとの判定：上下左右は同じ層で塞ぎ、残り1辺だけ2交点で塞ぐ
  {
    const bd=B(), pts=P();
    bd[4][4]={t:'hP',p:1};
    for(const [r,c] of [[3,4],[5,4],[4,3]]) bd[r][c]={t:'hP',p:-1};   // 上下左は同じ層で塞ぐ
    loadState(mk(bd,pts)); SFX.on=false;
    R['⑤右辺が空いている']=live(false,4,4);
    pts[4][5]={t:'GOW',p:-1};                                        // 右辺の交点1つ
    loadState(mk(bd,pts)); SFX.on=false;
    R['⑤右辺の交点1つ']=live(false,4,4);
    pts[5][5]={t:'GOW',p:-1};                                        // 右辺の交点2つ
    loadState(mk(bd,pts)); SFX.on=false;
    R['⑤右辺の交点2つ']=live(false,4,4);
  }
  // ⑥ 実際に着手して取れるか（層をまたぐ囲みの仕上げの一手）
  {
    const bd=B(), pts=P();
    bd[4][4]={t:'hP',p:1};
    for(const [r,c] of [[4,4],[4,5],[5,4]]) pts[r][c]={t:'GOW',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    capEnemy.push('GOW'); turn=-1;
    applyMoveSilent(-1,{drop:'GOW',tr:5,tc:5,pt:true});
    R['⑥最後の頂点を打つ']={マスの駒:board[4][4]?'★残った':'取れた',
      後手の持ち駒:capEnemy.filter(x=>x==='hP').length+'個の歩兵'};
  }
  // ⑦ 通常の将棋（交点レイヤーが空）では影響が出ない
  {
    document.getElementById('presetSel').value='hon';
    document.getElementById('presetSel').dispatchEvent(new Event('change'));
    document.getElementById('applyPresetBtn').click(); SFX.on=false;
    let dead=0;
    for(let r=0;r<NR;r++)for(let c=0;c<NC;c++){
      if(board[r][c] && !surroundedGroup(board,ptsBoard,false,r,c).free) dead++;
    }
    R['⑦本将棋の初期配置で呼吸点0の駒']=dead;
  }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
