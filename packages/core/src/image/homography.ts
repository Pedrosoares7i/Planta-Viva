import type { Point, Quad } from '../model/types.js';

export type Matrix3 = [number, number, number, number, number, number, number, number, number];

const EPS = 1e-12;

const solveLinearSystem = (m: number[][], b: number[]): number[] | null => {
  const n = b.length;
  const a = m.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let pivotValue = Math.abs(a[col]![col]!);
    for (let row = col + 1; row < n; row += 1) {
      const value = Math.abs(a[row]![col]!);
      if (value > pivotValue) {
        pivotValue = value;
        pivotRow = row;
      }
    }
    if (pivotValue < EPS) return null;
    if (pivotRow !== col) {
      const tmp = a[col]!;
      a[col] = a[pivotRow]!;
      a[pivotRow] = tmp;
    }
    const pivot = a[col]![col]!;
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row]![col]! / pivot;
      if (factor === 0) continue;
      for (let k = col; k <= n; k += 1) {
        a[row]![k] = a[row]![k]! - factor * a[col]![k]!;
      }
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = a[row]![n]!;
    for (let k = row + 1; k < n; k += 1) {
      sum -= a[row]![k]! * x[k]!;
    }
    x[row] = sum / a[row]![row]!;
  }
  return x;
};

export const solveHomography = (src: Quad, dst: Quad): Matrix3 | null => {
  if (src.length !== 4 || dst.length !== 4) return null;
  const rows: number[][] = [];
  const rhs: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    const s = src[i]!;
    const d = dst[i]!;
    rows.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y]);
    rhs.push(d.x);
    rows.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y]);
    rhs.push(d.y);
  }

  const h = solveLinearSystem(rows, rhs);
  if (!h) return null;
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
};

export const identityHomography = (): Matrix3 => [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const applyHomography = (h: Matrix3, p: Point): Point | null => {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  if (Math.abs(w) < EPS) return null;
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
};

export const invertMatrix3 = (m: Matrix3): Matrix3 | null => {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-14) return null;
  const inv = 1 / det;
  return [
    A * inv,
    -(b * i - c * h) * inv,
    (b * f - c * e) * inv,
    B * inv,
    (a * i - c * g) * inv,
    -(a * f - c * d) * inv,
    C * inv,
    -(a * h - b * g) * inv,
    (a * e - b * d) * inv,
  ];
};

export const invertHomography = (h: Matrix3): Matrix3 | null => invertMatrix3(h);

export const composeHomography = (a: Matrix3, b: Matrix3): Matrix3 => {
  const mul = (i: number, j: number): number =>
    a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!;
  return [
    mul(0, 0), mul(0, 1), mul(0, 2),
    mul(1, 0), mul(1, 1), mul(1, 2),
    mul(2, 0), mul(2, 1), mul(2, 2),
  ];
};

export const isConvexQuad = (quad: Quad): boolean => {
  let sign = 0;
  for (let i = 0; i < quad.length; i += 1) {
    const a = quad[i]!;
    const b = quad[(i + 1) % quad.length]!;
    const c = quad[(i + 2) % quad.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < EPS) continue;
    const current = cross > 0 ? 1 : -1;
    if (sign === 0) sign = current;
    else if (sign !== current) return false;
  }
  return true;
};

export const quadArea = (quad: Quad): number => {
  let total = 0;
  for (let i = 0; i < quad.length; i += 1) {
    const a = quad[i]!;
    const b = quad[(i + 1) % quad.length]!;
    total += a.x * b.y - b.x * a.y;
  }
  return Math.abs(total / 2);
};

export const outputQuadFor = (width: number, height: number): Quad => [
  { x: 0, y: 0 },
  { x: width, y: 0 },
  { x: width, y: height },
  { x: 0, y: height },
];

export const correctionHomography = (
  sourceQuad: Quad,
  outputWidth: number,
  outputHeight: number,
): Matrix3 | null => solveHomography(sourceQuad, outputQuadFor(outputWidth, outputHeight));

export const correctionHomographyInverse = (
  sourceQuad: Quad,
  outputWidth: number,
  outputHeight: number,
): Matrix3 | null => {
  const forward = correctionHomography(sourceQuad, outputWidth, outputHeight);
  return forward ? invertHomography(forward) : null;
};
