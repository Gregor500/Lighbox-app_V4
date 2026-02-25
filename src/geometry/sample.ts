import { Border, Point2, PolygonApprox, DEFAULT_TOLERANCES } from './types';
import { decodeSVGPath } from './decode';

export function createSampleRoot(id: string, width: number, height: number): Border {
  const points: Point2[] = [
    { x: 0, y: 0 },
    { x: 0, y: height },
    { x: width, y: height },
    { x: width, y: 0 }
  ];
  
  return {
    id,
    loop: { segments: [{ type: 'line', points }] },
    polygon: { points },
    role: 'unknown',
    depth: -1,
    parentId: null
  };
}

export function createSampleHole(id: string, cx: number, cy: number, outerRadius: number, innerRadius: number): Border {
  const points: Point2[] = [];
  const numPoints = 8;
  for (let i = 0; i < numPoints * 2; i++) {
    const angle = (i * Math.PI) / numPoints;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle)
    });
  }

  return {
    id,
    loop: { segments: [{ type: 'line', points }] },
    polygon: { points },
    role: 'unknown',
    depth: -1,
    parentId: null
  };
}

export function getSampleBorders(): Border[] {
  const r0 = createSampleRoot('R0', 300, 150);
  const h0 = createSampleHole('H0', 150, 75, 40, 20);

  return [r0, h0];
}
