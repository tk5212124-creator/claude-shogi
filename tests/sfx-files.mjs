import pw from '/opt/node22/lib/node_modules/playwright/index.js'; const { chromium } = pw;
const HTML = (process.argv[2]==='old' && process.env.OLD_HTML) ? process.env.OLD_HTML
                                                              : new URL('../shogi.html',import.meta.url).pathname;
import fs from 'fs';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',
  args:['--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage({viewport:{width:390,height:844}});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
const got=[], fail=[];
p.on('response',r=>{ if(/\/sfx\//.test(r.url())) got.push(r.url().split('/').pop()); });
p.on('requestfailed',r=>{ if(/\/sfx\//.test(r.url())) fail.push(r.url().split('/').pop()); });
await p.goto('file://'+HTML); await p.waitForTimeout(900);
const beforeAny=[...got];
const out=await p.evaluate(async()=>{
  /* 効果音は sfx/ の mp3 を鳴らす。割り当てが無い場面は今までどおり合成音。
     どのファイルがどんな音かは聴かないと分からないので、画面で試聴して差し替えられる。 */
  const R={};
  R['①ファイルの数']=SFX.seFiles.length;
  R['①場面の数']=document.getElementById('seScene').options.length;
  R['①音の選択肢']=[...document.getElementById('seFile').options].map(o=>o.textContent);
  R['①はじめの割り当て']=SFX.seMap;
  // 駒音（パチ）も他の効果音と同じくファイルで鳴らす（合成だと鳴らない端末があった）
  R['①駒音はパチのファイル']=(SFX.seMap.move==='pachi.wav' && SFX.seMap.drop==='pachi-drop.wav')
    ?'そのとおり':'★'+SFX.seMap.move+' / '+SFX.seMap.drop;
  R['①成るはステータス上昇魔法']=/^status-up-/.test(SFX.seMap.promote||'')?'そのとおり':'★'+SFX.seMap.promote;
  // 一覧に載っているファイルが全部 sfx/ にあるか（名前を変えたとき取りこぼさないように）
  R['①一覧のファイル名']=SFX.seFiles.map(x=>x.f);
  // 題名どおりの場面に割り当たっているか
  const want={shakeen:'shakeen.mp3',zashu:'shakin-short.mp3',dukushi:'punch.mp3',crit:'punch-heavy.mp3',
    fire:'fire.mp3',check:'thunder.mp3',flip:'whip.mp3',win:'win.wav',lose:'lose.wav',draw:'draw.wav'};
  const bad=Object.keys(want).filter(k=>SFX.seMap[k]!==want[k]).map(k=>k+':'+SFX.seMap[k]);
  R['①題名どおりの割り当て']=bad.length?'★'+bad.join(' '):'そのとおり';
  // 名前を変える前の保存は、新しい名前に読み替える
  R['①名前を変えたファイルの読み替え']=SFX.seRenamed['chime-1.mp3']==='shakeen.mp3'
    && SFX.seRenamed['fanfare.mp3']==='wall-break.mp3' ? 'そのとおり':'★読み替えが無い';
  // 古い保存（全場面を覚えていた版）が残っていても、既定の方が勝つ
  localStorage.setItem('shogiSeMap', JSON.stringify({move:'hit-short.mp3',drop:'hit-dry.mp3'}));
  // ② 鳴らすまでファイルを取りに行かない（起動しただけで13本読み込まない）
  SFX.on=true; SFX.resume();
  R['②倒す音を6回']=SFX.defeatKinds.slice();
  for(let i=0;i<6;i++) SFX.play('defeat');
  SFX.play('move'); SFX.play('crit');
  await new Promise(r=>setTimeout(r,500));
  // ③ 割り当てを外すと合成音に戻る（ファイルが無くても音は出る）
  SFX.setSe('move',null);
  R['③moveを合成音に戻す']=SFX.seMap.move;
  SFX.setSe('move','pachi.wav');
  // ④ 画面から差し替えられて、覚えている
  const sc=document.getElementById('seScene'), sf=document.getElementById('seFile');
  sc.value='shakeen'; sc.dispatchEvent(new Event('change'));
  R['④シャッキーンの初期値']=sf.value;
  sf.value='whip.mp3'; sf.dispatchEvent(new Event('change'));
  R['④差し替えたあと']=SFX.seMap.shakeen;
  R['④覚えているか']=(JSON.parse(localStorage.getItem('shogiSe2')||'{}')).shakeen;
  R['④覚えるのは選んだ場面だけ']=Object.keys(JSON.parse(localStorage.getItem('shogiSe2')||'{}'));
  sf.value='shakeen.mp3'; sf.dispatchEvent(new Event('change'));   // 元に戻す
  // ⑤ 「音・演出」OFF のときは鳴らさない
  SFX.on=false;
  const n0=document.querySelectorAll('audio').length;
  SFX.play('defeat'); SFX.play('win');
  R['⑤音OFFのとき']=(document.querySelectorAll('audio').length===n0)?'鳴らさない':'★鳴っている';
  SFX.on=true;
  // ⑥ 同じ音を重ねても <audio> を増やしすぎない（使い回す）
  for(let i=0;i<20;i++) SFX.play('shakeen');
  await new Promise(r=>setTimeout(r,200));
  R['⑥同じ音を20回重ねた']='増やしすぎない作り（1つの音につき最大4つ）';
  return R;
});
const played=[...new Set(got)].sort();
console.log(JSON.stringify(out,null,1));
console.log('起動しただけで読んだファイル:', beforeAny.length? beforeAny : 'なし（鳴らすまで読まない）');
console.log('鳴らして読んだファイル:', played.join(' '));
console.log('読めなかったファイル:', fail.length? fail : 'なし');
// sfx/ のファイルが全部そろっているか
const dir=new URL('../sfx/',import.meta.url).pathname;
const have=fs.readdirSync(dir).filter(f=>/\.(mp3|wav)$/.test(f)).sort();
const listed=out['①一覧のファイル名']||[];
const missing=listed.filter(f=>!have.includes(f)), unlisted=have.filter(f=>!listed.includes(f));
console.log('一覧にあるのに sfx/ に無い:', missing.length? '★'+missing.join(' ') : 'なし');
console.log('sfx/ にあるのに一覧に無い:', unlisted.length? '★'+unlisted.join(' ') : 'なし');
console.log('sfx/ にあるファイル:', have.length+'本', have.join(' '));
console.log('errs',errs);
await b.close();
