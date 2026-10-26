import {planCalibrationSchema} from './domain.js';

export function makePlanScale(plan,input) {
  const calibration=planCalibrationSchema.parse(input);
  const pixels=Math.hypot((calibration.end.x-calibration.start.x)*plan.width/100,(calibration.end.y-calibration.start.y)*plan.height/100);
  if(!Number.isFinite(pixels) || pixels<5)throw Object.assign(new Error('Pilih dua titik rujukan yang berbeza dan sekurang-kurangnya 5 piksel berjauhan pada imej asal.'),{status:400});
  return {...calibration,metersPerPixel:calibration.distanceM/pixels};
}

export function rotatePlanScale(scale,angle) {
  if(!scale)return scale;
  const turn=(angle%360+360)%360;
  const point=({x,y})=>turn===90?{x:100-y,y:x}:turn===180?{x:100-x,y:100-y}:turn===270?{x:y,y:100-x}:{x,y};
  return {...scale,start:point(scale.start),end:point(scale.end)};
}

export function roomMeasurements(room,plan) {
  const positive=value=>typeof value==='number' && Number.isFinite(value) && value>0;
  if(room?.dimensions!=null) {
    const {lengthM,widthM}=room.dimensions;
    return positive(lengthM) && positive(widthM)?{lengthM,widthM,areaM2:lengthM*widthM,source:'manual'}:null;
  }
  const scale=plan?.scale?.metersPerPixel;
  if(!room?.bounds || !positive(scale) || !positive(plan.width) || !positive(plan.height))return null;
  const across=room.bounds.width/100*plan.width*scale,down=room.bounds.height/100*plan.height*scale;
  if(!positive(across) || !positive(down))return null;
  return {lengthM:Math.max(across,down),widthM:Math.min(across,down),areaM2:across*down,source:'plan'};
}
