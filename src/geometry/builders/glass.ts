import { Element, Diagnostic, Tolerances, CornerTrace, PolygonApprox, Point2 } from '../types';
import { offsetPolygon, getUsableMaterial } from '../offset';
import { analyzeCorners } from '../corners';

function applyChamfers(poly: PolygonApprox, traces: CornerTrace[], borderId: string, chamferLength: number): PolygonApprox {
  if (chamferLength <= 0) return poly;
  
  const pts = poly.points;
  const n = pts.length;
  const newPts: Point2[] = [];

  for (let i = 0; i < n; i++) {
    const trace = traces.find(t => t.sourceBorderId === borderId && t.cornerIndex === i);
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

export function buildGlass(element: Element, glassOffset: number, chamferLength: number, tol: Tolerances, diagnostics: Diagnostic[]): { elements: Element[], traces: CornerTrace[] } {
  const traces: CornerTrace[] = [];
  
  // Analyze corners of original element
  const origPerimeterTraces = analyzeCorners(element.perimeter, tol, 'glass');
  traces.push(...origPerimeterTraces);
  const origHolesTraces = element.holes.map(hole => analyzeCorners(hole, tol, 'glass'));
  origHolesTraces.forEach(t => traces.push(...t));
  
  // 1. Apply chamfers to original polygons
  const chamferedPerimeterPoly = applyChamfers(element.perimeter.polygon, origPerimeterTraces, element.perimeter.id, chamferLength);
  const chamferedHolesPoly = element.holes.map((hole, i) => applyChamfers(hole.polygon, origHolesTraces[i], hole.id, chamferLength));

  // 2. Perimeter offset inward by glass_offset (offset the chamfered polygon)
  const perimeterOffset = offsetPolygon(chamferedPerimeterPoly, -glassOffset);
  
  // 3. Hole offset outward by glass_offset (negative delta expands CW polygons)
  const holesOffset = element.holes.map((hole, i) => offsetPolygon(chamferedHolesPoly[i], -glassOffset));

  if (perimeterOffset.length === 0) {
    diagnostics.push({
      code: 'glass_offset_failed',
      severity: 'error',
      message: `Glass offset failed for perimeter ${element.perimeter.id}`,
      borderId: element.perimeter.id,
      actionStage: 'glass_build',
      repairApplied: false
    });
    return { elements: [], traces };
  }

  // Clip holes against perimeter to prevent overlap
  const allHolesOffsetPolys = holesOffset.flatMap(ho => ho);
  const usableMaterials = perimeterOffset.flatMap(perim => 
    getUsableMaterial(perim, allHolesOffsetPolys)
  );

  if (usableMaterials.length === 0) {
    return { elements: [], traces };
  }

  const processedElements: Element[] = [];

  for (let i = 0; i < usableMaterials.length; i++) {
    const material = usableMaterials[i];
    
    const processedPerimeter = {
      ...element.perimeter,
      id: `${element.perimeter.id}_offset_${i}`,
      polygon: material.perimeter
    };

    const processedHoles = material.holes.map((holePoly, j) => {
      return {
        ...element.holes[0], // Copy properties from first hole as fallback
        id: `${element.id}_hole_offset_${i}_${j}`,
        polygon: holePoly
      };
    });

    processedElements.push({
      ...element,
      id: `${element.id}_${i}`,
      perimeter: processedPerimeter,
      holes: processedHoles
    });
  }

  return {
    elements: processedElements,
    traces
  };
}
