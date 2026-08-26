import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const HTML=new URL('../shogi.html',import.meta.url).pathname;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
  args:['--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
const reqs=[]; p.on('request',r=>{ if(/\.mp3(\?|$)/.test(r.url())) reqs.push(r.url().split('/').pop()); });
await p.goto('file://'+HTML); await p.waitForTimeout(900);
const R={};
R['①曲の一覧']=await p.evaluate(()=>SFX.bgm.list.map(t=>t.n+' → '+t.f));
R['①選択肢']=await p.$$eval('#bgmTrack option',os=>os.map(o=>o.textContent));
R['②ONにする前に読み込むか']={mp3リクエスト:reqs.length, audio要素:await p.evaluate(()=>!!SFX.bgm.el)};
R['②ボタンの表示']=await p.textContent('#bgmToggle');

await p.click('#bgmToggle'); await p.waitForTimeout(2500);
R['③ONにした後']=await p.evaluate(()=>{
  const a=SFX.bgm.el;
  return {ボタン:document.getElementById('bgmToggle').textContent,
    再生中:SFX.bgm.playing, 一時停止:a?a.paused:'audioなし',
    曲:SFX.bgm.title(), src:a?a.getAttribute('src'):null,
    長さ秒:a&&isFinite(a.duration)?Math.round(a.duration):'まだ不明',
    現在位置:a?+a.currentTime.toFixed(2):null, 音量:a?a.volume:null, くり返し:a?a.loop:null};
});
R['③読み込んだファイル']=reqs.slice();

// 曲を選び直す
await p.selectOption('#bgmTrack','2'); await p.waitForTimeout(1500);
R['④曲を選び直す']=await p.evaluate(()=>({曲:SFX.bgm.title(), src:SFX.bgm.el.getAttribute('src'),
  再生中:SFX.bgm.playing, 一時停止:SFX.bgm.el.paused}));

// くり返し方は 🔁全曲 → 🔂1曲 → 🔀ランダム → 🔁全曲 と回る
const modeState=async()=>await p.evaluate(()=>({表示:document.getElementById('bgmMode').textContent.trim(),
  mode:SFX.bgm.mode, loop:SFX.bgm.el.loop}));
R['⑤くり返し方の初期']=await modeState();
await p.click('#bgmMode'); R['⑤1回押す']=await modeState();
await p.click('#bgmMode'); R['⑤2回押す']=await modeState();
await p.click('#bgmMode'); R['⑤3回押して戻る']=await modeState();
R['⑤ランダムの選び方']=await p.evaluate(()=>{
  SFX.bgm.setMode('shuffle');
  const seen=new Set(); let same=0;
  for(let i=0;i<200;i++){ SFX.bgm.idx=3; const n=SFX.bgm._next(); if(n===3) same++; seen.add(n); }
  return {いまと同じ曲を選んだ回数:same, 選ばれた曲数:seen.size, 全曲数:SFX.bgm.list.length};
});
await p.evaluate(()=>SFX.bgm.setMode('all'));
// 曲が終わったら次の曲へ（全曲モード）。終わりの1秒前まで飛ばして確かめる
await p.evaluate(()=>{ SFX.bgm.setMode('all'); SFX.bgm.select(0); if(!SFX.bgm.playing) SFX.bgm.start(); });
await p.waitForTimeout(1200);
const before=await p.evaluate(()=>SFX.bgm.title());
await p.evaluate(()=>{ const a=SFX.bgm.el; if(isFinite(a.duration)) a.currentTime=Math.max(0,a.duration-0.6); });
await p.waitForTimeout(3000);
R['⑨曲が終わったら']={前:before, 後:await p.evaluate(()=>SFX.bgm.title()),
  再生中:await p.evaluate(()=>!SFX.bgm.el.paused),
  選択の表示:await p.$eval('#bgmTrack',e=>e.options[e.selectedIndex].textContent)};
await p.evaluate(()=>SFX.bgm.stop());
R['pageerror']=errs;
console.log(JSON.stringify(R,null,1));
await b.close();
