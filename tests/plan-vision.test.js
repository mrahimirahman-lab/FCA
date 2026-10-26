import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {addPlanGrid,warnOverlappingRooms} from '../server/plan-vision.js';

test('temporary grid preserves plan dimensions and non-grid wall pixels without changing the input image',async()=>{
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="white"/><rect x="73" y="87" width="500" height="400" fill="none" stroke="black" stroke-width="4"/></svg>');
  const png=await sharp(svg).png().toBuffer(),copy=Buffer.from(png);
  const guided=await addPlanGrid(png,{width:800,height:600});assert.equal(guided.hasGrid,true);assert.deepEqual(png,copy);
  const metadata=await sharp(guided.png).metadata();assert.equal(metadata.width,800);assert.equal(metadata.height,600);
  const wall=await sharp(guided.png).extract({left:73,top:87,width:1,height:1}).removeAlpha().raw().toBuffer();assert.deepEqual([...wall],[0,0,0]);
  const raw=await sharp(guided.png).removeAlpha().raw().toBuffer();let blue=0;
  for(let i=0;i<raw.length;i+=3)if(raw[i+2]>raw[i]+10)blue++;
  assert.ok(blue>0,'Visible coordinate guides must be added to the inference image');
  const small=await sharp({create:{width:100,height:80,channels:3,background:'#fff'}}).png().toBuffer();
  const unmodified=await addPlanGrid(small,{width:100,height:80});assert.equal(unmodified.hasGrid,false);assert.deepEqual(unmodified.png,small);
});

test('significant overlapping proposals are flagged without shrinking, deleting or moving room boxes',()=>{
  const a={name:'Bilik',confidence:.7,bounds:{x:10,y:10,width:30,height:40}};
  const b={name:'Dapur',confidence:.6,bounds:{x:20,y:20,width:40,height:30}};
  const source={rooms:[a,b],notes:'Semak.'},copy=structuredClone(source);
  const result=warnOverlappingRooms(source);assert.match(result.notes,/bertindih/);assert.deepEqual(result.rooms,copy.rooms);assert.deepEqual(source,copy);
  const adjacent={rooms:[a,{...b,bounds:{x:40,y:10,width:20,height:40}}],notes:'Semak.'};assert.deepEqual(warnOverlappingRooms(adjacent),adjacent);
});
