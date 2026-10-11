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
  window.__snd={osc:0,buf:0,env:[]};
  const o=AC.prototype.createOscillator, s=AC.prototype.createBufferSource, g=AC.prototype.createGain;
  AC.prototype.createOscillator=function(){ window.__snd.osc++; return o.apply(this,arguments); };
  AC.prototype.createBufferSource=function(){ window.__snd.buf++; return s.apply(this,arguments); };
  // 音量カーブだけを記録する（周波数のカーブと区別するため gain に印を付ける）
  AC.prototype.createGain=function(){ const n=g.apply(this,arguments); try{ n.gain.__g=1; }catch(_){} return n; };
  const AP=window.AudioParam.prototype;
  const sv=AP.setValueAtTime, er=AP.exponentialRampToValueAtTime;
  AP.setValueAtTime=function(v,t){ if(this.__g) window.__snd.env.push(['set',v,t]); return sv.apply(this,arguments); };
  AP.exponentialRampToValueAtTime=function(v,t){ if(this.__g) window.__snd.env.push(['ramp',v,t]); return er.apply(this,arguments); };
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
  /* ⑥ 音が割れないか。鳴らすひとつひとつの音量カーブを拾って、
        重なったところの合計（×マスター 0.6）の最大を見る。1.0 を超えると割れる。 */
  {
    const peakOf=(name)=>{
      window.__snd.env.length=0;
      SFX.on=true; SFX.play(name);
      // 1音＝gainノード1つ。set で始まり、次の set までが1音ぶんのカーブ
      const parts=[]; let cur=null;
      for(const [kind,v,t] of window.__snd.env){
        if(kind==='set'){ if(cur) parts.push(cur); cur={t0:t,tp:t,peak:v,tEnd:t}; }
        else if(cur){ if(v>cur.peak){ cur.peak=v; cur.tp=t; } cur.tEnd=Math.max(cur.tEnd,t); }
      }
      if(cur) parts.push(cur);
      if(!parts.length) return null;
      const base=Math.min(...parts.map(x=>x.t0)), end=Math.max(...parts.map(x=>x.tEnd));
      let mx=0;
      for(let s=base;s<=end;s+=0.001){      // 1msごとに重なりを足す
        let sum=0;
        for(const q of parts){
          if(s<q.t0||s>q.tEnd) continue;
          // 立ち上がりと減衰を三角で近似する
          sum += s<=q.tp ? (q.tp>q.t0 ? q.peak*(s-q.t0)/(q.tp-q.t0) : q.peak)
                         : (q.tEnd>q.tp ? q.peak*(1-(s-q.tp)/(q.tEnd-q.tp)) : 0);
        }
        if(sum>mx) mx=sum;
      }
      return {重なりの最大:+(mx*0.6).toFixed(2), 音の数:parts.length, 長さ秒:+(end-base).toFixed(2)};
    };
    for(const n of ['shakeen','zashu','dukushi','crit','promote','move','drop'])
      R['⑥'+n+'の音量']=peakOf(n);
    // 倒す音は毎回鳴るので、割れない（1.0以下）かつ3種が同じくらいの大きさであること
    const ps=SFX.defeatKinds.map(n=>peakOf(n).重なりの最大);
    R['⑥倒す音は割れないか']=ps.every(x=>x<=1.0)?'大丈夫（'+ps.join(' / ')+'）'
                                              :'★割れる（'+ps.join(' / ')+'）';
    R['⑥3種の大きさの差']=(Math.max(...ps)-Math.min(...ps))<=0.25
      ? '揃っている（差 '+(+(Math.max(...ps)-Math.min(...ps)).toFixed(2))+'）'
      : '★ばらつきが大きい（差 '+(+(Math.max(...ps)-Math.min(...ps)).toFixed(2))+'）';
  }
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
