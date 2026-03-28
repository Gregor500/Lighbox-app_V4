import DxfParser from 'dxf-parser';
import { Border, Point2, Tolerances, Diagnostic } from './types';

export function decodeSVGPath(d: string, id: string, tol: Tolerances, diagnostics: Diagnostic[]): Border | null {
  const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g);
  if (!commands) return null;

  const points: Point2[] = [];
  let currentPt: Point2 = { x: 0, y: 0 };

  for (const cmd of commands) {
    const type = cmd[0];
    const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));

    if (type === 'M' || type === 'm') {
      for (let i = 0; i < args.length; i += 2) {
        if (type === 'm' && i > 0) {
          currentPt = { x: currentPt.x + args[i], y: currentPt.y + args[i+1] };
        } else {
          currentPt = { x: args[i], y: args[i+1] };
        }
        points.push(currentPt);
      }
    } else if (type === 'L' || type === 'l') {
      for (let i = 0; i < args.length; i += 2) {
        if (type === 'l') {
          currentPt = { x: currentPt.x + args[i], y: currentPt.y + args[i+1] };
        } else {
          currentPt = { x: args[i], y: args[i+1] };
        }
        points.push(currentPt);
      }
    } else if (type === 'Z' || type === 'z') {
      // closed
    } else {
      diagnostics.push({
        code: 'unsupported_entity',
        severity: 'warning',
        message: `Unsupported SVG command: ${type}`,
        actionStage: 'decode',
        repairApplied: false
      });
    }
  }

  if (points.length < 3) return null;

  return {
    id,
    loop: { segments: [{ type: 'line', points: [...points] }] },
    polygon: { points },
    role: 'unknown',
    depth: -1,
    parentId: null
  };
}

function getBulgeArcPoints(p1: Point2, p2: Point2, bulge: number): Point2[] {
  if (!bulge || bulge === 0) return [p1];
  
  const theta = 4 * Math.atan(bulge);
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (dist === 0) return [p1];
  
  const radius = Math.abs(dist / (2 * Math.sin(theta / 2)));
  const steps = Math.min(1024, Math.max(16, Math.ceil(radius * Math.abs(theta))));
  
  const chordMid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const chordDir = { x: (p2.x - p1.x) / dist, y: (p2.y - p1.y) / dist };
  const chordNorm = { x: -chordDir.y, y: chordDir.x }; // CCW normal
  
  const centerDist = dist / (2 * Math.tan(theta / 2));
  const center = {
    x: chordMid.x + chordNorm.x * centerDist,
    y: chordMid.y + chordNorm.y * centerDist
  };
  
  let startAngle = Math.atan2(p1.y - center.y, p1.x - center.x);
  let endAngle = Math.atan2(p2.y - center.y, p2.x - center.x);
  
  if (bulge > 0 && endAngle < startAngle) endAngle += 2 * Math.PI;
  if (bulge < 0 && endAngle > startAngle) endAngle -= 2 * Math.PI;
  
  const points: Point2[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / steps);
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    });
  }
  return points;
}

export function decodeDXF(dxfString: string, tol: Tolerances, diagnostics: Diagnostic[]): Border[] {
  const parser = new DxfParser();
  let parsed;
  try {
    parsed = parser.parseSync(dxfString);
  } catch (e: any) {
    diagnostics.push({
      code: 'dxf_parse_error',
      severity: 'error',
      message: `Failed to parse DXF: ${e.message}`,
      actionStage: 'decode',
      repairApplied: false
    });
    return [];
  }

  if (!parsed || !parsed.entities) return [];

  const borders: Border[] = [];
  let idCounter = 0;
  const prefix = Math.random().toString(36).substring(2, 7);

  // Pool of disconnected segments (arrays of points)
  const segments: Point2[][] = [];

  for (const entity of parsed.entities) {
    if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
      const vertices = entity.vertices;
      const polyPoints: Point2[] = [];
      
      for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const p1 = { x: v1.x, y: v1.y };
        
        if (v1.bulge && v1.bulge !== 0) {
          // If it's the last vertex and not closed, don't connect to first
          if (i === vertices.length - 1 && !entity.shape) {
            polyPoints.push(p1);
            continue;
          }
          
          const v2 = vertices[(i + 1) % vertices.length];
          const p2 = { x: v2.x, y: v2.y };
          
          const arcPoints = getBulgeArcPoints(p1, p2, v1.bulge);
          polyPoints.push(...arcPoints.slice(0, -1));
        } else {
          polyPoints.push(p1);
        }
      }
      
      if (entity.shape) {
        if (polyPoints.length > 2) {
          borders.push({
            id: `dxf_${prefix}_${idCounter++}`,
            loop: { segments: [{ type: 'line', points: [...polyPoints] }] },
            polygon: { points: polyPoints },
            role: 'unknown',
            depth: -1,
            parentId: null
          });
        }
      } else {
        if (polyPoints.length > 1) {
          segments.push(polyPoints);
        }
      }
    } else if (entity.type === 'CIRCLE') {
      const points: Point2[] = [];
      const steps = Math.min(1024, Math.max(32, Math.ceil(entity.radius * 2 * Math.PI)));
      for (let i = 0; i < steps; i++) {
        const angle = (i * 2 * Math.PI) / steps;
        points.push({
          x: entity.center.x + entity.radius * Math.cos(angle),
          y: entity.center.y + entity.radius * Math.sin(angle)
        });
      }
      borders.push({
        id: `dxf_${prefix}_${idCounter++}`,
        loop: { segments: [{ type: 'circle', points: [...points] }] },
        polygon: { points },
        role: 'unknown',
        depth: -1,
        parentId: null
      });
    } else if (entity.type === 'LINE') {
      segments.push([
        { x: entity.vertices[0].x, y: entity.vertices[0].y },
        { x: entity.vertices[1].x, y: entity.vertices[1].y }
      ]);
    } else if (entity.type === 'ARC') {
      const points: Point2[] = [];
      let start = entity.startAngle;
      let end = entity.endAngle;
      if (end < start) end += 2 * Math.PI;
      const steps = Math.min(1024, Math.max(16, Math.ceil(entity.radius * Math.abs(end - start))));
      for (let i = 0; i <= steps; i++) {
        const angle = start + (end - start) * (i / steps);
        points.push({
          x: entity.center.x + entity.radius * Math.cos(angle),
          y: entity.center.y + entity.radius * Math.sin(angle)
        });
      }
      segments.push(points);
    } else if (entity.type === 'SPLINE') {
      if (entity.controlPoints && entity.controlPoints.length > 1) {
        const degree = entity.degreeOfSplineCurve !== undefined ? entity.degreeOfSplineCurve : (entity.degree !== undefined ? entity.degree : 3);
        const knots = entity.knotValues || entity.knots;
        const weights = entity.weights;
        const controlPoints = entity.controlPoints;

        if (knots && knots.length > 0) {
          const steps = Math.max(64, controlPoints.length * 10);
          const points = evaluateNURBS(degree, controlPoints, knots, weights, steps);
          if (points) {
            segments.push(points);
          } else if (entity.fitPoints && entity.fitPoints.length > 1) {
            const points: Point2[] = entity.fitPoints.map((p: any) => ({ x: p.x, y: p.y }));
            segments.push(points);
          } else {
            const points: Point2[] = controlPoints.map((p: any) => ({ x: p.x, y: p.y }));
            segments.push(points);
          }
        } else if (entity.fitPoints && entity.fitPoints.length > 1) {
          // Fallback to fit points if no control points
          const points: Point2[] = entity.fitPoints.map((p: any) => ({ x: p.x, y: p.y }));
          segments.push(points);
        } else {
          // Fallback to control points if no fit points
          const points: Point2[] = controlPoints.map((p: any) => ({ x: p.x, y: p.y }));
          segments.push(points);
        }
      } else if (entity.fitPoints && entity.fitPoints.length > 1) {
        // Fallback to fit points if no control points
        const points: Point2[] = entity.fitPoints.map((p: any) => ({ x: p.x, y: p.y }));
        segments.push(points);
      }
    } else if (entity.type === 'ELLIPSE') {
      const points: Point2[] = [];
      const cx = entity.center.x;
      const cy = entity.center.y;
      const mx = entity.majorAxisEndPoint.x;
      const my = entity.majorAxisEndPoint.y;
      const ratio = entity.axisRatio;
      
      // Calculate minor axis vector
      const majorLen = Math.hypot(mx, my);
      const minorLen = majorLen * ratio;
      const nx = -my / majorLen * minorLen;
      const ny = mx / majorLen * minorLen;
      
      let start = entity.startAngle || 0;
      let end = entity.endAngle || (2 * Math.PI);
      if (end < start) end += 2 * Math.PI;
      
      const steps = Math.min(1024, Math.max(32, Math.ceil(majorLen * Math.abs(end - start))));
      
      for (let i = 0; i <= steps; i++) {
        const angle = start + (end - start) * (i / steps);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        points.push({
          x: cx + mx * cosA + nx * sinA,
          y: cy + my * cosA + ny * sinA
        });
      }
      segments.push(points);
    } else {
      diagnostics.push({
        code: 'unsupported_entity',
        severity: 'warning',
        message: `Unsupported DXF entity: ${entity.type}`,
        actionStage: 'decode',
        repairApplied: false
      });
    }
  }

  // Connect loose segments into loops
  const connectedLoops = connectSegments(segments, tol.eps_closure_gap);
  for (const loopPts of connectedLoops) {
    if (loopPts.length > 2) {
      borders.push({
        id: `dxf_${prefix}_${idCounter++}`,
        loop: { segments: [{ type: 'line', points: [...loopPts] }] },
        polygon: { points: loopPts },
        role: 'unknown',
        depth: -1,
        parentId: null
      });
    }
  }

  // Fix Y-axis inversion (DXF is Y-up, SVG/Canvas is Y-down)
  for (const border of borders) {
    // We must create new point objects to avoid double-negation if references are shared
    border.polygon.points = border.polygon.points.map(pt => ({ x: pt.x, y: -pt.y }));
    for (const segment of border.loop.segments) {
      segment.points = segment.points.map(pt => ({ x: pt.x, y: -pt.y }));
    }
  }

  return borders;
}

function connectSegments(segments: Point2[][], eps: number): Point2[][] {
  if (segments.length === 0) return [];
  
  const loops: Point2[][] = [];
  let currentLoop: Point2[] | null = null;
  const used = new Array(segments.length).fill(false);

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    
    currentLoop = [...segments[i]];
    used[i] = true;
    
    let added = true;
    while (added) {
      added = false;
      const startPt = currentLoop[0];
      const endPt = currentLoop[currentLoop.length - 1];
      
      for (let j = 0; j < segments.length; j++) {
        if (used[j]) continue;
        
        const seg = segments[j];
        const segStart = seg[0];
        const segEnd = seg[seg.length - 1];
        
        // Check if segment connects to end of current loop
        if (Math.hypot(endPt.x - segStart.x, endPt.y - segStart.y) < eps) {
          currentLoop.push(...seg.slice(1));
          used[j] = true;
          added = true;
          break;
        } else if (Math.hypot(endPt.x - segEnd.x, endPt.y - segEnd.y) < eps) {
          currentLoop.push(...[...seg].reverse().slice(1));
          used[j] = true;
          added = true;
          break;
        }
        // Check if segment connects to start of current loop
        else if (Math.hypot(startPt.x - segEnd.x, startPt.y - segEnd.y) < eps) {
          currentLoop.unshift(...seg.slice(0, -1));
          used[j] = true;
          added = true;
          break;
        } else if (Math.hypot(startPt.x - segStart.x, startPt.y - segStart.y) < eps) {
          currentLoop.unshift(...[...seg].reverse().slice(0, -1));
          used[j] = true;
          added = true;
          break;
        }
      }
    }
    
    // Close the loop if start and end are close
    const finalStart = currentLoop[0];
    const finalEnd = currentLoop[currentLoop.length - 1];
    if (currentLoop.length > 2 && Math.hypot(finalStart.x - finalEnd.x, finalStart.y - finalEnd.y) < eps) {
      currentLoop.pop(); // Remove duplicate end point
    }
    
    loops.push(currentLoop);
  }
  
  return loops;
}

function evaluateNURBS(
  degree: number,
  controlPoints: any[],
  knots: number[],
  weights: number[] | undefined,
  steps: number = 64
): Point2[] | null {
  const points: Point2[] = [];
  const p = degree;
  const n = controlPoints.length - 1;
  const m = knots.length - 1;

  // If knot vector is invalid length or degree is too high, return null to trigger fallback
  if (m < n + p || n < p) {
    return null;
  }

  const minU = knots[p];
  const maxU = knots[Math.min(n + 1, knots.length - 1)];

  if (maxU <= minU) {
    return null;
  }

  // Collect u values to sample
  const uValues: number[] = [];
  
  // 1. Add uniform steps
  for (let i = 0; i <= steps; i++) {
    uValues.push(minU + (maxU - minU) * (i / steps));
  }
  
  // 2. Add all knot values in the valid range.
  // This is CRITICAL for preserving sharp corners in splines, 
  // as sharp corners occur exactly at the knots (with high multiplicity).
  for (let i = p; i <= Math.min(n + 1, knots.length - 1); i++) {
    if (knots[i] >= minU && knots[i] <= maxU) {
      uValues.push(knots[i]);
    }
  }

  // Sort the u values
  uValues.sort((a, b) => a - b);

  // Filter out duplicates to avoid redundant evaluations
  const uniqueU: number[] = [];
  for (let i = 0; i < uValues.length; i++) {
    if (i === 0 || uValues[i] - uniqueU[uniqueU.length - 1] > 1e-7) {
      uniqueU.push(uValues[i]);
    }
  }

  for (const u of uniqueU) {
    points.push(evaluateNURBSPoint(p, controlPoints, knots, weights, u, maxU));
  }

  return points;
}

function evaluateNURBSPoint(
  p: number,
  controlPoints: any[],
  knots: number[],
  weights: number[] | undefined,
  u: number,
  maxU: number
): Point2 {
  const n = controlPoints.length - 1;
  
  // Find knot span
  let k = p;
  const maxK = Math.min(n, knots.length - 2);
  
  if (u >= maxU) {
    k = maxK;
    u = maxU;
  } else if (u <= knots[p]) {
    k = p;
    u = knots[p];
  } else {
    for (let i = p; i <= maxK; i++) {
      if (u >= knots[i] && u < knots[i + 1]) {
        k = i;
        break;
      }
    }
  }

  // De Boor's algorithm
  const d: { x: number; y: number; w: number }[] = [];
  for (let j = 0; j <= p; j++) {
    const cp = controlPoints[k - p + j];
    const w = weights && weights.length > k - p + j ? weights[k - p + j] : 1.0;
    d[j] = { x: cp.x * w, y: cp.y * w, w: w };
  }

  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = k - p + j;
      const denom = knots[i + p - r + 1] - knots[i];
      const alpha = denom === 0 ? 0 : (u - knots[i]) / denom;
      
      d[j].x = (1 - alpha) * d[j - 1].x + alpha * d[j].x;
      d[j].y = (1 - alpha) * d[j - 1].y + alpha * d[j].y;
      d[j].w = (1 - alpha) * d[j - 1].w + alpha * d[j].w;
    }
  }

  if (d[p].w === 0) return { x: d[p].x, y: d[p].y };
  return { x: d[p].x / d[p].w, y: d[p].y / d[p].w };
}
