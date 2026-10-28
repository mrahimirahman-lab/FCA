import { test } from 'node:test';
import assert from 'node:assert/strict';
import './score.js';
const S=globalThis.CubiScore,room=(label,bbox_2d)=>({label,bbox_2d});
test('parser accepts fences/single object/empty list; rejects fabricated coordinate contracts',()=>{
 assert.deepEqual(S.parse('```json\n[]\n```'),[]);
 assert.equal(S.parse('{"label":"A","bbox_2d":[0,0,10,10]}').length,1);
 for(const text of ['null','[{"label":"","bbox_2d":[0,0,10,10]}]','[{"label":"A","bbox_2d":[0,0,1001,10]}]','[{"label":"A","bbox_2d":[10,0,0,10]}]','[{"label":"A","bbox_2d":["0",0,10,10]}]'])assert.throws(()=>S.parse(text));
});
test('one prediction cannot score both bedrooms; unmatched reference=0 and extras reduce precision',()=>{
 const gt=[room('Bedroom',[0,0,100,100]),room('Bedroom',[200,0,300,100])];
 const r=S.score([room(' bedroom ',[0,0,100,100]),room('Store',[0,0,100,100])],gt);
 assert.equal(r.mean_iou,.5);assert.equal(r.matches_at_iou_05,1);assert.equal(r.precision_at_05,.5);assert.equal(r.recall_at_05,.5);
 assert.equal(S.score([],gt).mean_iou,0);
});
test('optimal assignment differs from greedy and detection maximizes threshold cardinality',()=>{
 assert.deepEqual(S.assign([[.9,.8],[.85,0]]),[1,0]);
 assert.deepEqual(S.assign([[1,1],[1,0]]),[1,0]);
 assert.deepEqual(S.assign([[],[]]),[-1,-1]);
});
test('Hungarian sum matches brute-force for small deterministic random rectangular inputs',()=>{
 let seed=173;const random=()=>{seed=(seed*48271)%2147483647;return seed/2147483647};
 function brute(w,i=0,used=new Set()){if(i===w.length)return 0;let best=brute(w,i+1,used);for(let j=0;j<w[i].length;j++)if(!used.has(j)){used.add(j);best=Math.max(best,w[i][j]+brute(w,i+1,used));used.delete(j)}return best}
 for(let n=1;n<=5;n++)for(let m=0;m<=5;m++){const w=Array.from({length:n},()=>Array.from({length:m},()=>Math.floor(random()*10)/10));const result=S.assign(w).reduce((s,j,i)=>s+(j<0?0:w[i][j]),0);assert.ok(Math.abs(result-brute(w))<1e-9)}
});
test('large duplicate-label inputs stay tractable',()=>{
 const gt=Array.from({length:24},(_,i)=>room('A',[i*30,0,i*30+20,20]));
 const pred=Array.from({length:100},(_,i)=>room('A',[i%24*30,0,i%24*30+20,20]));
 const r=S.score(pred,gt);assert.equal(r.mean_iou,1);assert.equal(r.matches_at_iou_05,24);assert.equal(r.precision_at_05,.24);
});
test('aggregate distinguishes mean per image from pooled per reference',()=>{
 const one=S.score([], [room('A',[0,0,10,10])]);
 const three=Array.from({length:3},()=>room('A',[0,0,10,10]));const perfect=S.score(three,three);
 const r=S.aggregate([{models:{base:one}},{models:{base:perfect}}],'base');
 assert.equal(r.mean_iou_per_image,.5);assert.equal(r.mean_iou_per_reference,.75);assert.equal(S.aggregate([],'base'),null);
});
test('invalid geometry is preserved as output failure, never silently repaired or scored as empty',()=>{
 const gt=[room('A',[0,0,100,100])];
 const raw=JSON.stringify([room('A',[10,900,300,900])]);
 const r=S.inspect(raw,gt);
 assert.equal(r.status,'invalid_output');assert.equal(r.raw_response,raw);
 assert.equal(r.metrics,null);assert.equal(r.predictions,null);assert.match(r.error,/Objek 1/);
 const empty=S.inspect('[]',gt);assert.equal(empty.status,'valid');assert.equal(empty.metrics.mean_iou,0);
 assert.throws(()=>S.inspect('',gt));
});
