import { Element, PolygonApprox } from './types';

function polylineToDxf(poly: PolygonApprox, layer: string): string {
  let str = `  0\nLWPOLYLINE\n  8\n${layer}\n 90\n${poly.points.length}\n 70\n1\n`; // 70=1 is closed
  for (const pt of poly.points) {
    str += ` 10\n${pt.x.toFixed(4)}\n 20\n${pt.y.toFixed(4)}\n`;
  }
  return str;
}

export function exportToDXF(elements: Element[]): string {
  let str = `  0\nSECTION\n  2\nENTITIES\n`;
  for (const el of elements) {
    str += polylineToDxf(el.perimeter.polygon, 'Perimeter');
    for (const hole of el.holes) {
      str += polylineToDxf(hole.polygon, 'Hole');
    }
  }
  str += `  0\nENDSEC\n  0\nEOF\n`;
  return str;
}
