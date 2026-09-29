import { describe, expect, it } from 'vitest';
import { addRoom, validatePlan } from '../index.js';
import type { PlanDocument } from '../index.js';
import {
  PlanBuilder,
  calibratedScale,
  makePlan,
  squarePlan,
  vertexIdAt,
} from '../testing/fixtures.js';

const withCorruptWall = (): PlanDocument => {
  const plan = squarePlan(400);
  const a = vertexIdAt(plan, 0, 0);
  return {
    ...plan,
    walls: {
      ...plan.walls,
      w_corrupta: {
        id: 'w_corrupta',
        a,
        b: a,
        thicknessM: 0.15,
        heightM: null,
        origin: 'auto',
        review: 'ok',
        evidence: [],
        issues: [],
        derivedFrom: null,
        groupId: null,
      },
    },
  };
};

describe('validacao do documento', () => {
  it('aceita um quadrado valido', () => {
    const result = validatePlan(squarePlan(400), calibratedScale(100));
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('aponta parede com canto inexistente', () => {
    const plan = squarePlan(400);
    const wallId = Object.keys(plan.walls)[0]!;
    const broken: PlanDocument = {
      ...plan,
      walls: { ...plan.walls, [wallId]: { ...plan.walls[wallId]!, b: 'fantasma' } },
    };
    const result = validatePlan(broken, calibratedScale(100));
    expect(result.isValid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('wall-missing-vertex');
  });

  it('aponta parede de comprimento zero inserida manualmente', () => {
    const result = validatePlan(withCorruptWall(), calibratedScale(100));
    expect(result.errors.map((e) => e.code)).toContain('wall-zero-length');
  });

  it('aponta canto solto', () => {
    const builder = new PlanBuilder();
    builder.closedPolygon([0, 0], [400, 0], [400, 400], [0, 400]);
    builder.vertex(777, 777);
    const result = validatePlan(builder.snapshot(), calibratedScale(100));
    expect(result.warnings.map((w) => w.code)).toContain('orphan-vertex');
    expect(result.isValid).toBe(true);
  });

  it('aponta ambiente com menos de tres cantos', () => {
    const plan = squarePlan(400);
    const room = addRoom(plan, [vertexIdAt(plan, 0, 0), vertexIdAt(plan, 400, 0)]);
    const result = validatePlan(room.plan, calibratedScale(100));
    expect(result.errors.map((e) => e.code)).toContain('room-too-few-vertices');
    expect(result.errors[0]!.elementId).toBe(room.room.id);
  });

  it('aponta ambiente que se cruza', () => {
    const builder = new PlanBuilder();
    builder.line([0, 0], [400, 0], [100, 400], [300, 400], [0, 0]);
    const ids = Object.values(builder.snapshot().vertices).map((v) => v.id);
    const bowtie = addRoom(builder.snapshot(), [ids[0]!, ids[1]!, ids[2]!, ids[3]!]);
    const result = validatePlan(bowtie.plan, calibratedScale(100));
    expect(result.errors.map((e) => e.code)).toContain('room-self-intersecting');
  });

  it('avisa sobre falta de escala', () => {
    const result = validatePlan(squarePlan(400), {
      ...calibratedScale(100),
      pixelsPerMeter: null,
    });
    const noScale = result.warnings.find((w) => w.code === 'no-scale');
    expect(noScale).toBeDefined();
    expect(noScale!.message).toContain('Calibre');
  });

  it('avisa sobre ambiente sem classificacao', () => {
    const plan = squarePlan(400);
    const room = addRoom(plan, [
      vertexIdAt(plan, 0, 0),
      vertexIdAt(plan, 400, 0),
      vertexIdAt(plan, 400, 400),
    ]);
    const result = validatePlan(room.plan, calibratedScale(100));
    expect(result.warnings.map((w) => w.code)).toContain('room-unclassified');
  });

  it('conta elementos que precisam de revisao', () => {
    const plan = squarePlan(400);
    const wallId = Object.keys(plan.walls)[0]!;
    const flagged: PlanDocument = {
      ...plan,
      walls: { ...plan.walls, [wallId]: { ...plan.walls[wallId]!, review: 'needs-review' } },
    };
    expect(validatePlan(flagged, calibratedScale(100)).needsReviewCount).toBe(1);
  });

  it('nao acusa erro em planta vazia', () => {
    const result = validatePlan(makePlan(), calibratedScale(100));
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

