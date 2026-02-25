import { Element, Diagnostic, Tolerances, CornerTrace } from '../types';
import { analyzeCorners } from '../corners';

export function buildVinyl(element: Element, glassTera: number, tol: Tolerances, diagnostics: Diagnostic[]): { element: Element, traces: CornerTrace[] } {
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
  const filletRadius = glassTera / 2;
  
  // Simplified fillet application
  // In a full implementation, we would calculate the fillet arc for each corner
  // and check if it fits within the edge length constraints.
  
  let filletClamped = false;
  if (filletClamped) {
    diagnostics.push({
      code: 'corner_fillet_clamped',
      severity: 'warning',
      message: `Corner fillet clamped due to edge length constraints on ${element.perimeter.id}`,
      borderId: element.perimeter.id,
      actionStage: 'vinyl_build',
      repairApplied: true
    });
  }

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
