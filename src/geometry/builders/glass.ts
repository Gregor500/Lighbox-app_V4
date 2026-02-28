import { Element, Diagnostic, Tolerances, CornerTrace, PolygonApprox, Point2 } from '../types';
import { offsetPolygon } from '../offset';
import { analyzeCorners } from '../corners';

function applyChamfers(poly: PolygonApprox, chamferLength: number, tol: Tolerances): PolygonApprox {
  if (chamferLength <= 0) return poly;
  
  // Create a temporary border to analyze corners
  const tempBorder = {
    id: 'temp',
    loop: { segments: [] },
    polygon: poly,
    role: 'perimeter' as any,
    depth: 0,
    parentId: null
  };
  
  const traces = analyzeCorners(tempBorder, tol, 'glass');
  
  const pts = poly.points;
  const n = pts.length;
  const newPts: Point2[] = [];

  for (let i = 0; i < n; i++) {
    const trace = traces.find(t => t.cornerIndex === i);
    if (trace && trace.actionChosen === 'chamfer') {
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
      
      // Calculate distance d along the edge to achieve the desired crosscut length C
      // Split the acute interior angle into two right-angle triangles.
      // The opposite leg of the right-angle triangle is C / 2.
      // The hypotenuse is the distance d along the edge.
      // sin(theta / 2) = (C / 2) / d  =>  d = (C / 2) / sin(theta / 2)
      let d = (chamferLength / 2) / Math.sin(angleRad / 2);
      
      // Clamp d to half the shortest edge to avoid extending past the segment midpoint
      const maxD = Math.min(len1, len2) / 2;
      if (d > maxD) d = maxD;

      const t1 = { x: pCurr.x + u1.x * d, y: pCurr.y + u1.y * d };
      const t2 = { x: pCurr.x + u2.x * d, y: pCurr.y + u2.y * d };

      newPts.push(t1);
      newPts.push(t2);
    } else {
      newPts.push(pts[i]);
    }
  }
  return { points: newPts };
}

export function buildGlass(element: Element, glassOffset: number, chamferLength: number, tol: Tolerances, diagnostics: Diagnostic[]): { elements: Element[], traces: CornerTrace[] } {
  const traces: CornerTrace[] = [];
  
  // Analyze corners
  traces.push(...analyzeCorners(element.perimeter, tol, 'glass'));
  element.holes.forEach(hole => {
    traces.push(...analyzeCorners(hole, tol, 'glass'));
  });
  // Perimeter offset inward by glass_offset
  const perimeterOffset = offsetPolygon(element.perimeter.polygon, -glassOffset);
  
  // Hole offset outward by glass_offset
  const holesOffset = element.holes.map(hole => offsetPolygon(hole.polygon, -glassOffset));

  if (perimeterOffset.length === 0) {
    diagnostics.push({
      code: 'glass_offset_failed',
      severity: 'error',
      message: `Glass offset failed for perimeter ${element.perimeter.id}`,
      borderId: element.perimeter.id,
      actionStage: 'glass_build',
      repairApplied: false
    });
  }

  // Mirror final Glass geometry exactly once (X-axis mirror)
  const processedPerimeterPoly = perimeterOffset[0] ? applyChamfers({ points: perimeterOffset[0].points }, chamferLength, tol) : applyChamfers(element.perimeter.polygon, chamferLength, tol);
  
  const mirroredPerimeter = {
    ...element.perimeter,
    polygon: { points: processedPerimeterPoly.points.map(pt => ({ x: -pt.x, y: pt.y })) }
  };

  const mirroredHoles = holesOffset.map((ho, i) => {
    const processedHolePoly = ho[0] ? applyChamfers({ points: ho[0].points }, chamferLength, tol) : applyChamfers(element.holes[i].polygon, chamferLength, tol);
    return {
      ...element.holes[i],
      polygon: { points: processedHolePoly.points.map(pt => ({ x: -pt.x, y: pt.y })) }
    };
  });

  const processedElement = {
    ...element,
    perimeter: mirroredPerimeter,
    holes: mirroredHoles
  };

  const mirroredSourceElement = {
    ...element,
    id: element.id + '_mirrored_src',
    perimeter: {
      ...element.perimeter,
      id: element.perimeter.id + '_mirrored_src',
      polygon: { points: element.perimeter.polygon.points.map(pt => ({ x: -pt.x, y: pt.y })) }
    },
    holes: element.holes.map(h => ({
      ...h,
      id: h.id + '_mirrored_src',
      polygon: { points: h.polygon.points.map(pt => ({ x: -pt.x, y: pt.y })) }
    }))
  };

  return {
    elements: [processedElement, mirroredSourceElement],
    traces
  };
}
