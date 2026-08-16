import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const HTML = (process.argv[2]==='old' && process.env.OLD_HTML) ? process.env.OLD_HTML
                                                              : new URL('../shogi.html',import.meta.url).pathname;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const out={};
for(const W of [390,320]){
  const p=await b.newPage({viewport:{width:W,height:844}});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('file://'+HTML); await p.waitForTimeout(800);
  const R={};
  const snap=()=>p.evaluate(()=>{
    const bd=document.getElementById('board').getBoundingClientRect();
    const h1=document.querySelector('h1').getBoundingClientRect();
    return {盤幅:Math.round(bd.width), 見出しの上:Math.round(h1.top),
      文書の横幅:document.documentElement.scrollWidth, 画面幅:innerWidth};
  });
  R['演出の前']=await snap();
  // 会心の一撃つきの取り（飛車を取る）を実時間で指す
  await p.evaluate(()=>{
    const bd=Array.from({length:9},()=>Array(9).fill(null));
    bd[8][4]={t:'hK',p:1}; bd[0][4]={t:'hK',p:-1};
    bd[4][4]={t:'hR',p:-1}; bd[4][3]={t:'hR',p:1};
    loadState(JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
      RULES:{drops:true,captureAll:false,pointMode:'cell',banSennichite:false,sennichiteMode:'none'},
      board:bd,pts:Array.from({length:10},()=>Array(10).fill(null)),
      diag:Array.from({length:9},()=>Array(9).fill(null)),capYou:[],capEnemy:[]}));
    SFX.on=true; gameOver=false; turn=1;
    applyMoveSilent(1,{fr:4,fc:3,tr:4,tc:4});
  });
  await p.waitForTimeout(160);
  R['演出の最中']=await snap();
  await p.waitForTimeout(900);
  R['演出の後']=await snap();
  R['横にはみ出したか']=['演出の前','演出の最中','演出の後']
    .filter(k=>R[k].文書の横幅>R[k].画面幅+1).join('・')||'なし';
  // 図鑑ボタンが盤の駒と重ならず、モーダルより手前にも出ないこと
  R['図鑑ボタン']=await p.evaluate(()=>{
    const z=document.getElementById('zukanBtn');
    const zr=z.getBoundingClientRect();
    let hit=[];
    document.querySelectorAll('#board .koma').forEach(k=>{
      const r=k.getBoundingClientRect();
      if(zr.left<r.right&&zr.right>r.left&&zr.top<r.bottom&&zr.bottom>r.top) hit.push(k.textContent.replace(/\s/g,''));
    });
    document.getElementById('ruleModal').classList.add('show');
    const cx=Math.round((zr.left+zr.right)/2), cy=Math.round((zr.top+zr.bottom)/2);
    const top=document.elementFromPoint(cx,cy);
    const overModal = !!(top && (top===z || z.contains(top)));
    document.getElementById('ruleModal').classList.remove('show');
    return {盤の駒と重なる:hit, ルール設定より手前に出るか:overModal?'★出る':'出ない',
            位置:{右:Math.round(zr.right), 画面幅:innerWidth}};
  });
  R['pageerror']=errs;
  out[W+'px']=R;
  await p.close();
}
console.log(JSON.stringify(out,null,1));
await b.close();
