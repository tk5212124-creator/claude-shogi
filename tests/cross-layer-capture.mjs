import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+new URL('../shogi.html',import.meta.url).pathname); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  // 囲んで取れるのは碁石だけ。取られる方は駒の種類を問わない。
  //   ① 隣に相手の碁石／② 辺を別の層の相手の碁石2つが挟む／③ 碁石をマスに置けるとき空き交点も2辺で塞がり／④ 盤の外
  const R={};
  const mk=(bd,pts,pm)=>JSON.stringify({v:2,NR:9,NC:9,PZ:0,turn:1,youAreSente:true,gameOver:false,
    RULES:{drops:true,keepPromoted:false,nifu:true,sennichiteMode:'none',captureAll:true,
      banSennichite:false,pointMode:pm||'free',palaceEscape:false,allowPass:true},
    board:bd||Array.from({length:9},()=>Array(9).fill(null)),
    pts:pts||Array.from({length:10},()=>Array(10).fill(null)),
    diag:Array.from({length:9},()=>Array(9).fill(null)),capYou:[],capEnemy:[]});
  const B=()=>Array.from({length:9},()=>Array(9).fill(null));
  const P=()=>Array.from({length:10},()=>Array(10).fill(null));
  const live=(isPt,r,c)=>{const g=surroundedGroup(board,ptsBoard,isPt,r,c); return g?(g.free?'生き':'呼吸点0'):'駒なし';};
  const grp=(isPt,r,c)=>{const g=surroundedGroup(board,ptsBoard,isPt,r,c); return g&&g.stones?g.stones.length:'(生き)';};

  // ① 塞げるのは碁石だけ。普通の駒は隣にあっても呼吸点を塞がない
  {
    const bd=B(), pts=P();
    pts[4][4]={t:'GOB',p:1};
    for(const [r,c] of [[3,3],[3,4],[4,3],[4,4]]) bd[r][c]={t:'hP',p:-1};   // 交点を囲む4マスが敵の歩
    loadState(mk(bd,pts)); SFX.on=false;
    R['①交点の碁石を敵の歩4枚で囲む']=live(true,4,4);
    for(const [r,c] of [[3,3],[3,4],[4,3],[4,4]]) bd[r][c]={t:'GOW',p:-1};  // 同じ場所を碁石に
    loadState(mk(bd,pts)); SFX.on=false;
    R['①同じ形を敵の碁石4個で囲む']=live(true,4,4);
  }
  // ② マスの駒。4頂点の交点が碁石なら取れる。将棋駒では取れない
  {
    const bd=B(), pts=P();
    bd[4][4]={t:'hK',p:1};
    for(const [r,c] of [[4,4],[4,5],[5,4],[5,5]]) pts[r][c]={t:'GOW',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['②玉将を4頂点の碁石で囲む']=live(false,4,4);
    for(const [r,c] of [[4,4],[4,5],[5,4],[5,5]]) pts[r][c]={t:'XP',p:-1};  // 交点に乗る将棋以外の駒
    loadState(mk(bd,pts)); SFX.on=false;
    R['②同じ形を敵の兵4枚で囲む']=live(false,4,4);
  }
  // ③ 上下左右の隣が敵の歩でも取られない（報告の12手目の形）
  {
    const bd=B();
    bd[4][4]={t:'hP',p:1};
    for(const [r,c] of [[3,4],[5,4],[4,3],[4,5]]) bd[r][c]={t:'hP',p:-1};
    loadState(mk(bd,P())); SFX.on=false;
    R['③歩を敵の歩4枚で囲む']=live(false,4,4);
  }
  // ④ 塞がれた辺の向こうの味方とは群にならない（隣の味方の呼吸点で助からない）
  {
    const bd=B(), pts=P();
    bd[4][4]={t:'hK',p:1}; bd[4][5]={t:'hG',p:1};
    for(const [r,c] of [[4,4],[4,5],[5,4],[5,5]]) pts[r][c]={t:'GOW',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['④囲まれたマスの群の大きさ']=grp(false,4,4);
    R['④囲まれたマス／隣の味方']=live(false,4,4)+' ／ '+live(false,4,5);
    const n=captureSurroundedScan(-1, [[true,5,5]]);
    R['④取ったあと 囲まれたマス']= board[4][4]?'★残る':'取れた';
    R['④取ったあと 隣の味方']= board[4][5]?'残る（正しい）':'★取られた';
    R['④取った数']=n;
  }
  // ⑤ 辺を挟むのは相手の碁石2つ。1つ・味方・盤の外では塞がらない
  {
    const bd=B(); bd[3][3]={t:'GOW',p:-1};
    loadState(mk(bd,P())); SFX.on=false;
    R['⑤辺を挟む碁石1マス']= ptEdgeBlocked(board,4,4,0,-1,1)?'★塞がり':'通れる';
    bd[4][3]={t:'GOW',p:-1};
    loadState(mk(bd,P())); SFX.on=false;
    R['⑤辺を挟む碁石2マス']= ptEdgeBlocked(board,4,4,0,-1,1)?'塞がり（正しい）':'★通れる';
    R['⑤同じ2マスを味方から見ると']= ptEdgeBlocked(board,4,4,0,-1,-1)?'★塞がり':'通れる';
    const bd2=B(); bd2[8][3]={t:'GOW',p:-1};
    loadState(mk(bd2,P())); SFX.on=false;
    R['⑤盤の外を含む辺']= ptEdgeBlocked(board,9,4,0,-1,1)?'★塞がり':'通れる';
  }
  // ⑥ 盤の縁の交点は、隣のマス2つだけでは取られない
  {
    const bd=B(), pts=P();
    pts[9][4]={t:'GOW',p:-1};
    bd[8][3]={t:'GOB',p:1}; bd[8][4]={t:'GOB',p:1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['⑥縁の交点']=live(true,9,4);
    R['⑥縁に置くのが自殺手か']= isSuicidePlacement(board,ptsBoard,true,9,5,'GOW',-1)?'★自殺手':'置ける';
  }
  // ⑦ 碁石をマスに置けるルールのときだけ、空き交点も「2辺が碁石で塞がり」なら塞がり扱い
  {
    const bd=B(), pts=P();
    pts[4][4]={t:'GOB',p:1};
    // 交点(4,4)の上下左右の空き交点それぞれで、2辺が碁石で塞がるように敵石を並べる
    for(const [r,c] of [[3,3],[3,4],[4,3],[4,4],[2,3],[2,4],[3,2],[4,2],[3,5],[4,5],[5,3],[5,4]])
      bd[r][c]={t:'GOW',p:-1};
    loadState(mk(bd,pts,'cell')); SFX.on=false;
    R['⑦碁石をマスに置けるルール']=goStoneInCell();
    R['⑦空き交点(3,4)が塞がり扱いか']= ptSealedByEdges(board,3,4,1)?'塞がり':'通れる';
    loadState(mk(bd,pts,'point')); SFX.on=false;
    R['⑦交点だけのルールでは使わない']=goStoneInCell();
  }
  // ⑧ 通常の対局に誤爆しないか
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
      R['⑧'+k+'の初期配置で取られる駒']=dead;
    }
  }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
