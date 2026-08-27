import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
const URL_='file://'+new URL('../shogi.html',import.meta.url).pathname;
await p.goto(URL_); await p.waitForTimeout(900);
const R={};
const vars=()=>p.evaluate(()=>{
  const cs=getComputedStyle(document.documentElement);
  const g=n=>cs.getPropertyValue(n).trim();
  return {盤:g('--board'), 自分の駒:g('--koma-top'), 相手の駒:g('--foe-mid'), 背景:g('--bg1')};
});
R['①選択肢の数']=await p.evaluate(()=>['thBoard','thMine','thFoe','thBg']
  .map(id=>id+' '+document.getElementById(id).options.length+'種'));
// 4つとも同じ色の一覧か（「（きほん）」の付き方だけが違う）
R['①4つとも同じ一覧か']=await p.evaluate(()=>{
  const vals=id=>[...document.getElementById(id).options].map(o=>o.value).join(',');
  const a=vals('thBoard');
  const same=['thMine','thFoe','thBg'].every(id=>vals(id)===a);
  const names=[...document.getElementById('thBoard').options].map(o=>o.textContent);
  return {同じ:same, 一覧:names};
});
R['①きほんの印']=await p.evaluate(()=>['thBoard','thMine','thFoe','thBg'].map(id=>
  id+':'+[...document.getElementById(id).options].filter(o=>/きほん/.test(o.textContent)).map(o=>o.textContent).join('')));
R['②はじめの色']=await vars();
// 実際に駒・盤・背景へ効いているか
const painted=()=>p.evaluate(()=>{
  const k=document.querySelector('#board .koma:not(.enemy)');
  const e=document.querySelector('#board .koma.enemy');
  return {盤:getComputedStyle(document.getElementById('board')).backgroundImage.slice(0,60),
    自分の駒の文字色:getComputedStyle(k).color, 相手の駒の文字色:getComputedStyle(e).color,
    背景:getComputedStyle(document.body).backgroundImage.includes('rgb(20, 41, 31)')?'森':'その他'};
});
R['②描画に効いているか']=await painted();
await p.evaluate(()=>{
  const set=(id,v)=>{const e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('change'));};
  set('thBoard','sumi'); set('thMine','kuro'); set('thFoe','kiji'); set('thBg','mori');
});
await p.waitForTimeout(200);
R['③変えたあと']=await vars();
R['③描画に効いているか']=await painted();
R['③覚えたか']=await p.evaluate(()=>localStorage.getItem('shogiTheme'));
// 読み直しても残るか
await p.reload(); await p.waitForTimeout(900);
R['④読み直したあと']=await vars();
R['④選択欄の表示']=await p.evaluate(()=>['thBoard','thMine','thFoe','thBg']
  .map(id=>{const e=document.getElementById(id); return id+':'+e.options[e.selectedIndex].textContent;}));
// 元に戻す
await p.evaluate(()=>document.getElementById('thReset').click()); await p.waitForTimeout(200);
R['⑤元に戻したあと']=await vars();
// 盤を作り直しても色は残る
await p.evaluate(()=>{
  const set=(id,v)=>{const e=document.getElementById(id); e.value=v; e.dispatchEvent(new Event('change'));};
  set('thBoard','ai');
  document.getElementById('presetSel').value='chu';
  document.getElementById('presetSel').dispatchEvent(new Event('change'));
  document.getElementById('applyPresetBtn').click();
});
await p.waitForTimeout(300);
R['⑥プリセットを変えても']=(await vars()).盤;
// どの色をどの役に使っても、変数が全部入ること
R['⑦全色を4つの役すべてに当てても欠けが出ないか']=await p.evaluate(()=>{
  const need=['--board','--board2','--board-line','--board-edge','--grid',
    '--koma-top','--koma-mid','--koma-bot','--koma-edge','--ink',
    '--foe-top','--foe-mid','--foe-bot','--foe-edge','--foe-ink','--bg1','--bg2','--bg3'];
  let bad=[];
  for(const pal of PALETTE){
    themePick.board=themePick.mine=themePick.foe=themePick.bg=pal.id;
    applyTheme();
    const cs=getComputedStyle(document.documentElement);
    for(const n of need) if(!/^#[0-9a-f]{6}$/i.test(cs.getPropertyValue(n).trim())) bad.push(pal.id+' '+n);
  }
  return {色数:PALETTE.length, 欠け:bad};
});
// 古い保存の名前（aka など）が今の名前に読み替えられるか
R['⑧古い保存の読み替え']=await p.evaluate(()=>{
  localStorage.setItem('shogiTheme', JSON.stringify({board:'hinoki',mine:'shiro',foe:'aka',bg:'ai'}));
  initTheme();
  return {board:themePick.board, mine:themePick.mine, foe:themePick.foe, bg:themePick.bg};
});
R['pageerror']=errs;
console.log(JSON.stringify(R,null,1));
await b.close();
