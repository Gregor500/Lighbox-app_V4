import { Element, Diagnostic, Tolerances, CornerTrace, PolygonApprox, Point2 } from '../types';
import { analyzeCorners } from '../corners';

function applyFillets(poly: PolygonApprox, traces: CornerTrace[], radius: number): PolygonApprox {
  if (radius <= 0) return poly;
  const pts = poly.points;
  const n = pts.length;
  const newPts: Point2[] = [];

  for (let i = 0; i < n; i++) {
    const trace = traces.find(t => t.cornerIndex === i);
    if (trace && trace.actionChosen === 'fillet') {
      const pPrev = pts[(i - 1 + n) % n];
      const pCurr = pts[i];
      const pNext = pts[(i + 1) % n];

      const v1 = { x: pPrev.x - pCurr.x, y: pPrev.y - pCurr.y };
      const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };
      const len1 = Math.hypot(v1.x, v1.y);
      const len2 = Math.hypot(v2.x, v2.y);
      
      if (len1 === 0 || len2 === 0) {
        newPts.push(pCurr);
        continue;
      }

      const u1 = { x: v1.x / len1, y: v1.y / len1 };
      const u2 = { x: v2.x / len2, y: v2.y / len2 };

      const angleRad = trace.interiorAngleDeg * Math.PI / 180;
      // Use absolute value of tan to handle reflex angles correctly
      let d = radius / Math.abs(Math.tan(angleRad / 2));
      
      // Clamp d to half the shortest edge
      const maxD = Math.min(len1, len2) / 2;
      if (d > maxD) d = maxD;

      const t1 = { x: pCurr.x + u1.x * d, y: pCurr.y + u1.y * d };
      const t2 = { x: pCurr.x + u2.x * d, y: pCurr.y + u2.y * d };

      // Generate quadratic bezier points for the fillet
      const steps = 8;
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const x = Math.pow(1 - t, 2) * t1.x + 2 * (1 - t) * t * pCurr.x + Math.pow(t, 2) * t2.x;
        const y = Math.pow(1 - t, 2) * t1.y + 2 * (1 - t) * t * pCurr.y + Math.pow(t, 2) * t2.y;
        newPts.push({ x, y });
      }
    } else {
      newPts.push(pts[i]);
    }
  }
  return { points: newPts };
}

export function buildVinyl(element: Element, filletRadius: number, tol: Tolerances, diagnostics: Diagnostic[]): { element: Element, traces: CornerTrace[] } {
  const traces: CornerTrace[] = [];
  
  // Analyze corners
  traces.push(...analyzeCorners(element.perimeter, tol, 'vinyl'));
  element.holes.forEach(hole => {
    traces.push(...analyzeCorners(hole, tol, 'vinyl'));
  });
  // No geometric offset
  const vinylPerimeter = { ...element.perimeter };
  const vinylHoles = element.holes.map(h => ({ ...h }));

  // Fillet all interior usable-area corners
  vinylPerimeter.polygon = applyFillets(vinylPerimeter.polygon, traces.filter(t => t.sourceBorderId === vinylPerimeter.id), filletRadius);
  vinylHoles.forEach(h => {
    h.polygon = applyFillets(h.polygon, traces.filter(t => t.sourceBorderId === h.id), filletRadius);
  });

  // Not mirrored
  return {
    element: {
      ...element,
      perimeter: vinylPerimeter,
      holes: vinylHoles
    },
    traces
  };
}
