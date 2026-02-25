import { Border, Element, Document, Diagnostic, Tolerances } from './types';
import { polygonArea, polygonContainsPolygon } from './math';

export function buildEnclosureTree(borders: Border[], tol: Tolerances, diagnostics: Diagnostic[]): Border[] {
  // 1. Calculate depth for each border
  for (let i = 0; i < borders.length; i++) {
    let depth = 0;
    for (let j = 0; j < borders.length; j++) {
      if (i === j) continue;
      if (polygonContainsPolygon(borders[j].polygon, borders[i].polygon, tol)) {
        depth++;
      }
    }
    borders[i].depth = depth;
    borders[i].role = (depth % 2 === 0) ? 'perimeter' : 'hole';
  }

  // 2. Assign parent
  for (let i = 0; i < borders.length; i++) {
    if (borders[i].depth === 0) {
      borders[i].parentId = null;
      continue;
    }

    let parent: Border | null = null;
    let minArea = Infinity;

    for (let j = 0; j < borders.length; j++) {
      if (i === j) continue;
      if (borders[j].depth === borders[i].depth - 1) {
        if (polygonContainsPolygon(borders[j].polygon, borders[i].polygon, tol)) {
          const area = Math.abs(polygonArea(borders[j].polygon));
          if (area < minArea) {
            minArea = area;
            parent = borders[j];
          }
        }
      }
    }

    if (parent) {
      borders[i].parentId = parent.id;
    } else {
      diagnostics.push({
        code: 'invalid_orphan',
        severity: 'error',
        message: `No parent found for depth>0 loop ${borders[i].id}`,
        borderId: borders[i].id,
        actionStage: 'classification',
        repairApplied: false
      });
    }
  }

  return borders;
}

export function buildElementOwnershipModel(borders: Border[], diagnostics: Diagnostic[]): Element[] {
  const elements: Element[] = [];
  const roots = borders.filter(b => b.depth === 0);

  for (const root of roots) {
    const holes = borders.filter(b => b.parentId === root.id && b.role === 'hole');
    elements.push({
      id: `elem_${root.id}`,
      perimeter: root,
      holes: holes
    });
  }

  // Verify ownership invariants
  for (const b of borders) {
    if (b.role === 'hole' && !b.parentId) {
      diagnostics.push({
        code: 'hole_detachment',
        severity: 'error',
        message: `Hole ${b.id} detached from owner perimeter`,
        borderId: b.id,
        actionStage: 'ownership',
        repairApplied: false
      });
    }
  }

  return elements;
}
