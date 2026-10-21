// A real-plane illustration of the change-of-basis sandwich. R takes the
// horizontal initial direction to s. Its inverse aligns s with that axis;
// flipping the horizontal component and rotating back gives I - 2 s s^T.
export const PREPARED = Object.freeze({x:1/4, y:Math.sqrt(15)/4});
export const PREPARED_ANGLE = Math.acos(1/4);
const INITIAL = Object.freeze({x:1, y:0});

export function rotate(vector, angle) {
  const c=Math.cos(angle),s=Math.sin(angle);
  return {x:c*vector.x-s*vector.y, y:s*vector.x+c*vector.y};
}

export function reflect(vector, normal) {
  const projection=vector.x*normal.x+vector.y*normal.y;
  return {x:vector.x-2*projection*normal.x, y:vector.y-2*projection*normal.y};
}

export function exampleStages(degrees=20) {
  if (!Number.isFinite(degrees)) throw new RangeError('Expected a finite angle');
  const angle=degrees*Math.PI/180;
  const input={x:Math.cos(angle),y:Math.sin(angle)};
  const aligned=rotate(input,-PREPARED_ANGLE);
  const flipped={x:-aligned.x,y:aligned.y};
  const output=rotate(flipped,PREPARED_ANGLE);
  return {
    input,
    stages:[input,aligned,flipped,output].map((vector,step)=>({
      vector, reference:step===1 || step===2 ? INITIAL : PREPARED,
      norm:vector.x**2+vector.y**2
    }))
  };
}

// Rotation stages carry both the input and the reference through the same
// real change of basis. The middle arc is a geometric sweep between the
// reflection's endpoints, rather than a simulation of a quantum gate pulse.
export function continuousExample(example,position=0) {
  if (!Number.isFinite(position) || position<0 || position>3)
    throw new RangeError('Mixer position must be between zero and three');
  const basisAngle=position<=1 ? -PREPARED_ANGLE*position
    : position<=2 ? -PREPARED_ANGLE : PREPARED_ANGLE*(position-3);
  const input=rotate(example.input,basisAngle);
  const reference=rotate(PREPARED,basisAngle);
  const mirror={x:-reference.y,y:reference.x};
  const reflected=reflect(input,reference);
  let vector;
  if (position<=1) vector=input;
  else if (position>=2) vector=reflected;
  else {
    const from=example.stages[1].vector,to=example.stages[2].vector;
    const turn=Math.atan2(from.x*to.y-from.y*to.x,from.x*to.x+from.y*to.y);
    vector=rotate(from,turn*(position-1));
  }
  // Use the exact real-operation endpoints when a stage is complete.
  if (Number.isInteger(position)) vector=example.stages[position].vector;
  const alongReference=vector.x*reference.x+vector.y*reference.y;
  const alongMirror=vector.x*mirror.x+vector.y*mirror.y;
  const progress=position===0 ? 0 : Number.isInteger(position) ? 1 : position%1;
  return {
    position,stage:Math.ceil(position),completed:Math.floor(position),progress,
    basisAngle,vector,input,reference,mirror,reflected,
    foot:{x:(input.x+reflected.x)/2,y:(input.y+reflected.y)/2},
    alongReference,alongMirror,norm:vector.x**2+vector.y**2
  };
}
