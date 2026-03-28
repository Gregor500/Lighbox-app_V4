import { Element, Point2, PolygonApprox, Border, Diagnostic } from '../types';
import { calculateHole1DPositions } from '../holePlacement';
import { offsetPolygon } from '../offset';

export interface RearFrameParams {
  inset: number;
  profileWidth: number;
  targetSpacing: number;
}

export interface RearFrameComponent {
  id: string;
  outerOutline: PolygonApprox[];
  innerOutline: PolygonApprox[];
  centerline: PolygonApprox[];
  holes: Point2[];
}

function getAngle(p1: Point2, p2: Point2, p3: Point2): number {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const det = v1.x * v2.y - v1.y * v2.x;
  return Math.atan2(det, dot);
}

function splitPolygonIntoPieces(poly: PolygonApprox, angleThresholdDeg: number = 10): Point2[][] {
  const pts = poly.points;
  if (pts.length < 3) return [pts];

  const sharpIndices: number[] = [];
  const thresholdRad = (angleThresholdDeg * Math.PI) / 180;

  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];
    
    // Angle between prev->curr and curr->next
    const angle = Math.abs(getAngle(prev, curr, next));
    // A straight line has an angle of PI. Deviation from straight is |PI - angle|
    const deviation = Math.abs(Math.PI - angle);
    
    if (deviation > thresholdRad) {
      sharpIndices.push(i);
    }
  }

  if (sharpIndices.length === 0) {
    // No sharp corners (e.g., a circle), just split at index 0
    const piece = [...pts, pts[0]];
    return [piece];
  }

  const pieces: Point2[][] = [];
  for (let i = 0; i < sharpIndices.length; i++) {
    const startIdx = sharpIndices[i];
    const endIdx = sharpIndices[(i + 1) % sharpIndices.length];
    
    const piece: Point2[] = [];
    if (startIdx < endIdx) {
      for (let j = startIdx; j <= endIdx; j++) {
        piece.push(pts[j]);
      }
    } else if (startIdx > endIdx) {
      for (let j = startIdx; j < pts.length; j++) {
        piece.push(pts[j]);
      }
      for (let j = 0; j <= endIdx; j++) {
        piece.push(pts[j]);
      }
    } else {
      // startIdx === endIdx, which means there is only 1 sharp corner
      for (let j = startIdx; j < pts.length; j++) {
        piece.push(pts[j]);
      }
      for (let j = 0; j <= endIdx; j++) {
        piece.push(pts[j]);
      }
    }
    pieces.push(piece);
  }

  return pieces;
}

function placeHolesOnPiece(piece: Point2[], profileWidth: number, targetSpacing: number): Point2[] {
  if (piece.length < 2) return [];

  // Calculate total length
  let totalL = 0;
  const segmentLengths: number[] = [];
  for (let i = 0; i < piece.length - 1; i++) {
    const dx = piece[i+1].x - piece[i].x;
    const dy = piece[i+1].y - piece[i].y;
    const L = Math.sqrt(dx * dx + dy * dy);
    segmentLengths.push(L);
    totalL += L;
  }

  if (totalL < 1e-6) return [];

  const distances = calculateHole1DPositions(totalL, profileWidth, targetSpacing);
  const holes: Point2[] = [];

  for (const d of distances) {
    let currentL = 0;
    for (let i = 0; i < piece.length - 1; i++) {
      const L = segmentLengths[i];
      if (currentL + L >= d - 1e-6 || i === piece.length - 2) {
        // Hole is on this segment
        const t = (d - currentL) / L;
        const clampedT = Math.max(0, Math.min(1, t)); // Clamp to [0, 1] just in case
        holes.push({
          x: piece[i].x + (piece[i+1].x - piece[i].x) * clampedT,
          y: piece[i].y + (piece[i+1].y - piece[i].y) * clampedT
        });
        break;
      }
      currentL += L;
    }
  }

  return holes;
}

export function buildRearFrame(backingElement: Element, params: RearFrameParams, diagnostics: Diagnostic[]): { rearFrame: RearFrameComponent, mountingHoles: Point2[] } {
  const allMountingHoles: Point2[] = [];
  
  // 1. Outer outline: offset backing perimeter inward by inset
  const outerOutlines = offsetPolygon(backingElement.perimeter.polygon, -params.inset);
  
  // 2. Inner outline: offset outer outline inward by profileWidth
  const innerOutlines: PolygonApprox[] = [];
  for (const outer of outerOutlines) {
    innerOutlines.push(...offsetPolygon(outer, -params.profileWidth));
  }

  // 3. Centerline: offset outer outline inward by profileWidth / 2
  const centerlines: PolygonApprox[] = [];
  for (const outer of outerOutlines) {
    centerlines.push(...offsetPolygon(outer, -(params.profileWidth / 2)));
  }

  const frameHoles: Point2[] = [];

  // 4. Place holes along the centerline
  for (const centerline of centerlines) {
    const pieces = splitPolygonIntoPieces(centerline, 10); // 10 degrees threshold for sharp corners
    for (const piece of pieces) {
      const holes = placeHolesOnPiece(piece, params.profileWidth, params.targetSpacing);
      frameHoles.push(...holes);
      allMountingHoles.push(...holes);
    }
  }

  const rearFrame: RearFrameComponent = {
    id: backingElement.id + '_rear_frame',
    outerOutline: outerOutlines,
    innerOutline: innerOutlines,
    centerline: centerlines,
    holes: frameHoles
  };

  return { rearFrame, mountingHoles: allMountingHoles };
}
