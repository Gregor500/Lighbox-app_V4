import { Element, Diagnostic, Tolerances } from '../types';

export function buildKulg(element: Element, backingGeometry: Element, diagnostics: Diagnostic[]): Element {
  // Use same shape outlines as Backing output geometry
  const kulgPerimeter = { ...backingGeometry.perimeter };
  const kulgHoles = backingGeometry.holes.map(h => ({ ...h }));

  // Not mirrored
  // Preserve owner root and hole relationship metadata
  return {
    ...element,
    perimeter: kulgPerimeter,
    holes: kulgHoles
  };
}
