import { Element, Diagnostic, Tolerances, CornerTrace } from '../types';
import { offsetPolygon } from '../offset';
import { analyzeCorners } from '../corners';

export function buildBacking(element: Element, glassOffset: number, tol: Tolerances, diagnostics: Diagnostic[]): { element: Element, traces: CornerTrace[] } {
  const traces: CornerTrace[] = [];
  
  // Analyze corners
  traces.push(...analyzeCorners(element.perimeter, tol, 'backing'));
  element.holes.forEach(hole => {
    traces.push(...analyzeCorners(hole, tol, 'backing'));
  });
  // Perimeter offset inward by glass_offset
  const perimeterOffset = offsetPolygon(element.perimeter.polygon, -glassOffset);
  
  // Hole offset outward by glass_offset
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
  }

  // Not mirrored
  const backedPerimeter = perimeterOffset[0] ? {
    ...element.perimeter,
    polygon: perimeterOffset[0]
  } : element.perimeter;

  const backedHoles = holesOffset.map((ho, i) => ho[0] ? {
    ...element.holes[i],
    polygon: ho[0]
  } : element.holes[i]);

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
