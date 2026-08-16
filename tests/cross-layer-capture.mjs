import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+new URL('../shogi.html',import.meta.url).pathname); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  // 囲みは層をまたぐ。判定は群と呼吸点の1組だけ。
  //   辺は、その辺を挟む「別の層の相手の駒2つ」で塞がる（味方や盤の外は塞がない）
  //   塞がれた辺の向こうは、接続にも呼吸点にもならない
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
  const grp=(isPt,r,c)=>{const g=surroundedGroup(board,ptsBoard,isPt,r,c); return g&&g.stones?g.stones.length:(g?'(生き)':'駒なし');};

  // ① 辺は挟む相手の駒2つで塞がる。1つだけ・味方・盤の外では塞がらない
  {
    const bd=B(); bd[3][3]={t:'hP',p:-1};             // 交点(4,4)の左辺の片側だけ
    loadState(mk(bd,P())); SFX.on=false;
    R['①辺を挟む相手1マス']= ptEdgeBlocked(board,4,4,0,-1,1)?'★塞がり':'通れる';
    bd[4][3]={t:'hP',p:-1};
    loadState(mk(bd,P())); SFX.on=false;
    R['①辺を挟む相手2マス']= ptEdgeBlocked(board,4,4,0,-1,1)?'塞がり（正しい）':'★通れる';
    R['①同じ2マスを味方から見ると']= ptEdgeBlocked(board,4,4,0,-1,-1)?'★塞がり':'通れる';
    const bd2=B(); bd2[8][3]={t:'hP',p:-1};           // 盤の縁：下側にマスが無い
    loadState(mk(bd2,P())); SFX.on=false;
    R['①盤の外を含む辺']= ptEdgeBlocked(board,9,4,0,-1,1)?'★塞がり':'通れる';
  }
  // ② 交点の駒を、その点を囲む4マスで囲む
  {
    const bd=B(), pts=P();
    pts[4][4]={t:'GOB',p:1};
    for(const [r,c] of [[3,3],[3,4],[4,3],[4,4]]) bd[r][c]={t:'hP',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['②交点の駒を4マスで囲む']=live(true,4,4);
    bd[4][4]={t:'hP',p:1};                             // 1マスだけ味方に変える
    loadState(mk(bd,pts)); SFX.on=false;
    R['②うち1マスが味方']=live(true,4,4);
  }
  // ③ マスの駒を4頂点の交点で囲む
  {
    const bd=B(), pts=P();
    bd[4][4]={t:'hP',p:1};
    for(const [r,c] of [[4,4],[4,5],[5,4],[5,5]]) pts[r][c]={t:'GOW',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['③マスを4頂点で囲む']=live(false,4,4);
    const bd2=B(), pts2=P();
    bd2[4][4]={t:'hP',p:1};
    for(const [r,c] of [[4,4],[4,5],[5,4]]) pts2[r][c]={t:'GOW',p:-1};
    loadState(mk(bd2,pts2)); SFX.on=false;
    R['③4頂点のうち3つ']=live(false,4,4);
  }
  // ④ 塞がれた辺の向こうの味方とは群にならない（隣の味方の呼吸点で助からない）
  {
    const bd=B(), pts=P();
    bd[4][4]={t:'hK',p:1}; bd[4][5]={t:'hG',p:1};      // 隣り合う味方。hG側は空いている
    for(const [r,c] of [[4,4],[4,5],[5,4],[5,5]]) pts[r][c]={t:'GOW',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['④囲まれたマスの群の大きさ']=grp(false,4,4);
    R['④囲まれたマス']=live(false,4,4);
    R['④隣の味方']=live(false,4,5);
    const n=captureSurroundedScan(-1, [[true,5,5]]);
    R['④取ったあと 囲まれたマス']= board[4][4]?'★残る':'取れた';
    R['④取ったあと 隣の味方']= board[4][5]?'残る（正しい）':'★取られた';
    R['④取った数']=n;
  }
  // ⑤ 盤の縁の交点は、隣のマス2つだけでは取られない（縁に置けなくならない）
  {
    const bd=B(), pts=P();
    pts[9][4]={t:'GOW',p:-1};
    bd[8][3]={t:'hG',p:1}; bd[8][4]={t:'hK',p:1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['⑤縁の交点']=live(true,9,4);
    R['⑤縁に置くのが自殺手か']= isSuicidePlacement(board,ptsBoard,true,9,5,'GOW',-1)?'★自殺手':'置ける';
  }
  // ⑥ 空いている交点は、別の辺を塞がない（塞がりが伝播しない）
  {
    const bd=B(), pts=P();
    pts[1][3]={t:'GOB',p:1};
    // 本将棋の1段目・3段目のように上下を敵駒で埋める。交点(2,3)は空いたまま
    for(let c=2;c<=4;c++){ bd[0][c]={t:'hG',p:-1}; bd[2][c]={t:'hP',p:-1}; }
    bd[1][3]={t:'hR',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['⑥駒で埋まった盤の碁石']=live(true,1,3);
  }
  // ⑦ 通常の対局に誤爆しないか（初期配置で呼吸点0の駒が出ないこと）
  {
    for(const k of ['hon','chess','doubutsu','othello','hasami','xiangqi','janggi','mini','go','taikyoku']){
      document.getElementById('presetSel').value=k;
      document.getElementById('presetSel').dispatchEvent(new Event('change'));
      document.getElementById('applyPresetBtn').click(); SFX.on=false;
      let dead=0;
      for(let r=0;r<NR;r++)for(let c=0;c<NC;c++)
        if(board[r][c] && !surroundedGroup(board,ptsBoard,false,r,c).free) dead++;
      for(let r=0;r<=NR;r++)for(let c=0;c<=NC;c++)
        if(ptsBoard[r]&&ptsBoard[r][c] && !surroundedGroup(board,ptsBoard,true,r,c).free) dead++;
      R['⑦'+k+'の初期配置で取られる駒']=dead;
    }
  }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
