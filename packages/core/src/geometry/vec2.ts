import type { Point } from '../model/types.js';

export type { Point };

export const EPSILON = 1e-9;

export const v = (x: number, y: number): Point => ({ x, y });

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (a: Point, factor: number): Point => ({
  x: a.x * factor,
  y: a.y * factor,
});

export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;

export const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;

export const lengthSq = (a: Point): number => a.x * a.x + a.y * a.y;

export const length = (a: Point): number => Math.hypot(a.x, a.y);

export const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

export const distanceSq = (a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
};

export const normalize = (a: Point): Point => {
  const len = length(a);
  if (len < EPSILON) return { x: 0, y: 0 };
  return { x: a.x / len, y: a.y / len };
};

export const perpendicular = (a: Point): Point => ({ x: -a.y + 0, y: a.x + 0 });

export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export const midpoint = (a: Point, b: Point): Point => lerp(a, b, 0.5);

export const angle = (a: Point): number => Math.atan2(a.y, a.x);

export const rotate = (a: Point, radians: number): Point => {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: a.x * cos - a.y * sin, y: a.x * sin + a.y * cos };
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const almostEqual = (a: number, b: number, epsilon = 1e-6): boolean =>
  Math.abs(a - b) <= epsilon;

export const pointsEqual = (a: Point, b: Point, epsilon = 1e-6): boolean =>
  almostEqual(a.x, b.x, epsilon) && almostEqual(a.y, b.y, epsilon);

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const boundsOf = (points: Point[]): Bounds => {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
};

export const projectPointOnSegment = (p: Point, a: Point, b: Point): Point => {
  const ab = sub(b, a);
  const lenSq = lengthSq(ab);
  if (lenSq < EPSILON) return a;
  const t = clamp(dot(sub(p, a), ab) / lenSq, 0, 1);
  return add(a, scale(ab, t));
};

export const distanceToSegment = (p: Point, a: Point, b: Point): number =>
  distance(p, projectPointOnSegment(p, a, b));

export const projectPointOnLine = (p: Point, a: Point, b: Point): Point => {
  const ab = sub(b, a);
  const lenSq = lengthSq(ab);
  if (lenSq < EPSILON) return a;
  const t = dot(sub(p, a), ab) / lenSq;
  return add(a, scale(ab, t));
};

export const segmentIntersection = (
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): Point | null => {
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const denominator = cross(r, s);
  if (Math.abs(denominator) < 1e-12) return null;
  const t = cross(sub(b1, a1), s) / denominator;
  const u = cross(sub(b1, a1), r) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return add(a1, scale(r, t));
};
