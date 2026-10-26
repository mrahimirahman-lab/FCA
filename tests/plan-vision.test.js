import {test} from 'node:test';
import assert from 'node:assert/strict';
import {warnOverlappingRooms,reviewPlanRooms,isPlanSymbolLabel} from '../server/plan-vision.js';

test('symbol filtering removes whole door/window labels and preserves real rooms including repeated names',()=>{
  for(const name of ['T1','T2','P1','P2','P3',' t-01 ','(P 2)','T1 / T2','Tingkap T1','Pintu P3','Window W01','Door type D2','Tingkap','Pintu'])assert.equal(isPlanSymbolLabel(name),true,name);
  for(const name of ['BILIK 1','Bilik T1','Stor pintu','Ruang tingkap','Pejabat','P101A','PT1','Taman','Bilik P1','DAPUR'])assert.equal(isPlanSymbolLabel(name),false,name);
  const names=['BILIK 1','BILIK 2','RUANG TAMU','DAPUR','TANDAS','DAPUR','T1','T2','P1','P2','P3'];
  const source={rooms:names.map((name,i)=>({name,bounds:{x:i*8,y:5,width:5,height:10},confidence:.7})),notes:'Semak dinding.'},copy=structuredClone(source);
  const reviewed=reviewPlanRooms(source);
  assert.deepEqual(reviewed.rooms,copy.rooms.slice(0,6));assert.match(reviewed.notes,/5 cadangan simbol pintu\/tingkap disisihkan: T1, T2, P1, P2, P3/);assert.deepEqual(source,copy);
  const empty=reviewPlanRooms({rooms:source.rooms.slice(6),notes:''});assert.equal(empty.rooms.length,0);assert.match(empty.notes,/disisihkan/);
  const focused={rooms:[source.rooms[6]],notes:'Semakan ruang manual.'};assert.deepEqual(reviewPlanRooms(focused,{targetRoom:{name:'T1'}}),focused);
});

test('filter and overlap notes stay within the response contract with long provider notes',()=>{
  const source={rooms:['T1','Bilik 1','Bilik 2'].map(name=>({name,bounds:{x:10,y:10,width:20,height:20},confidence:.7})),notes:'x'.repeat(4000)};
  const result=reviewPlanRooms(source);assert.equal(result.rooms.length,2);assert.ok(result.notes.length<=4000);assert.match(result.notes,/simbol pintu\/tingkap/);assert.match(result.notes,/bertindih/);
});

test('significant overlapping proposals are flagged without shrinking, deleting or moving room boxes',()=>{
  const a={name:'Bilik',confidence:.7,bounds:{x:10,y:10,width:30,height:40}};
  const b={name:'Dapur',confidence:.6,bounds:{x:20,y:20,width:40,height:30}};
  const source={rooms:[a,b],notes:'Semak.'},copy=structuredClone(source);
  const result=warnOverlappingRooms(source);assert.match(result.notes,/bertindih/);assert.deepEqual(result.rooms,copy.rooms);assert.deepEqual(source,copy);
  const adjacent={rooms:[a,{...b,bounds:{x:40,y:10,width:20,height:40}}],notes:'Semak.'};assert.deepEqual(warnOverlappingRooms(adjacent),adjacent);
});

test('symbol filtering remaps parent references and containment of a valid subroom is not an overlap error',()=>{
  const root={name:'Ruang kerja',confidence:.7,bounds:{x:10,y:10,width:60,height:60},parentIndex:null};
  const child={name:'Sirkulasi',confidence:.7,bounds:{x:15,y:15,width:20,height:20},parentIndex:1};
  const source={rooms:[{...child,name:'T1',parentIndex:null},root,child],notes:'Semak.'};
  const result=reviewPlanRooms(source);assert.equal(result.rooms[1].parentIndex,0);assert.doesNotMatch(result.notes,/bertindih/);
  for(const rooms of [[{...root,parentIndex:0}],[root,{...child,parentIndex:8}],[root,{...child,parentIndex:0},{...child,parentIndex:1}]])assert.throws(()=>reviewPlanRooms({rooms,notes:''}),error=>error.status===502);
});
