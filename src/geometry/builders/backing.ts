import { Element, Diagnostic, Tolerances, CornerTrace, PolygonApprox, Point2 } from '../types';
import { offsetPolygon, getUsableMaterial } from '../offset';
import { analyzeCorners } from '../corners';
import { PipelineConfig } from '../pipeline';
import { calculateHolesForLine } from '../frame';
import { isPointInPolygon } from '../math';

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

export function buildBacking(element: Element, config: PipelineConfig, diagnostics: Diagnostic[]): { element: Element, traces: CornerTrace[] } {
  const { backingOffset, chamferLength, tolerances: tol, frameLines, frameMaterialThickness, frameHoleSpacing, frameHoleDiameter } = config;
  const traces: CornerTrace[] = [];
  
  // Analyze corners
  traces.push(...analyzeCorners(element.perimeter, tol, 'backing'));
  element.holes.forEach(hole => {
    traces.push(...analyzeCorners(hole, tol, 'backing'));
  });
  
  // Perimeter offset inward by backingOffset
  const perimeterOffset = offsetPolygon(element.perimeter.polygon, -backingOffset);
  
  // Hole offset outward by backingOffset (positive value expands the hole into the usable shape)
  const holesOffset = element.holes.map(hole => offsetPolygon(hole.polygon, backingOffset));

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

  // Calculate frame holes and add them to the backing holes
  if (frameLines && frameMaterialThickness && frameHoleSpacing && frameHoleDiameter) {
    const radius = frameHoleDiameter / 2;
    // Simple circle approximation for holes (e.g., 16 segments)
    const numSegments = 16;
    
    frameLines.forEach((line, lineIdx) => {
      const holes = calculateHolesForLine(line, frameMaterialThickness, frameHoleSpacing);
      holes.forEach((center, holeIdx) => {
        // Check if hole is inside the usable material
        const isInsidePerimeter = isPointInPolygon(center, material.perimeter, tol);
        const isInsideAnyHole = material.holes.some(h => isPointInPolygon(center, h, tol));
        
        if (!isInsidePerimeter || isInsideAnyHole) {
          return; // Skip this hole
        }

        const points: Point2[] = [];
        for (let i = 0; i < numSegments; i++) {
          const angle = (i / numSegments) * Math.PI * 2;
          points.push({
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius
          });
        }
        
        backedHoles.push({
          id: `${element.id}_frame_hole_${lineIdx}_${holeIdx}`,
          loop: { segments: [] }, // We don't have segments for this generated hole
          polygon: { points },
          role: 'hole',
          depth: element.perimeter.depth + 1,
          parentId: element.perimeter.id
        });
      });
    });
  }

  // Marker policy (down-arrow)
  // Determine anchor point inside perimeter, outside holes
  let cx = 0, cy = 0;
  const pts = backedPerimeter.polygon.points;
  if (pts.length > 0) {
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= pts.length;
    cy /= pts.length;
  }
  const anchor = pts.length > 0 ? { x: cx, y: cy } : null;

  if (!anchor) {
    diagnostics.push({
      code: 'marker_anchor_not_found',
      severity: 'warning',
      message: `No valid anchor found for marker on ${element.perimeter.id}`,
      borderId: element.perimeter.id,
      actionStage: 'backing_build',
      repairApplied: false
    });
  } else {
    // Add down arrow marker (pointing towards positive Y)
    const arrowSize = 10;
    const arrowPoints: Point2[] = [
      { x: anchor.x, y: anchor.y + arrowSize }, // tip
      { x: anchor.x + arrowSize / 2, y: anchor.y }, // right corner
      { x: anchor.x + arrowSize / 4, y: anchor.y }, // right inner
      { x: anchor.x + arrowSize / 4, y: anchor.y - arrowSize }, // right top
      { x: anchor.x - arrowSize / 4, y: anchor.y - arrowSize }, // left top
      { x: anchor.x - arrowSize / 4, y: anchor.y }, // left inner
      { x: anchor.x - arrowSize / 2, y: anchor.y } // left corner
    ];

    backedHoles.push({
      id: `${element.id}_marker_arrow`,
      loop: { segments: [] },
      polygon: { points: arrowPoints },
      role: 'hole',
      depth: element.perimeter.depth + 1,
      parentId: element.perimeter.id
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
