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
const until=async(pg,fn,ms=8000)=>{ const t=Date.now(); while(Date.now()-t<ms){ if(await pg.evaluate(fn)) return true; await new Promise(r=>setTimeout(r,100)); } return false; };
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
const same=async()=>{ const h=norm(await snap(H.p)), g=flipBack(await snap(G.p));
  const bad=[]; for(const k of Object.keys(h)) if(JSON.stringify(h[k])!==JSON.stringify(g[k])) bad.push(k);
  return bad.length?'★食い違い：'+bad.join(','):'一致'; };
R['①つながった直後の盤']=await same();
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
await until(G.p,()=>NR===19 && Online.ply===0);
await H.p.evaluate(()=>{ sel={drop:true,t:'GOB',p:1}; }); await tap(H.p,3,3,true);
await until(G.p,()=>turn===1);
await G.p.evaluate(()=>{ sel={drop:true,t:'GOB',p:1}; }); await tap(G.p,15,15,true);
await until(H.p,()=>turn===1);
R['⑧囲碁で1手ずつ']=await same();
R['⑧ゲストの画面では自分の石が黒']=await G.p.evaluate(()=>{ const a=ptsBoard[16][16], b2=ptsBoard[15][15]; return {相手の石:a&&a.t+':'+a.p, 自分の石:b2&&b2.t+':'+b2.p}; });
// ⑪ 先後入替（ホストだけ）：ゲストが先手になる
await H.p.evaluate(()=>{ document.getElementById('presetSel').value='hon'; document.getElementById('applyPresetBtn').click(); SFX.on=false; });
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
await until(G.p,()=>Online.ply===0 && board[4][4] && board[4][4].t==='hR');
R['⑮盤を編集したあと']=await same();
R['⑮編集が終わると指せる']=await G.p.evaluate(()=>Online.hold===null && !Online.remoteTurn());
await H.p.evaluate(()=>{ turn=-1; onlineSendState(); });
await until(G.p,()=>Online.ply===0 && turn===1);
await H.p.evaluate(()=>document.getElementById('ruleBtn').click());
await until(G.p,()=>!!Online.hold);
R['⑮ルール画面を開いている間']=await G.p.evaluate(()=>document.getElementById('status').textContent);
await H.p.evaluate(()=>{ const cb=document.getElementById('rNifu'); cb.checked=!cb.checked; cb.dispatchEvent(new Event('change')); document.getElementById('ruleClose').click(); });
await new Promise(r=>setTimeout(r,600));
R['⑮ルール設定（二歩）がそろう']={ホスト:await H.p.evaluate(()=>RULES.nifu), ゲスト:await G.p.evaluate(()=>RULES.nifu),
  閉じたら指せる:await G.p.evaluate(()=>Online.hold===null)};
await H.p.evaluate(()=>{ document.getElementById('presetSel').value='mini'; document.getElementById('applyPresetBtn').click(); SFX.on=false; });
await until(G.p,()=>NR===5 && Online.ply===0);
R['⑮盤の大きさを変えたあと']=await same();
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
console.log(JSON.stringify(R,null,1));
console.log('ホストのエラー',H.errs,'ゲストのエラー',G.errs);
await b.close(); srv.close(); try{ peerSrv.close(); }catch(_){} process.exit(0);
