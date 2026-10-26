export function subRoomSuffix(sequence) {
  if(!Number.isInteger(sequence) || sequence<1 || sequence>18278)throw new Error('Had subruang dicapai.');
  let result='';
  for(let value=sequence;value>0;value=Math.floor((value-1)/26))result=String.fromCharCode(97+(value-1)%26)+result;
  return result;
}
export function roomTag(room) {return `${room.number}${room.subCode||''}`;}
