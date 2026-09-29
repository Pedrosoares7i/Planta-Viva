import type { Id, PlanDocument, Point } from '../model/types.js';
import { isOrthogonal } from './wall.js';
import { distanceSq, normalize, projectPointOnLine, sub } from './vec2.js';

export type SnapKind = 'vertex' | 'axis-x' | 'axis-y' | 'wall-axis' | 'none';

export type SnapResult = {
  point: Point;
  kind: SnapKind;
  targetId: Id | null;
  delta: Point;
};

export type SnapOptions = {
  tolerancePx: number;
  enabled: boolean;
  axisLock: boolean;
  excludeVertexId?: Id | null;
  includeWallAxis?: boolean;
};

export const defaultSnapOptions = (): SnapOptions => ({
  tolerancePx: 10,
  enabled: true,
  axisLock: true,
  excludeVertexId: null,
  includeWallAxis: true,
});

const noSnap = (point: Point): SnapResult => ({
  point,
  kind: 'none',
  targetId: null,
  delta: { x: 0, y: 0 },
});

export const snapPoint = (
  plan: PlanDocument,
  raw: Point,
  options: SnapOptions = defaultSnapOptions(),
): SnapResult => {
  if (!options.enabled) return noSnap(raw);
  const tolerance = options.tolerancePx;
  const toleranceSq = tolerance * tolerance;
  const point = { ...raw };

  let bestVertex: { id: Id; point: Point; distSq: number } | null = null;
  for (const vertex of Object.values(plan.vertices)) {
    if (options.excludeVertexId && vertex.id === options.excludeVertexId) continue;
    const distSq = distanceSq(raw, { x: vertex.x, y: vertex.y });
    if (distSq > toleranceSq) continue;
    if (!bestVertex || distSq < bestVertex.distSq) {
      bestVertex = { id: vertex.id, point: { x: vertex.x, y: vertex.y }, distSq };
    }
  }
  if (bestVertex) {
    return {
      point: bestVertex.point,
      kind: 'vertex',
      targetId: bestVertex.id,
      delta: sub(bestVertex.point, raw),
    };
  }

  if (options.axisLock) {
    let bestX: { value: number; dist: number } | null = null;
    let bestY: { value: number; dist: number } | null = null;
    for (const vertex of Object.values(plan.vertices)) {
      if (options.excludeVertexId && vertex.id === options.excludeVertexId) continue;
      const dx = Math.abs(vertex.x - raw.x);
      if (dx <= tolerance && (!bestX || dx < bestX.dist)) bestX = { value: vertex.x, dist: dx };
      const dy = Math.abs(vertex.y - raw.y);
      if (dy <= tolerance && (!bestY || dy < bestY.dist)) bestY = { value: vertex.y, dist: dy };
    }
    if (options.includeWallAxis) {
      for (const wall of Object.values(plan.walls)) {
        const va = plan.vertices[wall.a];
        const vb = plan.vertices[wall.b];
        if (!va || !vb) continue;
        if (options.excludeVertexId && (wall.a === options.excludeVertexId || wall.b === options.excludeVertexId)) {
          continue;
        }
        const dir = normalize(sub({ x: vb.x, y: vb.y }, { x: va.x, y: va.y }));
        if (dir.x === 0 && dir.y === 0) continue;
        const angle = Math.atan2(dir.y, dir.x);
        if (isOrthogonal(angle, 0)) {
          const projected = projectPointOnLine(raw, { x: va.x, y: va.y }, { x: vb.x, y: vb.y });
          const dy = Math.abs(projected.y - raw.y);
          if (dy <= tolerance && (!bestY || dy < bestY.dist)) bestY = { value: projected.y, dist: dy };
        } else if (isOrthogonal(angle, Math.PI / 2)) {
          const projected = projectPointOnLine(raw, { x: va.x, y: va.y }, { x: vb.x, y: vb.y });
          const dx = Math.abs(projected.x - raw.x);
          if (dx <= tolerance && (!bestX || dx < bestX.dist)) bestX = { value: projected.x, dist: dx };
        }
      }
    }
    if (bestX && bestY) {
      const snapped = { x: bestX.value, y: bestY.value };
      return {
        point: snapped,
        kind: 'axis-x',
        targetId: null,
        delta: sub(snapped, raw),
      };
    }
    if (bestX) {
      point.x = bestX.value;
      return { point, kind: 'axis-x', targetId: null, delta: sub(point, raw) };
    }
    if (bestY) {
      point.y = bestY.value;
      return { point, kind: 'axis-y', targetId: null, delta: sub(point, raw) };
    }
  }

  return noSnap(raw);
};

export type WallHit = {
  wallId: Id;
  t: number;
  distancePx: number;
  point: Point;
};

export const hitTestWalls = (
  plan: PlanDocument,
  raw: Point,
  tolerancePx: number,
): WallHit | null => {
  let best: WallHit | null = null;
  for (const wall of Object.values(plan.walls)) {
    const va = plan.vertices[wall.a];
    const vb = plan.vertices[wall.b];
    if (!va || !vb) continue;
    const a = { x: va.x, y: va.y };
    const b = { x: vb.x, y: vb.y };
    const ab = sub(b, a);
    const lenSq = ab.x * ab.x + ab.y * ab.y;
    if (lenSq <= 0) continue;
    const t = Math.min(1, Math.max(0, ((raw.x - a.x) * ab.x + (raw.y - a.y) * ab.y) / lenSq));
    const projected = { x: a.x + ab.x * t, y: a.y + ab.y * t };
    const dist = Math.hypot(raw.x - projected.x, raw.y - projected.y);
    if (dist > tolerancePx) continue;
    if (!best || dist < best.distancePx) {
      best = { wallId: wall.id, t, distancePx: dist, point: projected };
    }
  }
  return best;
};
