/* 点数のルールのとき、CPUも点数（盤上の駒価＋囲碁の領域点）で考えるか。
   実行: node tests/score-cpu.mjs */
import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+new URL('../shogi.html',import.meta.url).pathname); await p.waitForTimeout(900);
const out=await p.evaluate(()=>{
  const R={};
  const B=()=>Array.from({length:9},()=>Array(9).fill(null));
  const mk=(bd,ru,cy,ce)=>JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:-1,youAreSente:true,gameOver:false,
    RULES:Object.assign({drops:true,captureAll:false,endByScore:false,scoreOnly:false,endOnRoyalCapture:false,
      pointMode:'cell',allowPass:false,banSennichite:false,sennichiteMode:'none',jishogiMode:'points',
      checkPoints:false,drawNoMove:true,drawBothEnter:false,nifu:false},ru||{}),
    board:bd, pts:Array.from({length:10},()=>Array(10).fill(null)),
    diag:Array.from({length:9},()=>Array(9).fill(null)),capYou:cy||[],capEnemy:ce||[]});
  const pick=(json,d)=>{ loadState(json); SFX.on=false; autoYou=false; autoEnemy=false;
    const m=cpuPickMove(-1,d); return m? (m.fr+','+m.fc+'→'+m.tr+','+m.tc) : null; };
  // ① 相手(CPU)は、あなたの王を取れる。ほかに、あなたの飛車（5点）も取れる。
  //    「点数だけで勝負する」では王を取ると点数 0対5 で負けるので、先に飛車を取る（5対0で勝ち筋）
  { const bd=B(); bd[0][4]={t:'hK',p:-1}; bd[1][4]={t:'hK',p:1};
    bd[8][0]={t:'hR',p:1}; bd[8][8]={t:'hR',p:-1};
    const kingCap='0,4→1,4', rookCap='8,8→8,0';
    const a=pick(mk(bd,{scoreOnly:true}),2);
    R['①点数だけで勝負する']= a===rookCap ? '飛車を取る（王を取ると点数で負ける）' : '★'+a;
    const c=pick(mk(bd,{}),2);
    R['①ふつうのルール']= c===kingCap ? '王を取る（それで勝ち）' : '★'+c;
  }
  // ② 「相手の点数がなくなるまで戦う」：王を取っても終わらない。最後の歩（1点）を取れば勝ち
  { const bd=B(); bd[0][4]={t:'hK',p:-1}; bd[1][4]={t:'hK',p:1};
    bd[8][8]={t:'hP',p:1}; bd[8][0]={t:'hR',p:-1};
    const a=pick(mk(bd,{endByScore:true}),2);
    R['②点数がなくなるまで']= a==='8,0→8,8' ? '最後の歩を取る（点数0で勝ち）' : '★'+a;
  }
  // ③ 読みの点数は画面の点数と同じ数え方（持ち駒は数えない）
  { const bd=B(); bd[0][4]={t:'hK',p:-1}; bd[8][4]={t:'hK',p:1}; bd[7][1]={t:'hR',p:1};
    loadState(mk(bd,{scoreOnly:true},['hB'],[])); SFX.on=false;
    R['③読みの点数']= boardScoreOn(board,ptsBoard,1)===currentScore(1) ? '画面と同じ（'+currentScore(1)+'点）' : '★'+boardScoreOn(board,ptsBoard,1)+' と '+currentScore(1);
  }
  return R;
});
console.log(JSON.stringify(out,null,1));
console.log('pageerror',errs);
await b.close();
