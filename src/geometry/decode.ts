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
      const points: Point2[] = entity.vertices.map((v: any) => ({ x: v.x, y: v.y }));
      if (points.length > 2) {
        borders.push({
          id: `dxf_${prefix}_${idCounter++}`,
          loop: { segments: [{ type: 'line', points: [...points] }] },
          polygon: { points },
          role: 'unknown',
          depth: -1,
          parentId: null
        });
      }
    } else if (entity.type === 'CIRCLE') {
      const points: Point2[] = [];
      const steps = 32;
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
      const steps = 16;
      let start = entity.startAngle;
      let end = entity.endAngle;
      if (end < start) end += 2 * Math.PI;
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
        const points: Point2[] = entity.controlPoints.map((p: any) => ({ x: p.x, y: p.y }));
        segments.push(points);
      }
    } else if (entity.type === 'ELLIPSE') {
      const points: Point2[] = [];
      const steps = 32;
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
