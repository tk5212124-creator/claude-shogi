import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
// 駒の字の大きさが「1マスの大きさ」に比例しているかを見る。
// 縦書きの span は箱の高さが 0 に潰れてブラウザごとに描画が違うので、
// 実際の描画ではなく「文字の大きさ ÷ マスの大きさ」と「縦に積んだ文字数ぶんの高さ」で判定する。
const HTML = (process.argv[2]==='old' && process.env.OLD_HTML) ? process.env.OLD_HTML
                                                              : new URL('../shogi.html',import.meta.url).pathname;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const out={};
for(const W of [390,320]){
  const p=await b.newPage({viewport:{width:W,height:844}});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('file://'+HTML); await p.waitForTimeout(900);
  const R={};
  for(const k of ['hon','chu','dai','makadai','taikyoku','xiangqi']){
    await p.evaluate((k)=>{
      document.getElementById('presetSel').value=k;
      document.getElementById('presetSel').dispatchEvent(new Event('change'));
      document.getElementById('applyPresetBtn').click(); SFX.on=false;
    },k);
    await p.waitForTimeout(250);
    R[k]=await p.evaluate(()=>{
      const bd=document.getElementById('board');
      const cell=bd.querySelector('.cell').getBoundingClientRect().width;
      let over=0, worstV=0, worstH=0, sample=null, minFs=99;
      bd.querySelectorAll('.koma').forEach(k=>{
        const kr=k.getBoundingClientRect();
        const cols=[...k.querySelectorAll('.koma-name')];
        const suf=k.querySelector('.koma-suffix');
        if(!cols.length) return;
        // 縦：1列に積む最大文字数 × 文字の大きさ
        let v=0, h=0;
        for(const c of cols){
          const fs=parseFloat(getComputedStyle(c).fontSize);
          minFs=Math.min(minFs,fs);
          v=Math.max(v, [...c.textContent].length*fs*1.02);
          h+=fs;
        }
        if(suf) h+=parseFloat(getComputedStyle(suf).fontSize);
        const vR=v/kr.height, hR=h/kr.width;
        if(vR>1||hR>1){ over++; if(!sample) sample=k.textContent.replace(/\s/g,'')+' 縦'+vR.toFixed(2)+' 横'+hR.toFixed(2); }
        worstV=Math.max(worstV,vR); worstH=Math.max(worstH,hR);
      });
      return {盤:NR+'×'+NC, マス:Math.round(cell)+'px', 駒数:bd.querySelectorAll('.koma').length,
        はみ出す駒:over, 縦の最悪:+worstV.toFixed(2), 横の最悪:+worstH.toFixed(2),
        一番小さい字:+minFs.toFixed(1)+'px', 例:sample};
    });
  }
  R['pageerror']=errs;
  out[W+'px']=R;
  await p.close();
}
console.log(JSON.stringify(out,null,1));
await b.close();
