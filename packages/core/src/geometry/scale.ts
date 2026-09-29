import { ASSUMED_PIXELS_PER_METER } from '../model/factory.js';
import type { MeasurementStatus, Point, ScaleState } from '../model/types.js';
import { distance } from './vec2.js';

export const effectivePixelsPerMeter = (scale: ScaleState): number | null =>
  scale.pixelsPerMeter ?? scale.assumedPixelsPerMeter ?? null;

export const hasRealScale = (scale: ScaleState): boolean => scale.pixelsPerMeter !== null;

export const measureStatus = (scale: ScaleState): MeasurementStatus => {
  if (scale.pixelsPerMeter !== null) {
    return scale.calibration?.origin === 'ocr' ? 'reconhecida' : 'informada';
  }
  if (scale.assumedPixelsPerMeter !== null) return 'estimada';
  return 'sem-escala';
};

export const measureStatusLabel: Record<MeasurementStatus, string> = {
  'sem-escala': 'Sem escala',
  estimada: 'Medidas estimadas',
  informada: 'Medida informada por voce',
  reconhecida: 'Medida reconhecida (confirme)',
};

export const pixelsToMeters = (pixels: number, scale: ScaleState): number | null => {
  const ppm = scale.pixelsPerMeter;
  if (ppm === null || ppm <= 0) return null;
  return pixels / ppm;
};

export const metersToPixels = (meters: number, scale: ScaleState): number | null => {
  const ppm = effectivePixelsPerMeter(scale);
  if (ppm === null || ppm <= 0) return null;
  return meters * ppm;
};

export const formatMeters = (meters: number | null, unit: ScaleState['unit'] = 'm'): string => {
  if (meters === null || !Number.isFinite(meters)) return 'sem escala';
  if (unit === 'cm') return `${(meters * 100).toFixed(0)} cm`;
  if (meters < 1) return `${(meters * 100).toFixed(1)} cm`;
  return `${meters.toFixed(2)} m`;
};

export const formatArea = (areaM2: number | null): string =>
  areaM2 === null || !Number.isFinite(areaM2) ? 'sem escala' : `${areaM2.toFixed(2)} m2`;

export const pixelsPerMeterFromReference = (
  a: Point,
  b: Point,
  realMeters: number,
): number | null => {
  const d = distance(a, b);
  if (!(d > 0) || !(realMeters > 0)) return null;
  return d / realMeters;
};

export const withAssumedScale = (
  scale: ScaleState,
  pixelsPerMeter: number = ASSUMED_PIXELS_PER_METER,
): ScaleState => ({
  ...scale,
  assumedPixelsPerMeter: scale.pixelsPerMeter === null ? pixelsPerMeter : null,
});
