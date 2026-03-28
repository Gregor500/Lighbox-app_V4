import { Border, Element, Document, Diagnostic, Tolerances, DEFAULT_TOLERANCES, CornerTrace, Point2 } from './types';
import { buildEnclosureTree, buildElementOwnershipModel } from './classification';
import { buildGlass } from './builders/glass';
import { buildBacking } from './builders/backing';
import { buildVinyl } from './builders/vinyl';
import { buildKulg } from './builders/kulg';
import { decodeSVGPath } from './decode';

export interface PipelineConfig {
  glassOffset: number;
  backingOffset: number;
  chamferLength: number;
  filletRadius: number;
  tolerances: Tolerances;
  frameLines?: { start: Point2, end: Point2 }[];
  frameMaterialThickness?: number;
  frameHoleSpacing?: number;
  frameHoleDiameter?: number;
}

export interface PipelineResult {
  document: Document;
  glass: Element[];
  backing: Element[];
  vinyl: Element[];
  kulg: Element[];
  diagnostics: Diagnostic[];
  cornerTraces: CornerTrace[];
}

export function runPipeline(borders: Border[], config: PipelineConfig): PipelineResult {
  const diagnostics: Diagnostic[] = [];
  const cornerTraces: CornerTrace[] = [];

  // 1. Decode + normalize segments (assumed done before passing borders)
  // 2. Validate loops (assumed done before passing borders)

  // 3. Build enclosure tree
  const classifiedBorders = buildEnclosureTree(borders, config.tolerances, diagnostics);

  // 4. Build element ownership model
  const elements = buildElementOwnershipModel(classifiedBorders, diagnostics);

  // 5. Derive per-output geometry
  const glassElements: Element[] = [];
  elements.forEach(el => {
    const res = buildGlass(el, config.glassOffset, config.chamferLength, config.tolerances, diagnostics);
    cornerTraces.push(...res.traces);
    glassElements.push(...res.elements);
  });
  
  const backingElements = elements.map(el => {
    const res = buildBacking(el, config.backingOffset, config.chamferLength, config.tolerances, diagnostics);
    cornerTraces.push(...res.traces);
    return res.element;
  });
  
  const vinylElements = elements.map(el => {
    const res = buildVinyl(el, config.filletRadius, config.tolerances, diagnostics);
    cornerTraces.push(...res.traces);
    return res.element;
  });
  
  // Külg uses Backing output geometry
  const kulgElements = elements.map((el, i) => buildKulg(el, backingElements[i], diagnostics));

  // 6. Apply placement/nesting policy (if enabled)
  // 7. Emit export geometry + diagnostics

  return {
    document: { elements, diagnostics },
    glass: glassElements,
    backing: backingElements,
    vinyl: vinylElements,
    kulg: kulgElements,
    diagnostics,
    cornerTraces
  };
}
