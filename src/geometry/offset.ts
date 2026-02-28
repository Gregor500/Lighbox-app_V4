import ClipperLib from 'clipper-lib';
import { PolygonApprox, Point2 } from './types';

const SCALE = 100000;

export function offsetPolygon(poly: PolygonApprox, delta: number): PolygonApprox[] {
  const path = poly.points.map(pt => ({ X: Math.round(pt.x * SCALE), Y: Math.round(pt.y * SCALE) }));
  
  const co = new ClipperLib.ClipperOffset();
  co.MiterLimit = 100; // High limit to keep sharp corners for subsequent chamfering
  co.AddPath(path, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  
  const solution = new ClipperLib.Paths();
  co.Execute(solution, delta * SCALE);
  
  return solution.map(sol => ({
    points: sol.map(pt => ({ x: pt.X / SCALE, y: pt.Y / SCALE }))
  }));
}

export function booleanUnion(polys: PolygonApprox[]): PolygonApprox[] {
  const c = new ClipperLib.Clipper();
  for (const poly of polys) {
    const path = poly.points.map(pt => ({ X: Math.round(pt.x * SCALE), Y: Math.round(pt.y * SCALE) }));
    c.AddPath(path, ClipperLib.PolyType.ptSubject, true);
  }
  
  const solution = new ClipperLib.Paths();
  c.Execute(ClipperLib.ClipType.ctUnion, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  
  return solution.map(sol => ({
    points: sol.map(pt => ({ x: pt.X / SCALE, y: pt.Y / SCALE }))
  }));
}
