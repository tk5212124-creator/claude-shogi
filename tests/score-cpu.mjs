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
  // ④ 王が2枚あるとき、1枚取っただけでは終わらない（前は「王を取った＝勝ち」と読んでいた）
  { const bd=B(); bd[0][4]={t:'hK',p:-1}; bd[8][0]={t:'hK',p:1}; bd[8][8]={t:'hKw',p:1}; bd[0][0]={t:'hR',p:-1};
    loadState(mk(bd,{})); SFX.on=false;
    const sim=simulate(board,{fr:0,fc:0,tr:8,tc:0},-1,capYou,capEnemy);
    R['④2枚のうち1枚を取る']= terminalAfter(sim,-1)===null ? '続く（読みでも勝ちにしない）' : '★勝ち扱い';
    bd[8][8]=null; loadState(mk(bd,{})); SFX.on=false;
    const sim2=simulate(board,{fr:0,fc:0,tr:8,tc:0},-1,capYou,capEnemy);
    R['④最後の1枚を取る']= terminalAfter(sim2,-1)>=1e7 ? '勝ち' : '★'+terminalAfter(sim2,-1);
    bd[8][8]={t:'hKw',p:1}; loadState(mk(bd,{endOnRoyalCapture:true})); SFX.on=false;
    const sim3=simulate(board,{fr:0,fc:0,tr:8,tc:0},-1,capYou,capEnemy);
    R['④「王を1枚でも取ったら終わり」なら']= terminalAfter(sim3,-1)>=1e7 ? '1枚目で勝ち' : '★'+terminalAfter(sim3,-1);
  }
  // ⑤ 取り切るまで戦う：王を取っても終わらない。最後の1枚を取ったら勝ち
  { const bd=B(); bd[0][4]={t:'hK',p:-1}; bd[8][0]={t:'hK',p:1}; bd[8][8]={t:'hP',p:1}; bd[0][0]={t:'hR',p:-1};
    loadState(mk(bd,{captureAll:true})); SFX.on=false;
    const sim=simulate(board,{fr:0,fc:0,tr:8,tc:0},-1,capYou,capEnemy);
    R['⑤取り切り：王を取る']= terminalAfter(sim,-1)===null ? '続く（歩が残っている）' : '★勝ち扱い';
  }
  // ⑥ royal は持ち駒にあっても、盤上から無くなれば負け
  { const bd=B(); bd[0][4]={t:'hK',p:-1}; bd[1][4]={t:'hG',p:1}; bd[8][4]={t:'hK',p:1};
    const st=JSON.parse(mk(bd,{},[],['hKw'])); st.turn=1;
    loadState(JSON.stringify(st)); SFX.on=false; autoYou=false; autoEnemy=false;
    onCell(1,4,false); onCell(0,4,false);   // あなたの金が相手の玉を取る（相手の持ち駒には王将がある）
    R['⑥持ち駒に王があっても']= gameOver ? '盤上の王が無くなって負け（'+document.getElementById('status').textContent.slice(0,16)+'）' : '★続いている';
  }
  // ⑦ CPUは持ち駒の royal を持ち続けない（打って盤上の royal を増やす）
  { const bd=B(); bd[0][4]={t:'hK',p:-1}; bd[8][4]={t:'hK',p:1}; bd[6][0]={t:'hP',p:1}; bd[2][8]={t:'hP',p:-1};
    loadState(mk(bd,{},[],['hKw'])); SFX.on=false; autoYou=false; autoEnemy=false;
    const m=cpuPickMove(-1,2);
    R['⑦持ち駒の王']= m&&m.drop==='hKw' ? '打つ（'+(m.tr+1)+','+(m.tc+1)+'）' : '★打たない：'+JSON.stringify(m);
    R['⑦持ち駒の王の価値']= handValue('hKw')<VALUE['hKw'] ? '盤上よりずっと低い（'+handValue('hKw')+'）' : '★高い';
  }
  // ⑧ ランダムに成る駒は、読みの中で「平均の強さ」に成ったとみなす（前は成らないまま）
  { const bd=B(); bd[0][4]={t:'hK',p:-1}; bd[8][4]={t:'hK',p:1}; bd[3][0]={t:'hG',p:1};
    loadState(mk(bd,{randomPromote:true,promoOnZone:true})); SFX.on=false;
    const sim=simulate(board,{fr:3,fc:0,tr:2,tc:0,promo:true},1,capYou,capEnemy);
    const q=sim.nb[2][0], a=randomPromoAverage();
    R['⑧ランダム成りの見込み']= q && q.rp!==undefined && Math.abs(q.rp-(a.V-VALUE.hG))<1e-6
      ? '平均との差を持つ（駒の価値 '+Math.round(q.rp)+'・点数 '+Math.round(q.rs*10)/10+'）' : '★'+JSON.stringify(q);
    const e1=classicEvaluate(sim.nb,[],[]), sim0=simulate(board,{fr:3,fc:0,tr:2,tc:0,promo:false},1,capYou,capEnemy);
    R['⑧評価に入る']= Math.abs((classicEvaluate(sim0.nb,[],[])-e1)-q.rp)<1e-6 ? '成った分だけ評価が変わる' : '★変わらない';
    const sim2=simulate(sim.nb,{fr:2,fc:0,tr:1,tc:0,promo:false},1,[],[]);
    R['⑧動いても見込みが残る']= sim2.nb[1][0] && sim2.nb[1][0].rp===q.rp ? '残る' : '★消える';
  }
  return R;
});
console.log(JSON.stringify(out,null,1));
console.log('pageerror',errs);
await b.close();
