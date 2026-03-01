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
  const v1 = { x: pPrev.x - pCurr.x, y: pPrev.y - pCurr.y };
  const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };
  
  let angle = Math.atan2(v2.y, v2.x) - Math.atan2(v1.y, v1.x);
  if (angle < 0) angle += 2 * Math.PI;
  
  let interiorPolyAngle = isCCW ? (2 * Math.PI - angle) : angle;
  
  return interiorPolyAngle;
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
