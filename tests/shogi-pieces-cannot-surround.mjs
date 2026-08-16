import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
import fs from 'fs';
const D=new URL('.',import.meta.url).pathname;
const C=JSON.parse(fs.readFileSync(D+'case12-surround-drop.json','utf8'));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+new URL('../shogi.html',import.meta.url).pathname); await p.waitForTimeout(800);
const out=await p.evaluate(([C])=>{
  const R={};
  loadState(JSON.stringify({v:2,NR:C.NR,NC:C.NC,PZ:C.PZ,turn:1,youAreSente:true,gameOver:false,
    RULES:C.RULES, board:C.start.board,pts:C.start.pts,diag:C.start.diag,
    capYou:C.start.capYou,capEnemy:C.start.capEnemy}));
  SFX.on=false; kifu.length=0; gameOver=false;
  for(const k of C.kifu){
    turn=k.side;
    applyMoveSilent(k.side, k.drop?{drop:k.drop,tr:k.to[0],tc:k.to[1],pt:k.pt||undefined}
                                  :{fr:k.from[0],fc:k.from[1],tr:k.to[0],tc:k.to[1],promo:!!k.promo,promoTo:k.promoTo});
    turn=-k.side;
  }
  // ① 上下左右すべてが敵の将棋駒でも取られない
  R['①先手の歩(3行2列)']= board[2][1]?board[2][1].t+'（残る）':'★取られた';
  R['①その歩の隣4つ']=[[1,1],[3,1],[2,0],[2,2]].map(([r,c])=>board[r][c]?board[r][c].t+':'+board[r][c].p:'空き');
  R['①12手目の棋譜']=kifuToText().split('\n')[11];
  // ② 白石4個で囲まれた8手目の金将は取られている
  R['②後手の金将(9行4列)']= board[8][3]?'★残る':'取れた';
  R['②8手目の棋譜']=kifuToText().split('\n')[7];
  // ③ 同じ形を碁石に置き換えると取られる
  {
    const bd=Array.from({length:9},()=>Array(9).fill(null));
    bd[4][4]={t:'hP',p:1};
    for(const [r,c] of [[3,4],[5,4],[4,3],[4,5]]) bd[r][c]={t:'hP',p:-1};
    const mk=(b2)=>JSON.stringify({v:2,NR:9,NC:9,PZ:0,turn:-1,youAreSente:true,gameOver:false,
      RULES:Object.assign({},C.RULES,{pointMode:'cell',captureAll:true,drops:true}),
      board:b2, pts:Array.from({length:10},()=>Array(10).fill(null)),
      diag:Array.from({length:9},()=>Array(9).fill(null)),capYou:[],capEnemy:['GOW']});
    loadState(mk(bd)); SFX.on=false;
    R['③敵の歩4枚に囲まれた歩']= surroundedGroup(board,ptsBoard,false,4,4).free?'生き（正しい）':'★呼吸点0';
    bd[4][3]=null;
    for(const [r,c] of [[3,4],[5,4],[4,5]]) bd[r][c]={t:'GOW',p:-1};
    loadState(mk(bd)); SFX.on=false; gameOver=false;
    turn=-1; applyMoveSilent(-1,{drop:'GOW',tr:4,tc:3});      // 最後の1つを碁石で塞ぐ
    R['③敵の碁石4個に囲まれた歩']= board[4][4]?'★残る':'取れた';
    R['③その棋譜']=kifuToText().split('\n').pop();
  }
  return R;
},[C]);
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
