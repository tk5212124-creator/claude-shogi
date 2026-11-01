/* 編集モードで交点の駒をドラッグして置く（指でもマウスでも）。
   ・指のときは駒を指の少し上に浮かせ、その駒の位置に落とす（指の真下だと駒が隠れて隣の交点に落ちていた）
   ・落ちる先（交点／×のマスの中心）を輪で示す
   ・×のマス（両方の斜め線があるマス）の中心は「マスであり交点でもある」共有点なので、交点の駒を出し入れできる
   実行: node tests/edit-drag-point.mjs */
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const HTML=new URL('../shogi.html',import.meta.url).pathname;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const R={};
// 動画と同じ形：9×8 の盤、×（2×2マスの宮）の上の段のマスに歩、×の上の交点に兵、下の真ん中に漢
const setup=(xCell)=>{
  const NRr=9,NCc=8, bd=Array.from({length:NRr},()=>Array(NCc).fill(null));
  ['hL','hN','hS','hG','hK','hG','hS','hN'].forEach((t,c)=>bd[8][c]={t,p:1});
  for(let c=0;c<8;c++) if(c!==2) bd[6][c]={t:'hP',p:1};
  bd[0][4]={t:'hK',p:-1};
  const pts=Array.from({length:NRr+1},()=>Array(NCc+1).fill(null));
  [0,2,4,6,8].forEach(c=>pts[6][c]={t:'XP',p:1});
  pts[8][4]={t:'JK',p:1};
  const diag=Array.from({length:NRr},()=>Array(NCc).fill(null));
  diag[6][3]='l'; diag[6][4]='r'; diag[7][3]='r'; diag[7][4]='l';
  if(xCell) diag[7][1]='x';
  loadState(JSON.stringify({v:2,NR:NRr,NC:NCc,PZ:3,turn:1,youAreSente:true,gameOver:false,RULES:{pointMode:'auto'},board:bd,pts,diag,capYou:[],capEnemy:[]}));
  SFX.on=false; setEditing(true); editLayer='pt'; syncEditLayerUI(); render();
  document.querySelector('.board-wrap').scrollIntoView({block:'center'});
};
const where=p=>p.evaluate(()=>{ for(let r=0;r<=NR;r++)for(let c=0;c<=NC;c++){ const q=ptsBoard[r][c]; if(q&&q.t==='JK') return '交点'+r+','+c; }
  for(let r=0;r<NR;r++)for(let c=0;c<NC;c++){ const q=board[r][c]; if(q&&q.t==='JK') return 'マス'+r+','+c+'の中心'; } return '?'; });
const geoOf=async p=>p.evaluate(()=>{ const r=document.getElementById('board').getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; });

// ① 指：駒は指の上に浮く。浮いた駒を×の中心に合わせて離すと、そこに置ける
{ const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('file://'+HTML); await p.waitForTimeout(800);
  await p.evaluate(setup,false); await p.waitForTimeout(300);
  const g=await geoOf(p), pos=(r,c)=>({x:g.x+c*g.w/8, y:g.y+r*g.h/9});
  const cdp=await ctx.newCDPSession(p);
  const touch=(type,pt)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:pt.x,y:pt.y}]});
  const a=pos(8,4), z=pos(7,4);
  await touch('touchStart',a); await touch('touchMove',{x:a.x,y:a.y-20}); await touch('touchMove',{x:a.x,y:a.y-25});
  const lift=await p.evaluate(()=>{ const gh=document.querySelector('.drag-ghost'); if(!gh) return null; const r=gh.getBoundingClientRect(); return r.top+r.height/2; });
  const dy = lift==null? 0 : (a.y-25)-lift;           // 指と浮いた駒の縦のずれ
  R['①指で動かすと駒が浮く']= dy>10 ? '指の '+Math.round(dy)+'px 上' : '★浮かない';
  for(let i=1;i<=8;i++) await touch('touchMove',{x:a.x+(z.x-a.x)*i/8, y:(a.y-25)+((z.y+dy)-(a.y-25))*i/8});
  R['①落ちる先の輪']=await p.evaluate(([zx,zy])=>{ const m=document.querySelector('.drop-mark'); if(!m) return '★出ない';
    const r=m.getBoundingClientRect(); return Math.hypot(r.left+r.width/2-zx, r.top+r.height/2-zy)<4 ? '×の中心に出る' : '★ずれている'; },[z.x,z.y]);
  await touch('touchEnd',{x:z.x,y:z.y+dy}); await p.waitForTimeout(200);
  R['①×の中心に置ける']=await where(p);
  R['①輪は消える']=await p.evaluate(()=>document.querySelector('.drop-mark')?'★残る':'消える');
  R['①エラー']=errs; await ctx.close(); }

// ② マウス：駒は浮かせない。×のマス（両方の斜め線）の中心に交点の駒を出し入れできる
{ const p=await b.newPage({viewport:{width:390,height:844}}); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('file://'+HTML); await p.waitForTimeout(800);
  await p.evaluate(setup,true); await p.waitForTimeout(300);
  const g=await geoOf(p), pos=(r,c)=>({x:g.x+c*g.w/8, y:g.y+r*g.h/9});
  const drag=async(a,z)=>{ await p.mouse.move(a.x,a.y); await p.mouse.down(); await p.mouse.move(a.x+12,a.y+12,{steps:3});
    await p.mouse.move(z.x,z.y,{steps:8}); await p.mouse.up(); await p.waitForTimeout(150); };
  await drag(pos(8,4), pos(7,4)); R['②マウスで×の中心（交点）']=await where(p);
  await drag(pos(7,4), pos(7.5,1.5)); R['②×のマスの中心へ']=await where(p);
  await drag(pos(7.5,1.5), pos(8,2)); R['②×のマスの中心から交点へ']=await where(p);
  await drag(pos(8,2), pos(6,4)); R['②兵のいる交点には置けない']=await where(p)==='交点8,2' ? '元の交点に戻る' : '★'+await where(p);
  R['②エラー']=errs; }
console.log(JSON.stringify(R,null,1));
await b.close();
