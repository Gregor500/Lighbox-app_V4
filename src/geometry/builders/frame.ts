import { Element, FrameComponent, Point2, LineSegment, PolygonApprox, Border } from '../types';
import { calculateHole1DPositions } from '../holePlacement';

export interface FrameParams {
  profileDepth: number;
  flangeWidth: number;
  targetSpacing: number;
}

export function buildFrame(backingElement: Element, params: FrameParams): { frames: FrameComponent[], mountingHoles: Point2[] } {
  const frames: FrameComponent[] = [];
  const allMountingHoles: Point2[] = [];

  const processBorder = (border: Border, isHole: boolean) => {
    const pts = border.polygon.points;
    if (pts.length < 3) return;

    let totalLength = 0;
    const bendMarks: LineSegment[] = [];
    const stripHoles: Point2[] = [];
    const backingHoles: Point2[] = [];

    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const L = Math.sqrt(dx * dx + dy * dy);
      
      if (L < 1e-6) continue;

      const v_dir = { x: dx / L, y: dy / L };
      
      // In SVG coordinates (Y down), CCW (perimeter) has interior to the left: (dy, -dx)
      // CW (holes) has interior to the right: (-dy, dx)
      const n_x = isHole ? -v_dir.y : v_dir.y;
      const n_y = isHole ? v_dir.x : -v_dir.x;

      const positions = calculateHole1DPositions(L, params.profileDepth, params.targetSpacing);

      for (const d of positions) {
        // Strip hole (placed in the center of the flange)
        stripHoles.push({
          x: totalLength + d,
          y: params.profileDepth + params.flangeWidth / 2 
        });

        // Backing hole
        const p_edge = {
          x: p1.x + v_dir.x * d,
          y: p1.y + v_dir.y * d
        };
        backingHoles.push({
          x: p_edge.x + n_x * (params.flangeWidth / 2),
          y: p_edge.y + n_y * (params.flangeWidth / 2)
        });
      }

      totalLength += L;
      
      // Bend mark at the end of the segment (except the very last one which wraps to start)
      if (i < pts.length - 1) {
        bendMarks.push({
          p1: { x: totalLength, y: 0 },
          p2: { x: totalLength, y: params.profileDepth + params.flangeWidth }
        });
      }
    }

    // Strip outline
    const h = params.profileDepth + params.flangeWidth;
    const stripOutline: PolygonApprox = {
      points: [
        { x: 0, y: 0 },
        { x: totalLength, y: 0 },
        { x: totalLength, y: h },
        { x: 0, y: h }
      ]
    };

    frames.push({
      id: border.id + '_frame',
      stripOutline,
      bendMarks,
      holes: stripHoles,
      totalLength
    });

    allMountingHoles.push(...backingHoles);
  };

  processBorder(backingElement.perimeter, false);
  for (const hole of backingElement.holes) {
    processBorder(hole, true);
  }

  return { frames, mountingHoles: allMountingHoles };
}
