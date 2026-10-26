import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subRoomSuffix} from '../server/room-codes.js';
import {suggestionParents,normalizeSuggestionOrder,startSuggestionOrder,moveSuggestion,suggestionTags,makeSuggestionImport} from '../src/suggestion-order.js';
import {rotatePlanPoint} from '../server/plan.js';
import {analysisPrompt,roomOutput} from '../server/ai-contract.js';

test('entrance order keeps child groups intact and only selected main rooms consume numeric codes',()=>{
  const bounds={x:10,y:10,width:20,height:20};
  const rooms=[{name:'Lobi'},{name:'Kerja'},{name:'Zon A',parentIndex:1},{name:'Zon B',parentIndex:1},{name:'Dapur'}].map(room=>({...room,bounds}));
  const parents=suggestionParents(rooms),order=normalizeSuggestionOrder([0,2,1,4,3],parents);
  assert.deepEqual(order,[0,1,2,3,4]);
  const entrance=startSuggestionOrder(order,4,parents);assert.deepEqual(entrance,[4,0,1,2,3]);
  const adjusted=moveSuggestion(entrance,3,-1,parents);assert.deepEqual(adjusted,[4,0,1,3,2]);
  assert.deepEqual([...suggestionTags(adjusted,parents,[0],12)],[ [4,'0012'],[1,'0013'],[3,'0013a'],[2,'0013b'] ]);
  const payload=makeSuggestionImport(rooms,adjusted,parents,[0]);assert.deepEqual(payload.map(room=>[room.name,room.parentIndex??null]),[['Dapur',null],['Kerja',null],['Zon B',1],['Zon A',1]]);
  assert.throws(()=>makeSuggestionImport(rooms,order,parents,[1]),/Pilih ruang induk/);
  assert.deepEqual(startSuggestionOrder(order,2,parents),order);
  for(const invalid of [[{name:'Self',parentIndex:0}],[{name:'Missing',parentIndex:3}],[{name:'Root'},{name:'Child',parentIndex:0},{name:'Nested',parentIndex:1}]])assert.throws(()=>suggestionParents(invalid),/tidak sah/);
});

test('subspace suffixes and entrance quarter turns preserve the reference convention',()=>{
  assert.deepEqual([1,5,26,27,52,53].map(subRoomSuffix),['a','e','z','aa','az','ba']);
  for(const value of [0,-1,1.5,18279])assert.throws(()=>subRoomSuffix(value));
  let point={x:20,y:80};for(let i=0;i<4;i++)point=rotatePlanPoint(point,90);assert.deepEqual(point,{x:20,y:80});
  assert.deepEqual(rotatePlanPoint({x:20,y:80},-90),{x:80,y:80});
});

test('cloud prompt uses percentage entrance hints and requests clockwise functional subspaces',()=>{
  const prompt=analysisPrompt('plan','',null,{x:25,y:90});
  assert.match(prompt,/\{"x":25,"y":90\} dalam peratus/);assert.match(prompt,/ARAH JAM/);assert.match(prompt,/parentIndex/);assert.match(prompt,/selepas ruang dalaman/);
  assert.ok(roomOutput.properties.rooms.items.required.includes('parentIndex'));
  assert.doesNotMatch(analysisPrompt('plan','',{name:'Lobi',bounds:{x:10,y:10,width:20,height:20}},{x:25,y:90}),/Pintu masuk utama ditandakan/);
});
