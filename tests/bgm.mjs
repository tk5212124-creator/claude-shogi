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

// 「音・演出」を切ったら BGM も止まる
await p.click('#sfxToggle'); await p.waitForTimeout(300);
R['⑥音・演出をOFFにしたら']=await p.evaluate(()=>({BGM:document.getElementById('bgmToggle').textContent,
  再生中:SFX.bgm.playing, 一時停止:SFX.bgm.el.paused}));
await p.click('#sfxToggle');
// BGMボタンで ON → OFF
await p.click('#bgmToggle'); await p.waitForTimeout(800);
const onNow=await p.evaluate(()=>!SFX.bgm.el.paused);
await p.click('#bgmToggle'); await p.waitForTimeout(300);
R['⑦BGMボタンでON→OFF']={ONで鳴る:onNow, OFFで止まる:await p.evaluate(()=>SFX.bgm.el.paused)};
// 全ファイルが実在して再生できるか
R['⑧全曲の長さ']=await p.evaluate(async()=>{
  const out=[];
  for(const t of SFX.bgm.list){
    const a=new Audio(t.f);
    const d=await new Promise(res=>{
      a.addEventListener('loadedmetadata',()=>res(Math.round(a.duration)));
      a.addEventListener('error',()=>res('★読み込めない'));
      setTimeout(()=>res('★時間切れ'),8000);
    });
    out.push(t.n+'：'+(typeof d==='number'?Math.floor(d/60)+'分'+String(d%60).padStart(2,'0')+'秒':d));
  }
  return out;
});
await p.evaluate(()=>{ if(!SFX.bgm.playing) SFX.bgm.start(); });
await p.waitForTimeout(600);

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

// ⑤' 曲送り・曲戻し
const cur=()=>p.evaluate(()=>({曲:SFX.bgm.title(), 番号:SFX.bgm.idx,
  再生中:SFX.bgm.playing && !SFX.bgm.el.paused, 位置:+SFX.bgm.el.currentTime.toFixed(1)}));
await p.evaluate(()=>{ SFX.bgm.setMode('all'); SFX.bgm.select(0); if(!SFX.bgm.playing) SFX.bgm.start(); });
await p.waitForTimeout(900);
R["⑤'はじめ"]=await cur();
await p.click('#bgmNext'); await p.waitForTimeout(700); R["⑤'次へ"]=await cur();
await p.click('#bgmNext'); await p.waitForTimeout(700); R["⑤'もう一度次へ"]=await cur();
await p.click('#bgmPrev'); await p.waitForTimeout(700); R["⑤'前へ（頭から1秒未満なので前の曲）"]=await cur();
await p.evaluate(()=>{SFX.bgm.el.currentTime=0.2;}); await p.waitForTimeout(200);
await p.click('#bgmPrev'); await p.waitForTimeout(700); R["⑤'さらに前へ"]=await cur();
// 3秒より後まで進んでいたら「前へ」は頭出し（曲は変わらない）
await p.evaluate(()=>{SFX.bgm.select(4); SFX.bgm.el.currentTime=20;}); await p.waitForTimeout(500);
const before4=await cur();
await p.click('#bgmPrev'); await p.waitForTimeout(500);
R["⑤'20秒地点で前へ＝頭出し"]={前:before4.曲+' '+before4.位置+'秒', 後:(await cur()).曲+' '+(await cur()).位置+'秒'};
// 先頭で前へ／末尾で次へ（一周する）
await p.evaluate(()=>SFX.bgm.select(0)); await p.waitForTimeout(300);
await p.evaluate(()=>{SFX.bgm.el.currentTime=0;});
await p.click('#bgmPrev'); await p.waitForTimeout(500);
R["⑤'先頭で前へ"]=(await cur()).曲;
await p.evaluate(()=>SFX.bgm.select(SFX.bgm.list.length-1)); await p.waitForTimeout(300);
await p.click('#bgmNext'); await p.waitForTimeout(500);
R["⑤'末尾で次へ"]=(await cur()).曲;
// 1曲くり返しでも押せば動く
await p.evaluate(()=>{SFX.bgm.setMode('one'); SFX.bgm.select(2);}); await p.waitForTimeout(300);
await p.click('#bgmNext'); await p.waitForTimeout(500);
R["⑤'1曲くり返し中に次へ"]=(await cur()).曲;
// ランダム中の「前へ」は聴いた順に戻る
await p.evaluate(()=>{SFX.bgm.setMode('shuffle'); SFX.bgm.select(5); SFX.bgm.hist=[];});
await p.waitForTimeout(300);
const a1=(await cur()).曲;
await p.click('#bgmNext'); await p.waitForTimeout(500); const a2=(await cur()).曲;
await p.evaluate(()=>{SFX.bgm.el.currentTime=0;});
await p.click('#bgmPrev'); await p.waitForTimeout(500);
R["⑤'ランダムで次→前"]={最初:a1, 次:a2, 戻ったら:(await cur()).曲, 一致:a1===(await cur()).曲};
await p.evaluate(()=>{SFX.bgm.setMode('all'); SFX.bgm.select(0);});
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
