import { describe, expect, it } from 'vitest';
import {
  addOpening,
  addRoom,
  addVertex,
  addWall,
  createImageRef,
  createProject,
  createScale,
  migrateDocument,
  serializeDocument,
} from '../index.js';
import { calibratedScale, makePlan, squarePlan, vertexIdAt } from '../testing/fixtures.js';

const baseDocument = () => {
  const plan = squarePlan(400);
  const withRoom = addRoom(plan, [
    vertexIdAt(plan, 0, 0),
    vertexIdAt(plan, 400, 0),
    vertexIdAt(plan, 400, 400),
    vertexIdAt(plan, 0, 400),
  ]).plan;
  const wallId = Object.keys(plan.walls)[0]!;
  const withOpening = addOpening(withRoom, wallId, 0.5, 'door', calibratedScale(100)).plan;

  const doc = createProject(
    createImageRef({ mimeType: 'image/jpeg', width: 1200, height: 900, byteLength: 54321 }),
    'Minha casa',
  );
  return { ...doc, plan: withOpening };
};

const tinyProject = () =>
  createProject(createImageRef({ mimeType: 'image/png', width: 1, height: 1, byteLength: 1 }));

describe('ciclo de vida do projeto', () => {
  it('cria um projeto novo sem escala e sem planta', () => {
    const doc = tinyProject();
    expect(doc.schemaVersion).toBe(1);
    expect(doc.scale.pixelsPerMeter).toBeNull();
    expect(Object.keys(doc.plan.walls)).toHaveLength(0);
    expect(doc.recognition).toBeNull();
    expect(doc.transform.outputWidth).toBe(1);
  });

  it('sobrevive a serializar e desserializar sem perder geometria', () => {
    const doc = baseDocument();
    const result = migrateDocument(JSON.parse(serializeDocument(doc)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.name).toBe('Minha casa');
    expect(Object.keys(result.document.plan.walls)).toHaveLength(4);
    expect(Object.keys(result.document.plan.vertices)).toHaveLength(4);
    expect(Object.keys(result.document.plan.openings)).toHaveLength(1);
    expect(Object.keys(result.document.plan.rooms)).toHaveLength(1);
    expect(Object.values(result.document.plan.openings)[0]!.kind).toBe('door');
    expect(result.document.image.byteLength).toBe(54321);
    expect(result.warnings).toHaveLength(0);
  });

  it('repara aberturas orfas ao importar', () => {
    const doc = baseDocument();
    const broken = JSON.parse(serializeDocument(doc));
    const openingId = Object.keys(broken.plan.openings)[0]!;
    broken.plan.openings[openingId].wallId = 'parede_que_nao_existe';

    const result = migrateDocument(broken);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.document.plan.openings)).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('parede');
  });

  it('repara paredes com canto inexistente ao importar', () => {
    const doc = baseDocument();
    const broken = JSON.parse(serializeDocument(doc));
    const wallId = Object.keys(broken.plan.walls)[0]!;
    broken.plan.walls[wallId].b = 'fantasma';

    const result = migrateDocument(broken);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.document.plan.walls)).toHaveLength(3);
    expect(result.warnings.join(' ')).toContain('canto de referencia');
  });

  it('remove ambientes com menos de tres cantos ao importar', () => {
    const doc = baseDocument();
    const broken = JSON.parse(serializeDocument(doc));
    const roomId = Object.keys(broken.plan.rooms)[0]!;
    broken.plan.rooms[roomId].vertexIds = broken.plan.rooms[roomId].vertexIds.slice(0, 2);

    const result = migrateDocument(broken);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.document.plan.rooms)).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('menos de 3 cantos');
  });

  it('recusa arquivo de versao futura', () => {
    const result = migrateDocument({ schemaVersion: 99, image: { width: 10, height: 10 } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('nao e suportado');
  });

  it('recusa conteudo que nao e projeto', () => {
    expect(migrateDocument('texto').ok).toBe(false);
    expect(migrateDocument({ schemaVersion: 1 }).ok).toBe(false);
  });

  it('preserva o status de demonstracao do reconhecimento', () => {
    const doc = baseDocument();
    const withRecognition = {
      ...doc,
      recognition: {
        provider: 'demo',
        model: 'exemplo',
        ranAt: new Date().toISOString(),
        demo: true as const,
        partial: false,
        notes: ['Dados de exemplo.'],
        counts: { walls: 4, doors: 1, windows: 0, rooms: 1 },
      },
    };
    const result = migrateDocument(JSON.parse(serializeDocument(withRecognition)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.recognition!.demo).toBe(true);
    expect(result.document.recognition!.counts.walls).toBe(4);
  });

  it('mantem a calibracao ao reabrir', () => {
    const doc = baseDocument();
    const calibrated = { ...doc, scale: { ...createScale(), pixelsPerMeter: 42 } };
    const result = migrateDocument(JSON.parse(serializeDocument(calibrated)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.scale.pixelsPerMeter).toBe(42);
  });

  it('gera ids distintos a cada criacao', () => {
    const a = addVertex(makePlan(), { x: 0, y: 0 });
    const b = addVertex(makePlan(), { x: 0, y: 0 });
    expect(a.vertex.id).not.toBe(b.vertex.id);
  });

  it('nao aceita parede com referencia invalida', () => {
    const v = addVertex(makePlan(), { x: 0, y: 0 }).vertex.id;
    const result = addWall(makePlan(), v, 'x');
    expect(result.ok).toBe(false);
  });
});
