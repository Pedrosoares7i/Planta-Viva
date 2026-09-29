import { describe, expect, it } from 'vitest';
import {
  applyHomography,
  composeHomography,
  correctionHomography,
  correctionHomographyInverse,
  identityHomography,
  invertHomography,
  isConvexQuad,
  outputQuadFor,
  quadArea,
  solveHomography,
} from './homography.js';
import type { Quad } from '../model/types.js';

const unitSquare: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

describe('homografia', () => {
  it('resolve a identidade quando a quad de origem e a de destino sao iguais', () => {
    const h = solveHomography(unitSquare, unitSquare)!;
    for (const p of unitSquare) {
      const mapped = applyHomography(h, p)!;
      expect(mapped.x).toBeCloseTo(p.x, 6);
      expect(mapped.y).toBeCloseTo(p.y, 6);
    }
  });

  it('mapeia apenas os quatro cantos de origem', () => {
    const dst: Quad = [
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 70 },
      { x: 10, y: 70 },
    ];
    const h = solveHomography(unitSquare, dst)!;
    unitSquare.forEach((p, i) => {
      const mapped = applyHomography(h, p)!;
      expect(mapped.x).toBeCloseTo(dst[i]!.x, 6);
      expect(mapped.y).toBeCloseTo(dst[i]!.y, 6);
    });
  });

  it('aplica transformacao de perspectiva de um quad inclinado', () => {
    const tilted: Quad = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 820, y: 600 },
      { x: 180, y: 600 },
    ];
    const h = solveHomography(tilted, outputQuadFor(820, 600))!;
    for (const [i, p] of tilted.entries()) {
      const mapped = applyHomography(h, p)!;
      expect(mapped.x).toBeCloseTo(outputQuadFor(820, 600)[i]!.x, 4);
      expect(mapped.y).toBeCloseTo(outputQuadFor(820, 600)[i]!.y, 4);
    }
  });

  it('devolve a inversa que desfaz a correcao', () => {
    const tilted: Quad = [
      { x: 12, y: 30 },
      { x: 980, y: 8 },
      { x: 900, y: 610 },
      { x: 90, y: 640 },
    ];
    const h = correctionHomography(tilted, 868, 632)!;
    const inv = correctionHomographyInverse(tilted, 868, 632)!;
    for (const p of tilted) {
      const forward = applyHomography(h, p)!;
      const back = applyHomography(inv, forward)!;
      expect(back.x).toBeCloseTo(p.x, 3);
      expect(back.y).toBeCloseTo(p.y, 3);
    }
  });

  it('inverte a identidade', () => {
    const inv = invertHomography(identityHomography())!;
    const mapped = applyHomography(inv, { x: 3, y: 7 })!;
    expect(mapped.x).toBeCloseTo(3);
    expect(mapped.y).toBeCloseTo(7);
  });

  it('compoe homografias na ordem correta', () => {
    const a = solveHomography(unitSquare, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ])!;
    const b = solveHomography(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
      unitSquare,
    )!;
    const composed = applyHomography(composeHomography(a, b), { x: 0.5, y: 0.5 })!;
    expect(composed.x).toBeCloseTo(0.5, 6);
    expect(composed.y).toBeCloseTo(0.5, 6);
  });

  it('detecta quad convexo e quad degenerado', () => {
    expect(isConvexQuad(unitSquare)).toBe(true);
    expect(
      isConvexQuad([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 10 },
      ]),
    ).toBe(false);
  });

  it('calcula a area do quad de saida', () => {
    expect(quadArea(outputQuadFor(400, 300))).toBe(120000);
  });
});
