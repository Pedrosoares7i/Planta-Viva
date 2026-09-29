import { describe, expect, it } from 'vitest';
import {
  clamp01,
  growRect,
  intersectRect,
  normalizedFromRect,
  rectArea,
  rectFromNormalized,
} from './crop.js';

describe('clamp01', () => {
  it('prende em 0 e 1', () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(4)).toBe(1);
    expect(clamp01(0.25)).toBe(0.25);
  });

  it('trata NaN e infinito como 0', () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clamp01(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('rectFromNormalized', () => {
  it('converte para pixels', () => {
    expect(rectFromNormalized({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, 800, 400)).toEqual({
      x: 200,
      y: 200,
      width: 400,
      height: 100,
    });
  });

  it('mapeia o retangulo inteiro para o canvas inteiro', () => {
    const r = rectFromNormalized({ x: 0, y: 0, width: 1, height: 1 }, 640, 480);
    expect(r).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });
});

describe('normalizedFromRect', () => {
  it('e a inversa de rectFromNormalized', () => {
    const rect = { x: 100, y: 50, width: 300, height: 150 };
    expect(normalizedFromRect(rect, 800, 400)).toEqual({ x: 0.125, y: 0.125, width: 0.375, height: 0.375 });
  });

  it('prena valores fora de faixa', () => {
    const result = normalizedFromRect({ x: -50, y: -10, width: 2000, height: 900 }, 800, 400);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it('devolve zero quando o tamanho e invalido', () => {
    expect(normalizedFromRect({ x: 10, y: 10, width: 5, height: 5 }, 0, 0)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe('intersectRect', () => {
  it('devolve a intersecao de dois retangulos', () => {
    const result = intersectRect(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 50, y: 50, width: 100, height: 100 },
    );
    expect(result).toEqual({ x: 50, y: 50, width: 50, height: 50 });
  });

  it('devolve null quando nao ha sobreposicao', () => {
    expect(
      intersectRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 50, y: 50, width: 10, height: 10 }),
    ).toBeNull();
  });

  it('devolve null quando o canto coincide (area zero)', () => {
    expect(
      intersectRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 10, width: 10, height: 10 }),
    ).toBeNull();
  });
});

describe('growRect', () => {
  it('expande nos quatro lados', () => {
    expect(growRect({ x: 100, y: 100, width: 50, height: 50 }, 10)).toEqual({
      x: 90,
      y: 90,
      width: 70,
      height: 70,
    });
  });
});

describe('rectArea', () => {
  it('ignora dimensoes negativas', () => {
    expect(rectArea({ x: 0, y: 0, width: -5, height: 10 })).toBe(0);
  });

  it('calcula a area', () => {
    expect(rectArea({ x: 3, y: 3, width: 4, height: 5 })).toBe(20);
  });
});
