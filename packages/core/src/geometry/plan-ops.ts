import {
  createOpening,
  createRoom,
  createVertex,
  createWall,
  roomFallbackName,
} from '../model/factory.js';
import type {
  ElementOrigin,
  Id,
  Opening,
  OpeningKind,
  PlanDocument,
  Point,
  Room,
  RoomNameOrigin,
  ScaleState,
  Vertex,
  Wall,
} from '../model/types.js';
import { polygonArea } from './polygon.js';
import { findOverlappingOpenings, fitOpeningInWall, openingsOfWall } from './openings.js';
import { wallLengthM, wallLengthPx, wallKey, wallsAtVertex, findWallBetween } from './wall.js';
import { EPSILON, distance, pointsEqual } from './vec2.js';

export type CascadeReport = {
  removedWalls: Id[];
  removedOpenings: Id[];
  removedRooms: Id[];
  createdWalls: Id[];
  createdOpenings: Id[];
  reassignedOpenings: Id[];
  removedVertices: Id[];
  mergedWalls: Id[];
  touchedRooms: Id[];
  flaggedForReview: Id[];
  notes: string[];
};

export const emptyReport = (): CascadeReport => ({
  removedWalls: [],
  removedOpenings: [],
  removedRooms: [],
  createdWalls: [],
  createdOpenings: [],
  reassignedOpenings: [],
  removedVertices: [],
  mergedWalls: [],
  touchedRooms: [],
  flaggedForReview: [],
  notes: [],
});

export type PlanResult = { plan: PlanDocument; report: CascadeReport };

const clonePlan = (plan: PlanDocument): PlanDocument => ({
  vertices: { ...plan.vertices },
  walls: { ...plan.walls },
  openings: { ...plan.openings },
  rooms: { ...plan.rooms },
});

const without = <T>(record: Record<Id, T>, ids: Id[]): Record<Id, T> => {
  const next = { ...record };
  for (const id of ids) delete next[id];
  return next;
};

export const resolveRoomPolygon = (plan: PlanDocument, room: Room): Point[] => {
  const points: Point[] = [];
  for (const id of room.vertexIds) {
    const vertex = plan.vertices[id];
    if (!vertex) continue;
    const point = { x: vertex.x, y: vertex.y };
    const last = points[points.length - 1];
    if (last && pointsEqual(last, point, 1e-6)) continue;
    points.push(point);
  }
  if (points.length > 1 && pointsEqual(points[0]!, points[points.length - 1]!, 1e-6)) {
    points.pop();
  }
  return points;
};

export const roomAreaM2 = (
  plan: PlanDocument,
  room: Room,
  scale: ScaleState,
): number | null => {
  const points = resolveRoomPolygon(plan, room);
  if (points.length < 3) return null;
  const areaPx = polygonArea(points);
  const ppm = scale.pixelsPerMeter;
  if (ppm === null || ppm <= 0) return null;
  return areaPx / (ppm * ppm);
};

export const addVertex = (
  plan: PlanDocument,
  point: Point,
  origin: ElementOrigin = 'manual',
): { plan: PlanDocument; vertex: Vertex } => {
  const next = clonePlan(plan);
  const vertex = createVertex(point, origin);
  next.vertices[vertex.id] = vertex;
  return { plan: next, vertex };
};

export const moveVertex = (
  plan: PlanDocument,
  vertexId: Id,
  point: Point,
): { plan: PlanDocument; vertex: Vertex | null } => {
  const existing = plan.vertices[vertexId];
  if (!existing) return { plan, vertex: null };
  const next = clonePlan(plan);
  const vertex: Vertex = { ...existing, x: point.x, y: point.y };
  next.vertices[vertexId] = vertex;
  return { plan: next, vertex };
};

export type AddWallOutcome =
  | { ok: true; plan: PlanDocument; wall: Wall }
  | { ok: false; plan: PlanDocument; reason: 'zero-length' | 'duplicate' | 'missing-vertex' };

export const addWall = (
  plan: PlanDocument,
  a: Id,
  b: Id,
  options: Partial<Wall> = {},
): AddWallOutcome => {
  if (!plan.vertices[a] || !plan.vertices[b]) {
    return { ok: false, plan, reason: 'missing-vertex' };
  }
  if (a === b) return { ok: false, plan, reason: 'zero-length' };
  if (distance({ x: plan.vertices[a]!.x, y: plan.vertices[a]!.y }, { x: plan.vertices[b]!.x, y: plan.vertices[b]!.y }) < EPSILON) {
    return { ok: false, plan, reason: 'zero-length' };
  }
  if (findWallBetween(plan, a, b)) return { ok: false, plan, reason: 'duplicate' };
  const next = clonePlan(plan);
  const wall = createWall(a, b, options);
  next.walls[wall.id] = wall;
  return { ok: true, plan: next, wall };
};

export const updateWall = (
  plan: PlanDocument,
  wallId: Id,
  patch: Partial<Wall>,
): { plan: PlanDocument; wall: Wall | null } => {
  const existing = plan.walls[wallId];
  if (!existing) return { plan, wall: null };
  const next = clonePlan(plan);
  const wall: Wall = { ...existing, ...patch, id: existing.id };
  next.walls[wallId] = wall;
  return { plan: next, wall };
};

export const revalidateWallOpenings = (
  plan: PlanDocument,
  wallId: Id,
  scale: ScaleState,
): { plan: PlanDocument; report: CascadeReport } => {
  const wall = plan.walls[wallId];
  if (!wall) return { plan, report: emptyReport() };
  const next = clonePlan(plan);
  const report = emptyReport();
  const lengthM = wallLengthM(next, wall, scale);
  const openings = openingsOfWall(next, wallId);
  for (const opening of openings) {
    if (lengthM === null) continue;
    const fitted = fitOpeningInWall(opening, lengthM);
    next.openings[opening.id] = fitted;
    if (fitted.review === 'needs-review') {
      report.flaggedForReview.push(opening.id);
      report.notes.push(
        `A abertura ${opening.kind === 'door' ? 'da porta' : 'da janela'} foi ajustada para caber dentro da parede.`,
      );
    }
  }
  const overlaps = findOverlappingOpenings(next, wallId, scale);
  for (const [a, b] of overlaps) {
    for (const opening of [a, b]) {
      const current = next.openings[opening.id];
      if (current && !current.issues.includes('opening-overlap')) {
        next.openings[opening.id] = {
          ...current,
          issues: [...current.issues, 'opening-overlap'],
          review: 'needs-review',
        };
        report.flaggedForReview.push(opening.id);
      }
    }
  }
  return { plan: next, report };
};

export const deleteWall = (plan: PlanDocument, wallId: Id): PlanResult => {
  const wall = plan.walls[wallId];
  if (!wall) return { plan, report: emptyReport() };
  const next = clonePlan(plan);
  const report = emptyReport();
  const openingIds = openingsOfWall(plan, wallId).map((o) => o.id);
  next.openings = without(next.openings, openingIds);
  report.removedOpenings = openingIds;
  delete next.walls[wallId];
  report.removedWalls = [wallId];

  const rooms = Object.values(next.rooms);
  for (const room of rooms) {
    if (room.wallIds.includes(wallId)) {
      next.rooms[room.id] = {
        ...room,
        wallIds: room.wallIds.filter((id) => id !== wallId),
        review: 'needs-review',
        issues: Array.from(new Set([...room.issues, 'room-self-intersecting' as const])),
      };
      report.touchedRooms.push(room.id);
      report.flaggedForReview.push(room.id);
    }
  }
  report.notes.push(
    openingIds.length > 0
      ? `Parede removida. ${openingIds.length} abertura(s) vinculada(s) foram excluidas junto.`
      : 'Parede removida.',
  );
  return { plan: next, report };
};

export const splitWall = (
  plan: PlanDocument,
  wallId: Id,
  parameter: number,
  scale: ScaleState,
): PlanResult => {
  const wall = plan.walls[wallId];
  if (!wall) return { plan, report: emptyReport() };
  const lengthPx = wallLengthPx(plan, wall);
  if (lengthPx === null || lengthPx <= EPSILON) return { plan, report: emptyReport() };
  const t = Math.min(0.999, Math.max(0.001, parameter));
  const va = plan.vertices[wall.a]!;
  const vb = plan.vertices[wall.b]!;
  const point: Point = {
    x: va.x + (vb.x - va.x) * t,
    y: va.y + (vb.y - va.y) * t,
  };

  const next = clonePlan(plan);
  const report = emptyReport();
  const mid = createVertex(point, wall.origin, {
    review: wall.review,
    evidence: [...wall.evidence],
  });
  next.vertices[mid.id] = mid;

  const first = createWall(wall.a, mid.id, {
    thicknessM: wall.thicknessM,
    heightM: wall.heightM,
    origin: wall.origin,
    review: wall.review,
    evidence: wall.evidence,
    derivedFrom: wall.id,
    groupId: wall.groupId,
  });
  const second = createWall(mid.id, wall.b, {
    thicknessM: wall.thicknessM,
    heightM: wall.heightM,
    origin: wall.origin,
    review: wall.review,
    evidence: wall.evidence,
    derivedFrom: wall.id,
    groupId: wall.groupId,
  });
  next.walls[first.id] = first;
  next.walls[second.id] = second;
  report.createdWalls = [first.id, second.id];

  for (const opening of openingsOfWall(plan, wallId)) {
    const target = opening.t <= 0.5 ? first : second;
    const newT = opening.t <= 0.5 ? opening.t * 2 : (opening.t - 0.5) * 2;
    const moved: Opening = {
      ...opening,
      wallId: target.id,
      t: Math.min(0.999, Math.max(0.001, newT)),
      derivedFrom: opening.id,
    };
    next.openings[moved.id] = moved;
    report.reassignedOpenings.push(moved.id);
  }

  delete next.walls[wallId];
  report.removedWalls = [wallId];
  report.notes.push(
    report.reassignedOpenings.length > 0
      ? `Parede dividida em 2. ${report.reassignedOpenings.length} abertura(s) foram re-ligadas aos novos trechos.`
      : 'Parede dividida em 2 trechos.',
  );

  const revalidated = revalidateWallOpenings(next, first.id, scale);
  const revalidated2 = revalidateWallOpenings(revalidated.plan, second.id, scale);
  report.flaggedForReview.push(...revalidated.report.flaggedForReview, ...revalidated2.report.flaggedForReview);
  report.notes.push(...revalidated.report.notes, ...revalidated2.report.notes);
  return { plan: revalidated2.plan, report };
};

const removeKeys = <T>(record: Record<Id, T>, keys: Id[]): Record<Id, T> => {
  const next = { ...record };
  for (const key of keys) delete next[key];
  return next;
};

export const deleteVertex = (
  plan: PlanDocument,
  vertexId: Id,
  scale: ScaleState,
): PlanResult => {
  const vertex = plan.vertices[vertexId];
  if (!vertex) return { plan, report: emptyReport() };
  const next = clonePlan(plan);
  const report = emptyReport();
  const attached = wallsAtVertex(plan, vertexId);

  if (attached.length === 2) {
    const [w1, w2] = attached as [Wall, Wall];
    const x = w1.a === vertexId ? w1.b : w1.a;
    const y = w2.a === vertexId ? w2.b : w2.a;
    if (x !== y) {
      const vx = plan.vertices[x]!;
      const vy = plan.vertices[y]!;
      const mergedLength = distance({ x: vx.x, y: vx.y }, { x: vy.x, y: vy.y });
      if (mergedLength > EPSILON) {
        const merged = createWall(x, y, {
          thicknessM: Math.max(w1.thicknessM, w2.thicknessM),
          heightM: w1.heightM ?? w2.heightM,
          origin: 'manual',
          review: 'needs-review',
          evidence: [
            {
              source: 'user',
              note: 'Resultado da fusao de dois trechos ao remover um canto compartilhado.',
            },
          ],
          derivedFrom: null,
          groupId: w1.groupId ?? w2.groupId,
        });
        next.walls[merged.id] = merged;
        delete next.walls[w1.id];
        delete next.walls[w2.id];
        report.createdWalls = [merged.id];
        report.mergedWalls = [w1.id, w2.id];

        const openingsToReassign = [...openingsOfWall(plan, w1.id), ...openingsOfWall(plan, w2.id)];
        const dx = vy.x - vx.x;
        const dy = vy.y - vx.y;
        const lenSq = dx * dx + dy * dy;
        for (const opening of openingsToReassign) {
          const source = plan.walls[opening.wallId];
          if (!source) continue;
          const sa = plan.vertices[source.a];
          const sb = plan.vertices[source.b];
          if (!sa || !sb) continue;
          const centerX = sa.x + (sb.x - sa.x) * opening.t;
          const centerY = sa.y + (sb.y - sa.y) * opening.t;
          const newT = Math.min(0.999, Math.max(0.001, ((centerX - vx.x) * dx + (centerY - vx.y) * dy) / lenSq));
          const moved: Opening = { ...opening, wallId: merged.id, t: newT, derivedFrom: opening.id };
          next.openings[moved.id] = moved;
          report.reassignedOpenings.push(moved.id);
        }
        report.notes.push(
          report.reassignedOpenings.length > 0
            ? 'Canto removido: os dois trechos foram fundidos e as aberturas re-ligadas.'
            : 'Canto removido: os dois trechos foram fundidos em uma parede.',
        );
      }
    }
  }

  for (const wall of attached) {
    if (report.mergedWalls.includes(wall.id)) continue;
    for (const opening of openingsOfWall(plan, wall.id)) {
      if (report.reassignedOpenings.includes(opening.id)) continue;
      delete next.openings[opening.id];
      report.removedOpenings.push(opening.id);
    }
    delete next.walls[wall.id];
    report.removedWalls.push(wall.id);
  }

  if (attached.length >= 3) {
    report.notes.push(
      `${attached.length} paredes usavam este canto. Todas foram removidas porque nao ha como juntas-las em um unico trecho.`,
    );
  }
  if (attached.length === 0) {
    report.notes.push('Canto sem parede foi removido.');
  }

  delete next.vertices[vertexId];
  report.removedVertices = [vertexId];

  for (const room of Object.values(next.rooms)) {
    if (!room.vertexIds.includes(vertexId)) continue;
    const vertexIds = room.vertexIds.filter((id) => id !== vertexId);
    const points = vertexIds
      .map((id) => next.vertices[id])
      .filter((v): v is Vertex => Boolean(v))
      .map((v) => ({ x: v.x, y: v.y }));
    if (points.length < 3) {
      delete next.rooms[room.id];
      report.removedRooms.push(room.id);
      report.notes.push(
        `Ambiente "${room.name}" tinha menos de 3 cantos restantes e foi removido.`,
      );
      continue;
    }
    next.rooms[room.id] = { ...room, vertexIds, review: 'needs-review' };
    report.touchedRooms.push(room.id);
    report.flaggedForReview.push(room.id);
  }

  if (report.createdWalls.length > 0) {
    for (const id of report.createdWalls) {
      const revalidated = revalidateWallOpenings(next, id, scale);
      next.openings = revalidated.plan.openings;
      report.flaggedForReview.push(...revalidated.report.flaggedForReview);
      report.notes.push(...revalidated.report.notes);
    }
  }

  return { plan: next, report };
};

export const addOpening = (
  plan: PlanDocument,
  wallId: Id,
  parameter: number,
  kind: OpeningKind,
  scale: ScaleState,
  options: Partial<Opening> = {},
): { plan: PlanDocument; opening: Opening | null; report: CascadeReport } => {
  const wall = plan.walls[wallId];
  const report = emptyReport();
  if (!wall) return { plan, opening: null, report };
  const next = clonePlan(plan);
  const created = createOpening(wallId, kind, Math.min(0.999, Math.max(0.001, parameter)), options);
  const lengthM = wallLengthM(next, wall, scale);
  const fitted = lengthM === null ? created : fitOpeningInWall(created, lengthM);
  next.openings[fitted.id] = fitted;
  report.createdOpenings = [fitted.id];
  if (lengthM === null) {
    report.notes.push(
      'A escala ainda nao foi definida. A abertura foi criada, mas o ajuste de largura fica estimado ate voce calibrar uma medida.',
    );
  } else if (fitted.widthM !== created.widthM || fitted.t !== created.t) {
    report.flaggedForReview.push(fitted.id);
    report.notes.push('A abertura foi ajustada para caber dentro da parede e marcada para revisao.');
  }
  return { plan: next, opening: fitted, report };
};

export const updateOpening = (
  plan: PlanDocument,
  openingId: Id,
  patch: Partial<Opening>,
): { plan: PlanDocument; opening: Opening | null } => {
  const existing = plan.openings[openingId];
  if (!existing) return { plan, opening: null };
  const next = clonePlan(plan);
  const opening: Opening = { ...existing, ...patch, id: existing.id };
  next.openings[openingId] = opening;
  return { plan: next, opening };
};

export const deleteOpening = (plan: PlanDocument, openingId: Id): PlanResult => {
  if (!plan.openings[openingId]) return { plan, report: emptyReport() };
  const next = clonePlan(plan);
  const report = emptyReport();
  delete next.openings[openingId];
  report.removedOpenings = [openingId];
  return { plan: next, report };
};

export const addRoom = (
  plan: PlanDocument,
  vertexIds: Id[],
  options: Partial<Room> = {},
): { plan: PlanDocument; room: Room } => {
  const next = clonePlan(plan);
  const nameOrigin: RoomNameOrigin = options.nameOrigin ?? 'fallback';
  const room = createRoom(vertexIds, {
    ...options,
    name: options.name ?? roomFallbackName(Object.keys(next.rooms).length + 1),
    nameOrigin,
  });
  next.rooms[room.id] = room;
  return { plan: next, room };
};

export const renameRoom = (
  plan: PlanDocument,
  roomId: Id,
  name: string,
  nameOrigin: RoomNameOrigin = 'user',
): { plan: PlanDocument; room: Room | null } => {
  const existing = plan.rooms[roomId];
  if (!existing) return { plan, room: null };
  const next = clonePlan(plan);
  const trimmed = name.trim();
  const room: Room = {
    ...existing,
    name: trimmed.length > 0 ? trimmed : roomFallbackName(Object.keys(plan.rooms).indexOf(roomId) + 1),
    nameOrigin,
    review: 'ok',
  };
  next.rooms[roomId] = room;
  return { plan: next, room };
};

export const deleteRoom = (plan: PlanDocument, roomId: Id): PlanResult => {
  if (!plan.rooms[roomId]) return { plan, report: emptyReport() };
  const next = clonePlan(plan);
  const report = emptyReport();
  delete next.rooms[roomId];
  report.removedRooms = [roomId];
  return { plan: next, report };
};

export const setRoomClassification = (
  plan: PlanDocument,
  roomId: Id,
  name: string,
  nameOrigin: RoomNameOrigin,
): { plan: PlanDocument; room: Room | null } =>
  renameRoom(plan, roomId, name, nameOrigin);

export const planWallKeys = (plan: PlanDocument): Set<string> =>
  new Set(Object.values(plan.walls).map((w) => wallKey(w)));

export const pruneOrphanVertices = (plan: PlanDocument): PlanResult => {
  const next = clonePlan(plan);
  const report = emptyReport();
  const used = new Set<Id>();
  for (const wall of Object.values(plan.walls)) {
    used.add(wall.a);
    used.add(wall.b);
  }
  for (const room of Object.values(plan.rooms)) {
    for (const id of room.vertexIds) used.add(id);
  }
  for (const id of Object.keys(plan.vertices)) {
    if (!used.has(id)) {
      delete next.vertices[id];
      report.removedVertices.push(id);
    }
  }
  return { plan: next, report };
};
