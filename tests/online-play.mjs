/* オンライン対戦（招待URL方式）を、ブラウザ2つで本当につないで確かめる。
   手元に PeerJS の仲介サーバーを立てて使う（本番は PeerJS の公開サーバー）。

   用意（1回だけ）:  mkdir -p /tmp/peerjs && cd /tmp/peerjs && npm i peer@1 peerjs@1.5.4
   実行:             PEER_DIR=/tmp/peerjs node tests/online-play.mjs
   PEER_DIR が無ければ何もせず「スキップ」と出して終わる。 */
import { createRequire } from 'module';
const PEER_DIR=process.env.PEER_DIR;
if(!PEER_DIR){ console.log('スキップ：PEER_DIR（peer と peerjs を入れたフォルダ）が指定されていません'); process.exit(0); }
const req=createRequire(PEER_DIR+'/package.json');
const { PeerServer } = req('peer');
const LIB_PATH=PEER_DIR+'/node_modules/peerjs/dist/peerjs.min.js';
const peerSrv=await new Promise(ok=>{ const s=PeerServer({port:9000,path:'/myapp',host:'127.0.0.1'},()=>ok(s)); });
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT=new URL('..',import.meta.url).pathname, LIB=LIB_PATH;
// 本番と同じく http で配る（招待URLの ?room= も同じ形で試す）
const srv=http.createServer((q,res)=>{
  let u=decodeURIComponent(q.url.split('?')[0]); if(u==='/') u='/shogi.html';
  const f = u==='/peerjs.min.js' ? LIB : path.join(ROOT,u);
  fs.readFile(f,(e,b)=>{ if(e){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type': f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream'}); res.end(b); });
}).listen(8123,'127.0.0.1');
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-proxy-server']});
const init=()=>{ window.ONLINE_PEER_OPTS={host:'127.0.0.1',port:9000,path:'/myapp',secure:false};
  window.PEERJS_SRC_OVERRIDE='/peerjs.min.js'; };
const mk=async(url)=>{ const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(String(e))); await p.addInitScript(init); await p.goto(url); await p.waitForTimeout(700);
  await p.evaluate(()=>{ SFX.on=false; }); return {p,errs}; };
const H=await mk('http://127.0.0.1:8123/shogi.html');
const until=async(pg,fn,ms=8000,arg)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await pg.evaluate(fn,arg)) return true; await new Promise(r=>setTimeout(r,100)); } return false; };
await H.p.evaluate(()=>document.getElementById('onlineCreate').click());
await until(H.p,()=>!!Online.code && document.getElementById('onlineCodeRow').style.display!=='none');
const url=await H.p.evaluate(()=>document.getElementById('onlineUrl').value);
const G=await mk(url);
const R={招待URL:url.replace(/room=.*/,'room=…')};
R['つながった']=await until(H.p,()=>Online.connected) && await until(G.p,()=>Online.connected && !Online.hold && turn===-1);
// 両方の盤を「ホストの向き」にそろえて比べる
const snap=pg=>pg.evaluate(()=>{ const s=stateJSON(); return {NR:s.NR,NC:s.NC,turn:s.turn,board:s.board,pts:s.pts,diag:s.diag,capYou:s.capYou,capEnemy:s.capEnemy,gameOver:gameOver}; });
const flipBack=(g)=>{ const R_=g.NR,C=g.NC, mc=t=>t==='GOB'?'GOW':t==='GOW'?'GOB':t;
  const f=(a,rows,cols)=>Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>{const x=a[rows-1-r][cols-1-c]; return x?mc(x.t)+':'+(-x.p):null;}));
  return {turn:-g.turn, board:f(g.board,R_,C), pts:f(g.pts,R_+1,C+1),
    diag:Array.from({length:R_},(_,r)=>Array.from({length:C},(_,c)=>g.diag[R_-1-r][C-1-c])),
    capYou:g.capEnemy.map(mc).sort().join(','), capEnemy:g.capYou.map(mc).sort().join(','), gameOver:g.gameOver}; };
const norm=h=>({turn:h.turn, board:h.board.map(r=>r.map(x=>x?x.t+':'+x.p:null)), pts:h.pts.map(r=>r.map(x=>x?x.t+':'+x.p:null)),
  diag:h.diag, capYou:h.capYou.slice().sort().join(','), capEnemy:h.capEnemy.slice().sort().join(','), gameOver:h.gameOver});
// 盤を送り直した直後は、届くまでのわずかな間だけ古い盤が見えることがある。
// 3秒まで待ってそろえば「一致」。それでも違えば本当に食い違っている
const same=async(gp)=>{ let last=''; gp=gp||G.p;
  for(const t0=Date.now(); Date.now()-t0<3000; ){
    const h=norm(await snap(H.p)), g=flipBack(await snap(gp));
    const bad=[]; for(const k of Object.keys(h)) if(JSON.stringify(h[k])!==JSON.stringify(g[k])) bad.push(k);
    if(!bad.length) return '一致';
    last='★食い違い：'+bad.join(',');
    await new Promise(r=>setTimeout(r,100));
  }
  return last; };
R['①つながった直後の盤']=await same();
// 対局の途中で作った側が設定を変えると、入った側に許可を求める窓が出る。ここでは許可して進める
const approve=async(gp)=>{ gp=gp||G.p;
  if(await until(gp,()=>document.getElementById('proposeModal').classList.contains('show'),2500))
    await gp.evaluate(()=>document.getElementById('proposeYes').click()); };
R['①ゲストの向き']=await G.p.evaluate(()=>({自分の玉:board[8][4]&&board[8][4].t+':'+board[8][4].p, 手番:turn, 状態:document.getElementById('status').textContent}));
// ② ホストが歩を突く（画面のタップと同じ onCell を通す）
const tap=(pg,r,c,pt)=>pg.evaluate(([r,c,pt])=>onCell(r,c,!!pt),[r,c,pt]);
await tap(H.p,6,6); await tap(H.p,5,6);   // 角道を開ける
await until(G.p,()=>turn===1);
R['②ホストが1手指したあと']=await same();
// ③ ゲストは自分の番でないときは動かせない／待ったは使えない
await tap(H.p,6,2); await tap(H.p,5,2);   // ホストが自分の番でないのに指そうとする
R['③番でない側は動かせない']=await H.p.evaluate(()=>board[6][2]?'動かなかった':'★動いた');
await G.p.evaluate(()=>document.getElementById('undo').click());
R['③待ったは使えない']=await G.p.evaluate(()=>document.getElementById('status').textContent);
await G.p.evaluate(()=>document.getElementById('reset').click());
R['③ゲストは指し直しできない']=await G.p.evaluate(()=>document.getElementById('status').textContent);
// ④ ゲストが指す → ホストに届く
await tap(G.p,6,6); await tap(G.p,5,6);
await until(H.p,()=>turn===1);
R['④ゲストが指したあと']=await same();
// ⑤ 角交換で成り（成り確認のボタンを押す）と、持ち駒を打つ
await tap(H.p,7,7); await tap(H.p,1,1);   // 角で角を取る（敵陣に入るので成り確認）
await H.p.evaluate(()=>document.getElementById('promoYes').click());
await until(G.p,()=>turn===1);
await tap(G.p,8,6); await tap(G.p,7,7);   // 銀で取り返す（ホストの (0,2) の銀＝ゲストの (8,6)）
await until(H.p,()=>turn===1);
R['⑤角交換と成り']=await same();
R['⑤持ち駒']=await H.p.evaluate(()=>({あなた:capYou.join(','),相手:capEnemy.join(',')}));
await H.p.evaluate(()=>{ sel={drop:true,t:'hB',p:1}; }); await tap(H.p,4,4);
await until(G.p,()=>turn===1);
R['⑤角を打ったあと']=await same();
// ⑥ ホストがプリセットを変えると送り直される（チェス）
await H.p.evaluate(()=>{ document.getElementById('presetSel').value='chess'; document.getElementById('applyPresetBtn').click(); SFX.on=false; });
await approve();
await until(G.p,()=>NR===8 && Online.ply===0);
R['⑥チェスに変えたあと']=await same();
// ⑦ チェスの特殊な手：ホストのキャスリング（キング側）とゲストのアンパッサン
await H.p.evaluate(()=>{ // キャスリングできる形にして送り直す
  board[7][5]=null; board[7][6]=null; board[6][4]={t:'cP',p:1}; board[4][4]=null;
  render(); onlineSendState(); });
await until(G.p,()=>Online.ply===0 && !board[0][1] );
await tap(H.p,7,4); await tap(H.p,7,6);    // キング e1→g1（キング側キャスリング）
await until(G.p,()=>turn===1);
R['⑦ホストのキャスリング']=await same();
R['⑦ルークも動いたか']=await H.p.evaluate(()=>({キング:board[7][6]&&board[7][6].t, ルーク:board[7][5]&&board[7][5].t}));
// アンパッサン：ホストのポーンが5段目にいて、ゲストが隣のポーンを2歩進める
await H.p.evaluate(()=>{ board[6][4]=null; board[3][4]={t:'cP',p:1}; turn=-1; render(); onlineSendState(); });
await until(G.p,()=>Online.ply===0 && turn===1);
R['⑦ep前 ゲストの手番']=await G.p.evaluate(()=>turn);
R['⑦ep前 ゲストの盤']=await G.p.evaluate(()=>({p64:board[6][4]&&board[6][4].t+':'+board[6][4].p, 行き先:moves(board,6,4).map(m=>m.join(',')), sel:JSON.stringify(sel), 合法:isLegalMove({fr:6,fc:4,tr:4,tc:4},1)}));
await tap(G.p,6,4); await tap(G.p,4,4);    // ゲストのポーン 2歩（ホストの盤では (1,3)→(3,3)）
R['⑦ゲストが指したあと']=await G.p.evaluate(()=>({p44:board[4][4]&&board[4][4].t, 状態:document.getElementById('status').textContent, ply:Online.ply}));
await until(H.p,()=>turn===1);
R['⑦ep前 ホストの盤']=await H.p.evaluate(()=>({自分:board[3][4]&&board[3][4].t+':'+board[3][4].p, 隣:board[3][3]&&board[3][3].t+':'+board[3][3].p, 手番:turn}));
R['⑦アンパッサンできる形か']=await H.p.evaluate(()=>isEnPassant(3,4,2,3,1));
await tap(H.p,3,4); await tap(H.p,2,3);    // ホストがアンパッサン
await until(G.p,()=>turn===1);
R['⑦ホストのアンパッサン']=await same();
R['⑦棋譜に印']=await H.p.evaluate(()=>!!(kifu[kifu.length-1]||{}).enpassant);
R['⑦ゲスト側で取られたポーン']=await G.p.evaluate(()=>board[4][4]?'★残っている':'消えた');
// ⑧ 囲碁：碁石の色が入れ替わっても同じ局面
await H.p.evaluate(()=>{ document.getElementById('presetSel').value='go'; document.getElementById('applyPresetBtn').click(); SFX.on=false; });
await approve();
await until(G.p,()=>NR===19 && Online.ply===0);
await H.p.evaluate(()=>{ sel={drop:true,t:'GOB',p:1}; }); await tap(H.p,3,3,true);
await until(G.p,()=>turn===1);
await G.p.evaluate(()=>{ sel={drop:true,t:'GOB',p:1}; }); await tap(G.p,15,15,true);
await until(H.p,()=>turn===1);
R['⑧囲碁で1手ずつ']=await same();
R['⑧ゲストの画面では自分の石が黒']=await G.p.evaluate(()=>{ const a=ptsBoard[16][16], b2=ptsBoard[15][15]; return {相手の石:a&&a.t+':'+a.p, 自分の石:b2&&b2.t+':'+b2.p}; });
// ⑪ 先後入替（ホストだけ）：ゲストが先手になる
await H.p.evaluate(()=>{ document.getElementById('presetSel').value='hon'; document.getElementById('applyPresetBtn').click(); SFX.on=false; });
await approve();
await until(G.p,()=>NR===9 && Online.ply===0);
await H.p.evaluate(()=>document.getElementById('swapSides').click());
await until(G.p,()=>Online.ply===0 && turn===1);
R['⑪先後入替のあと']={ホスト:await H.p.evaluate(()=>({先手:youAreSente,手番:turn})), ゲスト:await G.p.evaluate(()=>({先手:youAreSente,手番:turn})), 盤:await same()};
await G.p.evaluate(()=>{ document.getElementById('ruleBtn').click(); });
R['⑪ゲストはルールを開けない']=await G.p.evaluate(()=>document.getElementById('ruleModal').classList.contains('show')?'★開いた':'開かない');
await tap(G.p,6,2); await tap(G.p,5,2);
await until(H.p,()=>turn===1);
R['⑪ゲストが先に指せる']=await same();
// ⑫ 食い違い：ゲストの手数をわざとずらす → ホストの手が届いたとき送り直しで揃う
await G.p.evaluate(()=>{ Online.ply+=5; });
await tap(H.p,6,6); await tap(H.p,5,6);
await until(G.p,()=>Online.ply===0, 8000);
R['⑫食い違いから立ち直る']=await same();
R['⑫立ち直ったあと続けて指せる']=await (async()=>{ const who=await G.p.evaluate(()=>turn===1?'G':'H');
  const P= who==='G'?G.p:H.p, O= who==='G'?H.p:G.p;
  await tap(P,6,0); await tap(P,5,0); await until(O,()=>turn===1); return await same(); })();
// ⑬ 成り先がランダムでも同じ駒になる
await H.p.evaluate(()=>{ RULES.randomPromote=true; RULES.promoOnZone=true;
  for(let r=0;r<NR;r++)for(let c=0;c<NC;c++){ const q=board[r][c]; if(q&&q.t!=='hK'&&q.t!=='hKw') board[r][c]=null; }
  board[3][0]={t:'hG',p:1}; turn=1; render(); onlineSendState(); });
await until(G.p,()=>Online.ply===0 && turn===-1);
await tap(H.p,3,0); await tap(H.p,2,0);
await H.p.evaluate(()=>{ if(document.getElementById('promoModal').classList.contains('show')) document.getElementById('promoYes').click(); });
await until(G.p,()=>turn===1);
R['⑬ランダムに成った駒']={ホスト:await H.p.evaluate(()=>board[2][0]&&board[2][0].t), ゲスト:await G.p.evaluate(()=>board[6][8]&&board[6][8].t), 盤:await same()};
// ⑮ 相手が入ったあとでも、ホストは盤の編集・ルール設定・盤の大きさを変えられ、そのまま相手に届く
// ゲストの番にしてからホストが編集を始める → ゲストは指せない
await H.p.evaluate(()=>{ turn=-1; onlineSendState(); });
await until(G.p,()=>Online.ply===0 && turn===1);
await H.p.evaluate(()=>setEditing(true));
await until(G.p,()=>!!Online.hold);
const gB=await G.p.evaluate(()=>JSON.stringify(board));
await tap(G.p,6,0); await tap(G.p,5,0);
R['⑮編集中はゲストが指せない']={状態:await G.p.evaluate(()=>document.getElementById('status').textContent),
  盤:(await G.p.evaluate(()=>JSON.stringify(board)))===gB?'動かない':'★動いた'};
await H.p.evaluate(()=>{ board[4][4]={t:'hR',p:1}; board[4][5]={t:'hB',p:-1}; setEditing(false); });
await approve();
await until(G.p,()=>Online.ply===0 && board[4][4] && board[4][4].t==='hR');
R['⑮盤を編集したあと']=await same();
R['⑮編集が終わると指せる']=await G.p.evaluate(()=>Online.hold===null && !Online.remoteTurn());
await H.p.evaluate(()=>{ turn=-1; onlineSendState(); });
await until(G.p,()=>Online.ply===0 && turn===1);
await H.p.evaluate(()=>document.getElementById('ruleBtn').click());
await until(G.p,()=>!!Online.hold);
R['⑮ルール画面を開いている間']=await G.p.evaluate(()=>document.getElementById('status').textContent);
await H.p.evaluate(()=>{ const cb=document.getElementById('rNifu'); cb.checked=!cb.checked; cb.dispatchEvent(new Event('change')); document.getElementById('ruleClose').click(); });
await approve();
await new Promise(r=>setTimeout(r,600));
R['⑮ルール設定（二歩）がそろう']={ホスト:await H.p.evaluate(()=>RULES.nifu), ゲスト:await G.p.evaluate(()=>RULES.nifu),
  閉じたら指せる:await G.p.evaluate(()=>Online.hold===null)};
await H.p.evaluate(()=>{ document.getElementById('presetSel').value='mini'; document.getElementById('applyPresetBtn').click(); SFX.on=false; });
await approve();
await until(G.p,()=>NR===5 && Online.ply===0);
R['⑮盤の大きさを変えたあと']=await same();
// ⑬' ランダムに成った先が碁石だった場合（たまにしか起きないので、成り先を決めて確かめる）
await H.p.evaluate(()=>{ document.getElementById('presetSel').value='hon'; document.getElementById('applyPresetBtn').click(); SFX.on=false; });
await until(G.p,()=>NR===9 && Online.ply===0);
await H.p.evaluate(()=>{ for(let r=0;r<NR;r++)for(let c=0;c<NC;c++){ const q=board[r][c]; if(q&&q.t!=='hK'&&q.t!=='hKw') board[r][c]=null; }
  board[3][1]={t:'hG',p:1}; turn=1; render(); onlineSendState(); });
await until(G.p,()=>Online.ply===0 && turn===-1 && NR===9 && !board[6][0]);
await H.p.evaluate(()=>{ applyMoveSilent(1,{fr:3,fc:1,tr:2,tc:1,promo:true,promoTo:'GOW'}); afterPlayer(); });
await until(G.p,()=>turn===1);
R["⑬'碁石に成ったとき"]={ホスト:await H.p.evaluate(()=>{const q=board[2][1]; return q&&q.t+':'+q.p;}),
  ゲスト:await G.p.evaluate(()=>{const q=board[6][7]; return q&&q.t+':'+q.p;}), 盤:await same()};
// ⑨ 投了
await G.p.evaluate(()=>{ document.getElementById('presetSel').value='hon'; });
await G.p.evaluate(()=>document.getElementById('onlineResign').click());
await until(H.p,()=>gameOver);
R['⑨ゲストが投了']=await H.p.evaluate(()=>document.getElementById('status').textContent);
// ⑩ ゲストが閉じる
await G.p.close({runBeforeUnload:true});
R['⑩切れたと気づくまで']=(await until(H.p,()=>!Online.connected,8000))?'8秒以内':'★8秒では気づかない';
R['⑩相手が閉じたあと']=await H.p.evaluate(()=>document.getElementById('onlineState').textContent);
// ⑭ 同じ招待URLを開き直すと再開できる
const G2=await mk(url);
// つながってからホストの盤が届くまでは Online.hold が立っていて指せない
// （手元では一瞬で届くので観測できない。待ち状態で指せないことは ⑮ で確かめている）
R['⑭開き直してつながる']=await until(G2.p,()=>Online.connected && !Online.hold, 10000);
const h2=norm(await snap(H.p)), g2=flipBack(await snap(G2.p));
R['⑭開き直したあとの盤']=JSON.stringify(h2.board)===JSON.stringify(g2.board)?'一致':'★食い違い';
R['⑭ゲストのエラー']=G2.errs;
// ⑯ 合言葉をコピーして、別の人が貼り付けて入る（URLではなく合言葉で）
await G2.p.close({runBeforeUnload:true});
await until(H.p,()=>!Online.connected);
const ctx3=await b.newContext({viewport:{width:390,height:844}, permissions:['clipboard-read','clipboard-write']});
await H.p.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://127.0.0.1:8123'});
await H.p.evaluate(()=>document.getElementById('onlineCopyCode').click());
await new Promise(r=>setTimeout(r,300));
const copied=await H.p.evaluate(()=>navigator.clipboard.readText());
R['⑯コピーした合言葉']=copied===await H.p.evaluate(()=>Online.code)?'合言葉そのもの':'★'+copied;
const G3p=await ctx3.newPage(); const g3errs=[]; G3p.on('pageerror',e=>g3errs.push(String(e)));
await G3p.addInitScript(init); await G3p.goto('http://127.0.0.1:8123/shogi.html'); await G3p.waitForTimeout(600);
await G3p.evaluate(()=>{ SFX.on=false; });
// 共有メッセージをまるごとクリップボードに入れて「貼り付け」→「入る」
await G3p.evaluate(t=>navigator.clipboard.writeText(t), '将棋で対戦しよう 合言葉 '+copied+' '+url);
await G3p.evaluate(()=>{ document.getElementById('onlineBtn').click(); document.getElementById('onlinePaste').click(); });
await new Promise(r=>setTimeout(r,300));
R['⑯貼り付けた中身']=await G3p.evaluate(()=>document.getElementById('onlineJoinCode').value.slice(0,12)+'…');
await G3p.evaluate(()=>document.getElementById('onlineJoin').click());
R['⑯合言葉で入れる']=await until(G3p,()=>Online.connected && !Online.hold, 10000);
const h3=norm(await snap(H.p)), g3=flipBack(await snap(G3p));
R['⑯入ったあとの盤']=JSON.stringify(h3.board)===JSON.stringify(g3.board)?'一致':'★食い違い';
R['⑯エラー']=g3errs;
// ㉑ 入った側は盤の設定（プリセット・大きさ・置き方・九宮・編集・ルール）を変えられない
await H.p.evaluate(()=>{ document.getElementById('presetSel').value='hon'; document.getElementById('applyPresetBtn').click(); SFX.on=false; });
await until(G3p,()=>NR===9 && !Online.hold);
R['㉑入った側で押せないもの']=await G3p.evaluate(()=>['presetSel','applyPresetBtn','rowRange','colRange','applySizeBtn','pzSel','ptSel',
  'bsMakePalace','bsClearPalace','swapSides','reset','resetBoard','ruleBtn','loadBtn','accEditHead']
  .filter(id=>!document.getElementById(id).disabled).map(id=>'★'+id).join(' ')||'すべて押せない');
await G3p.evaluate(()=>{ const rr=document.getElementById('rowRange'); rr.value='5';
  document.getElementById('applySizeBtn').click(); document.getElementById('bsMakePalace').click();
  const pt=document.getElementById('ptSel'); pt.value='cell'; pt.dispatchEvent(new Event('change',{bubbles:true}));
  document.getElementById('accEditHead').click(); });
await new Promise(r=>setTimeout(r,400));
R['㉑押そうとしても変わらない']={盤:await G3p.evaluate(()=>NR+'×'+NC), 置き方:await G3p.evaluate(()=>RULES.pointMode),
  編集:await G3p.evaluate(()=>editing?'★編集できた':'できない'), 揃っている:await same(G3p)};
// ㉒ 1手も指していないうちの変更は、許可なしでそのまま届く。始める前の画面がゲストにも出る
await H.p.evaluate(()=>{ document.getElementById('presetSel').value='mini'; document.getElementById('applyPresetBtn').click(); SFX.on=false; });
await until(G3p,()=>NR===5 && !Online.hold);
R['㉒始まる前の変更']={許可の窓:await G3p.evaluate(()=>document.getElementById('proposeModal').classList.contains('show')?'★出た':'出ない'),
  盤:await same(G3p), 始める前の画面:await G3p.evaluate(()=>document.getElementById('startCard').hidden?'★出ない':document.getElementById('scTitle').textContent)};
// ㉓ 対局の途中の変更は、相手の許可が要る。断ると元に戻る
const tap3=(pg,r,c)=>pg.evaluate(([r,c])=>onCell(r,c,false),[r,c]);
// 手番の側が歩を1つ前へ（⑪で先後を入れ替えたので、どちらが先かは盤から見る）
const pushPawn=async()=>{ const P=(await H.p.evaluate(()=>turn===1))?H.p:G3p;
  const hp=await P.evaluate(()=>{ for(let r=0;r<NR;r++)for(let c=0;c<NC;c++){ const q=board[r][c]; if(q&&q.p===1&&q.t==='hP'&&r>0&&!board[r-1][c]) return [r,c]; } });
  const O=P===H.p?G3p:H.p, k0=await O.evaluate(()=>kifu.length);
  await tap3(P,hp[0],hp[1]); await tap3(P,hp[0]-1,hp[1]);
  return await until(O,k=>kifu.length>k,5000,k0); };
R['㉓1手指す']=await pushPawn()?'指した':'★指せない';
await H.p.evaluate(()=>{ document.getElementById('presetSel').value='hon'; document.getElementById('applyPresetBtn').click(); SFX.on=false; });
R['㉓途中で変えると相談の窓']=await until(G3p,()=>document.getElementById('proposeModal').classList.contains('show'),5000)
  ? await G3p.evaluate(()=>document.getElementById('proposeTitle').textContent) : '★出ない';
R['㉓返事を待つ間']={作った側:await H.p.evaluate(()=>document.getElementById('status').textContent),
  見せている盤:await G3p.evaluate(()=>NR+'×'+NC), 入った側は指せない:await G3p.evaluate(()=>Online.remoteTurn())};
await G3p.evaluate(()=>document.getElementById('proposeNo').click());
await until(H.p,()=>NR===5 && !Online.proposal);
await until(G3p,()=>NR===5 && !Online.hold);
R['㉓断ると元に戻る']={作った側:await H.p.evaluate(()=>NR+'×'+NC+' 棋譜'+kifu.length+'手'), 盤:await same(G3p),
  状態:await H.p.evaluate(()=>document.getElementById('status').textContent),
  始める前の画面:await G3p.evaluate(()=>document.getElementById('startCard').hidden?'出ない':'★出た')};
R['㉓断ったあと続けて指せる']=await pushPawn();
await H.p.evaluate(()=>{ document.getElementById('presetSel').value='hon'; document.getElementById('applyPresetBtn').click(); SFX.on=false; });
await approve(G3p);
await until(G3p,()=>NR===9 && !Online.hold);
R['㉓許可すると変わる']={盤:await same(G3p), 大きさ:await H.p.evaluate(()=>NR+'×'+NC), 待ちが解ける:await H.p.evaluate(()=>!Online.hold && !Online.proposal)};
// ㉕ CPUを使えるかはルールで決める
await G3p.evaluate(()=>document.getElementById('autoYou').click());
R['㉕使えないルールのとき']={状態:await G3p.evaluate(()=>document.getElementById('status').textContent), CPU:await G3p.evaluate(()=>autoYou)};
await H.p.evaluate(()=>{ document.getElementById('ruleBtn').click(); const cb=document.getElementById('rOnlineCpu');
  cb.checked=true; cb.dispatchEvent(new Event('change')); document.getElementById('ruleClose').click(); });
await until(G3p,()=>RULES.onlineCpu && !Online.hold);
await G3p.evaluate(()=>document.getElementById('autoYou').click());
R['㉕使えるルールのとき']=await G3p.evaluate(()=>autoYou);
await G3p.evaluate(()=>document.getElementById('autoEnemy').click());
R['㉕相手側はCPUにできない']=await G3p.evaluate(()=>autoEnemy?'★できた':'できない');
await until(H.p,()=>Online.peerCpu===true,3000);
R['㉕相手がCPUと分かる']=await H.p.evaluate(()=>document.getElementById('onlineState').textContent);
// 作った側の番なら作った側が指す。入った側の番になればCPUが指す
if(await H.p.evaluate(()=>turn===1)) await pushPawn();
R['㉕入った側のCPUが指す']=await until(H.p,()=>kifu.some(k=>k.side===-1), 15000);
if(!R['㉕入った側のCPUが指す']) R['㉕様子']={H:await H.p.evaluate(()=>({turn,k:kifu.length,st:document.getElementById('status').textContent})),
  G:await G3p.evaluate(()=>({turn,autoYou,paused,hold:Online.hold,k:kifu.length,st:document.getElementById('status').textContent}))};
R['㉕CPUの手のあと']=await same(G3p);
await G3p.evaluate(()=>document.getElementById('autoYou').click());
R['㉕エラー']=g3errs;
// ㉖ 指した手の知らせが途中で消えても、返事が来ないので送り直して届く
{ const P=(await H.p.evaluate(()=>turn===1))?H.p:G3p, O=P===H.p?G3p:H.p;
  await P.evaluate(()=>{ window.ONLINE_DROP=(m,dir)=>dir==='out' && m.t==='move' && !window.__dropped && (window.__dropped=true); });
  const t0=Date.now();
  R['㉖1回目が消えても届く']=await pushPawn()? '届いた（'+Math.round((Date.now()-t0)/100)/10+'秒）' : '★届かない';
  R['㉖消した回数']=await P.evaluate(()=>window.__dropped?1:0);
  R['㉖盤']=await same(G3p);
  await P.evaluate(()=>{ window.ONLINE_DROP=null; }); }
// ㉗ 作った側が知らせもなく黙った（携帯の画面が消えたなど）。入った側は気づいてつなぎ直し、
//     届いていなかった自分の手も渡してそろう
if(await H.p.evaluate(()=>turn===1)) await pushPawn();
await G3p.evaluate(()=>{ window.ONLINE_DEAD_MS=4000; });
await H.p.evaluate(()=>{ window.ONLINE_DROP=()=>!window.__lift; });
const hk=await H.p.evaluate(()=>kifu.length);
{ const gp=await G3p.evaluate(()=>{ for(let r=NR-1;r>0;r--)for(let c=0;c<NC;c++){ const q=board[r][c]; if(q&&q.p===1&&q.t==='hP'&&!board[r-1][c]) return [r,c]; } });
  await tap3(G3p,gp[0],gp[1]); await tap3(G3p,gp[0]-1,gp[1]); }
R['㉗黙っている間は届かない']=await H.p.evaluate(k=>kifu.length===k?'届かない':'★届いた',hk);
R['㉗入った側が気づく']=await until(G3p,()=>Online.reconnecting,8000)
  ? await G3p.evaluate(()=>document.getElementById('status').textContent) : '★気づかない';
R['㉗つなぎ直す間は指せない']=await G3p.evaluate(()=>Online.remoteTurn());
await H.p.evaluate(()=>{ window.__lift=true; });
R['㉗つなぎ直せる']=await until(G3p,()=>Online.connected && !Online.reconnecting && !Online.hold,20000);
R['㉗届いていなかった手']=await until(H.p,k=>kifu.length===k+1,5000,hk)?'反映された':'★失われた';
R['㉗盤']=await same(G3p);
R['㉗続けて指せる']=await pushPawn();
await H.p.evaluate(()=>{ window.ONLINE_DROP=null; });
R['㉗エラー']=g3errs;
// ⑰ 合言葉は6けたの数字。貼り付けた文字からも取り出せる
R['⑰合言葉の形']=/^\d{6}$/.test(await H.p.evaluate(()=>Online.code))?'6けたの数字':'★'+(await H.p.evaluate(()=>Online.code));
R['⑰取り出し']=await H.p.evaluate(()=>[onlineCodeFrom('123456'), onlineCodeFrom('合言葉 ６５４３２１ です'),
  onlineCodeFrom('https://x/claude-shogi/?room=777111'), onlineCodeFrom('将棋しよう 合言葉 135790 https://x/?room=135790')]);
// ⑱ 先に「入る」を押してしまっても、部屋ができるまで探し続けて入れる
const ctx4=await b.newContext({viewport:{width:390,height:844}});
const G4p=await ctx4.newPage(); await G4p.addInitScript(init); await G4p.goto('http://127.0.0.1:8123/shogi.html'); await G4p.waitForTimeout(600);
const H2ctx=await b.newContext({viewport:{width:390,height:844}});
const H2p=await H2ctx.newPage(); await H2p.addInitScript(init); await H2p.goto('http://127.0.0.1:8123/shogi.html'); await H2p.waitForTimeout(600);
await G4p.evaluate(()=>{ SFX.on=false; onlineStart('guest','424242'); });
await new Promise(r=>setTimeout(r,4000));
R['⑱部屋ができる前']=await G4p.evaluate(()=>document.getElementById('onlineState').textContent);
await H2p.evaluate(()=>{ SFX.on=false; onlineStart('host','424242'); });
R['⑱あとから部屋ができても入れる']=await until(G4p,()=>Online.connected && !Online.hold, 15000);
// ⑲ 作った側が仲介サーバーから外れても（携帯で別の画面に切り替えたとき）つなぎ直し、新しく入れる
await G4p.close();
await until(H2p,()=>!Online.connected, 8000);
await H2p.evaluate(()=>Online.peer.disconnect());          // 仲介サーバーから外れた状態にする
await until(H2p,()=>Online.peer && !Online.peer.disconnected && Online.peer.open, 8000);
R['⑲外れたあと自分でつなぎ直す']=await H2p.evaluate(()=>Online.peer && !Online.peer.disconnected && Online.code==='424242');
const G5ctx=await b.newContext({viewport:{width:390,height:844}});
const G5p=await G5ctx.newPage(); await G5p.addInitScript(init); await G5p.goto('http://127.0.0.1:8123/shogi.html?room=424242'); await G5p.waitForTimeout(600);
R['⑲同じ合言葉で入れる']=await until(G5p,()=>Online.connected && !Online.hold, 15000);
if(!R['⑲同じ合言葉で入れる']) R['⑲入れなかったときの様子']=[await G5p.evaluate(()=>[Online.connected,Online.hold,Online.tries,document.getElementById('onlineState').textContent]), await H2p.evaluate(()=>[Online.connected,Online.peer&&Online.peer.open,Online.peer&&Online.peer.disconnected,document.getElementById('onlineState').textContent])];
// ⑳ 打ち間違えた合言葉では、入れた合言葉を見せて止まる（いつまでも探さない）
const G6ctx=await b.newContext({viewport:{width:390,height:844}});
const G6p=await G6ctx.newPage(); await G6p.addInitScript(init); await G6p.goto('http://127.0.0.1:8123/shogi.html'); await G6p.waitForTimeout(600);
await G6p.evaluate(()=>{ window.ONLINE_FIND_TRIES=2; });   // 本番は15回。試験では2回であきらめさせる
await G6p.evaluate(()=>onlineStart('guest','000001'));
await until(G6p,()=>!Online.active, 60000);
R['⑳打ち間違い']=await G6p.evaluate(()=>document.getElementById('onlineState').textContent);
R['⑳探すのをやめた']=await G6p.evaluate(()=>!Online.active && Online.tries===2);
console.log(JSON.stringify(R,null,1));
console.log('ホストのエラー',H.errs,'ゲストのエラー',G.errs);
await b.close(); srv.close(); try{ peerSrv.close(); }catch(_){} process.exit(0);
