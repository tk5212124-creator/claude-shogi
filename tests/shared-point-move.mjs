import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const HTML = (process.argv[2]==='old' && process.env.OLD_HTML) ? process.env.OLD_HTML
                                                              : new URL('../shogi.html',import.meta.url).pathname;
import fs from 'fs';
const C50=JSON.parse(fs.readFileSync(new URL('./case50-shared-point.json',import.meta.url).pathname,'utf8'));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file://'+HTML); await p.waitForTimeout(900);
const out=await p.evaluate((C50)=>{
  // 交点の駒は交点だけ・マスの駒はマスだけ、というルールでも
  // 九宮の交差マス（×）は「マスであり交点でもある共有点」なので、そこへだけは入れる。
  const R={};
  const B=()=>Array.from({length:9},()=>Array(9).fill(null));
  const P=()=>Array.from({length:10},()=>Array(10).fill(null));
  const D=()=>Array.from({length:9},()=>Array(9).fill(null));
  const mk=(bd,pts,dg,pm)=>JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
    RULES:{drops:true,captureAll:false,pointMode:pm||'auto',allowPass:false,banSennichite:false,
      sennichiteMode:'none',nifu:false,palaceEscape:false},
    board:bd,pts:pts,diag:dg,capYou:[],capEnemy:[]});
  // 交点(4,4)の角行から、その斜め半歩の4マス (3,3)(3,4)(4,3)(4,4) のどれに入れるか
  const canReach=(dg,pm)=>{
    const pts=P(); pts[4][4]={t:'hB',p:1};
    loadState(mk(B(),pts,dg,pm)); SFX.on=false;
    return moves(ptsBoard,4,4).filter(m=>m[2]).map(m=>'マス('+(m[0]+1)+'行'+(m[1]+1)+'列)').sort();
  };
  // ① 宮マスが無いとき（auto）＝どのマスにも入れない
  R['①宮マス無し・auto']=canReach(D(),'auto');
  // ② マス(4,4)を × にすると、そこだけ入れる
  {
    const dg=D(); dg[4][4]='x';
    R['②マス(5行5列)が×・auto']=canReach(dg,'auto');
  }
  // ③ 半歩ななめの隣より遠い × には、走る駒でも行けない
  {
    const dg=D(); dg[6][6]='x';
    R['③2つ先が×・auto']=canReach(dg,'auto');
  }
  // ④ ／や＼の宮マス（×でない）は共有点ではないので入れない
  {
    const dg=D(); dg[4][4]='l';
    R['④マス(5行5列)が＼・auto']=canReach(dg,'auto');
    const dg2=D(); dg2[4][4]='r';
    R['④マス(5行5列)が／・auto']=canReach(dg2,'auto');
  }
  // ⑤ 「すべての駒がマスにも交点にも常時進める」なら今までどおり4マスとも入れる
  {
    const dg=D(); dg[4][4]='x';
    R['⑤freeMove']=canReach(dg,'freeMove');
  }
  // ⑥ 逆向き：マスの駒も × の交点へ入れる
  {
    const dg=D(); dg[4][4]='x';
    const bd=B(); bd[4][4]={t:'hB',p:1};
    loadState(mk(bd,P(),dg,'auto')); SFX.on=false;
    R['⑥マスの角行が入れる交点']=moves(board,4,4).filter(m=>m[2]).map(m=>'交点('+(m[0]+1)+'行'+(m[1]+1)+'列)').sort();
  }
  // ⑦ 実際に指せて、共有点の敵も取れる
  {
    const dg=D(); dg[4][4]='x';
    const pts=P(); pts[4][4]={t:'hB',p:1}; pts[8][4]={t:'hK',p:1};
    const bd=B(); bd[4][4]={t:'hP',p:-1}; bd[0][4]={t:'hK',p:-1};
    loadState(mk(bd,pts,dg,'auto')); SFX.on=false; gameOver=false;
    const m={fr:4,fc:4,tr:4,tc:4,pt:true,toPt:false};
    R['⑦合法か']=isLegalMove(m,1);
    R['⑦CPUも同じ手を生成するか']=genMoves(board,1,capYou,capEnemy)
      .some(g=>!g.drop&&g.fr===4&&g.fc===4&&g.tr===4&&g.tc===4&&g.pt&&g.toPt===false);
    turn=1; applyMoveSilent(1,m);
    R['⑦指したあと']={交点:ptsBoard[4][4]?ptsBoard[4][4].t:'空',
      マス:board[4][4]?board[4][4].t+':'+board[4][4].p:'空',
      持ち駒:capYou.slice(), 棋譜:kifuToText().split('\n').pop()};
  }
  // ⑦' 宮の駒（漢・仕）も × のマスへ入れる。報告のあった9×9＋チャンギ駒の盤で確かめる
  {
    loadState(JSON.stringify({v:2,NR:C50.NR,NC:C50.NC,PZ:C50.PZ,turn:1,youAreSente:true,gameOver:false,
      RULES:C50.RULES, board:C50.start.board, pts:C50.start.pts, diag:C50.start.diag,
      capYou:[], capEnemy:[]}));
    SFX.on=false; gameOver=false;
    const xs=[];
    for(let r=0;r<NR;r++)for(let c=0;c<NC;c++) if(getDiag(r,c)==='x') xs.push((r+1)+'行'+(c+1)+'列');
    R["⑦'この盤の×マス"]=xs;
    const into=[];
    for(let r=0;r<=NR;r++)for(let c=0;c<=NC;c++){
      const q=ptsBoard[r]&&ptsBoard[r][c]; if(!q) continue;
      for(const m of moves(ptsBoard,r,c)) if(m[2]&&getDiag(m[0],m[1])==='x')
        into.push(KANJI[q.t]+' ◇('+(r+1)+'行'+(c+1)+'列)→('+(m[0]+1)+'行'+(m[1]+1)+'列)');
    }
    R["⑦'×のマスへ入れる交点駒"]=into;
    const mine=[];
    for(let r=0;r<=NR;r++)for(let c=0;c<=NC;c++){
      const q=ptsBoard[r]&&ptsBoard[r][c]; if(!q||q.p!==1) continue;
      for(const m of moves(ptsBoard,r,c)) if(m[2]&&getDiag(m[0],m[1])==='x')
        mine.push({fr:r,fc:c,tr:m[0],tc:m[1],name:KANJI[q.t]});
    }
    if(mine.length){
      const mv=mine[0];
      const m={fr:mv.fr,fc:mv.fc,tr:mv.tr,tc:mv.tc,pt:true,toPt:false};
      R["⑦'合法か"]={駒:mv.name, 合法:isLegalMove(m,1),
        CPUも生成:genMoves(board,1,capYou,capEnemy).some(g=>!g.drop&&g.fr===m.fr&&g.fc===m.fc&&g.tr===m.tr&&g.tc===m.tc&&g.toPt===false)};
      turn=1; applyMoveSilent(1,m);
      R["⑦'指したあと"]={元の交点:ptsBoard[m.fr][m.fc]?'★残る':'空',
        マス:board[m.tr][m.tc]?KANJI[board[m.tr][m.tc].t]:'★空',
        棋譜:kifuToText().split('\n').pop()};
    } else R["⑦'合法か"]='★入れる駒が無い';
    // 士（チャンギ・斜めベクトルなし）とシャンチーの仕（斜めベクトルあり）も入れるか
    const put=(t)=>{
      loadState(JSON.stringify({v:2,NR:C50.NR,NC:C50.NC,PZ:C50.PZ,turn:1,youAreSente:true,gameOver:false,
        RULES:C50.RULES, board:Array.from({length:C50.NR},()=>Array(C50.NC).fill(null)),
        pts:Array.from({length:C50.NR+1},()=>Array(C50.NC+1).fill(null)),
        diag:C50.start.diag, capYou:[], capEnemy:[]}));
      SFX.on=false;
      ptsBoard[8][4]={t,p:1};
      return moves(ptsBoard,8,4).filter(m=>m[2]).map(m=>'マス('+(m[0]+1)+'行'+(m[1]+1)+'列)');
    };
    R["⑦'士(チャンギ)"]=put('JA');
    R["⑦'仕(シャンチー)"]=put('XA');
    R["⑦'帥(シャンチー・斜めに動けない)"]=put('XK');
  }
  // ⑦'' 報告の50手をそのまま再生して、盤・交点・持ち駒・棋譜が一致するか
  {
    loadState(JSON.stringify({v:2,NR:C50.NR,NC:C50.NC,PZ:C50.PZ,turn:C50.start.turn,
      youAreSente:C50.youAreSente,gameOver:false,RULES:C50.RULES,
      board:C50.start.board,pts:C50.start.pts,diag:C50.start.diag,
      capYou:C50.start.capYou,capEnemy:C50.start.capEnemy}));
    SFX.on=false; kifu.length=0; gameOver=false;
    const bad=[];
    for(let i=0;i<C50.kifu.length;i++){
      const k=C50.kifu[i];
      const m = k.drop ? {drop:k.drop,tr:k.to[0],tc:k.to[1],pt:k.pt||undefined}
                       : {fr:k.from[0],fc:k.from[1],tr:k.to[0],tc:k.to[1],pt:k.pt||undefined,
                          promo:!!k.promo,promoTo:k.promoTo};
      turn=k.side;
      if(!isLegalMove(m,k.side)) bad.push(i+1);
      applyMoveSilent(k.side,m); turn=-k.side;
    }
    const cs=x=>x?x.t+':'+x.p:null, eq=(a,b)=>JSON.stringify(a.map(r=>r.map(cs)))===JSON.stringify(b.map(r=>r.map(cs)));
    const srt=a=>a.slice().sort().join(',');
    R["⑦''50手の再生"]={手数:kifu.length, マスの盤:eq(board,C50.board)?'一致':'★食い違い',
      交点の盤:eq(ptsBoard,C50.pts)?'一致':'★食い違い',
      持ち駒:(srt(capYou)===srt(C50.capYou)&&srt(capEnemy)===srt(C50.capEnemy))?'一致':'★食い違い',
      合法でない手:bad.length?bad:'なし', 対局終了:gameOver,
      状態:document.getElementById('status').textContent};
  }
  // ⑨ 持ち駒からも × のマスへ打てる
  {
    const dg=D(); dg[4][4]='x';
    const bd=B(); bd[8][8]={t:'hK',p:1}; bd[0][0]={t:'hK',p:-1};
    loadState(JSON.stringify({v:2,NR:9,NC:9,PZ:3,turn:1,youAreSente:true,gameOver:false,
      RULES:{drops:true,captureAll:false,pointMode:'auto',allowPass:false,banSennichite:false,
        sennichiteMode:'none',nifu:false,palaceEscape:false},
      board:bd,pts:P(),diag:dg,capYou:['JC','hP'],capEnemy:[]}));
    SFX.on=false; gameOver=false;
    // 交点に置かれる駒（包）の打ち先に、× のマスが層をまたいで入るか
    const tg=dropTargets(ptsBoard,'JC',1);
    R['⑨包の打ち先に×のマスが入るか']=tg.filter(x=>x[2]).map(x=>'マス('+(x[0]+1)+'行'+(x[1]+1)+'列)');
    R['⑨マスに置かれる駒（歩）が交点に打てるか']=dropTargets(board,'hP',1).filter(x=>x[2])
      .map(x=>'交点('+(x[0]+1)+'行'+(x[1]+1)+'列)');
    // 実際に打てるか
    const dm={drop:'JC',tr:4,tc:4};      // pt を付けない＝マスの層へ打つ
    R['⑨合法か']=isLegalMove(dm,1);
    R['⑨CPUも生成するか']=genMoves(board,1,capYou,capEnemy)
      .some(g=>g.drop==='JC'&&g.tr===4&&g.tc===4&&!g.pt);
    turn=1; applyMoveSilent(1,dm);
    R['⑨打ったあと']={マス:board[4][4]?board[4][4].t:'★空', 交点:ptsBoard[4][4]?'★ある':'空',
      持ち駒:capYou.slice(), 棋譜:kifuToText().split('\n').pop()};
  }
  // ⑧ 通常の対局に影響しないこと（宮マスの無い盤では層をまたぐ手が出ない）
  {
    let cross=0;
    for(const k of ['hon','chess','chu','xiangqi','janggi']){
      document.getElementById('presetSel').value=k;
      document.getElementById('presetSel').dispatchEvent(new Event('change'));
      document.getElementById('applyPresetBtn').click(); SFX.on=false;
      for(const side of [1,-1])
        cross += genMoves(board,side,capYou,capEnemy).filter(m=>m.toPt!==undefined).length;
      R['⑧'+k]=cross;
    }
  }
  return R;
},C50);
console.log(JSON.stringify(out,null,1)); console.log('errs',errs);
await b.close();
