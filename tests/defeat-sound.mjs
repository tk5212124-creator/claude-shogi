import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const HTML = (process.argv[2]==='old' && process.env.OLD_HTML) ? process.env.OLD_HTML
                                                              : new URL('../shogi.html',import.meta.url).pathname;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
// 音そのものは headless では聴けないので、
// AudioContext が「何をいくつ鳴らそうとしたか」を数えて中身を確かめる。
await p.addInitScript(()=>{
  const AC=window.AudioContext||window.webkitAudioContext;
  window.__snd={osc:0,buf:0};
  const o=AC.prototype.createOscillator, s=AC.prototype.createBufferSource;
  AC.prototype.createOscillator=function(){ window.__snd.osc++; return o.apply(this,arguments); };
  AC.prototype.createBufferSource=function(){ window.__snd.buf++; return s.apply(this,arguments); };
});
await p.goto('file://'+HTML); await p.waitForTimeout(900);
const out=await p.evaluate(async()=>{
  const R={};
  SFX.on=true; SFX.resume();
  const count=(fn)=>{ const a={...window.__snd}; fn(); const z=window.__snd;
    return {音程:z.osc-a.osc, ノイズ:z.buf-a.buf}; };
  R['倒す音の種類']=SFX.defeatKinds;
  // ① 1つずつ鳴らして、ちゃんと音が組まれるか（0なら名前が無い＝無音）
  for(const n of ['shakeen','zashu','dukushi','move','drop','crit','promote','flip','check'])
    R['①'+n]=count(()=>SFX.play(n));
  // ② 消した名前は無音（旧 slash）
  R['②slash（削除済み）']=count(()=>SFX.play('slash'));
  R['②知らない名前']=count(()=>SFX.play('nonsense'));
  // ③ 'defeat' と旧名 'capture' は3種のどれかになる。鳴らす中身の数で見分ける
  const sig={}; for(const n of SFX.defeatKinds){ const c=count(()=>SFX.play(n)); sig[c.音程+'_'+c.ノイズ]=n; }
  R['③見分けの表']=sig;
  const seq=[];
  for(let i=0;i<60;i++){ const c=count(()=>SFX.play('defeat')); seq.push(sig[c.音程+'_'+c.ノイズ]||'★不明'); }
  const seqC=[]; for(let i=0;i<20;i++){ const c=count(()=>SFX.play('capture')); seqC.push(sig[c.音程+'_'+c.ノイズ]||'★不明'); }
  const tally=a=>a.reduce((m,x)=>(m[x]=(m[x]||0)+1,m),{});
  let repeat=0; for(let i=1;i<seq.length;i++) if(seq[i]===seq[i-1]) repeat++;
  R["③'defeat' を60回"]={内訳:tally(seq), 同じ音が続いた回数:repeat, 最初の8回:seq.slice(0,8)};
  R["③旧名 'capture' を20回"]={内訳:tally(seqC)};
  // ④ 音・演出OFFなら1つも鳴らさない
  SFX.on=false;
  R['④音OFFのとき']=count(()=>{ SFX.play('defeat'); SFX.play('shakeen'); SFX.play('move'); });
  SFX.on=true;
  // ⑤ 実際に駒を取ったときに通る道（applyMoveSilent→render→applyFx）で倒す音が鳴るか
  {
    const B=Array.from({length:9},()=>Array(9).fill(null));
    B[8][4]={t:'hK',p:1}; B[0][4]={t:'hKw',p:-1}; B[4][4]={t:'hR',p:1}; B[3][4]={t:'hP',p:-1};
    loadState(JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
      RULES:{drops:true,pointMode:'cell',banSennichite:false,sennichiteMode:'none',allowPass:false},
      board:B,pts:Array.from({length:10},()=>Array(10).fill(null)),
      diag:Array.from({length:9},()=>Array(9).fill(null)),capYou:[],capEnemy:[]}));
    SFX.on=true; SFX.resume(); gameOver=false;
    const a={...window.__snd};
    turn=1; applyMoveSilent(1,{fr:4,fc:4,tr:3,tc:4});      // 飛車で歩を取る
    // 演出は render→requestAnimationFrame で出るので、2フレーム待つ
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const c={音程:window.__snd.osc-a.osc, ノイズ:window.__snd.buf-a.buf};
    R['⑤歩を取ったとき']={鳴った中身:c, どの音:sig[c.音程+'_'+c.ノイズ]||'★3種のどれでもない',
      取った駒:capYou.slice()};
    // 同じ道で、音・演出OFFなら鳴らない
    const a2={...window.__snd};
    SFX.on=false; turn=1; applyMoveSilent(1,{fr:3,fc:4,tr:0,tc:4});
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    R['⑤音OFFで取ったとき']={音程:window.__snd.osc-a2.osc, ノイズ:window.__snd.buf-a2.buf};
    SFX.on=true;
  }
  // 音の大きさ・形（割れないか／鐘になっていないか）は
  // 波形をそのまま測る tests/defeat-sound-shape.mjs が見る
  /* ⑦ 音の起こし方。iOS は触った瞬間にしか鳴らし始められないので、
        画面に触れたら必ず AudioContext を起こす。途中で止められても拾えること。 */
  {
    const blocker=document.createElement('div');
    blocker.style.cssText='position:fixed;inset:0;z-index:9999';
    blocker.addEventListener('pointerdown',e=>e.stopPropagation());   // バブリングを止める邪魔者
    document.body.appendChild(blocker);
    blocker.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    R['⑦止められても音が起きるか']=SFX.state==='running'?'起きる':'★'+SFX.state+'のまま';
    blocker.remove();
    // 音・演出ボタンをONにしたら、合図の音が鳴る（鳴らせていることがその場で分かる）
    SFX.on=false;
    const c=count(()=>document.getElementById('sfxToggle').click());
    R['⑦ONにした合図の音']={鳴った:c, 音:SFX.on, 状態:SFX.state};
  }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
