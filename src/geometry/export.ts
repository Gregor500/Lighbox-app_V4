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
  cutDepth: number | string;
  glassType: string;
  materialColor: string;
  workArea?: { width: number; height: number } | null;
  attachmentTrimCutDepth?: number | string;
  attachmentTrimRouterBitDiameter?: number;
  sideDepth?: number;
  sideThickness?: number;
  frameMaterialThickness?: number;
  frameHoleSpacing?: number;
  frameHoleDiameter?: number;
}

export function exportToDXF(elements: Element[], params?: ExportParams): string {
  let str = `  0\nSECTION\n  2\nENTITIES\n`;
  
  // Add manufacturing text if params are provided
  if (params && elements.length > 0) {
    let minX = Infinity;
    let maxY = -Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    for (const el of elements) {
      for (const pt of el.perimeter.polygon.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
      }
    }

    let workAreaMinX = minX;
    let workAreaMaxY = maxY;

    if (params.workArea) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      workAreaMinX = cx - params.workArea.width / 2;
      const workAreaMaxX = cx + params.workArea.width / 2;
      const workAreaMinY = cy - params.workArea.height / 2;
      workAreaMaxY = cy + params.workArea.height / 2;
      
      // Draw work area rectangle
      const workAreaPoly = {
        points: [
          { x: workAreaMinX, y: workAreaMinY },
          { x: workAreaMaxX, y: workAreaMinY },
          { x: workAreaMaxX, y: workAreaMaxY },
          { x: workAreaMinX, y: workAreaMaxY }
        ]
      };
      str += polylineToDxf(workAreaPoly, 'WorkArea');
    }
    
    const textLines = [
      `Type: ${params.type.toUpperCase()}`,
      `Router Bit Diameter: ${params.routerBitDiameter}mm`,
      `Material Thickness: ${params.materialThickness}mm`,
      `Cut Depth: ${params.cutDepth}${typeof params.cutDepth === 'number' ? 'mm' : ''}`,
      `Glass Type: ${params.glassType}`,
      `Material Color: ${params.materialColor}`
    ];

    if (params.attachmentTrimCutDepth !== undefined) {
      textLines.push(`Attachment Trim Cut Depth: ${params.attachmentTrimCutDepth}${typeof params.attachmentTrimCutDepth === 'number' ? 'mm' : ''}`);
    }
    if (params.attachmentTrimRouterBitDiameter !== undefined) {
      textLines.push(`Attachment Trim Router Bit Dia: ${params.attachmentTrimRouterBitDiameter}mm`);
    }
    if (params.sideDepth !== undefined) {
      textLines.push(`Side Depth: ${params.sideDepth}mm`);
    }
    if (params.sideThickness !== undefined) {
      textLines.push(`Side Thickness: ${params.sideThickness}mm`);
    }
    if (params.frameMaterialThickness !== undefined) {
      textLines.push(`Frame Material Thickness: ${params.frameMaterialThickness}mm`);
    }
    if (params.frameHoleSpacing !== undefined) {
      textLines.push(`Frame Hole Spacing: ${params.frameHoleSpacing}mm`);
    }
    if (params.frameHoleDiameter !== undefined) {
      textLines.push(`Frame Hole Diameter: ${params.frameHoleDiameter}mm`);
    }

    let currentY = workAreaMaxY + 20; // Start above the geometry or work area
    const textHeight = 5;

    // Draw from bottom to top so it doesn't overlap the work area
    for (let i = textLines.length - 1; i >= 0; i--) {
      str += `  0\nTEXT\n  8\nManufacturing_Info\n 10\n${workAreaMinX.toFixed(4)}\n 20\n${currentY.toFixed(4)}\n 40\n${textHeight}\n  1\n${textLines[i]}\n`;
      currentY += (textHeight * 1.5);
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
