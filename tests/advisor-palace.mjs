import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const FILE=process.argv[2]==='old' ? (process.env.OLD_HTML||'') : new URL('../shogi.html',import.meta.url).pathname;
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+FILE); await p.waitForTimeout(800);
const out=await p.evaluate(()=>{
  // 仕・士は「宮に引かれた斜め線の上」しか動けないので、線の通っていない場所へは
  // 行けても打ててもいけない（行くと二度と動けなくなる）。
  // 標準の3×3九宮（×つき）を手で作る：中央が×、四隅が l / r
  const d=Array.from({length:9},()=>Array(9).fill(null));
  d[6][3]='l'; d[6][5]='r'; d[7][4]='x'; d[8][3]='r'; d[8][5]='l';
  d[0][3]='l'; d[0][5]='r'; d[1][4]='x'; d[2][3]='r'; d[2][5]='l';
  loadState(JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
    RULES:{drops:true,keepPromoted:false,nifu:true,sennichiteMode:'avoid',captureAll:false,
      banSennichite:false,pointMode:'auto',palace:true,palaceEscape:false,allowPass:false},
    board:Array.from({length:9},()=>Array(9).fill(null)),
    pts:Array.from({length:10},()=>Array(10).fill(null)), diag:d, capYou:[], capEnemy:[]}));
  SFX.on=false;
  const R={'×マスの数':(()=>{let n=0;for(let r=0;r<NR;r++)for(let c=0;c<NC;c++)if(getDiag(r,c)==='x')n++;return n;})()};
  let total=0,off=0,dead=0,dropBad=0,ex=[];
  for(let r=0;r<=NR;r++)for(let c=0;c<=NC;c++){
    ptsBoard[r][c]={t:'XAb',p:1};
    const dirs=ptDiagDirs(r,c).map(x=>x[0]+','+x[1]);
    for(const [tr,tc] of moves(ptsBoard,r,c)){
      total++;
      if(!dirs.includes(Math.sign(tr-r)+','+Math.sign(tc-c))){ off++; if(ex.length<3)ex.push((r+1)+','+(c+1)+'→'+(tr+1)+','+(tc+1)); }
      ptsBoard[r][c]=null; const s2=ptsBoard[tr][tc]; ptsBoard[tr][tc]={t:'XAb',p:1};
      if(moves(ptsBoard,tr,tc).length===0){ dead++; if(ex.length<3)ex.push('詰み'+(tr+1)+','+(tc+1)); }
      ptsBoard[tr][tc]=s2; ptsBoard[r][c]={t:'XAb',p:1};
    }
    ptsBoard[r][c]=null;
  }
  capYou.length=0; capYou.push('XAb');
  const tg=dropTargets(ptsBoard,'XAb',1);
  for(const [r,c] of tg){ ptsBoard[r][c]={t:'XAb',p:1};
    if(moves(ptsBoard,r,c).length===0) dropBad++; ptsBoard[r][c]=null; }
  R['生成された手']=total; R['線に沿っていない']=off; R['行った先で詰む']=dead;
  R['打てる点']=tg.length; R['打つと詰む点']=dropBad; R['例']=ex;
  // マスの中でも同じ検査
  const ps=document.getElementById('ptSel'); ps.value='cell'; ps.dispatchEvent(new Event('change'));
  let ct=0,co=0,cd=0,cdrop=0;
  for(let r=0;r<NR;r++)for(let c=0;c<NC;c++){
    board[r][c]={t:'XAb',p:1};
    for(const [tr,tc] of moves(board,r,c)){
      ct++; const g=getDiag(r,c), need=(tr-r)===(tc-c)?'l':'r';
      if(!(g===need||g==='x')) co++;
      board[r][c]=null; const s2=board[tr][tc]; board[tr][tc]={t:'XAb',p:1};
      if(moves(board,tr,tc).length===0) cd++;
      board[tr][tc]=s2; board[r][c]={t:'XAb',p:1};
    }
    board[r][c]=null;
  }
  capYou.length=0; capYou.push('XAb');
  for(const [r,c] of dropTargets(board,'XAb',1)){ board[r][c]={t:'XAb',p:1};
    if(moves(board,r,c).length===0) cdrop++; board[r][c]=null; }
  R['マス：手']=ct; R['マス：線に沿っていない']=co; R['マス：行った先で詰む']=cd; R['マス：打つと詰む']=cdrop;
  return R;
});
console.log('--- '+(process.argv[2]||'new')+' ---'); console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
