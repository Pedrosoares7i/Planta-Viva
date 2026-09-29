import type { NormalizedRect } from '../model/types.js';

export const clamp01 = (value: number): number => {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

export const rectFromNormalized = (
  rect: NormalizedRect,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } => {
  const x = rect.x * width;
  const y = rect.y * height;
  return {
    x,
    y,
    width: rect.width * width,
    height: rect.height * height,
  };
};

export const normalizedFromRect = (
  rect: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
): NormalizedRect => {
  const x = width <= 0 ? 0 : rect.x / width;
  const y = height <= 0 ? 0 : rect.y / height;
  const w = width <= 0 ? 0 : rect.width / width;
  const h = height <= 0 ? 0 : rect.height / height;
  return {
    x: clamp01(x),
    y: clamp01(y),
    width: clamp01(w),
    height: clamp01(h),
  };
};

export const growRect = (
  rect: { x: number; y: number; width: number; height: number },
  padding: number,
): { x: number; y: number; width: number; height: number } => {
  const px = padding;
  const x = rect.x - px;
  const y = rect.y - px;
  const width = rect.width + px * 2;
  const height = rect.height + px * 2;
  return { x, y, width, height };
};

export const intersectRect = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } | null => {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const aw = a.width;
  const ah = a.height;
  const bw = b.width;
  const bh = b.height;
  const x = Math.max(ax, bx);
  const y = Math.max(ay, by);
  const width = Math.min(ax + aw, bx + bw) - x;
  const height = Math.min(ay + ah, by + bh) - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
};

export const rectArea = (rect: { x: number; y: number; width: number; height: number }): number =>
  Math.max(0, rect.width) * Math.max(0, rect.height);
