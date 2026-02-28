import { Element, PolygonApprox } from './types';

function polylineToDxf(poly: PolygonApprox, layer: string): string {
  let str = `  0\nLWPOLYLINE\n  8\n${layer}\n 90\n${poly.points.length}\n 70\n1\n`; // 70=1 is closed
  for (const pt of poly.points) {
    str += ` 10\n${pt.x.toFixed(4)}\n 20\n${pt.y.toFixed(4)}\n`;
  }
  return str;
}

export interface ExportParams {
  type: string;
  routerBitDiameter: number;
  materialThickness: number;
  cutDepth: number;
  glassType: string;
  materialColor: string;
}

export function exportToDXF(elements: Element[], params?: ExportParams): string {
  let str = `  0\nSECTION\n  2\nENTITIES\n`;
  
  // Add manufacturing text if params are provided
  if (params && elements.length > 0) {
    // Find a reasonable place to put the text (e.g., near the first element)
    const firstPoly = elements[0].perimeter.polygon;
    let minX = Infinity;
    let maxY = -Infinity;
    for (const pt of firstPoly.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    
    const textLines = [
      `Type: ${params.type.toUpperCase()}`,
      `Router Bit Diameter: ${params.routerBitDiameter}mm`,
      `Material Thickness: ${params.materialThickness}mm`,
      `Cut Depth: ${params.cutDepth}mm`,
      `Glass Type: ${params.glassType}`,
      `Material Color: ${params.materialColor}`
    ];

    let currentY = maxY + 20; // Start above the geometry
    const textHeight = 5;

    for (const line of textLines) {
      str += `  0\nTEXT\n  8\nManufacturing_Info\n 10\n${minX.toFixed(4)}\n 20\n${currentY.toFixed(4)}\n 40\n${textHeight}\n  1\n${line}\n`;
      currentY -= (textHeight * 1.5);
    }
  }

  for (const el of elements) {
    str += polylineToDxf(el.perimeter.polygon, 'Perimeter');
    for (const hole of el.holes) {
      str += polylineToDxf(hole.polygon, 'Hole');
    }
  }
  str += `  0\nENDSEC\n  0\nEOF\n`;
  return str;
}
