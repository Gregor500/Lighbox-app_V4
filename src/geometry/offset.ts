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
  
  // Clean the polygons to remove collinear points that might mess up chamfering
  const cleanedSolution = ClipperLib.Clipper.CleanPolygons(solution, 1.0); // 1.0 is the distance tolerance in scaled units
  
  return cleanedSolution.map(sol => ({
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

export function getUsableMaterial(perimeter: PolygonApprox, holes: PolygonApprox[]): { perimeter: PolygonApprox, holes: PolygonApprox[] }[] {
  const c = new ClipperLib.Clipper();
  const subjPath = perimeter.points.map(pt => ({ X: Math.round(pt.x * SCALE), Y: Math.round(pt.y * SCALE) }));
  
  c.AddPath(subjPath, ClipperLib.PolyType.ptSubject, true);
  
  for (const hole of holes) {
    const clipPath = hole.points.map(pt => ({ X: Math.round(pt.x * SCALE), Y: Math.round(pt.y * SCALE) }));
    c.AddPath(clipPath, ClipperLib.PolyType.ptClip, true);
  }
  
  const solution = new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctDifference, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  
  const results: { perimeter: PolygonApprox, holes: PolygonApprox[] }[] = [];
  
  const childs = solution.Childs();
  for (let i = 0; i < childs.length; i++) {
    const outerNode = childs[i];
    let outerContour = outerNode.Contour();
    // We want perimeter to be CCW (positive area in our math.ts)
    // Clipper's Orientation returns true if area >= 0.
    // Wait, Clipper's Area is sum(X_i * Y_{i+1} - X_{i+1} * Y_i) / 2.
    // Our getSignedArea is sum(X_i * Y_{i+1} - X_{i+1} * Y_i) / 2.
    // So Clipper's Orientation == true means area >= 0 (CCW).
    // Therefore, we want Orientation to be true for perimeter.
    if (!ClipperLib.Clipper.Orientation(outerContour)) {
      outerContour.reverse();
    }
    const outerPoly = {
      points: outerContour.map(pt => ({ x: pt.X / SCALE, y: pt.Y / SCALE }))
    };
    
    const innerPolys = [];
    const innerChilds = outerNode.Childs();
    for (let j = 0; j < innerChilds.length; j++) {
      const innerNode = innerChilds[j];
      let innerContour = innerNode.Contour();
      // We want holes to be CW (negative area in our math.ts)
      if (ClipperLib.Clipper.Orientation(innerContour)) {
        innerContour.reverse();
      }
      innerPolys.push({
        points: innerContour.map(pt => ({ x: pt.X / SCALE, y: pt.Y / SCALE }))
      });
    }
    results.push({ perimeter: outerPoly, holes: innerPolys });
  }
  
  return results;
}
