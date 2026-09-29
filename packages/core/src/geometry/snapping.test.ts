import { describe, expect, it } from 'vitest';
import { hitTestWalls, snapPoint } from './snapping.js';
import { moveVertex } from '../index.js';
import { cornerPlan } from '../testing/fixtures.js';

describe('encaixe em cantos', () => {
  it('encaixa em um vertice proximo', () => {
    const { plan } = cornerPlan();
    const snap = snapPoint(plan, { x: 106, y: 95 }, {
      tolerancePx: 12,
      enabled: true,
      axisLock: true,
    });
    expect(snap.kind).toBe('vertex');
    expect(snap.point).toEqual({ x: 100, y: 100 });
  });

  it('respeita o vertice excluido', () => {
    const { plan, corner } = cornerPlan();
    const snap = snapPoint(
      plan,
      { x: 103, y: 102 },
      { tolerancePx: 12, enabled: true, axisLock: true, excludeVertexId: corner },
    );
    expect(snap.kind).not.toBe('vertex');
  });

  it('nao encaixa fora da tolerancia', () => {
    const { plan } = cornerPlan();
    const snap = snapPoint(plan, { x: 160, y: 160 }, {
      tolerancePx: 10,
      enabled: true,
      axisLock: true,
    });
    expect(snap.kind).toBe('none');
  });

  it('pode ser desligado', () => {
    const { plan } = cornerPlan();
    const snap = snapPoint(plan, { x: 103, y: 102 }, {
      tolerancePx: 12,
      enabled: false,
      axisLock: true,
    });
    expect(snap.kind).toBe('none');
    expect(snap.point).toEqual({ x: 103, y: 102 });
  });

  it('encaixa em eixo alinhado com outro vertice', () => {
    const { plan } = cornerPlan();
    const snap = snapPoint(plan, { x: 96, y: 260 }, {
      tolerancePx: 12,
      enabled: true,
      axisLock: true,
    });
    expect(snap.kind).toBe('axis-x');
    expect(snap.point.x).toBe(100);
  });

  it('encaixa no eixo de uma parede ortogonal', () => {
    const { plan, corner } = cornerPlan();
    const snap = snapPoint(
      plan,
      { x: 108, y: 240 },
      { tolerancePx: 12, enabled: true, axisLock: true, excludeVertexId: corner },
    );
    expect(snap.kind).toBe('axis-x');
    expect(snap.point.x).toBe(100);
  });

  it('encaixa no eixo horizontal da parede vizinha', () => {
    const { plan, corner } = cornerPlan();
    const snap = snapPoint(
      plan,
      { x: 250, y: 96 },
      { tolerancePx: 12, enabled: true, axisLock: true, excludeVertexId: corner },
    );
    expect(snap.kind).toBe('axis-y');
    expect(snap.point.y).toBe(100);
  });

  it('atualiza o resultado quando o vertice de referencia se move', () => {
    const { plan, corner, right } = cornerPlan();
    const moved = moveVertex(plan, right, { x: 500, y: 100 });
    const snap = snapPoint(
      moved.plan,
      { x: 96, y: 300 },
      { tolerancePx: 12, enabled: true, axisLock: true, excludeVertexId: corner },
    );
    expect(snap.kind).toBe('axis-x');
    expect(snap.point.x).toBe(100);
  });
});

describe('teste de acerto em parede', () => {
  it('encontra a parede e o parametro t', () => {
    const { plan } = cornerPlan();
    const hit = hitTestWalls(plan, { x: 250, y: 103 }, 8);
    expect(hit).not.toBeNull();
    expect(hit!.t).toBeCloseTo(0.5, 2);
    expect(hit!.point.y).toBeCloseTo(100);
  });

  it('ignora pontos longe de qualquer parede', () => {
    const { plan } = cornerPlan();
    expect(hitTestWalls(plan, { x: 900, y: 900 }, 8)).toBeNull();
  });

  it('escolhe a parede mais proxima', () => {
    const { plan, right, down } = cornerPlan();
    const hit = hitTestWalls(plan, { x: 102, y: 250 }, 6);
    expect(hit!.wallId).toBe(
      Object.values(plan.walls).find(
        (w) => (w.a === down && w.b === right) || (w.a === right && w.b === down),
      )?.id ?? hit!.wallId,
    );
  });
});
