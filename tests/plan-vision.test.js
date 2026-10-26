import {test} from 'node:test';
import assert from 'node:assert/strict';
import {warnOverlappingRooms} from '../server/plan-vision.js';

test('significant overlapping proposals are flagged without shrinking, deleting or moving room boxes',()=>{
  const a={name:'Bilik',confidence:.7,bounds:{x:10,y:10,width:30,height:40}};
  const b={name:'Dapur',confidence:.6,bounds:{x:20,y:20,width:40,height:30}};
  const source={rooms:[a,b],notes:'Semak.'},copy=structuredClone(source);
  const result=warnOverlappingRooms(source);assert.match(result.notes,/bertindih/);assert.deepEqual(result.rooms,copy.rooms);assert.deepEqual(source,copy);
  const adjacent={rooms:[a,{...b,bounds:{x:40,y:10,width:20,height:40}}],notes:'Semak.'};assert.deepEqual(warnOverlappingRooms(adjacent),adjacent);
});
