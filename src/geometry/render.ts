import { Border, Point2 } from './types';

export function drawBorders(ctx: CanvasRenderingContext2D, borders: Border[]) {
  borders.forEach(border => {
    const pts = border.polygon.points;
    if (pts.length < 3) return;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();

    if (border.role === 'perimeter') {
      ctx.strokeStyle = '#3b82f6'; // blue-500
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.fill();
    } else if (border.role === 'hole') {
      ctx.strokeStyle = '#22c55e'; // green-500
      ctx.lineWidth = 2;
      ctx.stroke();
      // Don't fill holes to show they are cutouts
    } else {
      ctx.strokeStyle = '#9ca3af'; // gray-400
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });
}
