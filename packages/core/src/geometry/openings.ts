import type { Id, IssueCode, Opening, PlanDocument, Point, ScaleState, Wall } from '../model/types.js';
import { effectivePixelsPerMeter } from './scale.js';
import { add, clamp, scale as scaleVec, sub } from './vec2.js';
import { wallEndpoints, wallLengthM, wallLengthPx, wallDirection } from './wall.js';

export const MIN_OPENING_WIDTH_M = 0.4;
export const OPENING_FIT_EPSILON_M = 0.005;

export const openingsOfWall = (plan: PlanDocument, wallId: Id): Opening[] =>
  Object.values(plan.openings)
    .filter((opening) => opening.wallId === wallId)
    .sort((a, b) => a.t - b.t);

export const openingCenterPx = (
  plan: PlanDocument,
  wall: Wall,
  opening: Opening,
): Point | null => {
  const ends = wallEndpoints(plan, wall);
  if (!ends) return null;
  return add(ends.a, scaleVec(sub(ends.b, ends.a), opening.t));
};

export const openingWidthPx = (opening: Opening, scale: ScaleState): number | null => {
  const ppm = effectivePixelsPerMeter(scale);
  if (ppm === null || ppm <= 0) return null;
  return opening.widthM * ppm;
};

export const openingSides = (
  plan: PlanDocument,
  wall: Wall,
  opening: Opening,
  scale: ScaleState,
): { start: Point; end: Point; axis: Point } | null => {
  const center = openingCenterPx(plan, wall, opening);
  const axis = wallDirection(plan, wall);
  const widthPx = openingWidthPx(opening, scale);
  if (!center || !axis || widthPx === null) return null;
  const half = scaleVec(axis, widthPx / 2);
  return { start: sub(center, half), end: add(center, half), axis };
};

export const fitsInWall = (opening: Opening, wallLengthM: number): boolean => {
  if (!(wallLengthM > 0)) return false;
  if (!(opening.widthM >= MIN_OPENING_WIDTH_M)) return false;
  const centerM = wallLengthM * opening.t;
  return (
    centerM - opening.widthM / 2 >= -OPENING_FIT_EPSILON_M &&
    centerM + opening.widthM / 2 <= wallLengthM + OPENING_FIT_EPSILON_M
  );
};

export const fitOpeningInWall = (
  opening: Opening,
  wallLengthM: number,
  minWidthM = MIN_OPENING_WIDTH_M,
): Opening => {
  if (!(wallLengthM > 0)) {
    return { ...opening, widthM: minWidthM, t: 0.5, review: 'needs-review' };
  }
  const maxWidth = Math.max(minWidthM, wallLengthM);
  const widthM = Math.min(Math.max(opening.widthM, minWidthM), maxWidth);
  const usable = Math.max(0, wallLengthM - widthM);
  const rawCenter = wallLengthM * opening.t;
  const centerM = clamp(rawCenter, widthM / 2, widthM / 2 + usable);
  const t = centerM / wallLengthM;
  const changed = Math.abs(widthM - opening.widthM) > 1e-9 || Math.abs(t - opening.t) > 1e-9;
  return {
    ...opening,
    widthM,
    t,
    review: changed ? 'needs-review' : opening.review,
  };
};

export const findOverlappingOpenings = (
  plan: PlanDocument,
  wallId: Id,
  scale: ScaleState,
): [Opening, Opening][] => {
  const wall = plan.walls[wallId];
  if (!wall) return [];
  const lengthM = wallLengthM(plan, wall, scale);
  if (lengthM === null || lengthM <= 0) return [];
  const list = openingsOfWall(plan, wallId);
  const pairs: [Opening, Opening][] = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i]!;
      const b = list[j]!;
      const aCenter = lengthM * a.t;
      const bCenter = lengthM * b.t;
      const aStart = aCenter - a.widthM / 2;
      const aEnd = aCenter + a.widthM / 2;
      const bStart = bCenter - b.widthM / 2;
      const bEnd = bCenter + b.widthM / 2;
      if (aStart < bEnd && bStart < aEnd) pairs.push([a, b]);
    }
  }
  return pairs;
};

export const validateOpening = (
  plan: PlanDocument,
  opening: Opening,
  scale: ScaleState,
): IssueCode[] => {
  const issues: IssueCode[] = [];
  const wall = plan.walls[opening.wallId];
  if (!wall) {
    issues.push('opening-out-of-wall');
    return issues;
  }
  const lengthPx = wallLengthPx(plan, wall);
  if (lengthPx === null || lengthPx <= 0) {
    issues.push('opening-out-of-wall');
    return issues;
  }
  if (!(opening.widthM >= MIN_OPENING_WIDTH_M)) issues.push('opening-zero-width');
  if (opening.t < -1e-6 || opening.t > 1 + 1e-6) {
    issues.push('opening-out-of-wall');
    return issues;
  }
  if (scale.pixelsPerMeter !== null) {
    const lengthM = lengthPx / scale.pixelsPerMeter;
    if (!fitsInWall(opening, lengthM)) issues.push('opening-out-of-wall');
  }
  const overlaps = findOverlappingOpenings(plan, wall.id, scale).some(([a, b]) => {
    if (a.id === b.id) return false;
    return a.id === opening.id || b.id === opening.id;
  });
  if (overlaps) issues.push('opening-overlap');
  return Array.from(new Set(issues));
};

export const validateOpeningsOfWall = (
  plan: PlanDocument,
  wall: Wall,
  scale: ScaleState,
): Map<Id, IssueCode[]> => {
  const result = new Map<Id, IssueCode[]>();
  for (const opening of openingsOfWall(plan, wall.id)) {
    result.set(opening.id, validateOpening(plan, opening, scale));
  }
  return result;
};
