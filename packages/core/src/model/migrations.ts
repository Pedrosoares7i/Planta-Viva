import {
  SCHEMA_VERSION,
  createScale,
  createTransform,
  emptyPlan,
} from './factory.js';
import type {
  Calibration,
  ImageRef,
  ImageTransform,
  PlanDocument,
  ProjectDocument,
  ScaleState,
} from './types.js';

export type MigrationResult =
  | { ok: true; document: ProjectDocument; warnings: string[] }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const str = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

const strOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const sanitizePlan = (input: unknown, warnings: string[]): PlanDocument => {
  const plan = emptyPlan();
  if (!isRecord(input)) return plan;

  if (isRecord(input.vertices)) {
    for (const [id, raw] of Object.entries(input.vertices)) {
      if (!isRecord(raw)) {
        warnings.push(`Canto "${id}" ignorado: formato invalido.`);
        continue;
      }
      plan.vertices[id] = {
        id,
        x: num(raw.x, 0),
        y: num(raw.y, 0),
        origin: raw.origin === 'auto' || raw.origin === 'demo' ? raw.origin : 'manual',
        review: raw.review === 'needs-review' ? 'needs-review' : 'ok',
        evidence: Array.isArray(raw.evidence) ? (raw.evidence as PlanDocument['vertices'][string]['evidence']) : [],
      };
    }
  }

  if (isRecord(input.walls)) {
    for (const [id, raw] of Object.entries(input.walls)) {
      if (!isRecord(raw)) {
        warnings.push(`Parede "${id}" ignorada: formato invalido.`);
        continue;
      }
      const a = str(raw.a, '');
      const b = str(raw.b, '');
      if (!plan.vertices[a] || !plan.vertices[b]) {
        warnings.push(`Parede "${id}" ignorada: canto de referencia inexistente.`);
        continue;
      }
      if (a === b) {
        warnings.push(`Parede "${id}" ignorada: comprimento zero.`);
        continue;
      }
      plan.walls[id] = {
        id,
        a,
        b,
        thicknessM: Math.max(0.02, num(raw.thicknessM, 0.15)),
        heightM: raw.heightM === null || raw.heightM === undefined ? null : Math.max(0.5, num(raw.heightM, 2.7)),
        origin: raw.origin === 'auto' || raw.origin === 'demo' ? raw.origin : 'manual',
        review: raw.review === 'needs-review' ? 'needs-review' : 'ok',
        evidence: Array.isArray(raw.evidence) ? (raw.evidence as never[]) : [],
        issues: Array.isArray(raw.issues) ? (raw.issues as never[]) : [],
        derivedFrom: strOrNull(raw.derivedFrom),
        groupId: strOrNull(raw.groupId),
      };
    }
  }

  if (isRecord(input.openings)) {
    for (const [id, raw] of Object.entries(input.openings)) {
      if (!isRecord(raw)) {
        warnings.push(`Abertura "${id}" ignorada: formato invalido.`);
        continue;
      }
      const wallId = str(raw.wallId, '');
      if (!plan.walls[wallId]) {
        warnings.push(`Abertura "${id}" ignorada: parede "${wallId}" nao existe.`);
        continue;
      }
      const kind = raw.kind === 'window' ? 'window' : 'door';
      plan.openings[id] = {
        id,
        kind,
        wallId,
        t: Math.min(0.999, Math.max(0.001, num(raw.t, 0.5))),
        widthM: Math.max(0.4, num(raw.widthM, kind === 'door' ? 0.8 : 1.2)),
        heightM: raw.heightM === null || raw.heightM === undefined ? null : Math.max(0.3, num(raw.heightM, 2.1)),
        sillM: Math.max(0, num(raw.sillM, kind === 'door' ? 0 : 0.9)),
        swing: raw.swing === 'left' || raw.swing === 'right' ? raw.swing : 'none',
        origin: raw.origin === 'auto' || raw.origin === 'demo' ? raw.origin : 'manual',
        review: raw.review === 'needs-review' ? 'needs-review' : 'ok',
        evidence: Array.isArray(raw.evidence) ? (raw.evidence as never[]) : [],
        issues: Array.isArray(raw.issues) ? (raw.issues as never[]) : [],
        derivedFrom: strOrNull(raw.derivedFrom),
        label: strOrNull(raw.label),
      };
    }
  }

  if (isRecord(input.rooms)) {
    for (const [id, raw] of Object.entries(input.rooms)) {
      if (!isRecord(raw)) {
        warnings.push(`Ambiente "${id}" ignorado: formato invalido.`);
        continue;
      }
      const vertexIds = Array.isArray(raw.vertexIds)
        ? raw.vertexIds.filter((v): v is string => typeof v === 'string' && Boolean(plan.vertices[v]))
        : [];
      if (vertexIds.length < 3) {
        warnings.push(`Ambiente "${id}" ignorado: menos de 3 cantos validos.`);
        continue;
      }
      const nameOrigin =
        raw.nameOrigin === 'user' || raw.nameOrigin === 'ocr' || raw.nameOrigin === 'model'
          ? raw.nameOrigin
          : 'fallback';
      plan.rooms[id] = {
        id,
        name: str(raw.name, 'Ambiente'),
        nameOrigin,
        vertexIds,
        origin: raw.origin === 'auto' || raw.origin === 'demo' ? raw.origin : 'manual',
        review: raw.review === 'needs-review' ? 'needs-review' : 'ok',
        evidence: Array.isArray(raw.evidence) ? (raw.evidence as never[]) : [],
        issues: Array.isArray(raw.issues) ? (raw.issues as never[]) : [],
        areaM2: raw.areaM2 === null || raw.areaM2 === undefined ? null : num(raw.areaM2, 0),
        wallIds: Array.isArray(raw.wallIds)
          ? raw.wallIds.filter((w): w is string => typeof w === 'string' && Boolean(plan.walls[w]))
          : [],
      };
    }
  }

  return plan;
};

const sanitizeScale = (input: unknown): ScaleState => {
  const base = createScale();
  if (!isRecord(input)) return base;
  const calibration: Calibration | null = isRecord(input.calibration)
    ? {
        a: isRecord(input.calibration.a)
          ? { x: num(input.calibration.a.x, 0), y: num(input.calibration.a.y, 0) }
          : { x: 0, y: 0 },
        b: isRecord(input.calibration.b)
          ? { x: num(input.calibration.b.x, 0), y: num(input.calibration.b.y, 0) }
          : { x: 0, y: 0 },
        realMeters: Math.max(0.01, num(input.calibration.realMeters, 1)),
        origin: input.calibration.origin === 'ocr' ? ('ocr' as const) : ('user' as const),
        rawText: strOrNull(input.calibration.rawText),
        createdAt: str(input.calibration.createdAt, new Date(0).toISOString()),
      }
    : null;
  const pixelsPerMeter =
    input.pixelsPerMeter === null || input.pixelsPerMeter === undefined
      ? null
      : num(input.pixelsPerMeter, 0) || null;
  return {
    unit: input.unit === 'cm' ? 'cm' : 'm',
    pixelsPerMeter,
    assumedPixelsPerMeter:
      input.assumedPixelsPerMeter === null || input.assumedPixelsPerMeter === undefined
        ? null
        : num(input.assumedPixelsPerMeter, 0) || null,
    calibration,
    wallThicknessM: Math.max(0.02, num(input.wallThicknessM, base.wallThicknessM)),
    wallHeightM: Math.max(0.5, num(input.wallHeightM, base.wallHeightM)),
  };
};

const sanitizeTransform = (input: unknown, image: ImageRef): ImageTransform => {
  const base = createTransform(image.width, image.height);
  if (!isRecord(input)) return base;
  const rotationRaw = num(input.rotation, 0);
  const rotation = ([0, 90, 180, 270] as const).includes(rotationRaw as 0 | 90 | 180 | 270)
    ? (rotationRaw as 0 | 90 | 180 | 270)
    : 0;
  return {
    sourceWidth: num(input.sourceWidth, image.width),
    sourceHeight: num(input.sourceHeight, image.height),
    outputWidth: Math.max(1, num(input.outputWidth, image.width)),
    outputHeight: Math.max(1, num(input.outputHeight, image.height)),
    maxEdge: Math.max(256, num(input.maxEdge, base.maxEdge)),
    rotation,
    crop: isRecord(input.crop)
      ? {
          x: num(input.crop.x, 0),
          y: num(input.crop.y, 0),
          width: Math.max(1, num(input.crop.width, image.width)),
          height: Math.max(1, num(input.crop.height, image.height)),
        }
      : null,
    perspective: Array.isArray(input.perspective) && input.perspective.length === 4
      ? (input.perspective as ImageTransform['perspective'])
      : null,
    steps: Array.isArray(input.steps) ? (input.steps as ImageTransform['steps']) : [],
  };
};

const sanitizeImage = (input: unknown, warnings: string[]): ImageRef => {
  if (!isRecord(input)) {
    throw new Error('Arquivo de projeto sem referencia de imagem.');
  }
  const width = Math.max(1, num(input.width, 0));
  const height = Math.max(1, num(input.height, 0));
  if (width <= 1 || height <= 1) {
    warnings.push('Imagem de referencia com dimensoes invalidas; assumindo 1x1.');
  }
  return {
    id: str(input.id, 'img_imported'),
    mimeType: str(input.mimeType, 'image/png'),
    width,
    height,
    byteLength: Math.max(0, num(input.byteLength, 0)),
    sha256: strOrNull(input.sha256),
    storage: input.storage === 'inline' ? 'inline' : 'indexeddb',
    key: strOrNull(input.key),
  };
};

export const migrateDocument = (input: unknown): MigrationResult => {
  const warnings: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, error: 'Arquivo de projeto invalido: conteudo nao e um objeto.' };
  }
  const version = num(input.schemaVersion, 0);
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Arquivo de projeto nao e suportado (versao ${version}, esperado ${SCHEMA_VERSION}). Atualize o Planta Viva para abrir.`,
    };
  }
  if (version < SCHEMA_VERSION) {
    warnings.push(`Projeto migrado da versao ${version} para ${SCHEMA_VERSION}.`);
  }

  let image: ImageRef;
  try {
    image = sanitizeImage(input.image, warnings);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Imagem invalida.' };
  }

  const now = new Date().toISOString();
  const document: ProjectDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: str(input.id, `p_${Date.now().toString(36)}`),
    name: str(input.name, 'Projeto importado'),
    createdAt: str(input.createdAt, now),
    updatedAt: str(input.updatedAt, now),
    image,
    transform: sanitizeTransform(input.transform, image),
    scale: sanitizeScale(input.scale),
    plan: sanitizePlan(input.plan, warnings),
    recognition: isRecord(input.recognition)
      ? {
          provider: str(input.recognition.provider, 'desconhecido'),
          model: str(input.recognition.model, 'desconhecido'),
          ranAt: str(input.recognition.ranAt, now),
          demo: input.recognition.demo === true,
          partial: input.recognition.partial === true,
          notes: Array.isArray(input.recognition.notes)
            ? input.recognition.notes.filter((n): n is string => typeof n === 'string')
            : [],
          counts: isRecord(input.recognition.counts)
            ? {
                walls: num(input.recognition.counts.walls, 0),
                doors: num(input.recognition.counts.doors, 0),
                windows: num(input.recognition.counts.windows, 0),
                rooms: num(input.recognition.counts.rooms, 0),
              }
            : { walls: 0, doors: 0, windows: 0, rooms: 0 },
        }
      : null,
  };

  return { ok: true, document, warnings };
};

export const serializeDocument = (document: ProjectDocument): string =>
  JSON.stringify(document, null, 2);
