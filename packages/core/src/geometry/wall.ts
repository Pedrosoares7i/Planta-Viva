import type { Id, Opening, PlanDocument, ScaleState, Wall } from '../model/types.js';
import { effectivePixelsPerMeter } from './scale.js';
import {
  EPSILON,
  add,
  boundsOf,
  distance,
  normalize,
  perpendicular,
  scale as scaleVec,
  sub,
  type Bounds,
  type Point,
} from './vec2.js';

export const wallEndpoints = (
  plan: PlanDocument,
  wall: Wall,
): { a: Point; b: Point } | null => {
  const va = plan.vertices[wall.a];
  const vb = plan.vertices[wall.b];
  if (!va || !vb) return null;
  return { a: { x: va.x, y: va.y }, b: { x: vb.x, y: vb.y } };
};

export const wallLengthPx = (plan: PlanDocument, wall: Wall): number | null => {
  const ends = wallEndpoints(plan, wall);
  if (!ends) return null;
  return distance(ends.a, ends.b);
};

export const wallLengthM = (plan: PlanDocument, wall: Wall, scale: ScaleState): number | null => {
  const px = wallLengthPx(plan, wall);
  if (px === null) return null;
  const ppm = scale.pixelsPerMeter;
  if (ppm === null || ppm <= 0) return null;
  return px / ppm;
};

export const wallNormal = (plan: PlanDocument, wall: Wall): Point | null => {
  const ends = wallEndpoints(plan, wall);
  if (!ends) return null;
  return perpendicular(normalize(sub(ends.b, ends.a)));
};

export const wallDirection = (plan: PlanDocument, wall: Wall): Point | null => {
  const ends = wallEndpoints(plan, wall);
  if (!ends) return null;
  return normalize(sub(ends.b, ends.a));
};

export const wallThicknessPx = (plan: PlanDocument, wall: Wall, scale: ScaleState): number | null => {
  const ppm = effectivePixelsPerMeter(scale);
  if (ppm === null || ppm <= 0) return null;
  return wall.thicknessM * ppm;
};

export const wallAngle = (plan: PlanDocument, wall: Wall): number | null => {
  const ends = wallEndpoints(plan, wall);
  if (!ends) return null;
  return Math.atan2(ends.b.y - ends.a.y, ends.b.x - ends.a.x);
};

export const isOrthogonal = (a: number, b: number, toleranceRad = Math.PI / 180): boolean => {
  const diff = Math.abs(((a - b) % Math.PI) + Math.PI) % Math.PI;
  const nearest = Math.min(diff, Math.PI - diff);
  return nearest <= toleranceRad;
};

export const pointOnWall = (plan: PlanDocument, wall: Wall, t: number): Point | null => {
  const ends = wallEndpoints(plan, wall);
  if (!ends) return null;
  return add(ends.a, scaleVec(sub(ends.b, ends.a), t));
};

export const parameterOfPoint = (plan: PlanDocument, wall: Wall, p: Point): number | null => {
  const ends = wallEndpoints(plan, wall);
  if (!ends) return null;
  const ab = sub(ends.b, ends.a);
  const lenSq = ab.x * ab.x + ab.y * ab.y;
  if (lenSq < EPSILON) return null;
  return ((p.x - ends.a.x) * ab.x + (p.y - ends.a.y) * ab.y) / lenSq;
};

export const wallCenter = (plan: PlanDocument, wall: Wall): Point | null => {
  const ends = wallEndpoints(plan, wall);
  if (!ends) return null;
  return { x: (ends.a.x + ends.b.x) / 2, y: (ends.a.y + ends.b.y) / 2 };
};

export const wallOutline = (
  plan: PlanDocument,
  wall: Wall,
  scale: ScaleState,
): Point[] | null => {
  const ends = wallEndpoints(plan, wall);
  const half = wallThicknessPx(plan, wall, scale);
  if (!ends || half === null) return null;
  const dir = normalize(sub(ends.b, ends.a));
  const n = scaleVec(perpendicular(dir), half);
  return [
    add(ends.a, n),
    add(ends.b, n),
    sub(ends.b, n),
    sub(ends.a, n),
  ];
};

export const wallBounds = (plan: PlanDocument, wall: Wall, scale: ScaleState): Bounds | null => {
  const outline = wallOutline(plan, wall, scale);
  return outline ? boundsOf(outline) : null;
};

export const wallHeightM = (wall: Wall, fallback: number): number =>
  wall.heightM !== null && wall.heightM > 0 ? wall.heightM : fallback;

export interface WallOpeningSpan {
  opening: Opening;
  startM: number;
  endM: number;
  centerM: number;
}

export const openingSpanM = (
  plan: PlanDocument,
  wall: Wall,
  opening: Opening,
  scale: ScaleState,
): WallOpeningSpan | null => {
  const lenM = wallLengthM(plan, wall, scale);
  if (lenM === null) return null;
  const centerM = lenM * opening.t;
  return {
    opening,
    startM: centerM - opening.widthM / 2,
    endM: centerM + opening.widthM / 2,
    centerM,
  };
};

export const wallSpanM = (plan: PlanDocument, wall: Wall, scale: ScaleState): number | null =>
  wallLengthM(plan, wall, scale);

export const wallAreaM2 = (plan: PlanDocument, wall: Wall, scale: ScaleState): number | null => {
  const lenM = wallLengthM(plan, wall, scale);
  if (lenM === null) return null;
  const h = wallHeightM(wall, scale.wallHeightM);
  return lenM * wall.thicknessM * h;
};

export const wallKey = (wall: Wall): string => [wall.a, wall.b].sort().join('|');

export const findWallBetween = (plan: PlanDocument, a: Id, b: Id): Wall | null => {
  const key = [a, b].sort().join('|');
  for (const wall of Object.values(plan.walls)) {
    if (wallKey(wall) === key) return wall;
  }
  return null;
};

export const wallsAtVertex = (plan: PlanDocument, vertexId: Id): Wall[] =>
  Object.values(plan.walls).filter((wall) => wall.a === vertexId || wall.b === vertexId);

export const vertexDegree = (plan: PlanDocument, vertexId: Id): number =>
  wallsAtVertex(plan, vertexId).length;

