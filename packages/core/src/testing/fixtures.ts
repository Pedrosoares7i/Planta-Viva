import { addVertex, addWall, createProject, createImageRef, createScale } from '../index.js';
import type { PlanDocument, ProjectDocument } from '../index.js';

export const makeProject = (): ProjectDocument =>
  createProject(
    createImageRef({ mimeType: 'image/png', width: 1200, height: 900, byteLength: 1000 }),
    'Teste',
  );

export const makePlan = (): PlanDocument => makeProject().plan;

export class PlanBuilder {
  private current: PlanDocument;

  constructor(plan: PlanDocument = makePlan()) {
    this.current = plan;
  }

  vertex(x: number, y: number): string {
    const result = addVertex(this.current, { x, y });
    this.current = result.plan;
    return result.vertex.id;
  }

  wall(a: string, b: string): string {
    const result = addWall(this.current, a, b);
    if (!result.ok) throw new Error(`addWall falhou: ${result.reason}`);
    this.current = result.plan;
    return result.wall.id;
  }

  line(...points: [number, number][]): this {
    const ids = points.map(([x, y]) => this.vertex(x, y));
    for (let i = 0; i < ids.length - 1; i += 1) this.wall(ids[i]!, ids[i + 1]!);
    return this;
  }

  closedPolygon(...points: [number, number][]): this {
    const ids = points.map(([x, y]) => this.vertex(x, y));
    for (let i = 0; i < ids.length; i += 1) {
      this.wall(ids[i]!, ids[(i + 1) % ids.length]!);
    }
    return this;
  }

  snapshot(): PlanDocument {
    return this.current;
  }
}

export const squarePlan = (size = 400): PlanDocument =>
  new PlanBuilder().closedPolygon([0, 0], [size, 0], [size, size], [0, size]).snapshot();

export const cornerPlan = (): { plan: PlanDocument; corner: string; right: string; down: string } => {
  const builder = new PlanBuilder();
  const corner = builder.vertex(100, 100);
  const right = builder.vertex(400, 100);
  const down = builder.vertex(100, 400);
  builder.wall(corner, right);
  builder.wall(corner, down);
  return { plan: builder.snapshot(), corner, right, down };
};

export const vertexIdAt = (plan: PlanDocument, x: number, y: number): string => {
  const found = Object.values(plan.vertices).find((v) => v.x === x && v.y === y);
  if (!found) throw new Error(`vertice nao encontrado em ${x},${y}`);
  return found.id;
};

export const wallIdBetween = (plan: PlanDocument, a: string, b: string): string => {
  const wall = Object.values(plan.walls).find(
    (w) => (w.a === a && w.b === b) || (w.a === b && w.b === a),
  );
  if (!wall) throw new Error(`parede entre ${a} e ${b} nao encontrada`);
  return wall.id;
};

export const calibratedScale = (pixelsPerMeter = 100) => ({
  ...createScale(),
  pixelsPerMeter,
});
