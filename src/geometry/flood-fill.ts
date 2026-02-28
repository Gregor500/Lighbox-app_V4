import { Point2, Border } from './types';

export function floodFillAndTrace(
  borders: Border[],
  clickPoint: Point2,
  resolution: number = 2000
): Point2[] | null {
  // 1. Calculate bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of borders) {
    for (const p of b.polygon.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  // Add padding
  const pad = (maxX - minX) * 0.05 + 1;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;

  const width = maxX - minX;
  const height = maxY - minY;
  const scale = resolution / Math.max(width, height);

  const canvasW = Math.ceil(width * scale);
  const canvasH = Math.ceil(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // 2. Draw all lines
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);
  
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1; // 1 pixel line width
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const b of borders) {
    for (const seg of b.loop.segments) {
      if (seg.points.length < 2) continue;
      ctx.beginPath();
      const first = seg.points[0];
      ctx.moveTo((first.x - minX) * scale, (first.y - minY) * scale);
      for (let i = 1; i < seg.points.length; i++) {
        const p = seg.points[i];
        ctx.lineTo((p.x - minX) * scale, (p.y - minY) * scale);
      }
      if (seg.type === 'circle' || b.polygon.points.length > 2) {
        ctx.closePath();
      }
      ctx.stroke();
    }
  }

  // 3. Flood fill
  const startX = Math.floor((clickPoint.x - minX) * scale);
  const startY = Math.floor((clickPoint.y - minY) * scale);

  if (startX < 0 || startX >= canvasW || startY < 0 || startY >= canvasH) return null;

  const imageData = ctx.getImageData(0, 0, canvasW, canvasH);
  const data = imageData.data;
  
  const getPixel = (x: number, y: number) => {
    const i = (y * canvasW + x) * 4;
    return data[i]; // Just check Red channel (0 = black line, 255 = white background)
  };

  if (getPixel(startX, startY) < 128) return null; // Clicked on a line

  const filled = new Uint8Array(canvasW * canvasH);
  const queue: [number, number][] = [[startX, startY]];
  filled[startY * canvasW + startX] = 1;

  let minFx = startX, minFy = startY, maxFx = startX, maxFy = startY;

  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    
    if (x < minFx) minFx = x;
    if (y < minFy) minFy = y;
    if (x > maxFx) maxFx = x;
    if (y > maxFy) maxFy = y;

    // Check neighbors
    const neighbors = [
      [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < canvasW && ny >= 0 && ny < canvasH) {
        const idx = ny * canvasW + nx;
        if (filled[idx] === 0 && getPixel(nx, ny) > 128) {
          filled[idx] = 1;
          queue.push([nx, ny]);
        }
      }
    }
  }

  // 4. Trace contour (Moore neighborhood or simple boundary detection)
  // Find a starting boundary pixel
  let startBx = -1, startBy = -1;
  for (let y = minFy; y <= maxFy; y++) {
    for (let x = minFx; x <= maxFx; x++) {
      if (filled[y * canvasW + x] === 1) {
        // Check if it's on the boundary (has an unfilled neighbor)
        if (
          x === 0 || x === canvasW - 1 || y === 0 || y === canvasH - 1 ||
          filled[y * canvasW + (x - 1)] === 0 ||
          filled[y * canvasW + (x + 1)] === 0 ||
          filled[(y - 1) * canvasW + x] === 0 ||
          filled[(y + 1) * canvasW + x] === 0
        ) {
          startBx = x;
          startBy = y;
          break;
        }
      }
    }
    if (startBx !== -1) break;
  }

  if (startBx === -1) return null;

  // Trace boundary
  const contour: Point2[] = [];
  let currX = startBx;
  let currY = startBy;
  let dir = 0; // 0: right, 1: down, 2: left, 3: up
  
  // Directions: right, down, left, up
  const dx = [1, 0, -1, 0];
  const dy = [0, 1, 0, -1];

  let steps = 0;
  const maxSteps = canvasW * canvasH;

  do {
    contour.push({
      x: minX + currX / scale,
      y: minY + currY / scale
    });

    // Turn left
    dir = (dir + 3) % 4;
    
    let found = false;
    for (let i = 0; i < 4; i++) {
      const nx = currX + dx[dir];
      const ny = currY + dy[dir];
      
      if (nx >= 0 && nx < canvasW && ny >= 0 && ny < canvasH && filled[ny * canvasW + nx] === 1) {
        currX = nx;
        currY = ny;
        found = true;
        break;
      }
      // Turn right
      dir = (dir + 1) % 4;
    }
    
    if (!found) break; // Isolated pixel
    steps++;
  } while ((currX !== startBx || currY !== startBy) && steps < maxSteps);

  // 5. Simplify contour
  return simplifyPolygon(contour, 1.0 / scale);
}

function simplifyPolygon(points: Point2[], epsilon: number): Point2[] {
  if (points.length <= 2) return points;
  
  let dmax = 0;
  let index = 0;
  const end = points.length - 1;
  
  for (let i = 1; i < end; i++) {
    const d = pointLineDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }
  
  if (dmax > epsilon) {
    const recResults1 = simplifyPolygon(points.slice(0, index + 1), epsilon);
    const recResults2 = simplifyPolygon(points.slice(index), epsilon);
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else {
    return [points[0], points[end]];
  }
}

function pointLineDistance(p: Point2, a: Point2, b: Point2): number {
  const num = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x);
  const den = Math.hypot(b.y - a.y, b.x - a.x);
  return den === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : num / den;
}
