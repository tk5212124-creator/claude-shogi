import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const FILE=process.argv[2]==='old' ? (process.env.OLD_HTML||'') : new URL('../shogi.html',import.meta.url).pathname;
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+FILE); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  const R={};
  const RU=(pm)=>({drops:true,keepPromoted:false,nifu:true,sennichiteMode:'none',captureAll:true,
      banSennichite:false,pointMode:pm,palaceEscape:false,allowPass:false,randomIncludeSpecial:true});
  const mk=(o,pm)=>JSON.stringify(Object.assign({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
    RULES:RU(pm||'auto'),
    board:Array.from({length:9},()=>Array(9).fill(null)),
    pts:Array.from({length:10},()=>Array(10).fill(null)),
    diag:Array.from({length:9},()=>Array(9).fill(null)),capYou:[],capEnemy:[]},o));
  const ok=q=> q? ((q.t==='GOB'&&q.p===1)||(q.t==='GOW'&&q.p===-1) ? '一致' : '★食い違い') : '無し';

  // A) オセロで裏返された碁石
  {
    const bd=Array.from({length:9},()=>Array(9).fill(null));
    bd[4][2]={t:'OTH',p:-1}; bd[4][3]={t:'OTH',p:1}; bd[4][4]={t:'GOB',p:1};
    loadState(mk({board:bd},'cell')); SFX.on=false;
    capEnemy.push('OTH'); turn=-1;
    applyMoveSilent(-1,{drop:'OTH',tr:4,tc:5});
    const q=board[4][4];
    R['A_裏返された碁石']={色:q?q.t:null, 持ち主:q?(q.p===1?'先手':'後手'):null, 判定:ok(q)};
  }
  // B) 読み（simulate）側でも同じか
  {
    const bd=Array.from({length:9},()=>Array(9).fill(null));
    bd[4][2]={t:'OTH',p:-1}; bd[4][3]={t:'OTH',p:1}; bd[4][4]={t:'GOB',p:1};
    loadState(mk({board:bd},'cell')); SFX.on=false;
    capEnemy.push('OTH');
    const s=simulate(board,{drop:'OTH',tr:4,tc:5},-1,capYou,capEnemy);
    R['B_読みの中の碁石']=ok(s.nb[4][4]);
  }
  // C) ランダム置換で碁石になったとき
  {
    const pts=Array.from({length:10},()=>Array(10).fill(null));
    for(let i=0;i<9;i++){ pts[1][i]={t:'GOB',p:1}; pts[7][i]={t:'GOW',p:-1}; }
    loadState(mk({pts})); SFX.on=false;
    let bad=0, n=0;
    for(let k=0;k<40;k++){
      randomReplace('full');
      for(let r=0;r<=NR;r++)for(let c=0;c<=NC;c++){
        const q=ptsBoard[r]&&ptsBoard[r][c];
        if(q&&isGo(q.t)){ n++; if(ok(q)!=='一致') bad++; }
      }
    }
    R['C_ランダム置換']={碁石の数:n, 食い違い:bad};
  }
  // D) 編集で「後手の黒石」を置こうとしたら
  {
    loadState(mk({},'point')); SFX.on=false;
    setEditing(true); editSide=-1; editCell={r:4,c:4};
    if(typeof editLayerIsPt==='function'){}
    const L=ptsBoard;
    const own=(typeof ownerOf==='function')?ownerOf('GOB',-1):-1;   // 旧版には無い
    L[4][4]={t:'GOB',p:own};
    R['D_編集で後手に黒石']={持ち主:L[4][4].p===1?'先手':'後手', 判定:ok(L[4][4])};
    setEditing(false);
  }
  // E) 仕上げ：どの経路でも「自分の色の石は取れない」
  {
    const pts=Array.from({length:10},()=>Array(10).fill(null));
    pts[4][4]={t:'GOB',p:1};
    for(const [r,c] of [[3,4],[5,4],[4,3],[4,5]]) pts[r][c]={t:'GOB',p:1};
    loadState(mk({pts})); SFX.on=false; captureSurroundedScan(null,[[true,4,4],[true,3,4],[true,5,4],[true,4,3],[true,4,5]]);
    R['E_黒石を黒で囲む']= ptsBoard[4][4]?'残る（正しい）':'★消えた';
  }
  return R;
});
console.log('--- '+(process.argv[2]||'new')+' ---');
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
