import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+new URL('../shogi.html',import.meta.url).pathname); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  // 囲みは層をまたぐ。
  //   辺は、その辺を挟む「別の層の2つ」が埋まっていれば塞がる（1つでは塞がらない）
  //   交点は、駒があるか「4辺のうち2辺以上」が塞がっていれば塞がる
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

  // ① 交点Pを囲む4マスのうち何マスで、Pが塞がり扱いになるか
  {
    const cells=[[3,3],[3,4],[4,3],[4,4]];   // 交点(4,4)を囲む4マス
    for(let n=0;n<=4;n++){
      const bd=B();
      for(let i=0;i<n;i++) bd[cells[i][0]][cells[i][1]]={t:'hP',p:-1};
      loadState(mk(bd,P())); SFX.on=false;
      R['①交点(4,4) 周りのマス'+n+'個']= pointBlocked(board,ptsBoard,4,4)?'塞がり':'通れる';
    }
  }
  // ② 隣り合う2辺（3マス）で塞がるか＝選ばれた仕様どおりか
  {
    const bd=B();
    for(const [r,c] of [[3,3],[3,4],[4,3]]) bd[r][c]={t:'hP',p:-1};   // a,b,c（dは空）
    loadState(mk(bd,P())); SFX.on=false;
    R['②3マス(L字)で交点が塞がるか']= pointBlocked(board,ptsBoard,4,4)?'塞がり（正しい）':'★通れる';
  }
  // ③ 交点の駒：行き先の交点が塞がっていると呼吸点にならない
  {
    const bd=B(), pts=P();
    pts[4][4]={t:'GOB',p:1};
    for(const [r,c] of [[3,3],[3,4],[4,3],[4,4]]) bd[r][c]={t:'hP',p:-1};  // 上下左右の辺を全部塞ぐ
    loadState(mk(bd,pts)); SFX.on=false;
    R['③交点の駒を4マスで囲む']=live(true,4,4);
  }
  // ④ 前回のケースが維持されているか
  {
    const bd=B(), pts=P();
    bd[4][4]={t:'hP',p:1};
    for(const [r,c] of [[4,4],[4,5],[5,4],[5,5]]) pts[r][c]={t:'GOW',p:-1};
    loadState(mk(bd,pts)); SFX.on=false;
    R['④マスを4頂点で囲む']=live(false,4,4);
    const bd2=B(), pts2=P();
    bd2[4][4]={t:'hP',p:1};
    for(const [r,c] of [[4,4],[4,5],[5,4]]) pts2[r][c]={t:'GOW',p:-1};
    loadState(mk(bd2,pts2)); SFX.on=false;
    R['④4頂点のうち3つ']=live(false,4,4);
  }
  // ⑤ 通常の対局に誤爆しないか（初期配置で呼吸点0の駒が出ないこと）
  {
    for(const k of ['hon','chess','doubutsu','othello','hasami','xiangqi','janggi','mini','taikyoku']){
      document.getElementById('presetSel').value=k;
      document.getElementById('presetSel').dispatchEvent(new Event('change'));
      document.getElementById('applyPresetBtn').click(); SFX.on=false;
      let dead=0;
      for(let r=0;r<NR;r++)for(let c=0;c<NC;c++)
        if(board[r][c] && !surroundedGroup(board,ptsBoard,false,r,c).free) dead++;
      for(let r=0;r<=NR;r++)for(let c=0;c<=NC;c++)
        if(ptsBoard[r]&&ptsBoard[r][c] && !surroundedGroup(board,ptsBoard,true,r,c).free) dead++;
      R['⑤'+k+'の初期配置で呼吸点0']=dead;
    }
  }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
