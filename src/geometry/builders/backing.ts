import { Element, Diagnostic, Tolerances, CornerTrace, PolygonApprox, Point2 } from '../types';
import { offsetPolygon, getUsableMaterial } from '../offset';
import { analyzeCorners } from '../corners';

function applyChamfers(poly: PolygonApprox, role: 'perimeter' | 'hole', chamferLength: number, tol: Tolerances): PolygonApprox {
  if (chamferLength <= 0) return poly;
  
  // Create a temporary border to analyze corners
  const tempBorder = {
    id: 'temp',
    loop: { segments: [] },
    polygon: poly,
    role: role,
    depth: 0,
    parentId: null
  };
  
  const traces = analyzeCorners(tempBorder, tol, 'backing');
  
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
      
      let d = (chamferLength / 2) / Math.sin(angleRad / 2);
      
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

export function buildBacking(element: Element, glassOffset: number, chamferLength: number, tol: Tolerances, diagnostics: Diagnostic[]): { element: Element, traces: CornerTrace[] } {
  const traces: CornerTrace[] = [];
  
  // Analyze corners
  traces.push(...analyzeCorners(element.perimeter, tol, 'backing'));
  element.holes.forEach(hole => {
    traces.push(...analyzeCorners(hole, tol, 'backing'));
  });
  
  // Perimeter offset inward by glass_offset
  const perimeterOffset = offsetPolygon(element.perimeter.polygon, -glassOffset);
  
  // Hole offset outward by glass_offset (positive value expands the hole into the usable shape)
  const holesOffset = element.holes.map(hole => offsetPolygon(hole.polygon, glassOffset));

  if (perimeterOffset.length === 0) {
    diagnostics.push({
      code: 'backing_offset_failed',
      severity: 'error',
      message: `Backing offset failed for perimeter ${element.perimeter.id}`,
      borderId: element.perimeter.id,
      actionStage: 'backing_build',
      repairApplied: false
    });
    return { element, traces };
  }

  // Clip holes against perimeter to prevent overlap
  const usableMaterials = getUsableMaterial(
    perimeterOffset[0], 
    holesOffset.map(ho => ho[0]).filter(Boolean)
  );

  if (usableMaterials.length === 0) {
    return { element, traces };
  }

  // Backing typically returns one element. If the boolean operation splits it, we just take the first one for now.
  const material = usableMaterials[0];

  const processedPerimeterPoly = applyChamfers(material.perimeter, 'perimeter', chamferLength, tol);
  
  const backedPerimeter = {
    ...element.perimeter,
    polygon: processedPerimeterPoly
  };

  const backedHoles = material.holes.map((holePoly, i) => {
    const processedHolePoly = applyChamfers(holePoly, 'hole', chamferLength, tol);
    return {
      ...element.holes[0], // fallback
      id: `${element.id}_hole_${i}`,
      polygon: processedHolePoly
    };
  });

  // Marker policy (down-arrow)
  // Determine anchor point inside perimeter, outside holes
  const anchor = backedPerimeter.polygon.points[0]; // Simplified anchor selection

  if (!anchor) {
    diagnostics.push({
      code: 'marker_anchor_not_found',
      severity: 'warning',
      message: `No valid anchor found for marker on ${element.perimeter.id}`,
      borderId: element.perimeter.id,
      actionStage: 'backing_build',
      repairApplied: false
    });
  }

  return {
    element: {
      ...element,
      perimeter: backedPerimeter,
      holes: backedHoles
    },
    traces
  };
}
