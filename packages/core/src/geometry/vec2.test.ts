import { describe, expect, it } from 'vitest';
import {
  isSimplePolygon,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonSignedArea,
  ensureCounterClockwise,
} from './polygon.js';
import {
  distance,
  distanceToSegment,
  normalize,
  perpendicular,
  projectPointOnSegment,
  segmentIntersection,
  sub,
} from './vec2.js';

describe('vec2', () => {
  it('calcula distancia e normaliza vetores', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(normalize({ x: 10, y: 0 })).toEqual({ x: 1, y: 0 });
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('gera vetor perpendicular unitario', () => {
    const n = perpendicular(normalize({ x: 2, y: 0 }));
    expect(n.x).toBe(0);
    expect(n.y).toBe(1);
  });

  it('projeta ponto no segmento com clamp nos extremos', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(projectPointOnSegment({ x: 5, y: 5 }, a, b)).toEqual({ x: 5, y: 0 });
    expect(projectPointOnSegment({ x: -4, y: 0 }, a, b)).toEqual({ x: 0, y: 0 });
    expect(projectPointOnSegment({ x: 99, y: 0 }, a, b)).toEqual({ x: 10, y: 0 });
  });

  it('calcula distancia ao segmento', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });

  it('encontra intersecao de segmentos', () => {
    const hit = segmentIntersection(
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    );
    expect(hit).toEqual({ x: 5, y: 5 });
  });

  it('devolve null para segmentos paralelos', () => {
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }),
    ).toBeNull();
  });
});

describe('polygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('calcula area com sinal e absoluta', () => {
    expect(polygonArea(square)).toBe(100);
    const reversed = [...square].reverse();
    expect(polygonSignedArea(reversed)).toBe(-100);
    expect(polygonArea(reversed)).toBe(100);
  });

  it('calcula centroide', () => {
    const c = polygonCentroid(square);
    expect(c.x).toBeCloseTo(5);
    expect(c.y).toBeCloseTo(5);
  });

  it('normaliza orientacao para anti-horario', () => {
    const normalized = ensureCounterClockwise([...square].reverse());
    expect(polygonSignedArea(normalized)).toBeGreaterThan(0);
  });

  it('detecta poligono simples e poligono que se cruza', () => {
    expect(isSimplePolygon(square)).toBe(true);
    const bowtie = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(isSimplePolygon(bowtie)).toBe(false);
  });

  it('testa ponto dentro e fora', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });

  it('rejeita poligono degenerado', () => {
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(polygonArea(line)).toBe(0);
  });

  it('usa sub corretamente para vetores', () => {
    expect(sub({ x: 5, y: 5 }, { x: 1, y: 2 })).toEqual({ x: 4, y: 3 });
  });
});
