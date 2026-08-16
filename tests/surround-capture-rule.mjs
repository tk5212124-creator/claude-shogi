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
  const start=(on)=>JSON.stringify({v:2,NR:C.NR,NC:C.NC,PZ:C.PZ,turn:1,youAreSente:true,gameOver:false,
    RULES:Object.assign({},C.RULES,{surroundCapture:on}),
    board:C.start.board,pts:C.start.pts,diag:C.start.diag,
    capYou:C.start.capYou,capEnemy:C.start.capEnemy});
  const play=(on)=>{
    loadState(start(on)); SFX.on=true; kifu.length=0; gameOver=false;
    const dmg=[]; const _d=window.dmgAt; window.dmgAt=(x,y,v,c)=>{dmg.push(v);};
    const _c=window.computeFx; let fx=null; window.computeFx=(...a)=>{const r=_c(...a); fx=r; return r;};
    const caps=[];
    for(const k of C.kifu){
      turn=k.side; fx=null;
      applyMoveSilent(k.side, k.drop?{drop:k.drop,tr:k.to[0],tc:k.to[1],pt:k.pt||undefined}
                                    :{fr:k.from[0],fc:k.from[1],tr:k.to[0],tc:k.to[1],promo:!!k.promo,promoTo:k.promoTo});
      if(fx&&fx.caps.length) caps.push(kifu.length+'手目 '+fx.caps.map(x=>x.code+'@'+(x.r+1)+'行'+(x.c+1)+'列').join('・'));
      turn=-k.side;
    }
    window.dmgAt=_d; window.computeFx=_c;
    return {caps, kifu:kifuToText().split('\n')};
  };
  // ① ONのとき：報告どおりに再現できるか
  const on=play(true);
  const cur=board.map(r=>r.map(x=>x?x.t+':'+x.p:null));
  const want=C.board.map(r=>r.map(x=>x?x.t+':'+x.p:null));
  const diff=[]; for(let r=0;r<C.NR;r++)for(let c=0;c<C.NC;c++) if(cur[r][c]!==want[r][c]) diff.push([r+1,c+1,cur[r][c],want[r][c]]);
  R['①報告の盤と一致']=diff.length===0?'一致':diff;
  R['①持ち駒も一致']=(JSON.stringify(capYou)===JSON.stringify(C.capYou))&&(JSON.stringify(capEnemy)===JSON.stringify(C.capEnemy));
  R['①12手目の棋譜']=on.kifu[11];
  R['①囲みで取った駒に演出が付くか']=on.caps.filter(s=>/^8手目|^12手目/.test(s));
  // ② OFFのとき：囲みで取られない
  const off=play(false);
  R['②12手目の棋譜']=off.kifu[11];
  R['②先手の歩(3行2列)']=board[2][1]?board[2][1].t+'（残る）':'★取られた';
  R['②8手目の金将(9行4列)']=board[8][3]?board[8][3].t+'（残る）':'★取られた';
  R['②碁石も取られないか']=(()=>{           // 囲碁の3子囲みで確かめる
    const pts=Array.from({length:10},()=>Array(10).fill(null));
    for(const c of [3,4,5]) pts[4][c]={t:'GOB',p:1};
    for(const [r,c] of [[3,3],[3,4],[3,5],[5,3],[5,4],[5,5],[4,2],[4,6]]) pts[r][c]={t:'GOW',p:-1};
    pts[4][5]=null;
    loadState(JSON.stringify({v:2,NR:9,NC:9,PZ:0,turn:-1,youAreSente:true,gameOver:false,
      RULES:Object.assign({},C.RULES,{surroundCapture:false,captureAll:true,pointMode:'point',drops:true}),
      board:Array.from({length:9},()=>Array(9).fill(null)),pts,
      diag:Array.from({length:9},()=>Array(9).fill(null)),capYou:[],capEnemy:['GOW']}));
    SFX.on=false; gameOver=false;
    turn=-1; applyMoveSilent(-1,{drop:'GOW',tr:4,tc:5,pt:true});
    return (ptsBoard[4][3]&&ptsBoard[4][4])?'残る（正しい）':'★取られた';
  })();
  R['②自殺手の制限も外れるか']=isSuicidePlacement(board,ptsBoard,true,4,5,'GOB',1)?'★自殺手':'置ける';
  return R;
},[C]);
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
