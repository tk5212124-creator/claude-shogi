import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const HTML = (process.argv[2]==='old' && process.env.OLD_HTML) ? process.env.OLD_HTML
                                                              : new URL('../shogi.html',import.meta.url).pathname;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
/* ページの AudioContext を OfflineAudioContext にすり替えると、
   SFX が組んだ音を「本物の波形」として取り出して測れる。
   headless では音を聴けないので、ここで形を数値にして確かめる。 */
await p.addInitScript(()=>{
  const OAC=window.OfflineAudioContext;
  window.AudioContext=function(){ return (window.__last=new OAC(1, Math.round(48000*1.2), 48000)); };
  window.webkitAudioContext=window.AudioContext;
});
await p.goto('file://'+HTML); await p.waitForTimeout(800);
const out=await p.evaluate(async()=>{
  /* 音の「らしさ」を3つの数で見る。
       体感の大きさ … 最初の0.3秒の実効値。小さすぎると「ポッ」に聞こえる
       ノイズらしさ … ゼロ交差の間隔のばらつき。0に近いほど純音＝鐘（ピロン）
       最大         … 1.0を超えると割れる
     倒す音を正弦波の倍音で作ると鐘になるので、ノイズで作らなければならない。 */
  const R={};
  const SRC=[...document.querySelectorAll('script')].map(s=>s.textContent).join('\n');
  const st=SRC.indexOf('const SFX = (function(){');
  const en=SRC.indexOf('\n})();', SRC.indexOf('bgm:{',st));
  const BODY=SRC.slice(st,en+6).replace('const SFX = (function(){','window.__SFX = (function(){');
  const measure=async(name)=>{
    (0,eval)(BODY);                       // 音ごとにまっさらな SFX（＝新しい文脈）を作る
    const S=window.__SFX; S.on=true; S.resume();
    for(const k in S.seMap) S.setSe(k,null);   // 合成音そのものを測る
    S.play(name);
    const buf=await window.__last.startRendering();
    const d=buf.getChannelData(0), sr=buf.sampleRate;
    let peak=0; for(let i=0;i<d.length;i++){ const v=Math.abs(d[i]); if(v>peak) peak=v; }
    if(peak===0) return {最大:0, 体感の大きさ:0, 長さ秒:0, ノイズらしさ:0};
    let last=0; for(let i=0;i<d.length;i++) if(Math.abs(d[i])>peak*0.01) last=i;
    let sq=0; const nn=Math.min(d.length,(sr*0.3)|0);
    for(let i=0;i<nn;i++) sq+=d[i]*d[i];
    const zc=[]; let prev=0;
    for(let i=1;i<last;i++){ if((d[i-1]<0)!==(d[i]<0)){ if(prev) zc.push(i-prev); prev=i; } }
    let noisy=0;
    if(zc.length>20){
      const mu=zc.reduce((a,x)=>a+x,0)/zc.length;
      noisy=Math.sqrt(zc.reduce((a,x)=>a+(x-mu)*(x-mu),0)/zc.length)/mu;
    }
    return {最大:+peak.toFixed(2), 体感の大きさ:+Math.sqrt(sq/nn).toFixed(3),
            長さ秒:+(last/sr).toFixed(2), ノイズらしさ:+noisy.toFixed(2)};
  };
  const kinds=['shakeen','zashu','dukushi'];
  for(const n of kinds.concat(['move','drop','crit'])) R['①'+n]=await measure(n);
  const M=Object.fromEntries(kinds.map(n=>[n,R['①'+n]]));
  const mv=R['①move'];
  // ② 倒す音は割れない
  const pk=kinds.map(n=>M[n].最大);
  R['②割れないか']=pk.every(x=>x<=0.95)?'大丈夫（'+pk.join(' / ')+'）':'★割れる（'+pk.join(' / ')+'）';
  // ③ 3種が同じくらいの大きさ（どれが出ても音量が揃っている）
  const ld=kinds.map(n=>M[n].体感の大きさ);
  R['③3種の大きさ']=(Math.max(...ld)/Math.min(...ld))<=1.6
    ? '揃っている（'+ld.join(' / ')+'）' : '★ばらつきが大きい（'+ld.join(' / ')+'）';
  // ④ 駒を動かす音（ポッ）より、はっきり大きい。小さいと「ポッ」に紛れる
  R['④moveよりどれだけ大きいか']=ld.every(x=>x>=mv.体感の大きさ*5)
    ? '5倍以上（move '+mv.体感の大きさ+' / 倒す音 '+ld.join(' / ')+'）'
    : '★小さすぎる（move '+mv.体感の大きさ+' / 倒す音 '+ld.join(' / ')+'）';
  // ⑤ 鐘（ピロン）になっていない。純音を重ねて作ると、move と同じくらい「ノイズらしさ」が低くなる
  const nz=kinds.map(n=>M[n].ノイズらしさ);
  R['⑤鐘になっていないか']=nz.every(x=>x>mv.ノイズらしさ)
    ? 'ノイズで作れている（move '+mv.ノイズらしさ+' / 倒す音 '+nz.join(' / ')+'）'
    : '★純音に寄っている（move '+mv.ノイズらしさ+' / 倒す音 '+nz.join(' / ')+'）';
  // ⑥ 消した名前は無音
  R['⑥slash（削除済み）']=await measure('slash');
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs.filter(e=>!/OfflineAudioContext/.test(e)));
await b.close();
