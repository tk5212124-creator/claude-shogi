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

以下は `shogi.html` からそのまま抜き出したもの（1文字も変えていない）。

```js
===== 並べ替えの記憶（killer / history / counter）の宣言 =====
let killers=[], histTable=new Map(), counters=new Map();

/* ===== 局面ハッシュ（Zobrist相当）と置換表 =====
   同じ局面に別の手順で辿り着いたとき（＝合流）、二度目以降の探索を省く。
   合法手も評価値も変えない。「同じ計算を二度しない」だけの仕組み。
   盤の大きさやルールは対局中に編集で変わりうるので、表は1手ごとに捨てる。 */
// 駒種を小さな整数に。VALUE に全駒種が載っているのでそこから採番する。
const ZT_IDX=(()=>{ const m=Object.create(null); let i=1;
  for(const k of Object.keys(VALUE)) m[k]=i++;
  m.__n=i; return m; })();
// VALUE に無い駒種（碁石など後から増えた種類）も衝突しないよう遅延で採番する
function zIdx(t){
  if(!t) return 0;
  let v=ZT_IDX[t];
  if(v===undefined){ v=ZT_IDX.__n++; ZT_IDX[t]=v; }
  return v;
}
// 整数をばらけさせる（乱数表の代わり。表を持たずに同じ効果を得る）

===== 置換表の宣言と1手ごとのリセット =====
let TT=new Map();
const TT_MAX=300000;
function clearOrderTables(){ killers=[]; histTable=new Map(); counters=new Map(); TT=new Map(); }
// 手を数値キーにする（座標は 0..40 なので衝突しない）

===== SPEEDS（速度設定） =====
deep は「大盤でも絞りすぎない」印（熟考だけ）。 */
const SPEEDS=[
  {n:'熟考',  ms:0, depth:8, budget:2000, deep:true},
  {n:'標準',  ms:0, depth:8, budget:400},
  {n:'高速',  ms:0, depth:8, budget:80},
  {n:'超高速',ms:0, depth:1, turbo:true}
];

===== findKing =====
/* ===== 相手AI：αβ探索 ===== */
// 玉の位置を探す
function findKing(b,p){
  const layers=(b&&b.L&&b.L.pts)? [b, b.L.pts] : [b];
  for(const L of layers)
    for(let r=0;r<LR(L);r++)for(let c=0;c<LC(L);c++){const pc=L[r]&&L[r][c];if(pc&&pc.p===p&&isRoyal(pc.t))return[r,c];}
  return null;
}

===== evaluate（評価関数） =====
// 評価は読みの中でいちばん多く呼ばれる。点数の付け方は一切変えずに、
// 盤を3周（findKing×2＋本体）していたのを2周に減らし、
// 内側のループから LR/LC の呼び出しと行の添字引きを追い出してある。
function evaluate(b,cy,ce){ // 相手(-1)視点で大きいほど良い
  let s=0;
  const pts=(b&&b.L&&b.L.pts)||null;
  const NL=pts?2:1;
  // 玉の位置を1周でまとめて拾う。走査順は findKing と同じ（マス→交点／上から）なので
  // 玉が複数居ても選ばれる1枚は従来と変わらない。
  let ek=null, yk=null;
  for(let li=0; li<NL && !(ek&&yk); li++){
    const L=li?pts:b, RR=LR(L), CC=LC(L);
    for(let r=0;r<RR && !(ek&&yk);r++){ const row=L[r]; if(!row) continue;
      for(let c=0;c<CC;c++){ const pc=row[c];
        if(pc && isRoyal(pc.t)){
          if(pc.p===-1){ if(!ek){ ek=[r,c]; if(yk) break; } }
          else if(!yk){ yk=[r,c]; if(ek) break; }
        }
      } }
  }
  const ekr=ek?ek[0]:0, ekc=ek?ek[1]:0, ykr=yk?yk[0]:0, ykc=yk?yk[1]:0;
  for(let li=0; li<NL; li++){
    const L=li?pts:b, RR=LR(L), CC=LC(L);
    for(let r=0;r<RR;r++){ const row=L[r]; if(!row) continue;
      const advE=r*7, advY=(NR-1-r)*7;              // 前進ボーナス（行で決まるので先に出す）
      for(let c=0;c<CC;c++){
        const pc=row[c]; if(!pc) continue;
        let v=VALUE[pc.t];
        if(pc.t!=='K'){
          const en = pc.p===-1;
          v += en? advE : advY;
          // 敵玉への接近ボーナス（攻撃性）
          if(en? yk : ek){
            const d = en? (Math.abs(r-ykr)+Math.abs(c-ykc)) : (Math.abs(r-ekr)+Math.abs(c-ekc));
            if(d<16) v += (16-d)*4;
          }
        }
        s += pc.p===-1? v : -v;
      } }
  }
  // 持ち駒（打てる駒は価値やや高め）
  for(let i=0;i<ce.length;i++) s += VALUE[ce[i]]*1.05;
  for(let i=0;i<cy.length;i++) s -= VALUE[cy[i]]*1.05;
  // 玉の安全度：玉が盤端・囲いから出ているとペナルティ的に評価
  return s;
}

===== anyRoyalIn（探索用の終局判定） =====
// 任意の2層の盤に side の royal が残っているか（探索用。実ゲームの hasRoyalOnBoard と同じ考え方）
function anyRoyalIn(cells, pts, side){
  for(let r=0;r<NR;r++)for(let c=0;c<NC;c++){ const q=cells[r]&&cells[r][c]; if(q&&q.p===side&&isRoyal(q.t)) return true; }
  for(let r=0;r<=NR;r++)for(let c=0;c<=NC;c++){ const q=pts[r]&&pts[r][c]; if(q&&q.p===side&&isRoyal(q.t)) return true; }
  return false;
}

===== simulate（読み用の着手） =====
function simulate(b,m,p,cy,ce){ // 盤・持ち駒をコピーして着手。戻り値 {nb,ncy,nce,king}
  // 駒オブジェクトはこのアプリでは書き換えられない（置き換えるか null にするかのどちらか）。
  // なので読みの中では枠（行の配列）だけ複製すればよく、駒まで作り直す必要はない。
  const nb=b.map(row=>row.slice());
  // 交点レイヤーも一緒にコピーして、読みの中でも2層のまま扱う
  const srcPts=(b&&b.L&&b.L.pts)||null;
  const npts=srcPts? srcPts.map(row=>row.slice()) : Array.from({length:NR+1},()=>Array(NC+1).fill(null));
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
  // 盤に碁石が1つも無ければ囲み取りは絶対に起きない。毎節点の全面走査をやめるため、
  // 「碁石がいるか」を局面から導いて親から引き継ぐ（呼び出し元が人かCPUかでは変えない）。
  // 碁石は打つ以外で増えないので、親に居なければ子にも居ない。取られて減る分は安全側に無視。
  function boardHasGo(cells, pts){
    for(let li=0; li<(pts?2:1); li++){
      const L=li?pts:cells, RR=LR(L), CC=LC(L);
      for(let r=0;r<RR;r++){ const row=L[r]; if(!row) continue;
        for(let c=0;c<CC;c++){ const q=row[c]; if(q&&isGo(q.t)) return true; } }
    }
    return false;
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
  const hadGo = (b && b._go!==undefined) ? b._go : boardHasGo(b, srcPts);
  nb._go = hadGo || !!(m.drop && isGo(m.drop)) || (cy.some(isGo)||ce.some(isGo));
  if(nb._go) simGoCapture(); // 囲碁の囲み取りを読みに反映
  // 実ゲームと同じ判定にする：royal を1枚取っただけでは勝ちにしない。
  // 相手の royal が盤上から全て消えたときだけ「勝ち」。取り切るルールでは royal では決着しない。
  if(king) king = !RULES.captureAll && !anyRoyalIn(nb, npts, -p);
  return {nb,ncy,nce,king};
}

===== genMoves（着手生成） =====
// 着手生成（成り/不成を別手として展開、持ち駒打ちも含む）
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

===== mix32 =====
// 整数をばらけさせる（乱数表の代わり。表を持たずに同じ効果を得る）
function mix32(x){
  x=(x^(x>>>16))>>>0; x=Math.imul(x,0x7feb352d)>>>0;
  x=(x^(x>>>15))>>>0; x=Math.imul(x,0x846ca68b)>>>0;
  return (x^(x>>>16))>>>0;
}

===== hashPos（局面ハッシュ） =====
// 盤（2層）＋持ち駒＋手番から44bitのキーを作る。順序に依らないようXORで畳む。
function hashPos(b,cy,ce,side){
  let h1=0,h2=0;
  const add=(x)=>{ h1^=mix32(x); h2^=mix32((x^0x9e3779b9)>>>0); };
  const pts=(b&&b.L&&b.L.pts)||null;
  for(let li=0; li<(pts?2:1); li++){
    const L = li? pts : b, RR=LR(L), CC=LC(L);
    for(let r=0;r<RR;r++){ const row=L[r]; if(!row) continue;
      for(let c=0;c<CC;c++){ const q=row[c]; if(!q) continue;
        // 元コード(o)は持ち駒になる駒種を変えるので同一視できない
        const code = (zIdx(q.t)*512 + zIdx(q.o))*2 + (q.p===1?1:0);
        add((((li*41+r)*41+c)*262144 + code)|0);
      } }
  }
  // 持ち駒は枚数まで含める（同じ駒2枚がXORで消えないように）
  const hand=(arr,tag)=>{ if(!arr||!arr.length) return;
    const m=new Map(); for(const t of arr) m.set(t,(m.get(t)||0)+1);
    for(const [t,n] of m) add((0x40000000 ^ ((zIdx(t)*64 + Math.min(n,63))*4 + tag))|0);
  };
  hand(cy,1); hand(ce,2);
  if(side===1) add(0x5bf03635|0);
  // 53bitに畳む（Number で正確に表せる上限。衝突は実用上無視できる）
  return (h1>>>0)*2097152 + (h2>>>11);
}

===== mvKey =====
// 手を数値キーにする（座標は 0..40 なので衝突しない）
function mvKey(m){
  if(!m) return -1;
  if(m.pass) return -2;
  const L = (m.pt?1:0) | (m.toPt?2:0);
  if(m.drop) return 90000000 + L*2000 + (m.tr*41+m.tc);
  return (((m.fr*41+m.fc)*1681) + (m.tr*41+m.tc))*4 + L;
}

===== orderInSearch（探索中の並べ替え） =====
// 探索中の並べ替え点数。取りの価値＋置換表の最善手＋killer/counter/history。
function orderInSearch(b, m, side, ply, prevKey, ttMove){
  if(m.pass) return -1000;
  let sc=0;
  if(!m.drop){
    const pts=(b.L&&b.L.pts)||null;
    const DB = (m.toPt!==undefined) ? (m.toPt? pts : b.L.cells) : (m.pt? pts : b);
    const q = DB && DB[m.tr] && DB[m.tr][m.tc];
    if(q && q.p!==side) sc += isRoyal(q.t) ? 1000000 : (VALUE[q.t]||0)*16;
    // 獅子型の途中取り（居喰い含む）も「取り」として先に読む
    if(m.caps) for(const cc of m.caps){
      const z=b[cc[0]] && b[cc[0]][cc[1]];
      if(z && z.p!==side) sc += isRoyal(z.t) ? 1000000 : (VALUE[z.t]||0)*16;
    }
    if(m.promo) sc += 400;
  }
  const k=mvKey(m);
  if(ttMove!==undefined && ttMove===k) sc += 50000;   // 前にこの局面で最善だった手を最優先
  const kk=killers[ply];
  if(kk){ if(kk[0]===k) sc += 9000; else if(kk[1]===k) sc += 8000; }
  if(prevKey!==undefined && counters.get(prevKey)===k) sc += 7000;
  sc += (histTable.get(k)||0);
  return sc;
}

===== searchTick（持ち時間の見張り） =====
function searchTick(){
  if(!searchDeadline) return;
  if((++searchNodes & 255)===0 && ((typeof performance!=='undefined'&&performance.now)?performance.now():Date.now())>searchDeadline) throw SEARCH_ABORT;
}

===== search（αβ探索） =====
function search(b,cy,ce,depth,side,alpha,beta,ply,prevKey){
  if(depth===0) return evaluate(b,cy,ce);
  searchTick();
  ply = ply||0;
  // 置換表：同じ局面を同じ深さ以上で読み終えていれば、その結果を使い回す。
  // 残り1手のところは「読み直す方がハッシュより安い」ので使わない（浅い探索が遅くなる）。
  const useTT = depth>=2;
  const a0=alpha, b0=beta;
  const key=useTT? hashPos(b,cy,ce,side) : 0;
  const ent=useTT? TT.get(key) : undefined;
  if(ent && ent.d>=depth){
    // 窓は動かさない（動かすと保存する上限/下限の意味が元の窓とずれる）。
    // 確定値、または今の窓だけで結論が出る境界値のときだけ使い回す。
    if(ent.f===0) return ent.v;                        // 確定値
    if(ent.f===1 && ent.v>=beta) return ent.v;         // 下限がbeta以上→beta cut
    if(ent.f===2 && ent.v<=alpha) return ent.v;        // 上限がalpha以下→alpha cut
  }
  const list=genMoves(b,side,cy,ce);
  if(!list.length){ // 手詰まり＝玉を取られる前提でその側の負け
    return side===-1? -MATE : MATE;
  }
  // 良い手から読む（置換表の手→取り→killer→counter→history→静かな手）
  if(list.length>1){
    const tm = ent? ent.bm : undefined;
    const sc=new Map();
    for(const m of list) sc.set(m, orderInSearch(b,m,side,ply,prevKey,tm));
    list.sort((x,y)=>sc.get(y)-sc.get(x));
  }
  // 詰み点は残り深さを含む値なので置換表には入れない（深さが違うと意味が変わる）
  const store=(val,bm)=>{
    if(!useTT) return;
    if(val<=-MATE || val>=MATE || !isFinite(val)) return;
    if(TT.size>=TT_MAX) TT.clear();
    const old=TT.get(key);
    if(old && old.d>depth) return;
    TT.set(key,{d:depth, v:val, f:(val<=a0?2:(val>=b0?1:0)), bm});
  };
  const isCap=(m)=>{
    if(m.drop||m.pass) return false;
    if(m.caps && m.caps.length) return true;
    const pts=(b.L&&b.L.pts)||null;
    const DB=(m.toPt!==undefined)?(m.toPt?pts:b.L.cells):(m.pt?pts:b);
    const q=DB&&DB[m.tr]&&DB[m.tr][m.tc];
    return !!(q&&q.p!==side);
  };
  // beta cutoff を起こした静かな手を覚える（次からその手を先に読む）
  const remember=(m)=>{
    if(isCap(m)) return;
    const k=mvKey(m);
    const kk=killers[ply]||(killers[ply]=[0,0]);
    if(kk[0]!==k){ kk[1]=kk[0]; kk[0]=k; }
    histTable.set(k,(histTable.get(k)||0)+depth*depth);
    if(prevKey!==undefined) counters.set(prevKey,k);
  };
  let best=undefined;
  if(side===-1){ // 相手＝最大化
    let val=-Infinity;
    for(const m of list){
      const s=simulate(b,m,-1,cy,ce);
      if(s.king){ return MATE+depth; } // あなたの玉を取れる→即勝ち（早いほど高評価）
      const v=search(s.nb,s.ncy,s.nce,depth-1,1,alpha,beta,ply+1,mvKey(m));
      if(v>val){ val=v; best=mvKey(m); }
      alpha=Math.max(alpha,val);
      if(alpha>=beta){ remember(m); break; }
    }
    store(val,best);
    return val;
  } else { // あなた＝最小化
    let val=Infinity;
    for(const m of list){
      const s=simulate(b,m,1,cy,ce);
      if(s.king){ return -MATE-depth; } // 相手の玉を取れる→相手にとって即負け
      const v=search(s.nb,s.ncy,s.nce,depth-1,-1,alpha,beta,ply+1,mvKey(m));
      if(v<val){ val=v; best=mvKey(m); }
      beta=Math.min(beta,val);
      if(alpha>=beta){ remember(m); break; }
    }
    store(val,best);
    return val;
  }
}

===== cpuPickMove（最善手選び） =====
// side=-1(相手) or 1(あなた) の最善手を選ぶ。評価は常に相手(-1)視点なので
// side=-1は最大化、side=1は最小化したい手を選ぶ。
function cpuPickMove(side, depth){
  clearOrderTables();   // 並べ替えの記憶は1手ごとにリセット（古い局面の情報を引きずらない）
  let list=genMoves(board,side,capYou,capEnemy);
  // 実際に指す手は人間と同じ合法判定を通す（千日手回避で禁じた手は候補から除く）
  if(RULES.banSennichite) list=list.filter(m=>isLegalMove(m,side));
  if(!list.length) return null;  // 指せる手が無い＝手詰まり（呼び出し側が持将棋/詰みとして解決）
  let DEPTH = depth!=null ? depth : (SPEEDS[speedIdx].depth||3);
  // 大盤は合法手・分岐が爆発するためCPUを簡易化（探索を浅くする割り切り）
  const BMAX=Math.max(NR,NC);
  // 熟考は時間で必ず止まるので、大盤でも深さを絞りすぎない。
  // 時間の見張りが無い速度（標準・高速・超高速）は、盤が広いと画面が固まるので従来どおり浅くする。
  const SP = (depth==null) ? SPEEDS[speedIdx] : null;
  const budget = SP ? SP.budget : 0;
  const deep = !!(SP && SP.deep);
  if(BMAX>=18) DEPTH=Math.min(DEPTH, deep?2:1);   // 19路盤など広い盤＋多数の打ち手は浅く
  else if(BMAX>=13) DEPTH=Math.min(DEPTH, deep?3:2);
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
    if(m.caps) for(const cc of m.caps){
      const z=board[cc[0]] && board[cc[0]][cc[1]];
      if(z && z.p!==side) sc += isRoyal(z.t) ? 100000 : (VALUE[z.t]||0);
    }
    if(m.promo) sc += 50;
    return sc;
  };
  const ordCache=new Map();
  const ordOf=(m)=>{ let v=ordCache.get(m); if(v===undefined){ v=ordScore(m); ordCache.set(m,v); } return v; };
  list.sort((a,b2)=>ordOf(b2)-ordOf(a));
  // 超高速(depth<=1)では、トップ候補だけ評価して即答する。
  // 大盤の絞り込みは以前ほど厳しくしなくてよい（探索自体が桁違いに速くなったため）。
  const CAP = (DEPTH<=1) ? (BMAX>=16?18:24) : (BMAX>=16? (deep?64:18) : 0);
  const cand = CAP ? list.slice(0, Math.min(list.length, CAP)) : list;
  // 指定の深さで候補を全部評価して最善手を返す（王が取れる手は即返す）
  const now=()=>((typeof performance!=='undefined'&&performance.now)?performance.now():Date.now());
  // 指定の深さで候補を全部評価して最善手を返す。
  // deadline を渡すと、途中で時間切れになった時点で打ち切る（その深さの結果は捨てる）。
  /* ルートでも窓を絞る。これまでは候補1手ごとに全窓(-∞,∞)で読み直していたので、
     明らかに劣る手も最後まで正確に読んでいた。今の最善よりわずかに下を下限にすれば、
     「同点以上の手」は今までどおり正確な値が返り、劣る手だけ途中で打ち切れる。
     → 選ばれる手も、同点のときの等確率選択も変わらないまま枝刈りだけが効く。 */
  const EPS=1e-6;
  const pickAt=(d, deadline)=>{
    let best=null, bestScore = side===-1? -Infinity : Infinity, ties=0;
    for(const m of cand){
      let sc;
      try{
        const s=simulate(board,m,side,capYou,capEnemy);
        if(s.king) return {m, mate:true};
        const lo = (side===-1 && isFinite(bestScore)) ? bestScore-EPS : -Infinity;
        const hi = (side===1  && isFinite(bestScore)) ? bestScore+EPS :  Infinity;
        sc = d<=0 ? evaluate(s.nb,s.ncy,s.nce)
                  : search(s.nb,s.ncy,s.nce,d,-side,lo,hi,1,mvKey(m));
      }catch(e){
        // 読んでいる途中で時間切れ。この手の分は結論が出ていないので捨て、
        // ここまでに読み終えた範囲の最善手を返す（候補は良い順なので使える）
        if(e!==SEARCH_ABORT) throw e;
        return {m:best, partial:true};
      }
      // ランダム加点はしない。完全に同点のときだけ、候補の中から等確率で選ぶ
      if(sc===bestScore){ ties++; if(Math.random()<1/ties) best=m; }
      else if(side===-1? sc>bestScore : sc<bestScore){ bestScore=sc; best=m; ties=1; }
      // 時間切れ：そこまでに読めた範囲の最善手を返す（候補は良い順に並んでいるので使える）
      if(deadline && now()>deadline) return {m:best, partial:true};
    }
    return {m:best};
  };
  if(budget && DEPTH>1){
    // 反復深化：浅い方から順に読み、与えた時間の中でできるだけ深く読む。
    // 途中で切れても「最後に読み切った深さの最善手」が残るので必ず手は返せる。
    // 深さ1から始めるのは、広い盤で深さ2が時間内に1手も読み終わらなくても
    // 「読み切った結論」を必ず1つ持っておくため。
    const deadline = now() + budget;
    searchDeadline = deadline; searchNodes = 0;   // 深い枝の途中でも時間で打ち切れるようにする
    try{
      let best=null;
      for(let d=1; d<=DEPTH; d++){
        // 前の深さの最善手を先頭に持ってくると枝刈りがよく効き、同じ時間でより深く読める
        if(best){ const i=cand.indexOf(best); if(i>0){ cand.splice(i,1); cand.unshift(best); } }
        const r=pickAt(d, deadline);
        if(r.mate) return r.m;
        if(r.m) best=r.m;               // 途中までの結果も使う（先頭は前の深さの最善手）
        if(r.partial || now()>=deadline) break;
      }
      return best||cand[0]||list[0];
    } finally { searchDeadline = 0; }
  }
  searchDeadline = 0;   // 深さ指定のときは時間で打ち切らない
  const r=pickAt(DEPTH);
  return r.m||cand[0]||list[0];
}

===== doAutoMove =====
// CPUに1手だけ指させる（スケジュールはしない）。指せたらtrue。
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

===== scheduleAutoStep =====
function scheduleAutoStep(){
  stopAutoLoop();
  if(paused) return; // 一時停止中は自動進行しない
  const sp=SPEEDS[speedIdx];
  // 超高速は setTimeout(0) で詰めつつ、各手の間にイベントループを挟む（ボタン応答確保）
  autoTimer=setTimeout(runAutoStep, stepDelay());
}
```

---

## 2. すでに入っているもの

**探索の正しさ**

- **探索と実ゲームの勝敗判定を統一**：`simulate` は royal を1枚取っただけでは
  `king=true` を返さない。相手の royal が盤上から全て消えたときだけ（`anyRoyalIn`）。
  `captureAll` では royal で決着しない。
- **評価のランダム加点を廃止**：完全同点のときだけ等確率で選ぶ。

**速くする仕組み（合法手も評価値も変えていない）**

| 仕組み | 内容 |
|---|---|
| 手の並べ替え | 探索の内側でも並べ替える。取りの価値（royal＞駒価値）＋成り＋獅子の途中取り、置換表の最善手、killer（各plyに2手）、counter、history（cutoffにdepth²）。以前はルートしか並べ替えていなかった |
| 置換表 | 局面を53bitのキーに（`hashPos`）。乱数表を持たず `mix32()` で生成。**確定値か、今の窓だけで結論が出る境界値のときだけ**使い、αβの窓は動かさない。詰み点は保存しない。残り1手の節点では使わない。1手ごとに捨てる |
| ルートの窓 | 候補ごとの全窓読み直しをやめ、今の最善のわずかに下（`EPS`）を下限にする。同点以上の手は正確な値が返るので選ばれる手も同点時の等確率選択も変わらない |
| 盤のコピー | 駒オブジェクトは書き換えられないので行の配列だけ複製する |
| 評価 | 玉の位置を1周でまとめて拾い、盤の走査を3周→2周に |
| 囲碁の囲み取り | 碁石が居ない盤では全面走査をしない（局面から導いて親から引き継ぐ） |
| 持ち時間 | `searchTick()` が256節点に1回だけ時計を見て、超えたら例外でその深さを丸ごと捨てる |
| 速度設定 | 深さ固定をやめ「1手にかける時間」に（熟考2秒／標準0.4秒／高速0.08秒／超高速は深さ1固定） |

同一局面・深さ4の探索時間（改善前→現在）：本将棋 8.7秒→0.30秒、チェス 11.8秒→0.22秒、
シャンチー深さ3 3.8秒→0.19秒、大局将棋深さ2 9.0秒→0.25秒。
熟考どうしのA/B（5五将棋8局）で新7勝・旧1勝。

---

## 3. まだ入っていないもの（依頼したい範囲）

優先順。上ほど費用対効果が高い。

1. **静止探索（qsearch）** — 取り合いの途中で評価を打ち切る地平線効果への対処。
   ただし葉ごとに `genMoves` を呼ぶと現状の探索より高くつく見込みなので、
   **取りだけを生成する軽い経路**を用意できるかが鍵。入れる前に必ず実測すること。
2. **評価の差分更新** — いまは葉で盤を2周している。着手で動いた駒の分だけ足し引きする。
   `simulate` が盤を作り直す方式なので、`make/unmake` とセットでないと効きにくい。
3. **make/unmake（Mutation Journal 方式）** — `simulate` の行コピーもやめる。
   オセロ複数反転・囲碁複数捕獲・獅子の複数取り・火鬼・はさみ取り・xcaps・
   層移動・成り をすべて完全復元できること。導入時は
   「旧 simulate と結果が一致するか」を一定確率で比較する検証モードを併用する。
   ※ 実測では盤コピーは `simulate` の約1/4、`simulate` 自体が1手あたりの1/4程度なので、
   通常の盤で見込める上積みは1割弱。大局将棋のような広い盤ほど効く。
4. **eventDelta（候補選別の質）** — 通常捕獲だけでなく、xcaps・複数取り・
   オセロ反転数・囲碁捕獲・成り増分・royal への脅威を採点に入れる。
   ※ 候補の足切り（`cand`）が効くのは深さ1か大盤のときだけなので、効果測定はその条件で。
5. **大局将棋の着手生成** — 4,440手を生成するのに数msかかり、広い盤ではここが支配的。
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
- **無改造の探索を正解として、選ぶ手が常に最善値と一致すること**
  （枝刈りを足したのに手が変わる＝どこかで正しい手を捨てている）
