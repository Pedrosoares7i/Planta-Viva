import { describe, expect, it } from 'vitest';
import { estimateImageQuality, MIN_USABLE_EDGE } from './quality.js';

const good = {
  width: 3000,
  height: 2000,
  byteLength: 3_000_000,
  meanLuma: 150,
  contrast: 60,
  edgeDensity: 0.08,
};

describe('estimateImageQuality', () => {
  it('classifica uma foto tipica de boa qualidade', () => {
    const result = estimateImageQuality(good);
    expect(result.level).toBe('boa');
    expect(result.reasons).toEqual([]);
    expect(result.positive).toContain('Resolução suficiente');
  });

  it('bloqueia imagens com menos de 480 px no lado menor', () => {
    const result = estimateImageQuality({ ...good, width: 400, height: 300 });
    expect(result.blocking).toBe(true);
    if (result.blocking) {
      expect(result.code).toBe('resolution-too-low');
      expect(result.message).toContain('1200 px');
    }
  });

  it('aceita entre 480 e 800 px mas sinaliza como razoavel', () => {
    const result = estimateImageQuality({ ...good, width: 640, height: 480, byteLength: 300_000 });
    expect(result.blocking).toBe(false);
    expect(result.level).toBe('razoavel');
    expect(result.reasons.join(' ')).toContain('Resolução baixa');
  });

  it('considera o lado menor, nao a largura', () => {
    const result = estimateImageQuality({ ...good, width: 4000, height: 400 });
    expect(result.blocking).toBe(true);
  });

  it('sinaliza compressao excessiva', () => {
    const result = estimateImageQuality({ ...good, byteLength: 30_000 });
    expect(result.reasons.join(' ')).toContain('Compressão alta');
  });

  it('sinaliza imagem escura e clara demais', () => {
    const dark = estimateImageQuality({ ...good, meanLuma: 12 });
    expect(dark.level).toBe('ruim');
    expect(dark.reasons.join(' ')).toContain('escura');

    const bright = estimateImageQuality({ ...good, meanLuma: 240 });
    expect(bright.level).toBe('ruim');
    expect(bright.reasons.join(' ')).toContain('clara');
  });

  it('sinaliza contraste baixo', () => {
    const result = estimateImageQuality({ ...good, contrast: 9 });
    expect(result.level).toBe('ruim');
    expect(result.reasons.join(' ')).toContain('Contraste baixo');
  });

  it('sinaliza ausencia de linhas', () => {
    const result = estimateImageQuality({ ...good, edgeDensity: 0.002 });
    expect(result.level).toBe('ruim');
    expect(result.reasons.join(' ')).toContain('Poucas linhas');
  });

  it('nao mede nada que nao foi informado', () => {
    const result = estimateImageQuality({ width: 2000, height: 2000, byteLength: 2_000_000 });
    expect(result.level).toBe('boa');
    expect(result.reasons).toEqual([]);
  });

  it('acumula problemas e chega a ruim sem bloquear', () => {
    const result = estimateImageQuality({
      width: 700,
      height: 700,
      byteLength: 20_000,
      meanLuma: 25,
      contrast: 10,
    });
    expect(result.blocking).toBe(false);
    expect(result.level).toBe('ruim');
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it('usa MIN_USABLE_EDGE como referencia do limite', () => {
    const result = estimateImageQuality({ ...good, width: MIN_USABLE_EDGE, height: MIN_USABLE_EDGE });
    expect(result.reasons).toEqual([]);
  });
});
