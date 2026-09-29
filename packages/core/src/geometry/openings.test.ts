import { describe, expect, it } from 'vitest';
import {
  MIN_OPENING_WIDTH_M,
  addOpening,
  addWall,
  addVertex,
  createScale,
  findOverlappingOpenings,
  fitOpeningInWall,
  moveVertex,
  openingCenterPx,
  openingsOfWall,
  validateOpening,
  wallLengthPx,
} from '../index.js';
import type { PlanDocument, ScaleState } from '../index.js';
import { PlanBuilder, calibratedScale, squarePlan } from '../testing/fixtures.js';

const wallWith = (
  lengthPx: number,
): { plan: PlanDocument; wallId: string; a: string; b: string } => {
  const builder = new PlanBuilder();
  const a = builder.vertex(0, 0);
  const b = builder.vertex(lengthPx, 0);
  const wallId = builder.wall(a, b);
  return { plan: builder.snapshot(), wallId, a, b };
};

describe('ajuste de abertura na parede', () => {
  it('aceita abertura que cabe', () => {
    const plan = squarePlan(400);
    const scale = calibratedScale(100);
    const wallId = Object.keys(plan.walls)[0]!;
    const result = addOpening(plan, wallId, 0.5, 'door', scale);
    expect(result.opening).not.toBeNull();
    expect(result.opening!.review).toBe('ok');
    expect(result.report.flaggedForReview).toHaveLength(0);
  });

  it('reduz e recentra a abertura que nao cabe', () => {
    const plan = squarePlan(400);
    const scale = calibratedScale(100);
    const wallId = Object.keys(plan.walls)[0]!;
    const created = addOpening(plan, wallId, 0.5, 'door', scale);
    const tooWide = { ...created.opening!, widthM: 10 };

    const fixed = fitOpeningInWall(tooWide, 4);
    expect(fixed.widthM).toBeLessThanOrEqual(4);
    expect(fixed.widthM).toBeGreaterThanOrEqual(MIN_OPENING_WIDTH_M);
    expect(fixed.t * 4 - fixed.widthM / 2).toBeGreaterThanOrEqual(-1e-6);
    expect(fixed.t * 4 + fixed.widthM / 2).toBeLessThanOrEqual(4 + 1e-6);
    expect(fixed.review).toBe('needs-review');

    const planWithWide: PlanDocument = {
      ...created.plan,
      openings: { ...created.plan.openings, [tooWide.id]: tooWide },
    };
    expect(validateOpening(planWithWide, tooWide, scale)).toContain('opening-out-of-wall');
  });

  it('mantem a largura minima mesmo em parede curta', () => {
    const plan = squarePlan(400);
    const scale = calibratedScale(100);
    const wallId = Object.keys(plan.walls)[0]!;
    const created = addOpening(plan, wallId, 0.5, 'door', scale);
    const fitted = fitOpeningInWall(created.opening!, 0.2);
    expect(fitted.widthM).toBe(MIN_OPENING_WIDTH_M);
    expect(fitted.review).toBe('needs-review');
  });

  it('avisa que a abertura ficou estimada quando ainda nao ha escala', () => {
    const { plan, wallId } = wallWith(400);
    const result = addOpening(plan, wallId, 0.5, 'door', createScale());
    expect(result.opening).not.toBeNull();
    expect(result.report.notes.join(' ')).toContain('escala');
  });

  it('posiciona a abertura pela parametrizacao t ao longo da parede', () => {
    const { plan, wallId } = wallWith(400);
    const scale = calibratedScale(100);
    const result = addOpening(plan, wallId, 0.25, 'window', scale);
    const wall = result.plan.walls[wallId]!;
    const center = openingCenterPx(result.plan, wall, result.opening!)!;
    expect(center.x).toBeCloseTo(100);
    expect(center.y).toBeCloseTo(0);
  });

  it('mantem a abertura na parede apos a parede mudar de tamanho', () => {
    const { plan, wallId, a } = wallWith(400);
    const scale = calibratedScale(100);
    const created = addOpening(plan, wallId, 0.5, 'door', scale);
    const opening = created.opening!;

    const moved = moveVertex(created.plan, a, { x: -100, y: 0 });
    const wall = moved.plan.walls[wallId]!;
    expect(wallLengthPx(moved.plan, wall)).toBeCloseTo(500);

    const center = openingCenterPx(moved.plan, wall, moved.plan.openings[opening.id]!)!;
    expect(center.x).toBeCloseTo(150);
  });
});

describe('deteccao de sobreposicao', () => {
  it('encontra duas aberturas que se sobrepoem', () => {
    const { plan, wallId } = wallWith(400);
    const scale = calibratedScale(100);
    const withTwo = addOpening(
      addOpening(plan, wallId, 0.5, 'door', scale).plan,
      wallId,
      0.55,
      'window',
      scale,
    ).plan;
    expect(findOverlappingOpenings(withTwo, wallId, scale)).toHaveLength(1);
  });

  it('nao acusa sobreposicao em aberturas afastadas', () => {
    const { plan, wallId } = wallWith(400);
    const scale = calibratedScale(100);
    const withTwo = addOpening(
      addOpening(plan, wallId, 0.3, 'door', scale).plan,
      wallId,
      0.7,
      'window',
      scale,
    ).plan;
    expect(findOverlappingOpenings(withTwo, wallId, scale)).toHaveLength(0);
  });

  it('rejeita largura abaixo do minimo', () => {
    const { plan, wallId } = wallWith(400);
    const scale: ScaleState = calibratedScale(100);
    const created = addOpening(plan, wallId, 0.5, 'door', scale);
    const tiny = { ...created.opening!, widthM: 0.05 };
    expect(validateOpening(created.plan, tiny, scale)).toContain('opening-zero-width');
  });

  it('rejeita abertura apontando para parede inexistente', () => {
    const plan = squarePlan(400);
    const created = addOpening(plan, Object.keys(plan.walls)[0]!, 0.5, 'door', calibratedScale(100));
    const orphan = { ...created.opening!, wallId: 'inexistente' };
    expect(validateOpening(created.plan, orphan, calibratedScale(100))).toEqual([
      'opening-out-of-wall',
    ]);
  });

  it('rejeita parametro t fora do trecho', () => {
    const { plan, wallId } = wallWith(400);
    const scale = calibratedScale(100);
    const created = addOpening(plan, wallId, 0.5, 'door', scale);
    const outside = { ...created.opening!, t: 1.8 };
    expect(validateOpening(created.plan, outside, scale)).toContain('opening-out-of-wall');
  });

  it('lista as aberturas da parede em ordem ao longo do trecho', () => {
    const { plan, wallId } = wallWith(400);
    const scale = calibratedScale(100);
    const withThree = addOpening(
      addOpening(
        addOpening(plan, wallId, 0.8, 'window', scale).plan,
        wallId,
        0.2,
        'window',
        scale,
      ).plan,
      wallId,
      0.5,
      'door',
      scale,
    ).plan;
    expect(openingsOfWall(withThree, wallId).map((o) => o.t)).toEqual([0.2, 0.5, 0.8]);
  });

  it('nao acusa sobreposicao quando a planta nao tem escala definida', () => {
    const { plan, wallId } = wallWith(400);
    const created = addOpening(plan, wallId, 0.5, 'door', createScale());
    expect(validateOpening(created.plan, created.opening!, createScale())).toEqual([]);
  });
});

describe('adicionar em planta vazia', () => {
  it('cria parede e abertura do zero', () => {
    const builder = new PlanBuilder();
    const a = builder.vertex(0, 0);
    const b = builder.vertex(400, 0);
    const wallId = builder.wall(a, b);
    const plan = builder.snapshot();

    expect(Object.keys(plan.walls)).toEqual([wallId]);
    const result = addOpening(plan, wallId, 0.5, 'door', calibratedScale(100));
    expect(Object.keys(result.plan.openings)).toHaveLength(1);
  });

  it('recusa criar parede com canto nao registrado', () => {
    const builder = new PlanBuilder();
    const a = builder.vertex(0, 0);
    const b = builder.vertex(1, 1);
    const result = addWall(builder.snapshot(), a, 'x');
    expect(result.ok).toBe(false);
    expect(addVertex(builder.snapshot(), { x: 0, y: 0 }).vertex.id).not.toBe(b);
  });
});
