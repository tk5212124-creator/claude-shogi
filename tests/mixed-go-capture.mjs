import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
import fs from 'fs';
const D=new URL('.',import.meta.url).pathname;
const C=JSON.parse(fs.readFileSync(D+'case26-mixed-go.json','utf8'));
const HTML=process.env.OLD_HTML && process.argv[2]==='old' ? process.env.OLD_HTML
                                                           : new URL('../shogi.html',import.meta.url).pathname;
const START=JSON.stringify({v:2,NR:C.NR,NC:C.NC,PZ:C.PZ,turn:1,youAreSente:true,gameOver:false,
  RULES:C.RULES, board:C.start.board, pts:C.start.pts, diag:C.start.diag,
  capYou:C.start.capYou, capEnemy:C.start.capEnemy});
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+HTML); await p.waitForTimeout(800);
const out=await p.evaluate(([START,KIFU])=>{
  loadState(START); SFX.on=false; kifu.length=0; gameOver=false;
  const R={};
  const snap=()=>({c:board.map(r=>r.map(x=>x?x.t+':'+x.p:null)),
                   p:ptsBoard.map(r=>r.map(x=>x?x.t+':'+x.p:null))});
  const at=(s,isPt,r,c)=>(isPt?s.p:s.c)[r][c];
  const took=[];
  let n=0;
  for(const k of KIFU){
    const before=snap();
    turn=k.side;
    applyMoveSilent(k.side, k.drop ? {drop:k.drop,tr:k.to[0],tc:k.to[1],pt:k.pt||undefined}
                                   : {fr:k.from[0],fc:k.from[1],tr:k.to[0],tc:k.to[1],promo:!!k.promo,promoTo:k.promoTo});
    turn=-k.side; n++;
    const after=snap();
    const gone=[];
    for(const isPt of [false,true]){
      const rows=isPt?NR+1:NR, cols=isPt?NC+1:NC;
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        if(!at(before,isPt,r,c) || at(after,isPt,r,c)) continue;
        if(!isPt && k.from && k.from[0]===r && k.from[1]===c) continue;   // 出て行っただけ
        gone.push((isPt?'pt':'cell')+'['+r+','+c+']='+at(before,isPt,r,c));
      }
    }
    if(gone.length) took.push({手:n, 消えた:gone});
  }
  R['手数']=n;
  R['取られた駒']=took;
  // ① 飛車がマスへ動いただけで交点の碁石が取れてしまわないこと（pointMode=auto）
  R['①12手目・16手目で碁石が取られたか']=
    took.filter(x=>x.手===12||x.手===16).flatMap(x=>x.消えた).filter(s=>s.startsWith('pt')).length;
  // ② 目に見えて呼吸点のある碁石が残っていること（11手目・13手目の黒石）
  R['②pt[1,3]の黒石']= ptsBoard[1][3]?ptsBoard[1][3].t:'★消えた';
  R['②pt[1,4]の黒石']= ptsBoard[1][4]?ptsBoard[1][4].t:'★消えた';
  // ③ 白石8個で囲まれた最下段の将棋駒が取られていること
  R['③cell[8,3] 金将']= board[8][3]?'★残る':'取れた';
  R['③cell[8,4] 玉将']= board[8][4]?'★残る':'取れた';
  R['③cell[8,5] 金将']= board[8][5]?'★残る':'取れた';
  R['③囲んでいない cell[8,2] 銀将']= board[8][2]?'残る（正しい）':'★取れた';
  // ④ 最後まで「取られるはずなのに残っている駒」が無いこと
  const left=[];
  for(const isPt of [false,true]){
    const L=isPt?ptsBoard:board, rows=isPt?NR+1:NR, cols=isPt?NC+1:NC;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      if(!L[r]||!L[r][c]) continue;
      const g=surroundedGroup(board,ptsBoard,isPt,r,c);
      if((g&&!g.free) || crossSurrounded(board,ptsBoard,isPt,r,c))
        left.push((isPt?'pt':'cell')+'['+r+','+c+']='+L[r][c].t);
    }
  }
  R['④取られずに残っている駒']=left;
  R['最終盤']=board.map(r=>r.map(x=>x?x.t:'.').join(' '));
  R['最終交点']=ptsBoard.map(r=>r.map(x=>x?(x.t==='GOB'?'●':'○'):'.').join(''));
  return R;
},[START,C.kifu]);
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
