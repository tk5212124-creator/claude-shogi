# CPU（探索）引き継ぎ資料

`shogi.html` の **CPU 探索まわりだけ**を抜き出したもの。改良を外部（ChatGPT等）に依頼するときは、
このファイルをそのまま渡せば足りるようにしてある。

- 元ファイル: `shogi.html`（1枚だけ・ビルド不要・バニラJS）
- 全体仕様: `README.md`
- **これは切り出しのコピー**。直したら `shogi.html` の同名関数を差し替える。

---

## 0. 依頼するときの前提（これを破ると壊れる）

### 絶対に変えてはいけないこと

1. **人間の指し手と CPU の指し手で機構を変えない。**
   着手は必ず `applyMoveSilent(side, move)`、合法判定は必ず `isLegalMove(move, side)` を通す。
   探索専用の合法判定・着手処理を別に作らない。
2. **勝敗ルールを変えない。**
   このアプリに「詰み」は無い。**盤上から味方の royal が全て消えた側の負け**。
   royal は複数あり得る（玉将・帥・漢・ライオン…）。1枚取っただけでは終わらない。
   `captureAll=true` のときは royal では決着しない。
3. **ルールを CPU の都合で単純化しない。**
   2層盤・宮・オセロ反転・囲碁の囲み取り・はさみ取り・持ち駒・成り・ランダム成り・
   パス・千日手回避・王不見王・ビッチャングン は探索内でも同じに扱う。
4. **JSON / 棋譜の互換を壊さない。** CPU の内部表現は保存形式に出さない。

### 使ってよい既存API（実装は `shogi.html` 側にある）

| 関数 | 意味 |
|---|---|
| `moves(b,r,c)` | レイヤー `b` 上の駒の着手先。`[tr,tc]`、層をまたぐ手は `[tr,tc,1]` |
| `isLegalMove(m,p,b)` | 合法判定。`b` 省略で実盤。千日手回避・王不見王・ビッチャングンを含む |
| `LR(b)` / `LC(b)` | そのレイヤーの行数／列数（マスは NR×NC、交点は (NR+1)×(NC+1)） |
| `isRoyal(t)` | royal 判定。**`t==='K'` のような直書き禁止** |
| `VALUE[t]` / `KANJI[t]` / `TP[t]` | 駒の価値・漢字・定義 |
| `promoteCode(t)` / `canPromoteMove(...)` | 成り先・成れるか |
| `dropTargets(b,t,p)` | 打てる場所 |
| `hasRoyalOnBoard(p)` | 実ゲームの勝敗判定（盤上のみ。持ち駒は数えない） |
| `isSharedPoint(r,c)` / `crossJumpPoints(...)` | 交差宮マスの共有点／斜めに飛び越えたとき通る相手レイヤーの点 |
| `RULES` | ルール設定（下記） |

### 盤の持ち方

```
board[r][c]      … マスの中の駒        （NR × NC）
ptsBoard[r][c]   … 線の交点の駒        （NR+1 × NC+1）… 交点(r,c)＝マス(r,c)の左上の角
cellDiag[r][c]   … 宮の斜め線 'l'/'r'/'x'/null
capYou / capEnemy … 持ち駒（駒コードの配列）
```

`board.L = {cells, pts}` と `board.isPts` で相互参照できる。`simulate` の戻り盤も同じ形にすること。

### 手（move）の形

```js
{fr,fc,tr,tc, promo?, promoTo?, caps?, pt?, toPt?}   // 移動
{drop:'hP', tr,tc, pt?}                              // 打ち
{pass:true}                                          // パス
```

- `pt:true` … 移動元が**交点レイヤー**
- `toPt` … 移動先のレイヤー（省略時は `pt` と同じ＝層をまたがない）
- `caps` … 獅子型の途中取り

1手で盤が大きく変わることがある（オセロ反転・囲碁の囲み取り・はさみ取り・火鬼・
共有点や飛び越えでの別層取り）。make/unmake を作るなら**これら全部を復元**すること。

### RULES（探索が見るべきもの）

`drops, keepPromoted, nifu, sennichiteMode, banSennichite, allowPass, captureAll,
promoOnZone, promoOnLast, promoOnCapture, repromote, randomPromote,
flyingGeneral, palace, palaceEscape, bikjang, pointMode, janggiSetup, ranklessAsGeneral`

---

## 1. 現状の実装（そのままのコード）

===== SPEEDS（速度設定） =====
const SPEEDS=[
  {n:'熟考',ms:0,depth:4,budget:2000},   // 時間の許す限り深く読む（反復深化）
  {n:'標準',ms:0,depth:3},
  {n:'高速',ms:0,depth:2},
  {n:'超高速',ms:0,depth:1,turbo:true}
];

===== evaluate（評価関数） =====
function evaluate(b,cy,ce){ // 相手(-1)視点で大きいほど良い
  let s=0;
  const ek=findKing(b,-1), yk=findKing(b,1);
  const layers=(b&&b.L&&b.L.pts)? [b, b.L.pts] : [b];
  for(const L of layers)
  for(let r=0;r<LR(L);r++)for(let c=0;c<LC(L);c++){
    const pc=L[r]&&L[r][c]; if(!pc)continue;
    let v=VALUE[pc.t];
    if(pc.t!=='K'){
      const adv = pc.p===-1? r : (NR-1-r);       // 前進ボーナス
      v += adv*7;
      // 敵玉への接近ボーナス（攻撃性）
      const tk = pc.p===-1? yk : ek;
      if(tk){ const d=Math.abs(r-tk[0])+Math.abs(c-tk[1]); v += Math.max(0,16-d)*4; }
    }
    s += pc.p===-1? v : -v;
  }
  // 持ち駒（打てる駒は価値やや高め）
  ce.forEach(t=>s += VALUE[t]*1.05);
  cy.forEach(t=>s -= VALUE[t]*1.05);
  // 玉の安全度：玉が盤端・囲いから出ているとペナルティ的に評価
  return s;
}

===== findKing =====
function findKing(b,p){
  const layers=(b&&b.L&&b.L.pts)? [b, b.L.pts] : [b];
  for(const L of layers)
    for(let r=0;r<LR(L);r++)for(let c=0;c<LC(L);c++){const pc=L[r]&&L[r][c];if(pc&&pc.p===p&&isRoyal(pc.t))return[r,c];}
  return null;
}

===== anyRoyalIn（探索用の royal 残存判定） =====
function anyRoyalIn(cells, pts, side){
  for(let r=0;r<NR;r++)for(let c=0;c<NC;c++){ const q=cells[r]&&cells[r][c]; if(q&&q.p===side&&isRoyal(q.t)) return true; }
  for(let r=0;r<=NR;r++)for(let c=0;c<=NC;c++){ const q=pts[r]&&pts[r][c]; if(q&&q.p===side&&isRoyal(q.t)) return true; }
  return false;
}

===== simulate（1手適用：盤・持ち駒をコピー） =====
function simulate(b,m,p,cy,ce){ // 盤・持ち駒をコピーして着手。戻り値 {nb,ncy,nce,king}
  const nb=b.map(row=>row.map(x=>x?{...x}:null));
  // 交点レイヤーも一緒にコピーして、読みの中でも2層のまま扱う
  const srcPts=(b&&b.L&&b.L.pts)||null;
  const npts=srcPts? srcPts.map(row=>row.map(x=>x?{...x}:null)) : Array.from({length:NR+1},()=>Array(NC+1).fill(null));
  linkLayers(nb, npts);
  const ncy=[...cy], nce=[...ce];
  if(m&&m.pass) return {nb,ncy,nce,king:false};   // パスは盤面を変えない
  const lb = (m&&m.pt)? npts : nb;                // この手が動くレイヤー
  const ob = (m&&m.pt)? nb : npts;                // もう一方のレイヤー
  const db = (m&&m.toPt!==undefined) ? (m.toPt? npts : nb) : lb;   // 着地するレイヤー

  const myCap = p===-1? nce : ncy;
  let king=false;
  // コピー盤nb上でオセロ裏返しを行う（8方向・全種類を自軍に裏返す。royalを裏返したらking扱い）
  function simOthelloFlip(r,c,side){
    const dirs=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for(const [dr,dc] of dirs){
      const line=[]; let rr=r+dr, cc=c+dc, closed=false;
      while(rr>=0&&rr<NR&&cc>=0&&cc<NC){
        const q=nb[rr][cc];
        if(!q) break;
        if(q.p===side){ closed=true; break; }
        line.push([rr,cc]); rr+=dr; cc+=dc;
      }
      if(closed && line.length>0){
        for(const [er,ec] of line){
          if(isRoyal(nb[er][ec].t)) king=true; // 相手royalを裏返し＝勝ち筋
          nb[er][ec]=flipPiece(nb[er][ec], side);
        }
      }
    }
  }
  // コピー盤nb上ではさみ取りを行う（4方向・挟んだ敵駒を取る。royalを取ったらking扱い）
  function simHasamiCapture(r,c,side){
    const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
    for(const [dr,dc] of dirs){
      const line=[]; let rr=r+dr, cc=c+dc, closed=false;
      while(rr>=0&&rr<NR&&cc>=0&&cc<NC){
        const q=nb[rr][cc];
        if(!q) break;
        if(q.p===side){ closed=true; break; }
        line.push([rr,cc]); rr+=dr; cc+=dc;
      }
      if(closed && line.length>0){
        for(const [er,ec] of line){
          const cap=nb[er][ec];
          if(isRoyal(cap.t)) king=true;
          else if(RULES.drops) myCap.push(capturedCode(cap));
          nb[er][ec]=null;
        }
      }
    }
  }
  // コピー盤nb上で火鬼の焼き取り（隣接8方向の敵を焼く。royalを焼いたらking扱い）
  function simFireBurn(r,c,side){
    for(const [dr,dc] of ALL8){
      const rr=r+dr, cc=c+dc; if(rr<0||rr>=NR||cc<0||cc>=NC)continue;
      const q=nb[rr][cc];
      if(q && q.p!==side){ if(isRoyal(q.t)) king=true; else if(RULES.drops) myCap.push(capturedCode(q)); nb[rr][cc]=null; }
    }
  }
  // 囲碁の囲み取り。碁石は「囲んだ領域の駒はマス・交点に関係なく取れる」ので2層を通して数える
  function simGoCapture(){
    for(const layer of [nb,npts]){
      const isPt=(layer===npts);
      for(let r=0;r<(isPt?NR+1:NR);r++)for(let c=0;c<(isPt?NC+1:NC);c++){
        const q=layer[r]&&layer[r][c]; if(!q||!isGo(q.t))continue;
        const enemy=-q.p;
        if(isSurrounded(isPt,r,c,nb,npts, n=>n.p===enemy)){
          layer[r][c]=null; if(RULES.drops) (enemy===1?ncy:nce).push(q.t);
        }
      }
    }
  }
  // 碁石が囲んだ領域の駒を取る（層に関係なく）。囲碁石を打った直後に判定する。
  function simGoSurround(r,c,side){
    const N=surroundNeighbors(true,r,c);
    const targets=[];
    N.same.forEach(([rr,cc])=>targets.push([rr,cc,true]));
    N.other.forEach(([rr,cc])=>targets.push([rr,cc,false]));
    for(const [nr,nc,isPt] of targets){
      const rows=isPt?NR+1:NR, cols=isPt?NC+1:NC;
      if(nr<0||nr>=rows||nc<0||nc>=cols) continue;
      const layer=isPt?npts:nb;
      const q=layer[nr]&&layer[nr][nc];
      if(!q||q.p===side||isGo(q.t)) continue;
      if(isSurrounded(isPt,nr,nc,nb,npts, t=>t.p===side)){
        if(isRoyal(q.t)) king=true; else if(RULES.drops) myCap.push(demoteOf(q.t));
        layer[nr][nc]=null;
      }
    }
  }
  if(m.drop){
    lb[m.tr][m.tc]={t:m.drop,p:isGo(m.drop)?goOwner(m.drop):p};
    const i=myCap.indexOf(m.drop); if(i>=0)myCap.splice(i,1);
    if(m.drop==='OTH') simOthelloFlip(m.tr,m.tc,p); // 打ったオセロの裏返しを読みに反映
    if(isGo(m.drop)) simGoSurround(m.tr,m.tc,lb[m.tr][m.tc].p);
  } else {
    const pc=lb[m.fr][m.fc]; const tg=db[m.tr]&&db[m.tr][m.tc];
    if(!pc) return {nb,ncy,nce,king:false};
    const igui = m.fr===m.tr && m.fc===m.tc; // 居喰い：動かない
    if(tg && tg.p!==p){ // 移動先の敵を取る（居喰いでは自駒なので除外）
      if(isRoyal(tg.t)) king=true;
      else { myCap.push(demoteOf(tg.t)); }
    }
    // 九宮の交差マス（2層の共有点）では、もう一方のレイヤーの敵も取れる
    const sh=ob[m.tr]&&ob[m.tr][m.tc];
    if(isSharedPoint(m.tr,m.tc) && sh && sh.p!==p){
      if(isRoyal(sh.t)) king=true; else myCap.push(demoteOf(sh.t));
      ob[m.tr][m.tc]=null;
    }
    // 斜めに飛び越えて動く駒は、跳び越えた先の相手レイヤーの駒も取れる
    for(const [cr,cc] of crossJumpPoints(lb, pc.t, m.fr, m.fc, m.tr, m.tc, p)){
      const v=ob[cr]&&ob[cr][cc];
      if(v && v.p!==p){ if(isRoyal(v.t)) king=true; else myCap.push(demoteOf(v.t)); ob[cr][cc]=null; }
    }
    // 獅子の途中取り（caps）
    if(m.caps) for(const [cr,cc] of m.caps){
      const v=lb[cr][cc];
      if(v){ if(isRoyal(v.t)) king=true; else myCap.push(demoteOf(v.t)); lb[cr][cc]=null; }
    }
    const promo = m.promo!==undefined ? m.promo
      : (!igui && canPromoteMove(pc.t,m.fr,m.tr,p, !!(tg&&tg.p!==p)||!!(m.caps&&m.caps.length)));
    db[m.tr][m.tc]={t:promo?(promoteCode(pc.t)||pc.t):pc.t,p};
    if(!igui||db!==lb) lb[m.fr][m.fc]=null;
    if(pc.t==='HASA') simHasamiCapture(m.tr,m.tc,p); // はさみ取りを読みに反映
    if(hasFire(pc.t)) simFireBurn(m.tr,m.tc,p);      // 火鬼の焼き取りを読みに反映
  }
  simGoCapture(); // 囲碁の囲み取りを読みに反映
  // 実ゲームと同じ判定にする：royal を1枚取っただけでは勝ちにしない。
  // 相手の royal が盤上から全て消えたときだけ「勝ち」。取り切るルールでは royal では決着しない。
  if(king) king = !RULES.captureAll && !anyRoyalIn(nb, npts, -p);
  return {nb,ncy,nce,king};
}


===== genMoves（着手生成） =====
function genMoves(b,p,cy,ce){
  const list=[];
  // マスの層と交点の層の両方から生成する（交点の手には pt:true を付ける）
  const layers=[[b,false]];
  if(b&&b.L&&b.L.pts&&ptLayerOn()) layers.push([b.L.pts,true]);
  for(const [lb,isPt] of layers){
    for(let r=0;r<LR(lb);r++)for(let c=0;c<LC(lb);c++){
      const pc=lb[r]&&lb[r][c];
      if(pc&&pc.p===p){
        moves(lb,r,c).forEach(([tr,tc,x])=>{
          const dstPt = x? !isPt : isPt;                 // x=1 ならもう一方のレイヤーへ
          const dst = dstPt? (lb.L.pts) : (lb.L.cells);
          const canP=canPromoteMove(pc.t,r,tr,p,!!(dst[tr]&&dst[tr][tc]&&dst[tr][tc].p!==p));
          const base=isPt?{pt:true}:{};
          if(x) base.toPt=dstPt;
          if(canP){
            list.push({...base,fr:r,fc:c,tr,tc,promo:true});
            if(!mustPromote(pc.t,tr,p)) list.push({...base,fr:r,fc:c,tr,tc,promo:false});
          } else {
            list.push({...base,fr:r,fc:c,tr,tc,promo:false});
          }
        });
        // 獅子型：2歩動き・2枚取り・居喰い（caps付き。成りはapply側で自動判定）
        if(hasLion(pc.t)){
          lionMoves(lb,r,c).forEach(m=>list.push(isPt?{...m,pt:true}:m));
        }
      }
    }
  }
  const cap = p===-1? ce : cy;
  if(RULES.drops){
    [...new Set(cap)].forEach(t=>{
      const isPt=!!(goesOnPoint(t)&&b&&b.L&&b.L.pts);
      const lb=isPt? b.L.pts : b;
      dropTargets(lb,t,p).forEach(([tr,tc])=>list.push(isPt?{drop:t,tr,tc,pt:true}:{drop:t,tr,tc}));
    });
  }
  if(RULES.allowPass) list.push({pass:true});  // パス（着手放棄）。人間・CPU共通の手として扱う
  return list;
}

===== search（αβ） =====
function search(b,cy,ce,depth,side,alpha,beta){
  if(depth===0) return evaluate(b,cy,ce);
  const list=genMoves(b,side,cy,ce);
  if(!list.length){ // 手詰まり＝玉を取られる前提でその側の負け
    return side===-1? -MATE : MATE;
  }
  if(side===-1){ // 相手＝最大化
    let val=-Infinity;
    for(const m of list){
      const s=simulate(b,m,-1,cy,ce);
      if(s.king){ return MATE+depth; } // あなたの玉を取れる→即勝ち（早いほど高評価）
      val=Math.max(val,search(s.nb,s.ncy,s.nce,depth-1,1,alpha,beta));
      alpha=Math.max(alpha,val);
      if(alpha>=beta)break;
    }
    return val;
  } else { // あなた＝最小化
    let val=Infinity;
    for(const m of list){
      const s=simulate(b,m,1,cy,ce);
      if(s.king){ return -MATE-depth; } // 相手の玉を取れる→相手にとって即負け
      val=Math.min(val,search(s.nb,s.ncy,s.nce,depth-1,-1,alpha,beta));
      beta=Math.min(beta,val);
      if(alpha>=beta)break;
    }
    return val;
  }
}

===== cpuPickMove（root：反復深化・並べ替え・候補選別） =====
function cpuPickMove(side, depth){
  let list=genMoves(board,side,capYou,capEnemy);
  // 実際に指す手は人間と同じ合法判定を通す（千日手回避で禁じた手は候補から除く）
  if(RULES.banSennichite) list=list.filter(m=>isLegalMove(m,side));
  if(!list.length) return null;  // 指せる手が無い＝手詰まり（呼び出し側が持将棋/詰みとして解決）
  let DEPTH = depth!=null ? depth : (SPEEDS[speedIdx].depth||3);
  // 大盤は合法手・分岐が爆発するためCPUを簡易化（探索を浅くする割り切り）
  const BMAX=Math.max(NR,NC);
  if(BMAX>=18) DEPTH=Math.min(DEPTH,1);   // 19路盤など広い盤＋多数の打ち手は浅く
  else if(BMAX>=13) DEPTH=Math.min(DEPTH,2);
  // 手の並べ替え。to地点のマスの駒だけでなく、その手で実際に起きる事象で採点する
  //（交点レイヤー・共有点や飛び越えの別層取り・成り・royal取り・獅子の複数取り）。
  // 手の並べ替え（αβの枝刈り効率を上げるためだけの安い採点）。
  // 旧実装は交点の手でも board[tr][tc] を見ていたため、交点レイヤーの取りが常に0点だった。
  // 行き先のレイヤーを正しく見て、royal を取る手と成りを優先する。
  const ordScore=(m)=>{
    if(m.pass) return -1000;
    if(m.drop) return 0;
    const DBs = (m.toPt!==undefined) ? (m.toPt? ptsBoard : board) : (m.pt? ptsBoard : board);
    const q = DBs && DBs[m.tr] && DBs[m.tr][m.tc];
    let sc = (q && q.p!==side) ? (isRoyal(q.t) ? 100000 : (VALUE[q.t]||0)) : 0;
    if(m.promo) sc += 50;
    return sc;
  };
  const ordCache=new Map();
  const ordOf=(m)=>{ let v=ordCache.get(m); if(v===undefined){ v=ordScore(m); ordCache.set(m,v); } return v; };
  list.sort((a,b2)=>ordOf(b2)-ordOf(a));
  // 超高速(depth<=1)や大盤では、トップ候補だけ評価して時間短縮
  const cand = (DEPTH<=1 || BMAX>=16) ? list.slice(0, Math.min(list.length, BMAX>=16?18:24)) : list;
  // 指定の深さで候補を全部評価して最善手を返す（王が取れる手は即返す）
  const now=()=>((typeof performance!=='undefined'&&performance.now)?performance.now():Date.now());
  // 指定の深さで候補を全部評価して最善手を返す。
  // deadline を渡すと、途中で時間切れになった時点で打ち切る（その深さの結果は捨てる）。
  const pickAt=(d, deadline)=>{
    let best=null, bestScore = side===-1? -Infinity : Infinity, ties=0;
    for(const m of cand){
      const s=simulate(board,m,side,capYou,capEnemy);
      if(s.king) return {m, mate:true};
      const sc = d<=0 ? evaluate(s.nb,s.ncy,s.nce)
                      : search(s.nb,s.ncy,s.nce,d,-side,-Infinity,Infinity);
      // ランダム加点はしない。完全に同点のときだけ、候補の中から等確率で選ぶ
      if(sc===bestScore){ ties++; if(Math.random()<1/ties) best=m; }
      else if(side===-1? sc>bestScore : sc<bestScore){ bestScore=sc; best=m; ties=1; }
      // 時間切れ：そこまでに読めた範囲の最善手を返す（候補は良い順に並んでいるので使える）
      if(deadline && now()>deadline) return {m:best, partial:true};
    }
    return {m:best};
  };
  const budget = (depth==null) ? (SPEEDS[speedIdx]&&SPEEDS[speedIdx].budget) : 0;
  if(budget && DEPTH>1){
    // 反復深化：浅い方から順に読み、与えた時間の中でできるだけ深く読む。
    // 途中で切れても「最後に読み切った深さの最善手」が残るので必ず手は返せる。
    const deadline = now() + budget;
    let best=null;
    for(let d=2; d<=DEPTH; d++){
      // 前の深さの最善手を先頭に持ってくると枝刈りがよく効き、同じ時間でより深く読める
      if(best){ const i=cand.indexOf(best); if(i>0){ cand.splice(i,1); cand.unshift(best); } }
      const r=pickAt(d, deadline);
      if(r.mate) return r.m;
      if(r.m) best=r.m;               // 途中までの結果も使う（先頭は前の深さの最善手）
      if(r.partial || now()>=deadline) break;
    }
    return best||cand[0]||list[0];
  }
  const r=pickAt(DEPTH);
  return r.m||cand[0]||list[0];
}

===== doAutoMove（CPUに1手指させる） =====
function doAutoMove(){
  if(gameOver||replaying||editing) return false;
  if(!isAuto(turn)) return false;
  const sp=SPEEDS[speedIdx];
  let m=cpuPickMove(turn);
  if(!m){ resolveNoMove(turn); return false; }
  // 手動と同一の合法判定を実盤で必ず通す。万一不正なら合法手から選び直す。
  if(!isLegalMove(m, turn)){
    const legal=genMoves(board,turn,capYou,capEnemy).filter(mm=>isLegalMove(mm,turn));
    if(!legal.length){ resolveNoMove(turn); return false; }
    m=legal[Math.floor(Math.random()*legal.length)];
  }
  applyMoveSilent(turn,m); // 描画の間引き・演出可否は速度/音設定から自動判定（人間の手と同一経路）
  if(gameOver){ render(); return true; }
  turn=-turn;
  return true;
}

===== stepDelay / scheduleAutoStep（手と手の間隔） =====
function scheduleAutoStep(){
  stopAutoLoop();
  if(paused) return; // 一時停止中は自動進行しない
  const sp=SPEEDS[speedIdx];
  // 超高速は setTimeout(0) で詰めつつ、各手の間にイベントループを挟む（ボタン応答確保）
  autoTimer=setTimeout(runAutoStep, stepDelay());
}

---

## 2. すでに直したこと

- **探索と実ゲームの勝敗判定を統一**：`simulate` は royal を1枚取っただけでは
  `king=true` を返さない。相手の royal が盤上から全て消えたときだけ（`anyRoyalIn`）。
  `captureAll` では royal で決着しない。
- **評価のランダム加点を廃止**：完全同点のときだけ等確率で選ぶ。
- **並べ替えを層対応に**：交点の手でも行き先のレイヤーを見る（以前は常に0点だった）。
- **熟考モード**：反復深化＋時間予算。前の深さの最善手を先頭に並べ替える。

## 3. まだ入っていないもの（依頼したい範囲）

優先順。上ほど費用対効果が高い。

1. **Killer / History / Counter move** — 単独で完結し、既存ルールに触れない。
2. **Zobrist hash + Transposition Table**
   - 鍵に含める必要があるもの：`board` 全駒、`ptsBoard` 全駒、駒種・所有者、手番、持ち駒。
   - `NR/NC/RULES/cellDiag` は対局中固定なので TT の名前空間側に分けてよい。
   - **hash が同じなのに合法手集合が違う状態を作らないこと。**
3. **make/unmake（Mutation Journal 方式）** — `simulate` の全面コピーをやめる。
   オセロ複数反転・囲碁複数捕獲・獅子の複数取り・火鬼・はさみ取り・xcaps・
   層移動・成り をすべて完全復元できること。導入時は
   「旧 simulate と結果が一致するか」を一定確率で比較する検証モードを併用する。
4. **eventDelta（候補選別の質）** — 通常捕獲だけでなく、xcaps・複数取り・
   オセロ反転数・囲碁捕獲・成り増分・royal への脅威を採点に入れる。
   ※ 候補の足切り（`cand`）が効くのは深さ1か大盤のときだけなので、効果測定はその条件で。
5. **incremental evaluation** → **node budget** → **限定 qsearch** → **PVS**
6. Null move pruning は**入れない**（パス・複数royal・オセロ・囲碁があり前提が成り立たない）。

## 4. 直したコードの戻し方

`shogi.html` の同名関数をそのまま置き換える。新しい関数を足す場合は
`cpuPickMove` の直前あたりに置く（トップレベルの関数宣言なら巻き上げで順序は自由）。

## 5. 受け入れ条件（これを満たさないと採用できない）

- 同一局面での1手あたりの思考時間が増えていない
- 10プリセット（本将棋・チェス・どうぶつ・オセロ・はさみ・シャンチー・チャンギ・
  5五・囲碁・大局）の自動対局でエラーが出ない
- 複数royal／captureAll／2層の取り／オセロ／囲碁／宮 の回帰テストが通る
- 旧CPUとのA/B対局（先後入替）で勝率が下がっていない
