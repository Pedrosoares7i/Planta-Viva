import type { NormalizedRect, Point, Quad } from '../model/types.js';
import { clamp01 } from './crop.js';

export const rotateSize = (
  width: number,
  height: number,
  rotation: 0 | 90 | 180 | 270,
): { width: number; height: number } => (rotation % 180 === 0 ? { width, height } : { width: height, height: width });

export const orientForRotation = (rotation: 0 | 90 | 180 | 270): number => {
  switch (rotation) {
    case 90:
      return 90;
    case 180:
      return 180;
    case 270:
      return -90;
    default:
      return 0;
  }
};

export const outputSize = (
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(maxEdge)) {
    return { width: 0, height: 0 };
  }
  if (width <= 0 || height <= 0 || maxEdge <= 0) return { width: 0, height: 0 };
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
};

export const cropPixelRect = (
  crop: NormalizedRect | null,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } => {
  if (!crop) return { x: 0, y: 0, width, height };
  return {
    x: crop.x * width,
    y: crop.y * height,
    width: crop.width * width,
    height: crop.height * height,
  };
};

export const normalizeQuad = (quad: Quad, width: number, height: number): Quad => {
  const clampX = (x: number): number => Math.min(width, Math.max(0, Number.isFinite(x) ? x : 0));
  const clampY = (y: number): number => Math.min(height, Math.max(0, Number.isFinite(y) ? y : 0));
  return [
    { x: clampX(quad[0].x), y: clampY(quad[0].y) },
    { x: clampX(quad[1].x), y: clampY(quad[1].y) },
    { x: clampX(quad[2].x), y: clampY(quad[2].y) },
    { x: clampX(quad[3].x), y: clampY(quad[3].y) },
  ];
};

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

export const correctedSize = (quad: Quad): { width: number; height: number } => {
  const horizontal = (distance(quad[0], quad[1]) + distance(quad[3], quad[2])) / 2;
  const vertical = (distance(quad[0], quad[3]) + distance(quad[1], quad[2])) / 2;
  return { width: Math.round(horizontal), height: Math.round(vertical) };
};

export const quadBounds = (quad: Quad): { min: Point; max: Point } => ({
  min: {
    x: Math.min(...quad.map((p) => p.x)),
    y: Math.min(...quad.map((p) => p.y)),
  },
  max: {
    x: Math.max(...quad.map((p) => p.x)),
    y: Math.max(...quad.map((p) => p.y)),
  },
});

/**
 * Gira os quatro cantos em torno do centro de `width` x `height` (o espaco de
 * origem), no sentido dos ponteiros do relogio, e devolve o quadrilatero de novo
 * na ordem canonica (superior-esquerdo, superior-direito, inferior-direito,
 * inferior-esquerdo).
 *
 * A reordenacao e obrigatoria: girar 90 graus move o canto que estava em
 * superior-esquerdo para superior-direito, e `correctedSize`, `isConvexQuad` e
 * `solveHomography` assumem a ordem canonica. Sem reordenar, a retificacao sairia
 * girada ou espelhada.
 */
export const rotateQuadAbout = (
  quad: Quad,
  width: number,
  height: number,
  degrees: number,
): Quad => {
  const cx = width / 2;
  const cy = height / 2;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const turn = (p: Point): Point => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  };

  const girado = [turn(quad[0]), turn(quad[1]), turn(quad[2]), turn(quad[3])];
  const passos = Math.round(((degrees / 90) % 4 + 4) % 4);
  if (passos === 0) return girado as Quad;
  const inicio = (4 - passos) % 4;
  return [girado[inicio]!, girado[(inicio + 1) % 4]!, girado[(inicio + 2) % 4]!, girado[(inicio + 3) % 4]!];
};

export const rebaseQuadForRotation = (
  quad: Quad,
  previousRotation: 0 | 90 | 180 | 270,
  nextRotation: 0 | 90 | 180 | 270,
  previousSize: { width: number; height: number },
): Quad =>
  rotateQuadAbout(
    quad,
    previousSize.width,
    previousSize.height,
    orientForRotation(nextRotation) - orientForRotation(previousRotation),
  );

export const quadFromNormalized = (quad: Quad, width: number, height: number): Quad => [
  { x: quad[0].x * width, y: quad[0].y * height },
  { x: quad[1].x * width, y: quad[1].y * height },
  { x: quad[2].x * width, y: quad[2].y * height },
  { x: quad[3].x * width, y: quad[3].y * height },
];

export const normalizedQuadFrom = (quad: Quad, width: number, height: number): Quad => {
  const nx = (x: number): number => (width <= 0 ? 0 : clamp01(x / width));
  const ny = (y: number): number => (height <= 0 ? 0 : clamp01(y / height));
  return [
    { x: nx(quad[0].x), y: ny(quad[0].y) },
    { x: nx(quad[1].x), y: ny(quad[1].y) },
    { x: nx(quad[2].x), y: ny(quad[2].y) },
    { x: nx(quad[3].x), y: ny(quad[3].y) },
  ];
};
