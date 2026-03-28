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

    // For a perimeter (CCW), the material is on the inside. Its angle is angleDeg.
    // For a hole (CW), the material is on the outside. Its angle is 360 - angleDeg.
    let materialAngleDeg = isCCW ? angleDeg : 360 - angleDeg;

    // A corner is an external sharp corner if the material angle is less than 180 degrees.
    const isExternalCorner = materialAngleDeg < 179.99;
    
    // We apply chamfer/fillet if the external corner is sharp enough.
    const isAcute = materialAngleDeg < tol.acute_threshold_deg;

    let action: 'none' | 'chamfer' | 'fillet' = 'none';

    if (target === 'glass' || target === 'backing') {
      if (isExternalCorner && isAcute) action = 'chamfer';
    } else if (target === 'vinyl') {
      if (isExternalCorner && isAcute) action = 'fillet';
    }

    traces.push({
      sourceBorderId: border.id,
      cornerIndex: i,
      interiorAngleDeg: angleDeg,
      isInteriorUsable: isExternalCorner, // Repurposing this field to mean isExternalCorner
      isAcute: isAcute,
      actionChosen: action
    });
  }
  return traces;
}
