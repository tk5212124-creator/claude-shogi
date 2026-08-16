import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+new URL('../shogi.html',import.meta.url).pathname); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  // 囲みは層をまたぐ。
  //   辺は、その辺を挟む「別の層の2つ」が埋まっていれば塞がる（1つでは塞がらない）
  //   交点が塞がるのは駒が乗っているときだけ（「2辺で塞がり」は取りやめ）
  //   別の層の隣4つがすべて相手の駒なら、その駒1つだけが取られる（層をまたぐ囲み）
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

  // ① 交点が塞がるのは駒が乗っているときだけ。周りのマスがいくつ埋まっても塞がらない
  {
    const cells=[[3,3],[3,4],[4,3],[4,4]];   // 交点(4,4)を囲む4マス
    for(let n=0;n<=4;n++){
      const bd=B();
      for(let i=0;i<n;i++) bd[cells[i][0]][cells[i][1]]={t:'hP',p:-1};
      loadState(mk(bd,P())); SFX.on=false;
      R['①交点(4,4) 周りのマス'+n+'個']= pointBlocked(board,ptsBoard,4,4)?'★塞がり':'通れる';
    }
    const bd=B(), pts=P(); pts[4][4]={t:'GOB',p:1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['①交点に駒が乗っているとき']= pointBlocked(board,ptsBoard,4,4)?'塞がり（正しい）':'★通れる';
  }
  // ② 辺は挟む2つが埋まってはじめて塞がる
  {
    const bd=B();
    bd[3][3]={t:'hP',p:-1};                       // 交点(4,4)の左へ伸びる辺の片側だけ
    loadState(mk(bd,P())); SFX.on=false;
    R['②辺を挟む1マスだけ']= ptEdgeBlocked(board,4,4,0,-1)?'★塞がり':'通れる';
    bd[4][3]={t:'hP',p:-1};
    loadState(mk(bd,P())); SFX.on=false;
    R['②辺を挟む2マス']= ptEdgeBlocked(board,4,4,0,-1)?'塞がり（正しい）':'★通れる';
  }
  // ③ 交点の駒：4辺すべてが塞がれば呼吸点0
  {
    const bd=B(), pts=P();
    pts[4][4]={t:'GOB',p:1};
    for(const [r,c] of [[3,3],[3,4],[4,3],[4,4]]) bd[r][c]={t:'hP',p:-1};  // 上下左右の辺を全部塞ぐ
    loadState(mk(bd,pts)); SFX.on=false;
    R['③交点の駒を4マスで囲む']=live(true,4,4);
    R['③同じ形が層をまたぐ囲みでも成立']= crossSurrounded(board,ptsBoard,true,4,4)?'成立':'★不成立';
  }
  // ④ マスの駒：4頂点の交点で囲む
  {
    const bd=B(), pts=P();
    bd[4][4]={t:'hP',p:1};
    for(const [r,c] of [[4,4],[4,5],[5,4],[5,5]]) pts[r][c]={t:'GOW',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['④マスを4頂点で囲む']=live(false,4,4);
    R['④層をまたぐ囲み']= crossSurrounded(board,ptsBoard,false,4,4)?'成立':'★不成立';
    const bd2=B(), pts2=P();
    bd2[4][4]={t:'hP',p:1};
    for(const [r,c] of [[4,4],[4,5],[5,4]]) pts2[r][c]={t:'GOW',p:-1};
    loadState(mk(bd2,pts2)); SFX.on=false;
    R['④4頂点のうち3つ']=live(false,4,4);
    R['④4頂点のうち3つ 層をまたぐ囲み']= crossSurrounded(board,ptsBoard,false,4,4)?'★成立':'不成立';
  }
  // ⑤ 層をまたぐ囲みは味方には守られない。隣の味方に呼吸点があっても、囲まれた駒は取られる
  {
    const bd=B(), pts=P();
    bd[4][4]={t:'hK',p:1}; bd[4][5]={t:'hG',p:1};   // 隣り合う味方。hGの側は空いている
    for(const [r,c] of [[4,4],[4,5],[5,4],[5,5]]) pts[r][c]={t:'GOW',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['⑤群としては生きているか']=live(false,4,4);
    const n=captureSurroundedScan(-1, [[true,5,5]]);
    R['⑤囲まれたマスの駒']= board[4][4]?'★残る':'取れた';
    R['⑤隣の味方']= board[4][5]?'残る（正しい）':'★取られた';
    R['⑤取った数']=n;
  }
  // ⑥ 盤の縁の交点は、隣のマス2つだけでは層をまたぐ囲みにならない
  {
    const bd=B(), pts=P();
    pts[9][4]={t:'GOW',p:-1};
    bd[8][3]={t:'hG',p:1}; bd[8][4]={t:'hK',p:1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['⑥縁の交点 層をまたぐ囲み']= crossSurrounded(board,ptsBoard,true,9,4)?'★成立':'不成立';
    R['⑥縁の交点 自殺手か']= isSuicidePlacement(board,ptsBoard,true,9,5,'GOW',-1)?'★自殺手':'置ける';
  }
  // ⑦ 通常の対局に誤爆しないか（初期配置で呼吸点0・層をまたぐ囲みの駒が出ないこと）
  {
    for(const k of ['hon','chess','doubutsu','othello','hasami','xiangqi','janggi','mini','go','taikyoku']){
      document.getElementById('presetSel').value=k;
      document.getElementById('presetSel').dispatchEvent(new Event('change'));
      document.getElementById('applyPresetBtn').click(); SFX.on=false;
      let dead=0;
      for(let r=0;r<NR;r++)for(let c=0;c<NC;c++)
        if(board[r][c] && (!surroundedGroup(board,ptsBoard,false,r,c).free || crossSurrounded(board,ptsBoard,false,r,c))) dead++;
      for(let r=0;r<=NR;r++)for(let c=0;c<=NC;c++)
        if(ptsBoard[r]&&ptsBoard[r][c] && (!surroundedGroup(board,ptsBoard,true,r,c).free || crossSurrounded(board,ptsBoard,true,r,c))) dead++;
      R['⑦'+k+'の初期配置で取られる駒']=dead;
    }
  }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
