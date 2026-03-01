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

    // To handle floating point inaccuracies
    const isInteriorUsable = angleDeg < 179.99;
    const isAcute = angleDeg < tol.acute_threshold_deg;

    let action: 'none' | 'chamfer' | 'fillet' = 'none';

    if (target === 'glass' || target === 'backing') {
      if (isInteriorUsable && isAcute) action = 'chamfer';
    } else if (target === 'vinyl') {
      if (isInteriorUsable && isAcute) action = 'fillet';
    }

    traces.push({
      sourceBorderId: border.id,
      cornerIndex: i,
      interiorAngleDeg: angleDeg,
      isInteriorUsable,
      isAcute,
      actionChosen: action
    });
  }
  return traces;
}
