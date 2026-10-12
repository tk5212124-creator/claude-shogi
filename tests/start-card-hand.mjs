/* 対局を始める前の「ルールと盤の設定」の画面と、編集中の持ち駒の枚数の窓を確かめる。
   実行: node tests/start-card-hand.mjs */
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const HTML=new URL('../shogi.html',import.meta.url).pathname;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+HTML); await p.waitForTimeout(800);
const R={};
const card=()=>p.evaluate(()=>document.getElementById('startCard').hidden?null:
  {題:document.getElementById('scTitle').textContent, 中身:document.getElementById('scBody').textContent});
const tick=()=>p.waitForTimeout(60);
const start=async()=>{ await p.evaluate(()=>document.getElementById('playPause').click()); await tick(); };
// ① 起動しただけでは出ない（盤の設定や駒の配置をいじれるように）。▶ 開始 で出る
R['①起動したとき']=(await card())?'★出る':'出ない';
await start();
const c1=await card();
R['①開始を押すと']=c1? c1.題 : '★出ない';
R['①書いてあること']=c1? ['盤','先手','終わり方','勝ち負け','成る','千日手','持ち駒を打てる','二歩禁止'].filter(w=>!c1.中身.includes(w)).map(w=>'★'+w).join(' ')||'そろっている' : '★';
R['①出ている間はまだ始まらない']=await p.evaluate(()=>paused?'止まっている':'★始まった');
// ② 「この設定で始める」で消えて、対局が始まる
await p.click('#scGo');
R['②始めると消える']=(await card())?'★残る':'消える';
R['②始まった']=await p.evaluate(()=>paused?'★止まったまま':'始まった');
await p.evaluate(()=>{ paused=true; stopAutoLoop(); updatePlayPauseLabel(); });
// ③ プリセットを変えても出ない。開始で、そのゲームの名前と自動で変わったルールで出る
await p.evaluate(()=>{ document.getElementById('presetSel').value='xiangqi'; document.getElementById('applyPresetBtn').click(); }); await tick();
R['③プリセットを変えただけ']=(await card())?'★出る':'出ない';
await start();
const c3=await card();
R['③開始でシャンチー']=c3? {題:c3.題, 王不見王:c3.中身.includes('王不見王')} : '★出ない';
// ④ 出ている間にルールを変えて閉じると中身が変わる
await p.evaluate(()=>{ document.getElementById('ruleBtn').click(); const cb=document.getElementById('rEndOnRoyalCapture');
  cb.checked=true; cb.dispatchEvent(new Event('change')); document.getElementById('ruleClose').click(); }); await tick();
R['④ルールを変えたあと']=((await card())||{中身:''}).中身.includes('王を1枚取る')?'反映された':'★反映されない';
await p.evaluate(()=>{ document.getElementById('startCard').hidden=true; });
// ⑤ 指し直し・先後入替・盤の大きさでは出ない。開始で出る。大きさを変えた名前になる
for(const [name,fn] of [['指し直し',()=>document.getElementById('reset').click()],
                        ['先後入替',()=>document.getElementById('swapSides').click()],
                        ['盤の大きさ',()=>{ document.getElementById('rowRange').value='7'; document.getElementById('colRange').value='7'; document.getElementById('applySizeBtn').click(); }]]){
  await p.evaluate(fn); await tick();
  R['⑤'+name]=(await card())? '★出る' : '出ない';
}
await start();
R['⑤開始で出る名前']=((await card())||{題:'★出ない'}).題;
await p.evaluate(()=>{ document.getElementById('startCard').hidden=true; });
// 手動で盤をタップして指し始めたときは出さない
await p.evaluate(()=>{ document.getElementById('presetSel').value='hon'; document.getElementById('applyPresetBtn').click();
  autoYou=false; autoEnemy=false; refreshAutoLabels(); if(!youAreSente) document.getElementById('swapSides').click(); }); await tick();
await p.evaluate(()=>{ onCell(6,6,false); onCell(5,6,false); }); await tick();
R['⑤盤をタップして指す']={出る:(await card())?'★出る':'出ない', 棋譜:await p.evaluate(()=>kifu.length)};
await p.evaluate(()=>{ document.getElementById('reset').click(); }); await tick();
// ⑥ 出ている間に編集を始めると消える（編集中は出さない）
await start();
await p.evaluate(()=>setEditing(true)); await tick();
R['⑥編集を始めると']=(await card())?'★出る':'消える';
// ⑦ 持ち駒をタップすると枚数の窓。＋−で枚数が変わり、「取り除く」で全部消える
await p.evaluate(()=>{ capYou.push('hP','hP','hP'); render(); });
await p.evaluate(()=>[...document.querySelectorAll('#capYou .cap-koma')].find(d=>!d.classList.contains('cap-add')).click());
R['⑦窓が出る']=await p.evaluate(()=>document.getElementById('handModal').classList.contains('show')
  ? document.getElementById('handTitle').textContent+' '+document.getElementById('handQty').textContent : '★出ない');
await p.click('#handPlus'); await p.click('#handPlus');
R['⑦＋2回']=await p.evaluate(()=>capYou.filter(x=>x==='hP').length);
await p.click('#handMinus');
R['⑦−1回']=await p.evaluate(()=>capYou.filter(x=>x==='hP').length);
R['⑦盤の下の表示も']=await p.evaluate(()=>(document.querySelector('#capYou .ct')||{}).textContent);
await p.click('#handRemove');
R['⑦取り除く']=await p.evaluate(()=>({残り:capYou.filter(x=>x==='hP').length, 窓:document.getElementById('handModal').classList.contains('show')?'★開いたまま':'閉じた'}));
// 1枚のときは − を押せない（0枚にするのは「取り除く」）
await p.evaluate(()=>{ capEnemy.push('hR'); render(); });
await p.evaluate(()=>[...document.querySelectorAll('#capEnemy .cap-koma')].find(d=>!d.classList.contains('cap-add')).click());
R['⑦1枚のとき']=await p.evaluate(()=>({枚数:document.getElementById('handQty').textContent, 減らす:document.getElementById('handMinus').disabled?'押せない':'★押せる'}));
await p.click('#handClose');
await p.evaluate(()=>setEditing(false)); await tick();
R['⑥編集を終えても']=(await card())?'★出る':'出ない';
await start();
R['⑥開始で出る名前']=((await card())||{題:'★出ない'}).題;
console.log(JSON.stringify(R,null,1));
console.log('pageerror',errs);
await b.close();
