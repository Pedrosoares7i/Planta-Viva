export type Id = string;

export type Point = { x: number; y: number };

export type Rect = { x: number; y: number; width: number; height: number };

/** Retângulo em coordenadas normalizadas 0..1, relativo ao estágio anterior. */
export type NormalizedRect = { x: number; y: number; width: number; height: number };

export type Quad = [Point, Point, Point, Point];

export type ElementOrigin = 'auto' | 'manual' | 'demo';

export type ReviewFlag = 'ok' | 'needs-review';

export type MeasurementStatus =
  | 'sem-escala'
  | 'estimada'
  | 'informada'
  | 'reconhecida';

export type OpeningKind = 'door' | 'window';

export type RoomNameOrigin = 'user' | 'ocr' | 'model' | 'fallback';

export type IssueCode =
  | 'wall-zero-length'
  | 'wall-duplicate'
  | 'wall-missing-vertex'
  | 'opening-out-of-wall'
  | 'opening-overlap'
  | 'opening-zero-width'
  | 'room-too-few-vertices'
  | 'room-self-intersecting'
  | 'room-zero-area'
  | 'room-missing-vertex'
  | 'orphan-vertex'
  | 'no-scale'
  | 'room-unclassified';

export type Issue = {
  code: IssueCode;
  message: string;
  elementId: Id | null;
  elementKind: 'wall' | 'opening' | 'room' | 'vertex' | 'document';
  severity: 'error' | 'warning';
};

export type Evidence = {
  source: 'measure' | 'vision-classic' | 'vision-model' | 'ocr' | 'user';
  note: string;
  measured?: number;
  unit?: string;
};

export type Vertex = {
  id: Id;
  x: number;
  y: number;
  origin: ElementOrigin;
  review: ReviewFlag;
  evidence: Evidence[];
};

export type Wall = {
  id: Id;
  a: Id;
  b: Id;
  thicknessM: number;
  heightM: number | null;
  origin: ElementOrigin;
  review: ReviewFlag;
  evidence: Evidence[];
  issues: IssueCode[];
  derivedFrom: Id | null;
  groupId: Id | null;
};

export type Opening = {
  id: Id;
  kind: OpeningKind;
  wallId: Id;
  t: number;
  widthM: number;
  heightM: number | null;
  sillM: number;
  swing: 'left' | 'right' | 'none';
  origin: ElementOrigin;
  review: ReviewFlag;
  evidence: Evidence[];
  issues: IssueCode[];
  derivedFrom: Id | null;
  label: string | null;
};

export type Room = {
  id: Id;
  name: string;
  nameOrigin: RoomNameOrigin;
  vertexIds: Id[];
  origin: ElementOrigin;
  review: ReviewFlag;
  evidence: Evidence[];
  issues: IssueCode[];
  areaM2: number | null;
  wallIds: Id[];
};

export type PlanDocument = {
  vertices: Record<Id, Vertex>;
  walls: Record<Id, Wall>;
  openings: Record<Id, Opening>;
  rooms: Record<Id, Room>;
};

export type Calibration = {
  a: Point;
  b: Point;
  realMeters: number;
  origin: 'user' | 'ocr';
  rawText: string | null;
  createdAt: string;
};

export type ScaleState = {
  unit: 'm' | 'cm';
  pixelsPerMeter: number | null;
  assumedPixelsPerMeter: number | null;
  calibration: Calibration | null;
  wallThicknessM: number;
  wallHeightM: number;
};

export type TransformStep = {
  kind: 'rotate' | 'crop' | 'perspective' | 'resize';
  detail: string;
  at: string;
};

export type ImageTransform = {
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  maxEdge: number;
  rotation: 0 | 90 | 180 | 270;
  crop: NormalizedRect | null;
  perspective: Quad | null;
  steps: TransformStep[];
};

export type ImageRef = {
  id: Id;
  mimeType: string;
  width: number;
  height: number;
  byteLength: number;
  sha256: string | null;
  storage: 'indexeddb' | 'inline';
  key: string | null;
};

export type RecognitionSummary = {
  provider: string;
  model: string;
  ranAt: string;
  demo: boolean;
  partial: boolean;
  notes: string[];
  counts: {
    walls: number;
    doors: number;
    windows: number;
    rooms: number;
  };
};

export type ProjectDocument = {
  schemaVersion: 1;
  id: Id;
  name: string;
  createdAt: string;
  updatedAt: string;
  image: ImageRef;
  transform: ImageTransform;
  scale: ScaleState;
  plan: PlanDocument;
  recognition: RecognitionSummary | null;
};

export type ProjectFile = {
  format: 'planta-viva';
  formatVersion: 1;
  exportedAt: string;
  document: ProjectDocument;
  imageBase64: string | null;
};
