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
        id: `dxf_${idCounter++}`,
        loop: { segments: [{ type: 'circle', points: [...points] }] },
        polygon: { points },
        role: 'unknown',
        depth: -1,
        parentId: null
      });
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

  return borders;
}
