import { Border, CornerTrace, Tolerances } from './types';
import { getSignedArea, getInteriorAngle } from './math';

export function analyzeCorners(border: Border, tol: Tolerances, target: 'glass' | 'backing' | 'vinyl'): CornerTrace[] {
  const pts = border.polygon.points;
  const n = pts.length;
  const traces: CornerTrace[] = [];
  if (n < 3) return traces;

  const area = getSignedArea(pts);
  const isCCW = area > 0;

  for (let i = 0; i < n; i++) {
    const pPrev = pts[(i - 1 + n) % n];
    const pCurr = pts[i];
    const pNext = pts[(i + 1) % n];

    const angleRad = getInteriorAngle(pPrev, pCurr, pNext, isCCW);
    let angleDeg = angleRad * (180 / Math.PI);

    // A corner makes a "cut into the usable area" if the empty space forms an acute angle.
    // For a perimeter (CCW), the empty space is on the outside. Its angle is 360 - angleDeg.
    // For a hole (CW), the empty space is on the inside. Its angle is angleDeg.
    let cutAngleDeg = isCCW ? 360 - angleDeg : angleDeg;

    // To handle floating point inaccuracies
    const isCutIntoMaterial = cutAngleDeg < 179.99;
    const isAcuteCut = cutAngleDeg < tol.acute_threshold_deg;

    let action: 'none' | 'chamfer' | 'fillet' = 'none';

    if (target === 'glass' || target === 'backing') {
      if (isCutIntoMaterial && isAcuteCut) action = 'chamfer';
    } else if (target === 'vinyl') {
      if (isCutIntoMaterial && isAcuteCut) action = 'fillet';
    }

    traces.push({
      sourceBorderId: border.id,
      cornerIndex: i,
      interiorAngleDeg: angleDeg,
      isInteriorUsable: isCutIntoMaterial, // Repurposing this field for the trace
      isAcute: isAcuteCut,
      actionChosen: action
    });
  }
  return traces;
}
