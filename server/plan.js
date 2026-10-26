import { boundsSchema } from './domain.js';

export function rotatePlanPoint({x,y},angle) {
  const turn=(angle%360+360)%360;
  return turn===90?{x:100-y,y:x}:turn===180?{x:100-x,y:100-y}:turn===270?{x:y,y:100-x}:{x,y};
}

// Clockwise quarter turns preserve rectangular room bounds without cropping.
export function rotateRoomBounds(bounds,angle) {
  const {x,y,width,height}=bounds;
  const turn=(angle%360+360)%360;
  const next=turn===90 ? {x:100-y-height,y:x,width:height,height:width}
    : turn===180 ? {x:100-x-width,y:100-y-height,width,height}
    : turn===270 ? {x:y,y:100-x-width,width:height,height:width} : {...bounds};
  // Remove floating point noise at image edges, not actual out-of-image bounds.
  const parsed=boundsSchema.safeParse(Object.fromEntries(Object.entries(next).map(([key,value])=>[key,Number(value.toFixed(10))])));
  if(!parsed.success)throw Object.assign(new Error('Sempadan ruang tidak dapat diputar. Betulkan sempadan yang berada di luar pelan dahulu.'),{status:409});
  return parsed.data;
}
