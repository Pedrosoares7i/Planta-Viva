import { describe, expect, it } from 'vitest';
import {
  addOpening,
  addRoom,
  addVertex,
  addWall,
  createScale,
  deleteOpening,
  deleteVertex,
  deleteWall,
  moveVertex,
  pruneOrphanVertices,
  renameRoom,
  resolveRoomPolygon,
  roomAreaM2,
  splitWall,
  updateOpening,
  wallLengthPx,
  wallsAtVertex,
} from '../index.js';
import type { PlanDocument } from '../index.js';
import {
  PlanBuilder,
  calibratedScale,
  cornerPlan,
  makePlan,
  squarePlan,
  vertexIdAt,
  wallIdBetween,
} from '../testing/fixtures.js';

describe('paredes e cantos compartilhados', () => {
  it('reaproveita o mesmo canto entre duas paredes', () => {
    const { plan, corner } = cornerPlan();
    expect(Object.keys(plan.vertices)).toHaveLength(3);
    expect(wallsAtVertex(plan, corner)).toHaveLength(2);
  });

  it('move um canto compartilhado e atualiza todas as paredes ligadas', () => {
    const { plan, corner } = cornerPlan();
    const moved = moveVertex(plan, corner, { x: 100, y: 220 });
    const after = Object.values(moved.plan.walls).map((w) => wallLengthPx(moved.plan, w)!);

    expect(Object.keys(moved.plan.walls)).toHaveLength(2);
    expect(moved.plan.vertices[corner]!.y).toBe(220);
    expect(after[0]).toBeCloseTo(Math.hypot(300, 120));
    expect(after[1]).toBeCloseTo(180);
  });

  it('rejeita parede de comprimento zero', () => {
    const builder = new PlanBuilder();
    const a = builder.vertex(50, 50);
    const b = builder.vertex(50, 50);
    const result = addWall(builder.snapshot(), a, b);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('zero-length');
  });

  it('rejeita parede duplicada entre os mesmos cantos', () => {
    const builder = new PlanBuilder();
    const a = builder.vertex(0, 0);
    const b = builder.vertex(100, 0);
    builder.wall(a, b);
    const again = addWall(builder.snapshot(), b, a);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('duplicate');
  });

  it('rejeita parede com canto inexistente', () => {
    const builder = new PlanBuilder();
    const a = builder.vertex(0, 0);
    const result = addWall(builder.snapshot(), a, 'nao_existe');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing-vertex');
  });
});

describe('exclusao de parede', () => {
  it('exclui as aberturas vinculadas e avisa', () => {
    const plan = squarePlan(400);
    const scale = calibratedScale(100);
    const wallId = Object.keys(plan.walls)[0]!;
    const withOpening = addOpening(plan, wallId, 0.5, 'door', scale);
    expect(Object.keys(withOpening.plan.openings)).toHaveLength(1);

    const removed = deleteWall(withOpening.plan, wallId);
    expect(Object.keys(removed.plan.walls)).toHaveLength(3);
    expect(Object.keys(removed.plan.openings)).toHaveLength(0);
    expect(removed.report.removedOpenings).toHaveLength(1);
    expect(removed.report.notes.join(' ')).toContain('abertura');
  });

  it('marca para revisao os ambientes que usavam a parede removida', () => {
    const plan = squarePlan(400);
    const ids = [
      vertexIdAt(plan, 0, 0),
      vertexIdAt(plan, 400, 0),
      vertexIdAt(plan, 400, 400),
      vertexIdAt(plan, 0, 400),
    ];
    const wallId = wallIdBetween(plan, ids[0]!, ids[1]!);
    const room = addRoom(plan, ids, { wallIds: [wallId] });

    const removed = deleteWall(room.plan, wallId);
    expect(removed.report.touchedRooms).toContain(room.room.id);
    expect(removed.plan.rooms[room.room.id]!.review).toBe('needs-review');
  });
});

describe('divisao de parede', () => {
  it('divide em dois trechos e mantem as aberturas vinculadas', () => {
    const plan = squarePlan(400);
    const scale = calibratedScale(100);
    const wallId = Object.keys(plan.walls)[0]!;
    const withDoor = addOpening(plan, wallId, 0.25, 'door', scale).plan;

    const split = splitWall(withDoor, wallId, 0.5, scale);
    expect(split.report.createdWalls).toHaveLength(2);
    expect(split.report.removedWalls).toEqual([wallId]);
    expect(Object.keys(split.plan.walls)).toHaveLength(5);

    const door = Object.values(split.plan.openings)[0]!;
    const newWall = split.plan.walls[door.wallId]!;
    expect(door.t).toBeCloseTo(0.5);
    expect(newWall.derivedFrom).toBe(wallId);
  });

  it('re-liga cada abertura ao trecho correto', () => {
    const plan = squarePlan(400);
    const scale = calibratedScale(100);
    const wallId = Object.keys(plan.walls)[0]!;
    const withOpenings = addOpening(
      addOpening(plan, wallId, 0.2, 'door', scale).plan,
      wallId,
      0.8,
      'window',
      scale,
    ).plan;
    const before = Object.values(withOpenings.openings).map((o) => o.id);

    const split = splitWall(withOpenings, wallId, 0.5, scale);
    const after = Object.values(split.plan.openings);
    expect(after).toHaveLength(2);
    expect(new Set(after.map((o) => o.id))).toEqual(new Set(before));
    expect(after.every((o) => o.t > 0 && o.t < 1)).toBe(true);
    expect(split.report.reassignedOpenings).toHaveLength(2);
  });

  it('marca para revisao a abertura que deixa de caber apos a divisao', () => {
    const plan = squarePlan(400);
    const scale = calibratedScale(100);
    const wallId = Object.keys(plan.walls)[0]!;
    const created = addOpening(plan, wallId, 0.3, 'door', scale);
    const widened = updateOpening(created.plan, created.opening!.id, { widthM: 3.4 }).plan;

    const split = splitWall(widened, wallId, 0.5, scale);
    const after = Object.values(split.plan.openings)[0]!;
    expect(after.review).toBe('needs-review');
    expect(split.report.flaggedForReview).toContain(after.id);
  });

  it('ajusta parametro fora do intervalo em vez de ignorar', () => {
    const plan = squarePlan(400);
    const wallId = Object.keys(plan.walls)[0]!;
    const split = splitWall(plan, wallId, 5, calibratedScale(100));
    expect(split.report.createdWalls).toHaveLength(2);
    expect(Object.keys(split.plan.walls)).toHaveLength(5);
  });

  it('nao faz nada para parede inexistente', () => {
    const plan = squarePlan(400);
    const split = splitWall(plan, 'fantasma', 0.5, calibratedScale(100));
    expect(split.report.createdWalls).toHaveLength(0);
    expect(split.plan).toBe(plan);
  });
});

describe('exclusao de canto compartilhado', () => {
  it('funde os dois trechos em uma parede e re-liga as aberturas', () => {
    const plan = squarePlan(400);
    const scale = calibratedScale(100);
    const corner = vertexIdAt(plan, 400, 400);
    const wallId = wallIdBetween(plan, corner, vertexIdAt(plan, 400, 0));
    const withDoor = addOpening(plan, wallId, 0.5, 'door', scale).plan;

    const removed = deleteVertex(withDoor, corner, scale);
    expect(removed.plan.vertices[corner]).toBeUndefined();
    expect(removed.report.mergedWalls).toHaveLength(2);
    expect(removed.report.createdWalls).toHaveLength(1);
    expect(Object.keys(removed.plan.walls)).toHaveLength(3);
    expect(Object.values(removed.plan.openings)).toHaveLength(1);

    const opening = Object.values(removed.plan.openings)[0]!;
    expect(opening.wallId).toBe(removed.report.createdWalls[0]);
    expect(opening.t).toBeGreaterThan(0);
    expect(opening.t).toBeLessThan(1);

    const merged = removed.plan.walls[removed.report.createdWalls[0]!]!;
    expect(merged.review).toBe('needs-review');
    expect(merged.evidence[0]!.note).toContain('fusao');
  });

  it('remove todas as paredes quando o canto tem tres ou mais trechos', () => {
    const builder = new PlanBuilder();
    const corner = builder.vertex(0, 0);
    builder.wall(corner, builder.vertex(200, 0));
    builder.wall(corner, builder.vertex(0, 200));
    builder.wall(corner, builder.vertex(-200, 0));
    const plan = builder.snapshot();

    const removed = deleteVertex(plan, corner, calibratedScale(100));
    expect(removed.report.mergedWalls).toHaveLength(0);
    expect(removed.report.removedWalls).toHaveLength(3);
    expect(removed.report.notes.join(' ')).toContain('3 paredes');
  });

  it('remove o ambiente que fica com menos de tres cantos', () => {
    const plan = squarePlan(400);
    const ids = [
      vertexIdAt(plan, 0, 0),
      vertexIdAt(plan, 400, 0),
      vertexIdAt(plan, 400, 400),
    ];
    const room = addRoom(plan, ids);
    const removed = deleteVertex(room.plan, ids[2]!, calibratedScale(100));
    expect(removed.plan.rooms[room.room.id]).toBeUndefined();
    expect(removed.report.removedRooms).toContain(room.room.id);
  });

  it('marca para revisao o ambiente que sobrevive a remocao de canto', () => {
    const plan = squarePlan(400);
    const ids = [
      vertexIdAt(plan, 0, 0),
      vertexIdAt(plan, 400, 0),
      vertexIdAt(plan, 400, 400),
      vertexIdAt(plan, 0, 400),
    ];
    const room = addRoom(plan, ids);
    const removed = deleteVertex(room.plan, ids[3]!, calibratedScale(100));
    expect(removed.plan.rooms[room.room.id]!.review).toBe('needs-review');
    expect(removed.report.touchedRooms).toContain(room.room.id);
  });

  it('remove canto sem nenhuma parede ligada', () => {
    const builder = new PlanBuilder();
    const lonely = builder.vertex(10, 10);
    const removed = deleteVertex(builder.snapshot(), lonely, createScale());
    expect(removed.plan.vertices[lonely]).toBeUndefined();
    expect(removed.report.removedVertices).toEqual([lonely]);
    expect(removed.report.notes.join(' ')).toContain('sem parede');
  });
});

describe('ambientes', () => {
  it('calcula area em metros quadrados com escala', () => {
    const plan = squarePlan(400);
    const room = addRoom(plan, [
      vertexIdAt(plan, 0, 0),
      vertexIdAt(plan, 400, 0),
      vertexIdAt(plan, 400, 400),
      vertexIdAt(plan, 0, 400),
    ]);
    expect(roomAreaM2(plan, room.room, calibratedScale(100))).toBeCloseTo(16);
  });

  it('devolve area nula sem escala', () => {
    const plan = squarePlan(400);
    const room = addRoom(plan, [
      vertexIdAt(plan, 0, 0),
      vertexIdAt(plan, 400, 0),
      vertexIdAt(plan, 400, 400),
    ]);
    expect(roomAreaM2(plan, room.room, createScale())).toBeNull();
  });

  it('acompanha o movimento do canto', () => {
    const plan = squarePlan(400);
    const corner = vertexIdAt(plan, 400, 400);
    const room = addRoom(plan, [
      vertexIdAt(plan, 0, 0),
      vertexIdAt(plan, 400, 0),
      corner,
      vertexIdAt(plan, 0, 400),
    ]);
    const before = resolveRoomPolygon(room.plan, room.room);
    const moved = moveVertex(room.plan, corner, { x: 800, y: 800 });
    const after = resolveRoomPolygon(moved.plan, moved.plan.rooms[room.room.id]!);
    expect(after).toHaveLength(before.length);
    expect(after[2]).toEqual({ x: 800, y: 800 });
  });

  it('renomeia e marca origem como usuario', () => {
    const plan = squarePlan(400);
    const room = addRoom(plan, [
      vertexIdAt(plan, 0, 0),
      vertexIdAt(plan, 400, 0),
      vertexIdAt(plan, 400, 400),
    ]);
    const renamed = renameRoom(room.plan, room.room.id, '  Cozinha  ');
    expect(renamed.room!.name).toBe('Cozinha');
    expect(renamed.room!.nameOrigin).toBe('user');
  });

  it('usa nome neutro quando nao ha classificacao', () => {
    const plan = squarePlan(400);
    const room = addRoom(plan, [
      vertexIdAt(plan, 0, 0),
      vertexIdAt(plan, 400, 0),
      vertexIdAt(plan, 400, 400),
    ]);
    expect(room.room.name).toMatch(/^Ambiente \d+$/);
    expect(room.room.nameOrigin).toBe('fallback');
  });
});

describe('aberturas', () => {
  it('exclui abertura isolada', () => {
    const plan = squarePlan(400);
    const wallId = Object.keys(plan.walls)[0]!;
    const withOpening = addOpening(plan, wallId, 0.5, 'window', calibratedScale(100)).plan;
    const id = Object.keys(withOpening.openings)[0]!;
    const removed = deleteOpening(withOpening, id);
    expect(Object.keys(removed.plan.openings)).toHaveLength(0);
  });

  it('limpa cantos soltos sem afetar paredes', () => {
    const builder = new PlanBuilder();
    builder.closedPolygon([0, 0], [400, 0], [400, 400], [0, 400]);
    const lonely = builder.vertex(900, 900);
    const plan = builder.snapshot();
    const pruned = pruneOrphanVertices(plan);
    expect(pruned.plan.vertices[lonely]).toBeUndefined();
    expect(Object.keys(pruned.plan.walls)).toHaveLength(4);
  });
});
