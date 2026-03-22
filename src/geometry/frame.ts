import { Point2 } from './types';

export interface FrameLine {
  start: Point2;
  end: Point2;
}

export function calculateHolesForLine(line: FrameLine, materialThickness: number, holeSpacing: number): Point2[] {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  const minEdgeDist = 0.5 * materialThickness;
  if (length < 2 * minEdgeDist) return []; // Line too short
  
  const usableLength = length - 2 * minEdgeDist;
  
  let numSpaces = Math.round(usableLength / holeSpacing);
  if (numSpaces < 1) numSpaces = 1;
  
  const actualSpacing = usableLength / numSpaces;
  
  const holes: Point2[] = [];
  const dirX = dx / length;
  const dirY = dy / length;
  
  for (let i = 0; i <= numSpaces; i++) {
    const dist = minEdgeDist + i * actualSpacing;
    holes.push({
      x: line.start.x + dirX * dist,
      y: line.start.y + dirY * dist
    });
  }
  
  return holes;
}
