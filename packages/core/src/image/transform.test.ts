import { describe, expect, it } from 'vitest';
import { isConvexQuad } from './homography.js';
import type { NormalizedRect, Point, Quad } from '../model/types.js';
import {
  correctedSize,
  cropPixelRect,
  normalizeQuad,
  outputSize,
  rebaseQuadForRotation,
  rotateQuadAbout,
  rotateSize,
} from './transform.js';
import { orientForRotation } from './transform.js';

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('rotateSize', () => {
  it('mantem as dimensoes em 0 e 180', () => {
    expect(rotateSize(800, 600, 0)).toEqual({ width: 800, height: 600 });
    expect(rotateSize(800, 600, 180)).toEqual({ width: 800, height: 600 });
  });

  it('troca as dimensoes em 90 e 270', () => {
    expect(rotateSize(800, 600, 90)).toEqual({ width: 600, height: 800 });
    expect(rotateSize(800, 600, 270)).toEqual({ width: 600, height: 800 });
  });
});

describe('orientForRotation', () => {
  it('mapeia graus de 90 para angulos de canvas', () => {
    expect(orientForRotation(0)).toBe(0);
    expect(orientForRotation(90)).toBe(90);
    expect(orientForRotation(180)).toBe(180);
    expect(orientForRotation(270)).toBe(-90);
  });
});

describe('outputSize', () => {
  it('reduz para caber em maxEdge', () => {
    expect(outputSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('nao amplia imagem menor que maxEdge', () => {
    expect(outputSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('usa o maior lado', () => {
    expect(outputSize(3000, 4000, 1000)).toEqual({ width: 750, height: 1000 });
  });

  it('devolve zero para entrada invalida', () => {
    expect(outputSize(0, 100, 1000)).toEqual({ width: 0, height: 0 });
    expect(outputSize(100, 100, 0)).toEqual({ width: 0, height: 0 });
  });

  it('arredonda as bordas', () => {
    const size = outputSize(1333, 999, 1000);
    expect(Number.isInteger(size.width)).toBe(true);
    expect(Number.isInteger(size.height)).toBe(true);
  });
});

describe('cropPixelRect', () => {
  it('converte um recorte normalizado para pixels', () => {
    const crop: NormalizedRect = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
    expect(cropPixelRect(crop, 1000, 500)).toEqual({ x: 100, y: 100, width: 500, height: 300 });
  });

  it('devolve o canvas inteiro quando nao ha recorte', () => {
    expect(cropPixelRect(null, 800, 600)).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('preserva a proporcao em dimensao fracionaria', () => {
    const crop: NormalizedRect = { x: 0.25, y: 0, width: 0.5, height: 1 };
    const result = cropPixelRect(crop, 801, 400);
    expect(result.width).toBeCloseTo(400.5, 6);
    expect(result.height).toBe(400);
  });
});

describe('normalizeQuad', () => {
  it('prena os pontos nos limites da imagem rotacionada', () => {
    const quad: Quad = [
      { x: -30, y: -10 },
      { x: 5000, y: -5 },
      { x: 4990, y: 3000 },
      { x: 20, y: 2990 },
    ];
    const result = normalizeQuad(quad, 1000, 500);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[1]).toEqual({ x: 1000, y: 0 });
    expect(result[2]).toEqual({ x: 1000, y: 500 });
    expect(result[3]).toEqual({ x: 20, y: 500 });
  });

  it('mantem um quad ja valido sem alterar', () => {
    const quad: Quad = [
      { x: 10, y: 10 },
      { x: 100, y: 10 },
      { x: 100, y: 100 },
      { x: 10, y: 100 },
    ];
    expect(normalizeQuad(quad, 200, 200)).toEqual(quad);
  });

  it('substitui NaN por zero', () => {
    const quad: Quad = [
      { x: Number.NaN, y: 10 },
      { x: 100, y: 10 },
      { x: 100, y: 100 },
      { x: 10, y: 100 },
    ];
    expect(normalizeQuad(quad, 200, 200)[0]).toEqual({ x: 0, y: 10 });
  });
});

describe('correctedSize', () => {
  it('usa a media das arestas opostas do quadrilatero', () => {
    const quad: Quad = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 200 },
      { x: 0, y: 200 },
    ];
    expect(correctedSize(quad)).toEqual({ width: 400, height: 200 });
  });

  it('faz a media das arestas opostas de um trapezio', () => {
    const quad: Quad = [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 500, y: 300 },
      { x: 100, y: 300 },
    ];
    const size = correctedSize(quad);
    // horizontais: 600 (topo) e 400 (base) -> media 500
    expect(size.width).toBe(500);
    // verticais: sqrt(100^2 + 300^2) nos dois lados -> 316.23
    expect(size.height).toBe(316);
  });

  it('devolve zero quando todos os pontos coincidem', () => {
    const point: Point = { x: 10, y: 10 };
    expect(correctedSize([point, point, point, point])).toEqual({ width: 0, height: 0 });
  });
});

describe('rotateQuadAbout', () => {
  const square = (): Quad => [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('gira 90 graus em sentido horario preservando o tamanho', () => {
    const result = rotateQuadAbout(square(), 100, 100, 90);
    expect(correctedSize(result)).toEqual(correctedSize(square()));
  });

  it('mantem a ordem canonica dos cantos apos girar', () => {
    const girado = rotateQuadAbout(square(), 100, 100, 90);
    // o canto original superior-esquerdo (0,0) vai para superior-direito
    expect(girado[1].x).toBeCloseTo(100, 6);
    expect(girado[1].y).toBeCloseTo(0, 6);
    // e o superior-direito original (100,0) vai para inferior-direito
    expect(girado[2].x).toBeCloseTo(100, 6);
    expect(girado[2].y).toBeCloseTo(100, 6);
    // o primeiro canto do array e sempre o mais proximo do topo-esquerda
    expect(girado[0].x).toBeLessThan(girado[1].x);
    expect(girado[0].y).toBeLessThan(girado[3].y);
  });

  it('mantem a ordem canonica em 180 e 270 graus', () => {
    for (const graus of [180, 270, -90]) {
      const girado = rotateQuadAbout(square(), 100, 100, graus);
      expect(girado[0].x).toBeLessThan(girado[1].x);
      expect(girado[0].y).toBeLessThan(girado[3].y);
    }
  });

  it('mantem o quad convexo depois de girar', () => {
    const quadrado = square();
    for (const graus of [90, 180, 270]) {
      expect(isConvexQuad(rotateQuadAbout(quadrado, 100, 100, graus))).toBe(true);
    }
  });

  it('volta a posicao original depois de quatro giros de 90', () => {
    let quad = square();
    for (let i = 0; i < 4; i += 1) quad = rotateQuadAbout(quad, 100, 100, 90);
    expect(quad[0].x).toBeCloseTo(0, 6);
    expect(quad[2].x).toBeCloseTo(100, 6);
  });

  it('gira 180 graus', () => {
    const result = rotateQuadAbout(square(), 100, 100, 180);
    // o canto superior-esquerdo continua sendo o superior-esquerdo do array
    expect(result[0].x).toBeCloseTo(0, 6);
    expect(result[0].y).toBeCloseTo(0, 6);
    expect(result[2].x).toBeCloseTo(100, 6);
    expect(result[2].y).toBeCloseTo(100, 6);
  });

  it('nao move o centro', () => {
    const result = rotateQuadAbout(square(), 100, 100, 37);
    expect(correctedSize(result)).toEqual(correctedSize(square()));
  });
});

describe('rebaseQuadForRotation', () => {
  it('mantem os cantos alinhados ao rotacionar de 0 para 90', () => {
    const quad: Quad = [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ];
    const result = rebaseQuadForRotation(quad, 0, 90, { width: 100, height: 100 });
    // o canto original superior-esquerdo (10,10) migrou para superior-direito
    expect(result[1].x).toBeCloseTo(90, 6);
    expect(result[1].y).toBeCloseTo(10, 6);
    // e o array continuacomecando pelo canto superior-esquerdo
    expect(result[0].x).toBeCloseTo(10, 6);
    expect(result[0].y).toBeCloseTo(10, 6);
  });

  it('mantem a proporcao do quadrilatero apos rotacionar', () => {
    const quad: Quad = [
      { x: 20, y: 30 },
      { x: 300, y: 60 },
      { x: 280, y: 400 },
      { x: 10, y: 380 },
    ];
    const before = correctedSize(quad);
    const after = correctedSize(rebaseQuadForRotation(quad, 0, 90, { width: 800, height: 600 }));
    expect(after.width).toBe(before.height);
    expect(after.height).toBe(before.width);
  });
});
