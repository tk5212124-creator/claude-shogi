# 将棋アプリ デバッグ計画書

**対象ファイル:** `shogi.html`（単一HTMLファイル / 約2,641行）
**作成日:** 2026年6月13日
**目的:** Claude Code で本計画書に沿ってデバッグを行うための、問題定義・調査履歴・推奨手順をまとめる。
**最重要原則:** 実機（ユーザーのスクショ）で観測された事象が「正」である。コードの単体テストで再現しないことを根拠に、実機の事象を否定してはならない。テスト側の網羅不足・実行ファイルの相違を疑うこと。

---

## 1. 最優先で解決すべき問題：オセロの不正配置・非裏返し

### 1.1 観測された事象（実機・複数回）
- 対局設定: 「あなた:CPU」「相手:CPU」、速度「高速」、編集モードOFF、通常対局。
- 事象A: オセロ石（●/○）が、**1枚も挟めない孤立した空きマス**に打たれる。
- 事象B: オセロ石を打った後、**挟んだはずの周囲の駒が裏返らない**ことがある。
- いずれも複数のスクリーンショットで繰り返し確認済み。再現性あり（高速CPU対局で頻発）。

### 1.2 関係する関数（`shogi.html` 内）
- `othelloFlipCount(r,c,p,bd)` … 指定位置に side=p が打ったとき裏返せる枚数を試算（打てるか判定用）。引数 `bd` で盤を指定可（既定 `board`）。
- `othelloFlip(r,c,p)` … 実際に裏返す。**グローバル `board` を直接参照**。裏返した枚数を返す（診断用に追加済み）。
- `dropTargets(b,t,p)` … 打てる空きマス一覧。OTHは `othelloFlipCount(...)===0` を除外。手動UI・CPU(`genMoves`)共通。
- `isLegalMove(m,p,b)` … 手動と同一判定。drop は `dropTargets`、移動は `moves` を使用。
- `applyMoveSilent(side,m,silent)` … 唯一の着手実体。drop時 `board[tr][tc]={t,p}` の後 `othelloFlip` を呼ぶ。
- `genMoves(b,p,cy,ce)` … CPUの着手候補生成。drop候補は `dropTargets(b,t,p)` から。
- `cpuPickMove(side,depth)` … 探索（`simulate`/`simOthelloFlip` 使用）で着手選択。
- `runAutoStep()` … CPU自動着手。`cpuPickMove`→`isLegalMove`検証→`applyMoveSilent`→`turn=-turn`。

### 1.3 これまで実施した調査（再現せず）
- `othelloFlipCount` 単体: 孤立位置=0、自軍が隣=0、間に空マス=0、相手駒を挟む=正の値。**正しい**。
- `othelloFlip` 単体: 挟んだ相手駒のみ裏返し、自軍は不変。**正しい**。
- `dropTargets`/`dropTargetsRaw` 単体: 孤立位置を候補に含めない。**正しい**。
- `genMoves`→`dropTargets`: 不正なOTH打ちを生成しない。**正しい**。
- `cpuPickMove` E2E（DOMスタブ）: 不正なOTH打ちを選ばない。**正しい**。
- `applyMoveSilent` E2E: 合法位置に打てば必ず裏返る（判定と実行が一致）。**正しい**。
- 結論: **コードの静的・単体・統合テストでは事象を再現できていない。** 実機との乖離あり。

### 1.4 まだ潰せていない仮説（Claude Codeで検証すべき）
ここが本デバッグの主戦場。優先度順。

1. **【最優先】実機で動くファイルが最新でない可能性**
   - ユーザーは毎回 `shogi.html` を手動でプロジェクト/端末へアップロードしている。
   - 古いバージョン（`dropTargetsRaw` 別実装時代、ガード追加前など）が動いていれば事象と整合する。
   - 検証: ブラウザのDevToolsで実際に読み込まれている `othelloFlip`/`dropTargets`/`isLegalMove` の中身を確認。`isLegalMove` が存在しなければ古いファイル。
   - **まず「裏返し枚数表示」が実機で出るか確認**。出なければ古いファイル確定。

2. **探索（`simulate`/`simOthelloFlip`）と実盤の不整合**
   - `cpuPickMove` の探索木深部でコピー盤 `nb` を変化させる。最終選択手が、評価時の仮想盤では合法でも、実盤 `board` では状況が異なる可能性。
   - `runAutoStep` の `isLegalMove(m, turn)` 事前チェックで弾けているはずだが、**実機で本当に通っているか**ログで確認。
   - 検証: `runAutoStep` 内で、選択手・`isLegalMove` の結果・`othelloFlipCount(実盤)` をすべて `console.log` し、CPU対CPLを回して不整合の瞬間を捕捉。

3. **`othelloFlipCount` と `othelloFlip` の盤参照タイミングのズレ**
   - `othelloFlipCount` は引数 `bd` を取れるが、`othelloFlip` はグローバル `board` 固定。
   - `applyMoveSilent` は「石を置く→`othelloFlip`」の順なので理屈は合うが、turbo時の描画間引き・非同期（`scheduleAutoStep`/`setTimeout`）で `board` が差し替わる経路がないか確認。

4. **盤座標系の取り違え（r/c と表示の対応）**
   - 実機スクショの「孤立して見える」位置が、内部座標では実は挟んでいる可能性（既出の仮説）。
   - 検証: 裏返し枚数表示が「0枚」かつ石が置かれているなら不正配置確定。「N枚（N>0）」なら遠距離挟みでルール通り。**この切り分けが最短**。

5. **複数の駒の `fl` フラグ衝突・OTH判定の取りこぼし**
   - `t==='OTH'` の文字列比較が、別経路（編集・ランダム置換でOTHが盤に出た後）で想定外の駒に化けていないか。

### 1.5 推奨デバッグ手順（Claude Code）
1. 実機のDevToolsで、読み込まれている関数が最新か確認（特に `isLegalMove` の有無、`othelloFlip` が枚数を返すか）。**最新でなければ最新を配置してから再検証。**
2. 最新であることを確認後、`runAutoStep` と `applyMoveSilent` のオセロ経路に一時ログを仕込み、CPU対CPU・高速で再現させ、以下を記録:
   - 選択手 `m`（drop/tr/tc）
   - `isLegalMove(m,turn)` の結果
   - 打つ直前の `othelloFlipCount(m.tr,m.tc,turn,board)`
   - `othelloFlip` の戻り値（実際の裏返し枚数）
3. 「`othelloFlipCount>0` だが `othelloFlip` の戻り値が0」または「`isLegalMove=false` の手が着手された」瞬間を特定。
4. 特定できた経路に絞って原因修正。修正後、同じログで再発しないことを確認してからログを除去。

---

## 2. 既知の設計上の注意（デバッグ時に壊さないこと）

- 着手は `applyMoveSilent` に一本化済み。手動 `doMove`/`doDrop` はラッパー。ここを二重化に戻さないこと。
- 合法判定は `moves`/`dropTargets`/`isLegalMove` を共通使用。CPU専用の別判定を新設しないこと（不整合の再発源になる）。
- `applyMoveSilent` 内に「手を弾いて return する」ガードを入れないこと（CPUのパス状態を生む）。弾く判定は必ず着手前（`runAutoStep`/`onCell`）で行う。
- チェスのキャスリング・アンパッサン・ポーン昇格は専用処理として残置（未統合）。

---

## 3. 副次的に確認したい項目（優先度低）

- `evaluate` がオセロの盤面支配を評価していない（CPUがオセロを軽視/濫用する遠因の可能性）。
- 詰み判定・王手放置禁止は未実装（仕様。バグではない）。勝敗はroyalを実際に取った時点で確定。
- 裏返し枚数表示（`setStatus('オセロ：N枚…')`）は診断用。原因特定後、残すか除くか判断。

---

## 4. 検証環境メモ（Node.jsでのヘッドレステスト手順）

`shogi.html` から `<script>` を正規表現で抽出し、必要関数を切り出して `new Function` で評価する方式。
- 定数 `F=Infinity` は TP 定義より前にあるため、関数切り出し時は別途定義が必要。
- `basePower`/`pieceRank` 使用時は `POWER_CACHE`/`BASEPOW_CACHE` のスタブが必要。
- `cpuPickMove` 等のフルパス検証には DOM スタブ（`document.getElementById` 等）が必要。
- **重要:** これらヘッドレステストは事象を再現できなかった。実機ブラウザ（DevToolsログ）での再現を優先すること。
