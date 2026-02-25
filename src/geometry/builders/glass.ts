import { Element, Diagnostic, Tolerances, CornerTrace } from '../types';
import { offsetPolygon } from '../offset';
import { analyzeCorners } from '../corners';

export function buildGlass(element: Element, glassOffset: number, tol: Tolerances, diagnostics: Diagnostic[]): { element: Element, traces: CornerTrace[] } {
  const traces: CornerTrace[] = [];
  
  // Analyze corners
  traces.push(...analyzeCorners(element.perimeter, tol, 'glass'));
  element.holes.forEach(hole => {
    traces.push(...analyzeCorners(hole, tol, 'glass'));
  });
  // Perimeter offset inward by glass_offset
  const perimeterOffset = offsetPolygon(element.perimeter.polygon, -glassOffset);
  
  // Hole offset outward by glass_offset
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
  }

  // Mirror final Glass geometry exactly once (X-axis mirror)
  const mirroredPerimeter = perimeterOffset[0] ? {
    ...element.perimeter,
    polygon: { points: perimeterOffset[0].points.map(pt => ({ x: -pt.x, y: pt.y })) }
  } : element.perimeter;

  const mirroredHoles = holesOffset.map((ho, i) => ho[0] ? {
    ...element.holes[i],
    polygon: { points: ho[0].points.map(pt => ({ x: -pt.x, y: pt.y })) }
  } : element.holes[i]);

  return {
    element: {
      ...element,
      perimeter: mirroredPerimeter,
      holes: mirroredHoles
    },
    traces
  };
}
