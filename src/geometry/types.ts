export interface Point2 {
  x: number;
  y: number;
}

export interface Vector2 {
  x: number;
  y: number;
}

export type SegmentType = 'line' | 'arc' | 'circle' | 'ellipse' | 'spline';

export interface Segment {
  type: SegmentType;
  points: Point2[];
}

export interface Loop {
  segments: Segment[];
}

export interface PolygonApprox {
  points: Point2[];
}

export type Role = 'perimeter' | 'hole' | 'unknown';

export interface Border {
  id: string;
  loop: Loop;
  polygon: PolygonApprox;
  role: Role;
  depth: number;
  parentId: string | null;
}

export interface Element {
  id: string;
  perimeter: Border;
  holes: Border[];
}

export interface Document {
  elements: Element[];
  diagnostics: Diagnostic[];
}

export interface Diagnostic {
  code: string;
  severity: 'warning' | 'error' | 'info';
  message: string;
  entityRef?: string;
  rootId?: string;
  borderId?: string;
  actionStage: string;
  repairApplied: boolean;
}

export interface CornerTrace {
  sourceBorderId: string;
  cornerIndex: number;
  interiorAngleDeg: number;
  isInteriorUsable: boolean;
  isAcute: boolean;
  actionChosen: 'none' | 'chamfer' | 'fillet';
  resultingParams?: any;
}

export interface Tolerances {
  eps_point_merge: number;
  eps_closure_gap: number;
  eps_contains: number;
  eps_collinear: number;
  eps_area_min: number;
  eps_self_intersection: number;
  acute_threshold_deg: number;
}

export const DEFAULT_TOLERANCES: Tolerances = {
  eps_point_merge: 1e-4,
  eps_closure_gap: 1e-4,
  eps_contains: 1e-4,
  eps_collinear: 1e-4,
  eps_area_min: 1e-2,
  eps_self_intersection: 1e-4,
  acute_threshold_deg: 45,
};
