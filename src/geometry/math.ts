import { Point2, PolygonApprox, Tolerances } from './types';

export function getSignedArea(pts: Point2[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area / 2;
}

export function getInteriorAngle(pPrev: Point2, pCurr: Point2, pNext: Point2, isCCW: boolean): number {
  const vIn = { x: pCurr.x - pPrev.x, y: pCurr.y - pPrev.y };
  const vOut = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };
  
  let turnAngle = Math.atan2(vOut.y, vOut.x) - Math.atan2(vIn.y, vIn.x);
  
  // Normalize turnAngle to [-PI, PI]
  while (turnAngle < -Math.PI) turnAngle += 2 * Math.PI;
  while (turnAngle > Math.PI) turnAngle -= 2 * Math.PI;
  
  // isCCW in our Y-down system means area > 0 is visually CW.
  // Wait, let's just use the standard definition:
  // If area > 0 (visually CW), interior is on the RIGHT.
  // If area < 0 (visually CCW), interior is on the LEFT.
  // We pass `isCCW = area > 0` from analyzeCorners. So `isCCW` actually means visually CW.
  // Let's rename the logic internally to be clear.
  const isVisuallyCW = isCCW; 
  
  let interiorPolyAngleRad;
  if (isVisuallyCW) {
    // Interior is on the RIGHT.
    // turnAngle > 0 (visually RIGHT turn) -> interior < 180
    // turnAngle < 0 (visually LEFT turn) -> interior > 180
    interiorPolyAngleRad = Math.PI - turnAngle;
  } else {
    // Interior is on the LEFT.
    // turnAngle > 0 (visually RIGHT turn) -> interior > 180
    // turnAngle < 0 (visually LEFT turn) -> interior < 180
    interiorPolyAngleRad = Math.PI + turnAngle;
  }
  
  return interiorPolyAngleRad;
}

export function polygonArea(poly: PolygonApprox): number {
  let area = 0;
  const pts = poly.points;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area / 2;
}

export function isPointInPolygon(pt: Point2, poly: PolygonApprox, tol: Tolerances): boolean {
  const pts = poly.points;
  let inside = false;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;

    const intersect = ((yi > pt.y) !== (yj > pt.y))
        && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function segmentsIntersect(p1: Point2, p2: Point2, p3: Point2, p4: Point2): boolean {
  const ccw = (A: Point2, B: Point2, C: Point2) => {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  };
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

export function polygonsIntersect(poly1: PolygonApprox, poly2: PolygonApprox): boolean {
  const pts1 = poly1.points;
  const pts2 = poly2.points;
  for (let i = 0; i < pts1.length; i++) {
    const p1 = pts1[i];
    const p2 = pts1[(i + 1) % pts1.length];
    for (let j = 0; j < pts2.length; j++) {
      const p3 = pts2[j];
      const p4 = pts2[(j + 1) % pts2.length];
      if (segmentsIntersect(p1, p2, p3, p4)) {
        return true;
      }
    }
  }
  return false;
}

export function polygonContainsPolygon(outer: PolygonApprox, inner: PolygonApprox, tol: Tolerances): boolean {
  // A simple check: if all points of inner are inside outer, it's contained.
  // In a robust engine, we'd also check edge intersections.
  for (const pt of inner.points) {
    if (!isPointInPolygon(pt, outer, tol)) {
      return false;
    }
  }
  return true;
}

export function distance(p1: Point2, p2: Point2): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

export function isClosed(poly: PolygonApprox, tol: Tolerances): boolean {
  if (poly.points.length < 3) return false;
  const first = poly.points[0];
  const last = poly.points[poly.points.length - 1];
  return distance(first, last) <= tol.eps_closure_gap;
}

export function simplifyPolygon(poly: PolygonApprox, tol: Tolerances): PolygonApprox {
  const pts = poly.points;
  if (pts.length < 3) return poly;

  const newPts: Point2[] = [];
  const n = pts.length;

  for (let i = 0; i < n; i++) {
    const pPrev = newPts.length > 0 ? newPts[newPts.length - 1] : pts[(i - 1 + n) % n];
    const pCurr = pts[i];
    const pNext = pts[(i + 1) % n];

    // Check if pCurr is collinear with pPrev and pNext
    // Area of triangle formed by pPrev, pCurr, pNext
    const area = Math.abs(
      pPrev.x * (pCurr.y - pNext.y) +
      pCurr.x * (pNext.y - pPrev.y) +
      pNext.x * (pPrev.y - pCurr.y)
    ) / 2;

    // Also check distance to avoid removing corners that are just very close
    const distPrevCurr = distance(pPrev, pCurr);
    const distCurrNext = distance(pCurr, pNext);

    if (area < tol.eps_collinear && distPrevCurr > tol.eps_point_merge && distCurrNext > tol.eps_point_merge) {
      // It's collinear, so we skip pCurr
      continue;
    }

    newPts.push(pCurr);
  }

  // One more pass to check the first point against the last and second
  if (newPts.length >= 3) {
    const pPrev = newPts[newPts.length - 1];
    const pCurr = newPts[0];
    const pNext = newPts[1];
    const area = Math.abs(
      pPrev.x * (pCurr.y - pNext.y) +
      pCurr.x * (pNext.y - pPrev.y) +
      pNext.x * (pPrev.y - pCurr.y)
    ) / 2;
    if (area < tol.eps_collinear) {
      newPts.shift();
    }
  }

  return { points: newPts };
}
