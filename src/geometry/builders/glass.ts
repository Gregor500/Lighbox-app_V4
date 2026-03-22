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
  
  // Analyze corners
  traces.push(...analyzeCorners(element.perimeter, tol, 'glass'));
  element.holes.forEach(hole => {
    traces.push(...analyzeCorners(hole, tol, 'glass'));
  });
  
  // Create mirrored original element
  const mirroredOriginalPerimeter = {
    ...element.perimeter,
    id: `${element.perimeter.id}_orig`,
    polygon: { points: element.perimeter.polygon.points.map(pt => ({ x: -pt.x, y: pt.y })) }
  };
  const mirroredOriginalHoles = element.holes.map((hole, i) => {
    // Apply chamfers to the original hole so the "cut" line also shows them
    const chamferedHolePoly = applyChamfers(hole.polygon, 'hole', chamferLength, tol);
    return {
      ...hole,
      id: `${hole.id}_orig`,
      polygon: { points: chamferedHolePoly.points.map(pt => ({ x: -pt.x, y: pt.y })) }
    };
  });
  const mirroredOriginalElement: Element = {
    ...element,
    id: `${element.id}_orig`,
    perimeter: mirroredOriginalPerimeter,
    holes: mirroredOriginalHoles
  };

  // Perimeter offset inward by glass_offset
  const perimeterOffset = offsetPolygon(element.perimeter.polygon, -glassOffset);
  
  // Hole offset outward by glass_offset (positive value expands the hole into the usable shape)
  const holesOffset = element.holes.map(hole => offsetPolygon(hole.polygon, glassOffset));

  if (perimeterOffset.length === 0) {
    diagnostics.push({
      code: 'glass_offset_failed',
      severity: 'error',
      message: `Glass offset failed for perimeter ${element.perimeter.id}`,
      borderId: element.perimeter.id,
      actionStage: 'glass_build',
      repairApplied: false
    });
    return { elements: [mirroredOriginalElement], traces };
  }

  // Clip holes against perimeter to prevent overlap
  const usableMaterials = getUsableMaterial(
    perimeterOffset[0], 
    holesOffset.map(ho => ho[0]).filter(Boolean)
  );

  if (usableMaterials.length === 0) {
    return { elements: [mirroredOriginalElement], traces };
  }

  const processedElements: Element[] = [mirroredOriginalElement];

  for (let i = 0; i < usableMaterials.length; i++) {
    const material = usableMaterials[i];
    
    const processedPerimeterPoly = applyChamfers(material.perimeter, 'perimeter', chamferLength, tol);
    
    const mirroredPerimeter = {
      ...element.perimeter,
      id: `${element.perimeter.id}_${i}`,
      polygon: { points: processedPerimeterPoly.points.map(pt => ({ x: -pt.x, y: pt.y })) }
    };

    const mirroredHoles = material.holes.map((holePoly, j) => {
      const processedHolePoly = applyChamfers(holePoly, 'hole', chamferLength, tol);
      return {
        ...element.holes[0], // Copy properties from first hole as fallback
        id: `${element.id}_hole_${i}_${j}`,
        polygon: { points: processedHolePoly.points.map(pt => ({ x: -pt.x, y: pt.y })) }
      };
    });

    processedElements.push({
      ...element,
      id: `${element.id}_${i}`,
      perimeter: mirroredPerimeter,
      holes: mirroredHoles
    });
  }

  return {
    elements: processedElements,
    traces
  };
}
