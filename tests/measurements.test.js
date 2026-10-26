import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makePlanScale,rotatePlanScale,roomMeasurements} from '../server/measurements.js';
import {rotateRoomBounds} from '../server/plan.js';

test('reference calibration converts original image pixels to metres including diagonal references',()=>{
  const plan={width:1000,height:500};
  const scale=makePlanScale(plan,{start:{x:10,y:20},end:{x:50,y:20},distanceM:4});
  assert.equal(scale.metersPerPixel,.01);
  assert.equal(makePlanScale(plan,{start:{x:0,y:0},end:{x:30,y:80},distanceM:5}).metersPerPixel,.01);
  const room={bounds:{x:10,y:10,width:30,height:40}};
  assert.deepEqual(roomMeasurements(room,{...plan,scale}),{lengthM:3,widthM:2,areaM2:6,source:'plan'});
  for(const input of [{start:{x:10,y:10},end:{x:10,y:10},distanceM:2},{start:{x:0,y:0},end:{x:.1,y:0},distanceM:1}])assert.throws(()=>makePlanScale(plan,input),error=>error.status===400);
});

test('real room area and reference scale are invariant across saved quarter turns',()=>{
  let plan={width:1000,height:500},room={bounds:{x:10,y:10,width:30,height:40}};
  plan.scale=makePlanScale(plan,{start:{x:10,y:20},end:{x:50,y:20},distanceM:4});
  for(const angle of [90,-90,180,90]) {
    plan={...plan,scale:rotatePlanScale(plan.scale,angle),width:Math.abs(angle)===90?plan.height:plan.width,height:Math.abs(angle)===90?plan.width:plan.height};
    room={bounds:rotateRoomBounds(room.bounds,angle)};
    assert.deepEqual(roomMeasurements(room,plan),{lengthM:3,widthM:2,areaM2:6,source:'plan'});
    assert.ok(Math.abs(makePlanScale(plan,plan.scale).metersPerPixel-.01)<1e-12);
  }
});

test('manual dimensions override image estimates and missing or incomplete measurements never invent square metres',()=>{
  const plan={width:1000,height:500,scale:{metersPerPixel:.01}},room={bounds:{x:10,y:10,width:30,height:40}};
  assert.deepEqual(roomMeasurements({...room,dimensions:{lengthM:5,widthM:4}},plan),{lengthM:5,widthM:4,areaM2:20,source:'manual'});
  assert.equal(roomMeasurements(room,{width:1000,height:500}),null);
  for(const dimensions of [{lengthM:2,widthM:''},{lengthM:0,widthM:2},{lengthM:Infinity,widthM:3}])assert.equal(roomMeasurements({...room,dimensions},plan),null);
  assert.equal(roomMeasurements({...room,dimensions:null},plan).areaM2,6);
});
