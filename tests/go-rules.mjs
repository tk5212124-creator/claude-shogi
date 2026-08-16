import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+new URL('../shogi.html',import.meta.url).pathname); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  // 囲みで取られる判定は駒の種類を問わない。上下左右でつながった同じ側の駒を1つの群とし、
  // 群の呼吸点が0になったら丸ごと取られる。自殺手は打てないが、
  // 相手の群を取って呼吸点が生まれるなら合法。
  const R={};
  const RU=()=>({drops:true,keepPromoted:false,nifu:true,sennichiteMode:'none',captureAll:true,
      banSennichite:false,pointMode:'point',palaceEscape:false,allowPass:true,randomIncludeSpecial:true});
  const mk=(pts,cy,ce,n)=>JSON.stringify({v:2,NR:n||9,NC:n||9,PZ:0,turn:1,youAreSente:true,gameOver:false,
    RULES:RU(), board:Array.from({length:n||9},()=>Array(n||9).fill(null)),
    pts, diag:Array.from({length:n||9},()=>Array(n||9).fill(null)), capYou:cy||[], capEnemy:ce||[]});
  const P=(n)=>Array.from({length:(n||9)+1},()=>Array((n||9)+1).fill(null));

  // ① 囲碁プリセット：400石ずつ・パス可
  {
    document.getElementById('presetSel').value='go';
    document.getElementById('presetSel').dispatchEvent(new Event('change'));
    document.getElementById('applyPresetBtn').click(); SFX.on=false;
    R['①初期持ち駒']={先手:capYou.length, 後手:capEnemy.length,
      先手の色:[...new Set(capYou)], 後手の色:[...new Set(capEnemy)]};
    R['①allowPass']=RULES.allowPass;
    R['①盤']=NR+'×'+NC;
  }
  // ② 連続2パスで終局／間に着手が入るとリセット
  {
    const pts=P(); pts[4][4]={t:'GOB',p:1};
    loadState(mk(pts,['GOB','GOB'],['GOW','GOW'])); SFX.on=false;
    turn=1; applyMoveSilent(1,{pass:true});
    R['②1回目のパス後']={終局:gameOver};
    turn=-1; applyMoveSilent(-1,{pass:true});
    R['②2回目のパス後']={終局:gameOver, 状態:document.getElementById('status').textContent};
  }
  {
    const pts=P(); loadState(mk(pts,['GOB','GOB'],['GOW','GOW'])); SFX.on=false;
    turn=1; applyMoveSilent(1,{pass:true});
    turn=-1; applyMoveSilent(-1,{drop:'GOW',tr:2,tc:2,pt:true});   // 間に通常着手
    turn=1;  applyMoveSilent(1,{pass:true});
    R['③間に着手→パス1回目']={終局:gameOver};
    turn=-1; applyMoveSilent(-1,{pass:true});
    R['③さらにパス']={終局:gameOver};
  }
  // ④ 連結群の一括捕獲：黒3子を白で完全に囲む
  {
    const pts=P();
    for(const c of [3,4,5]) pts[4][c]={t:'GOB',p:1};              // 黒3子（横並び）
    for(const [r,c] of [[3,3],[3,4],[3,5],[5,3],[5,4],[5,5],[4,2]]) pts[r][c]={t:'GOW',p:-1};
    loadState(mk(pts,[],['GOW'])); SFX.on=false;
    const before=[3,4,5].map(c=>pts[4][c]?'黒':'空').join('');
    turn=-1; applyMoveSilent(-1,{drop:'GOW',tr:4,tc:6,pt:true});   // 最後の呼吸点をふさぐ
    const after=[3,4,5].map(c=>ptsBoard[4][c]?'残':'取').join('');
    R['④黒3子を囲む']={打つ前:before, 打った後:after, 後手の持ち駒:capEnemy.filter(x=>x==='GOB').length+'個の黒石'};
  }
  // ⑤ 呼吸点が1つでも残っていれば取られない
  {
    const pts=P();
    for(const c of [3,4,5]) pts[4][c]={t:'GOB',p:1};
    for(const [r,c] of [[3,3],[3,4],[3,5],[5,3],[5,4],[5,5],[4,2]]) pts[r][c]={t:'GOW',p:-1};
    loadState(mk(pts,[],[])); SFX.on=false;
    captureSurroundedScan(null,[[true,4,4]]);
    R['⑤呼吸点1つ残り']=[3,4,5].map(c=>ptsBoard[4][c]?'残る':'★取られた').join(',');
  }
  // ⑥ 自殺手：呼吸点が無い所へは打てない
  {
    const pts=P();
    for(const [r,c] of [[3,4],[5,4],[4,3],[4,5]]) pts[r][c]={t:'GOW',p:-1};  // 白で囲まれた1点
    loadState(mk(pts,['GOB'],[])); SFX.on=false;
    const tg=dropTargets(ptsBoard,'GOB',1).some(([r,c])=>r===4&&c===4);
    R['⑥自殺点が候補に入るか']= tg?'★入る':'入らない（正しい）';
    R['⑥人の合法判定']= isLegalMove({drop:'GOB',tr:4,tc:4,pt:true},1)?'★指せる':'指せない（正しい）';
    R['⑥CPUが生成するか']= genMoves(ptsBoard,1,capYou,capEnemy).some(m=>m.drop==='GOB'&&m.tr===4&&m.tc===4)?'★生成する':'しない（正しい）';
  }
  // ⑦ 取れば生きる手は合法
  {
    // 白1子(4,4)の呼吸点を黒が最後に塞ぐ。黒の打つ点(3,4)自体は黒に囲まれて呼吸点0に見えるが、
    // 白を取ることで呼吸点が生まれるので合法。
    const pts=P();
    pts[4][4]={t:'GOW',p:-1};
    for(const [r,c] of [[5,4],[4,3],[4,5]]) pts[r][c]={t:'GOB',p:1};   // 白の呼吸点は(3,4)だけ
    for(const [r,c] of [[2,4],[3,3],[3,5]]) pts[r][c]={t:'GOB',p:1};   // 打つ点(3,4)の周りも黒
    loadState(mk(pts,['GOB'],[])); SFX.on=false;
    R['⑦取れば生きる手が候補に']= dropTargets(ptsBoard,'GOB',1).some(([r,c])=>r===3&&c===4)?'入る（正しい）':'★入らない';
    R['⑦人の合法判定']= isLegalMove({drop:'GOB',tr:3,tc:4,pt:true},1)?'指せる（正しい）':'★指せない';
    turn=1; applyMoveSilent(1,{drop:'GOB',tr:3,tc:4,pt:true});
    R['⑦打った結果']={白石:ptsBoard[4][4]?'★残った':'取れた', 黒石:ptsBoard[3][4]?'置かれた':'★消えた',
      先手の持ち駒の白:capYou.filter(x=>x==='GOW').length};
  }
  // ⑧ 読み(simulate)と実盤が一致するか
  {
    const pts=P();
    for(const c of [3,4,5]) pts[4][c]={t:'GOB',p:1};
    for(const [r,c] of [[3,3],[3,4],[3,5],[5,3],[5,4],[5,5],[4,2]]) pts[r][c]={t:'GOW',p:-1};
    loadState(mk(pts,[],['GOW'])); SFX.on=false;
    const m={drop:'GOW',tr:4,tc:6,pt:true};
    const s=simulate(board,m,-1,capYou,capEnemy);
    const simPts=s.nb.L.pts;
    turn=-1; applyMoveSilent(-1,m);
    let diff=0;
    for(let r=0;r<=NR;r++)for(let c=0;c<=NC;c++){
      const a=simPts[r]&&simPts[r][c], bq=ptsBoard[r]&&ptsBoard[r][c];
      if((a?a.t+a.p:null)!==(bq?bq.t+bq.p:null)) diff++;
    }
    R['⑧読みと実盤の食い違い']=diff;
    R['⑧持ち駒の食い違い']=(s.nce.slice().sort().join(',')===capEnemy.slice().sort().join(','))?0:'★あり';
  }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
