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
       平坦さ       … 鳴っている最中のスペクトルの平たさ。純音が数本立っているだけなら
                      0に近く、広帯域（金属のざらつき）なら大きい
       最大         … 1.0を超えると割れる
       ノイズらしさ … ゼロ交差の間隔のばらつき。低音を敷くと下がるので参考値
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
    // 鳴っている最中（0.06秒あたり）のスペクトルの平たさ
    const N=1024, st=Math.min(d.length-N-1,(sr*0.06)|0);
    let flat=0;
    if(st>0){
      const w=new Float64Array(N);
      for(let i=0;i<N;i++) w[i]=d[st+i]*(0.5-0.5*Math.cos(2*Math.PI*i/(N-1)));
      let lg=0, am=0, cnt=0;
      for(let k=1;k<N/2;k++){ let a=0,b=0;
        for(let i=0;i<N;i++){ const th=-2*Math.PI*k*i/N; a+=w[i]*Math.cos(th); b+=w[i]*Math.sin(th); }
        const m=a*a+b*b; lg+=Math.log(m+1e-20); am+=m; cnt++; }
      flat=Math.exp(lg/cnt)/((am/cnt)||1);
    }
    const zc=[]; let prev=0;
    for(let i=1;i<last;i++){ if((d[i-1]<0)!==(d[i]<0)){ if(prev) zc.push(i-prev); prev=i; } }
    let noisy=0;
    if(zc.length>20){
      const mu=zc.reduce((a,x)=>a+x,0)/zc.length;
      noisy=Math.sqrt(zc.reduce((a,x)=>a+(x-mu)*(x-mu),0)/zc.length)/mu;
    }
    return {最大:+peak.toFixed(2), 体感の大きさ:+Math.sqrt(sq/nn).toFixed(3),
            平坦さ:+flat.toFixed(3), 長さ秒:+(last/sr).toFixed(2), ノイズらしさ:+noisy.toFixed(2)};
  };
  /* 音はノイズで作っているので、鳴らすたびに山の高さが動く。
     1回だけ測るとたまたま低い回を見てしまうので、3回鳴らして
     いちばん大きかった回（＝割れやすい回）で判断する。 */
  const worst=async(n)=>{ let w=null;
    for(let i=0;i<3;i++){ const m=await measure(n); if(!w||m.最大>w.最大) w=m; }
    return w; };
  const kinds=['shakeen','zashu','dukushi'];
  for(const n of kinds.concat(['move','drop','crit','promote'])) R['①'+n]=await worst(n);
  const M=Object.fromEntries(kinds.map(n=>[n,R['①'+n]]));
  const mv=R['①move'];
  // ② 倒す音は割れない
  const pk=kinds.map(n=>M[n].最大);
  R['②割れないか']=pk.every(x=>x<=0.95)?'大丈夫（'+pk.join(' / ')+'）':'★割れる（'+pk.join(' / ')+'）';
  // ③ 3種が同じくらいの大きさ（どれが出ても音量が揃っている）
  const ld=kinds.map(n=>M[n].体感の大きさ);
  R['③3種の大きさ']=(Math.max(...ld)/Math.min(...ld))<=1.6
    ? '揃っている（'+ld.join(' / ')+'）' : '★ばらつきが大きい（'+ld.join(' / ')+'）';
  // ④ 駒音に紛れない大きさがあること。小さいと「ポッ」としか聞こえない
  //    直す前は 0.025〜0.056 しかなく、駒音の2倍ほどだった
  R['④大きさは足りているか']=(ld.every(x=>x>=0.08) && ld.every(x=>x>=mv.体感の大きさ*2.5))
    ? '足りている（駒音 '+mv.体感の大きさ+' / 倒す音 '+ld.join(' / ')+'）'
    : '★小さすぎる（駒音 '+mv.体感の大きさ+' / 倒す音 '+ld.join(' / ')+'）';
  /* ⑤ シャッキーンが鐘（ピロン）になっていないか。
        正弦波の倍音を重ねて作ると、スペクトルに純音が数本立つだけになって平坦さが下がる。
        わざと鐘にしてある「成る」の音より平たいことを見る。
        （直す前は 0.008 で、成るの 0.010 より下だった＝鐘そのもの） */
  const fl=M.shakeen.平坦さ, pr=R['①promote'].平坦さ;
  R['⑤シャッキーンが鐘になっていないか']= fl>pr
    ? 'ノイズで作れている（成る '+pr+' / シャッキーン '+fl+'）'
    : '★鐘に寄っている（成る '+pr+' / シャッキーン '+fl+'）';
  R['⑤ざらつきの参考値']=kinds.map(n=>n+' '+M[n].ノイズらしさ).join(' / ')+'（低音を敷くと下がるので目安）';
  // ⑥ 消した名前は無音
  R['⑥slash（削除済み）']=await measure('slash');
  return R;
});
console.log(JSON.stringify(out,null,1)); console.log('errs',errs.filter(e=>!/OfflineAudioContext/.test(e)));
await b.close();
