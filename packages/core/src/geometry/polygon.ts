import {
  EPSILON,
  boundsOf,
  cross,
  distance,
  segmentIntersection,
  sub,
  type Bounds,
  type Point,
} from './vec2.js';

export const polygonSignedArea = (points: Point[]): number => {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!current || !next) continue;
    total += current.x * next.y - next.x * current.y;
  }
  return total / 2;
};

export const polygonArea = (points: Point[]): number =>
  Math.abs(polygonSignedArea(points));

export const polygonCentroid = (points: Point[]): Point => {
  const signed = polygonSignedArea(points);
  if (Math.abs(signed) < EPSILON) {
    const bounds = boundsOf(points);
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!current || !next) continue;
    const factor = current.x * next.y - next.x * current.y;
    cx += (current.x + next.x) * factor;
    cy += (current.y + next.y) * factor;
  }
  return { x: cx / (6 * signed), y: cy / (6 * signed) };
};

export const ensureCounterClockwise = (points: Point[]): Point[] =>
  polygonSignedArea(points) < 0 ? [...points].reverse() : points;

export const isSimplePolygon = (points: Point[]): boolean => {
  if (points.length < 3) return false;
  for (let i = 0; i < points.length; i += 1) {
    const a1 = points[i]!;
    const a2 = points[(i + 1) % points.length]!;
    for (let j = i + 1; j < points.length; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === points.length - 1);
      if (adjacent) continue;
      const b1 = points[j]!;
      const b2 = points[(j + 1) % points.length]!;
      if (segmentIntersection(a1, a2, b1, b2)) return false;
    }
  }
  return true;
};

export const pointInPolygon = (p: Point, points: Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]!;
    const b = points[j]!;
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
};

export const polygonBounds = (points: Point[]): Bounds => boundsOf(points);

export const pointSegmentOrientation = (a: Point, b: Point, c: Point): number =>
  cross(sub(b, a), sub(c, a));

export const isClockwiseTriangle = (a: Point, b: Point, c: Point): boolean =>
  pointSegmentOrientation(a, b, c) < 0;

export const maxEdgeLength = (points: Point[]): number => {
  let max = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    max = Math.max(max, distance(current, next));
  }
  return max;
};
