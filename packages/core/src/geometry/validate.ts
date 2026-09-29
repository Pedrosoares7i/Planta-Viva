import type { Id, Issue, IssueCode, PlanDocument, ProjectDocument } from '../model/types.js';
import { isSimplePolygon, polygonArea } from './polygon.js';
import { measureStatus, measureStatusLabel } from './scale.js';
import { validateOpening } from './openings.js';
import { wallKey, wallLengthPx, wallsAtVertex } from './wall.js';
import { resolveRoomPolygon } from './plan-ops.js';
import { pointsEqual } from './vec2.js';

const issueMessages: Record<IssueCode, string> = {
  'wall-zero-length': 'Parede com comprimento zero.',
  'wall-duplicate': 'Existe mais de uma parede entre os mesmos dois cantos.',
  'wall-missing-vertex': 'Parede referencia um canto que nao existe.',
  'opening-out-of-wall': 'Abertura nao cabe dentro da parede.',
  'opening-overlap': 'Aberturas se sobrepoem na mesma parede.',
  'opening-zero-width': 'Largura de abertura invalida.',
  'room-too-few-vertices': 'Ambiente com menos de 3 cantos.',
  'room-self-intersecting': 'Poligono do ambiente se cruza.',
  'room-zero-area': 'Ambiente com area zero.',
  'room-missing-vertex': 'Ambiente referencia um canto que nao existe.',
  'orphan-vertex': 'Canto solto, sem parede e sem ambiente.',
  'no-scale': 'Planta sem escala definida: medidas sao estimadas.',
  'room-unclassified': 'Ambiente sem nome reconhecido (usando nome neutro).',
};

export const issueMessage = (code: IssueCode): string => issueMessages[code];

export type ValidationResult = {
  issues: Issue[];
  errors: Issue[];
  warnings: Issue[];
  isValid: boolean;
  needsReviewCount: number;
};

const make = (
  code: IssueCode,
  elementKind: Issue['elementKind'],
  elementId: Id | null,
  severity: Issue['severity'],
  messageOverride?: string,
): Issue => ({
  code,
  message: messageOverride ?? issueMessages[code],
  elementId,
  elementKind,
  severity,
});

export const validatePlan = (
  plan: PlanDocument,
  scale: ProjectDocument['scale'],
): ValidationResult => {
  const issues: Issue[] = [];
  const seenWallKeys = new Map<string, number>();

  for (const wall of Object.values(plan.walls)) {
    const va = plan.vertices[wall.a];
    const vb = plan.vertices[wall.b];
    if (!va || !vb) {
      issues.push(make('wall-missing-vertex', 'wall', wall.id, 'error'));
      continue;
    }
    const length = wallLengthPx(plan, wall);
    if (length === null || length <= 1e-6) {
      issues.push(make('wall-zero-length', 'wall', wall.id, 'error'));
      continue;
    }
    const key = wallKey(wall);
    const count = (seenWallKeys.get(key) ?? 0) + 1;
    seenWallKeys.set(key, count);
    if (count > 1) issues.push(make('wall-duplicate', 'wall', wall.id, 'error'));
  }

  for (const opening of Object.values(plan.openings)) {
    if (!plan.walls[opening.wallId]) {
      issues.push(make('opening-out-of-wall', 'opening', opening.id, 'error'));
      continue;
    }
    for (const code of validateOpening(plan, opening, scale)) {
      issues.push(
        make(
          code,
          'opening',
          opening.id,
          code === 'opening-overlap' ? 'warning' : 'error',
        ),
      );
    }
  }

  for (const room of Object.values(plan.rooms)) {
    const points = resolveRoomPolygon(plan, room);
    if (room.vertexIds.length !== points.length) {
      issues.push(make('room-missing-vertex', 'room', room.id, 'error'));
    }
    if (points.length < 3) {
      issues.push(make('room-too-few-vertices', 'room', room.id, 'error'));
      continue;
    }
    if (polygonArea(points) <= 1e-6) {
      issues.push(make('room-zero-area', 'room', room.id, 'error'));
      continue;
    }
    if (!isSimplePolygon(points)) {
      issues.push(make('room-self-intersecting', 'room', room.id, 'error'));
    }
    if (room.nameOrigin === 'fallback') {
      issues.push(make('room-unclassified', 'room', room.id, 'warning'));
    }
  }

  const referenced = new Set<Id>();
  for (const wall of Object.values(plan.walls)) {
    referenced.add(wall.a);
    referenced.add(wall.b);
  }
  for (const room of Object.values(plan.rooms)) {
    for (const id of room.vertexIds) referenced.add(id);
  }
  for (const id of Object.keys(plan.vertices)) {
    if (!referenced.has(id)) {
      issues.push(make('orphan-vertex', 'vertex', id, 'warning'));
    }
  }

  if (scale.pixelsPerMeter === null) {
    issues.push(
      make(
        'no-scale',
        'document',
        null,
        'warning',
        `${measureStatusLabel[measureStatus(scale)]}. Calibre uma medida conhecida para obter medidas reais.`,
      ),
    );
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const needsReviewCount = new Set(
    [
      ...Object.values(plan.walls).filter((w) => w.review === 'needs-review').map((w) => w.id),
      ...Object.values(plan.openings).filter((o) => o.review === 'needs-review').map((o) => o.id),
      ...Object.values(plan.rooms).filter((r) => r.review === 'needs-review').map((r) => r.id),
    ],
  ).size;

  return {
    issues,
    errors,
    warnings,
    isValid: errors.length === 0,
    needsReviewCount,
  };
};

export const orphanVertexIds = (plan: PlanDocument): Id[] => {
  const referenced = new Set<Id>();
  for (const wall of Object.values(plan.walls)) {
    referenced.add(wall.a);
    referenced.add(wall.b);
  }
  for (const room of Object.values(plan.rooms)) {
    for (const id of room.vertexIds) referenced.add(id);
  }
  return Object.keys(plan.vertices).filter((id) => !referenced.has(id));
};

export const degreeOf = (plan: PlanDocument, vertexId: Id): number =>
  wallsAtVertex(plan, vertexId).length;

export const isDegenerateWall = (plan: PlanDocument, wallId: Id): boolean => {
  const wall = plan.walls[wallId];
  if (!wall) return true;
  const va = plan.vertices[wall.a];
  const vb = plan.vertices[wall.b];
  if (!va || !vb) return true;
  if (pointsEqual({ x: va.x, y: va.y }, { x: vb.x, y: vb.y }, 1e-6)) return true;
  return false;
};
