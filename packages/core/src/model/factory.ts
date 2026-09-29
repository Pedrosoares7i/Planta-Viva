import { createId } from './ids.js';
import type {
  Calibration,
  ImageRef,
  ImageTransform,
  Opening,
  OpeningKind,
  PlanDocument,
  Point,
  ProjectDocument,
  Room,
  RoomNameOrigin,
  ScaleState,
  Vertex,
  Wall,
  ElementOrigin,
  Evidence,
  ReviewFlag,
  Id,
} from './types.js';

export const SCHEMA_VERSION = 1 as const;

export const DEFAULT_WALL_THICKNESS_M = 0.15;
export const DEFAULT_WALL_HEIGHT_M = 2.7;
export const DEFAULT_DOOR_WIDTH_M = 0.8;
export const DEFAULT_DOOR_HEIGHT_M = 2.1;
export const DEFAULT_WINDOW_WIDTH_M = 1.2;
export const DEFAULT_WINDOW_HEIGHT_M = 1.3;
export const DEFAULT_WINDOW_SILL_M = 0.9;
export const DEFAULT_MAX_EDGE = 2000;
export const ASSUMED_PIXELS_PER_METER = 100;

export const emptyPlan = (): PlanDocument => ({
  vertices: {},
  walls: {},
  openings: {},
  rooms: {},
});

export const createVertex = (
  point: Point,
  origin: ElementOrigin = 'manual',
  extra: Partial<Vertex> = {},
): Vertex => ({
  id: createId('v'),
  x: point.x,
  y: point.y,
  origin,
  review: 'ok',
  evidence: [],
  ...extra,
});

export const createWall = (
  a: Id,
  b: Id,
  options: Partial<Wall> = {},
): Wall => ({
  id: createId('w'),
  a,
  b,
  thicknessM: DEFAULT_WALL_THICKNESS_M,
  heightM: null,
  origin: 'manual',
  review: 'ok',
  evidence: [],
  issues: [],
  derivedFrom: null,
  groupId: null,
  ...options,
});

export const createOpening = (
  wallId: Id,
  kind: OpeningKind,
  t: number,
  options: Partial<Opening> = {},
): Opening => ({
  id: createId('o'),
  kind,
  wallId,
  t,
  widthM: kind === 'door' ? DEFAULT_DOOR_WIDTH_M : DEFAULT_WINDOW_WIDTH_M,
  heightM: kind === 'door' ? DEFAULT_DOOR_HEIGHT_M : DEFAULT_WINDOW_HEIGHT_M,
  sillM: kind === 'door' ? 0 : DEFAULT_WINDOW_SILL_M,
  swing: kind === 'door' ? 'left' : 'none',
  origin: 'manual',
  review: 'ok',
  evidence: [],
  issues: [],
  derivedFrom: null,
  label: null,
  ...options,
});

export const roomFallbackName = (index: number): string => `Ambiente ${index}`;

export const createRoom = (
  vertexIds: Id[],
  options: Partial<Room> = {},
): Room => {
  const nameOrigin: RoomNameOrigin = options.nameOrigin ?? 'fallback';
  const fallbackIndex = vertexIds.length > 0 ? vertexIds.length : 1;
  return {
    id: createId('r'),
    name: options.name ?? (nameOrigin === 'fallback' ? roomFallbackName(fallbackIndex) : 'Ambiente'),
    nameOrigin,
    vertexIds,
    origin: 'manual',
    review: 'ok',
    evidence: [],
    issues: [],
    areaM2: null,
    wallIds: [],
    ...options,
  };
};

export const createScale = (): ScaleState => ({
  unit: 'm',
  pixelsPerMeter: null,
  assumedPixelsPerMeter: null,
  calibration: null,
  wallThicknessM: DEFAULT_WALL_THICKNESS_M,
  wallHeightM: DEFAULT_WALL_HEIGHT_M,
});

export const createTransform = (
  width: number,
  height: number,
  maxEdge: number = DEFAULT_MAX_EDGE,
): ImageTransform => ({
  sourceWidth: width,
  sourceHeight: height,
  outputWidth: width,
  outputHeight: height,
  maxEdge,
  rotation: 0,
  crop: null,
  perspective: null,
  steps: [],
});

export type CreateImageRefInput = {
  mimeType: string;
  width: number;
  height: number;
  byteLength: number;
  sha256?: string | null;
  storage?: ImageRef['storage'];
  key?: string | null;
};

export const createImageRef = (input: CreateImageRefInput): ImageRef => ({
  id: createId('img'),
  storage: input.storage ?? 'indexeddb',
  key: input.key ?? null,
  mimeType: input.mimeType,
  width: input.width,
  height: input.height,
  byteLength: input.byteLength,
  sha256: input.sha256 ?? null,
});

export const createProject = (
  image: ImageRef,
  name = 'Projeto sem nome',
): ProjectDocument => {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: createId('p'),
    name,
    createdAt: now,
    updatedAt: now,
    image,
    transform: createTransform(image.width, image.height),
    scale: createScale(),
    plan: emptyPlan(),
    recognition: null,
  };
};

export const evidence = (
  source: Evidence['source'],
  note: string,
  measured?: number,
  unit?: string,
): Evidence => {
  const result: Evidence = { source, note };
  if (measured !== undefined) result.measured = measured;
  if (unit !== undefined) result.unit = unit;
  return result;
};

export const markReview = (review: ReviewFlag): ReviewFlag => review;

export const withUpdatedAt = (doc: ProjectDocument): ProjectDocument => ({
  ...doc,
  updatedAt: new Date().toISOString(),
});

export const calibrate = (
  scale: ScaleState,
  a: Point,
  b: Point,
  realMeters: number,
  origin: Calibration['origin'] = 'user',
  rawText: string | null = null,
): ScaleState => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distancePx = Math.hypot(dx, dy);
  if (!(distancePx > 0) || !(realMeters > 0)) {
    return scale;
  }
  return {
    ...scale,
    pixelsPerMeter: distancePx / realMeters,
    assumedPixelsPerMeter: null,
    calibration: {
      a,
      b,
      realMeters,
      origin,
      rawText,
      createdAt: new Date().toISOString(),
    },
  };
};
