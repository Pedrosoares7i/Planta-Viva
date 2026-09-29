import { describe, expect, it } from 'vitest';
import {
  calibrate,
  createScale,
  effectivePixelsPerMeter,
  formatArea,
  formatMeters,
  hasRealScale,
  measureStatus,
  metersToPixels,
  moveVertex,
  pixelsPerMeterFromReference,
  pixelsToMeters,
  wallLengthM,
  wallLengthPx,
  withAssumedScale,
} from '../index.js';
import { calibratedScale, squarePlan, vertexIdAt } from '../testing/fixtures.js';

describe('escala', () => {
  it('comeca sem escala', () => {
    const scale = createScale();
    expect(hasRealScale(scale)).toBe(false);
    expect(measureStatus(scale)).toBe('sem-escala');
    expect(effectivePixelsPerMeter(scale)).toBeNull();
    expect(formatMeters(null)).toBe('sem escala');
  });

  it('calcula pixels por metro a partir de dois pontos conhecidos', () => {
    const scale = calibrate(createScale(), { x: 0, y: 0 }, { x: 500, y: 0 }, 5);
    expect(scale.pixelsPerMeter).toBe(100);
    expect(measureStatus(scale)).toBe('informada');
    expect(hasRealScale(scale)).toBe(true);
  });

  it('distingue medida reconhecida de informada pelo usuario', () => {
    const scale = calibrate(createScale(), { x: 0, y: 0 }, { x: 300, y: 0 }, 3, 'ocr', '3 m');
    expect(measureStatus(scale)).toBe('reconhecida');
    expect(scale.calibration?.rawText).toBe('3 m');
  });

  it('recusa calibracao com distancia ou medida invalida', () => {
    const base = createScale();
    const same = calibrate(base, { x: 10, y: 10 }, { x: 10, y: 10 }, 3);
    expect(same).toBe(base);
    const zero = calibrate(base, { x: 0, y: 0 }, { x: 100, y: 0 }, 0);
    expect(zero).toBe(base);
  });

  it('usa escala provisoria como estimada, nunca como informada', () => {
    const estimated = withAssumedScale(createScale(), 80);
    expect(measureStatus(estimated)).toBe('estimada');
    expect(hasRealScale(estimated)).toBe(false);
    expect(pixelsToMeters(400, estimated)).toBeNull();
    expect(metersToPixels(2, estimated)).toBe(160);
  });

  it('escala real substitui a estimada', () => {
    const estimated = withAssumedScale(createScale(), 80);
    const real = calibrate(estimated, { x: 0, y: 0 }, { x: 800, y: 0 }, 4);
    expect(real.assumedPixelsPerMeter).toBeNull();
    expect(real.pixelsPerMeter).toBe(200);
  });

  it('converte pixels e metros nos dois sentidos', () => {
    const scale = calibratedScale(100);
    expect(pixelsToMeters(350, scale)).toBeCloseTo(3.5);
    expect(metersToPixels(3.5, scale)).toBeCloseTo(350);
  });

  it('calcula pixels por metro de referencia', () => {
    expect(pixelsPerMeterFromReference({ x: 0, y: 0 }, { x: 0, y: 250 }, 2.5)).toBe(100);
    expect(pixelsPerMeterFromReference({ x: 0, y: 0 }, { x: 0, y: 0 }, 2.5)).toBeNull();
  });

  it('formata medidas de forma legivel', () => {
    expect(formatMeters(3.456)).toBe('3.46 m');
    expect(formatMeters(0.85)).toBe('85.0 cm');
    expect(formatMeters(2.5, 'cm')).toBe('250 cm');
    expect(formatArea(12.3456)).toBe('12.35 m2');
    expect(formatArea(null)).toBe('sem escala');
  });
});

describe('comprimento de parede', () => {
  it('mede em pixels e em metros', () => {
    const plan = squarePlan(400);
    const wall = Object.values(plan.walls)[0]!;
    expect(wallLengthPx(plan, wall)).toBeCloseTo(400);
    expect(wallLengthM(plan, wall, calibratedScale(100))).toBeCloseTo(4);
  });

  it('devolve null em metros quando nao ha escala', () => {
    const plan = squarePlan(400);
    const wall = Object.values(plan.walls)[0]!;
    expect(wallLengthM(plan, wall, createScale())).toBeNull();
  });

  it('acompanha a mudanca de escala sem alterar a geometria', () => {
    const plan = squarePlan(400);
    const wall = Object.values(plan.walls)[0]!;
    expect(wallLengthM(plan, wall, calibratedScale(200))).toBeCloseTo(2);
    expect(wallLengthPx(plan, wall)).toBeCloseTo(400);
  });

  it('atualiza o comprimento quando um canto compartilhado se move', () => {
    const plan = squarePlan(400);
    const corner = vertexIdAt(plan, 0, 0);
    const before = Object.values(plan.walls).map((w) => wallLengthPx(plan, w)!);
    expect(before.every((l) => Math.abs(l - 400) < 1e-6)).toBe(true);

    const moved = moveVertex(plan, corner, { x: -100, y: 0 });
    const after = Object.values(moved.plan.walls).map((w) => wallLengthPx(moved.plan, w)!);
    expect(after.filter((l) => Math.abs(l - 500) < 1e-6)).toHaveLength(1);
    expect(after.filter((l) => Math.abs(l - 400) < 1e-6)).toHaveLength(2);
    expect(after.filter((l) => Math.abs(l - Math.hypot(100, 400)) < 1e-6)).toHaveLength(1);
  });
});
