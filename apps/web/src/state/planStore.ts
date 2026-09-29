import { create } from 'zustand';
import {
  addVertex,
  addWall,
  createScale,
  deleteVertex,
  deleteWall,
  emptyPlan,
  hitTestWalls,
  moveVertex,
  snapPoint,
  defaultSnapOptions,
  type CascadeReport,
  type Id,
  type PlanDocument,
  type Point,
  type ScaleState,
  type SnapResult,
} from '@planta-viva/core';

export type Tool = 'selecionar' | 'parede' | 'mover' | 'apagar';
export type Selection = { tipo: 'vertice' | 'parede'; id: Id } | null;

export type View = { zoom: number; panX: number; panY: number };

const HISTORY_LIMIT = 50;
const PICK_TOLERANCE_PX = 14;
export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 12;

type State = {
  plan: PlanDocument;
  scale: ScaleState;
  historico: PlanDocument[];
  futuro: PlanDocument[];
  ferramenta: Tool;
  selecao: Selection;
  primeiroPonto: Point | null;
  rascunho: SnapResult | null;
  cursor: Point | null;
  view: View;
  relatorios: CascadeReport[];
  /** Plano como estava antes do arrasto atual, para desfazer corretamente. */
  antesDoArrasto: PlanDocument | null;
};

type Actions = {
  setTool: (tool: Tool) => void;
  ajustarZoom: (factor: number, centro?: Point) => void;
  redefinirVista: () => void;
  moverCursor: (point: Point | null) => void;
  confirmarOuIniciar: (point: Point) => void;
  arrastarVertice: (id: Id, point: Point) => void;
  soltarVertice: () => void;
  cancelar: () => void;
  selecionarEm: (point: Point) => void;
  desfazer: () => void;
  refazer: () => void;
  limparPlano: () => void;
  fecharRelatorios: () => void;
};

const nearestVertex = (plan: PlanDocument, point: Point, tolerance: number): Id | null => {
  let best: Id | null = null;
  let bestDistance = tolerance;
  for (const vertex of Object.values(plan.vertices)) {
    const d = Math.hypot(vertex.x - point.x, vertex.y - point.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = vertex.id;
    }
  }
  return best;
};

/** Reaproveita um vertice existente perto do ponto, ou cria um novo. */
const ensureVertex = (plan: PlanDocument, point: Point): { plan: PlanDocument; id: Id } => {
  const existing = nearestVertex(plan, point, PICK_TOLERANCE_PX);
  if (existing) return { plan, id: existing };
  const created = addVertex(plan, point);
  return { plan: created.plan, id: created.vertex.id };
};

const limitZoom = (zoom: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

export const usePlanStore = create<State & Actions>((set, get) => {
  const commit = (plan: PlanDocument, report?: CascadeReport): void => {
    const { historico, plan: anterior } = get();
    set({
      plan,
      historico: [...historico, anterior].slice(-HISTORY_LIMIT),
      futuro: [],
      relatorios: report ? [report, ...get().relatorios].slice(0, 5) : get().relatorios,
    });
  };

  const comEncaixe = (point: Point, exclude?: Id | null): SnapResult =>
    snapPoint(get().plan, point, { ...defaultSnapOptions(), tolerancePx: PICK_TOLERANCE_PX, excludeVertexId: exclude ?? null });

  return {
    plan: emptyPlan(),
    scale: createScale(),
    historico: [],
    futuro: [],
    ferramenta: 'parede',
    selecao: null,
    primeiroPonto: null,
    rascunho: null,
    cursor: null,
    view: { zoom: 1, panX: 0, panY: 0 },
    relatorios: [],
    antesDoArrasto: null,

    setTool: (tool) => set({ ferramenta: tool, primeiroPonto: null, rascunho: null }),

    ajustarZoom: (factor, centro) => {
      const { view } = get();
      const zoom = limitZoom(view.zoom * factor);
      if (!centro) return set({ view: { ...view, zoom } });
      const escala = zoom / view.zoom;
      set({
        view: {
          zoom,
          panX: centro.x - (centro.x - view.panX) * escala,
          panY: centro.y - (centro.y - view.panY) * escala,
        },
      });
    },

    redefinirVista: () => set({ view: { zoom: 1, panX: 0, panY: 0 } }),

    moverCursor: (point) => {
      const { ferramenta, primeiroPonto } = get();
      if (point === null) return set({ cursor: null, rascunho: null });
      const efetiva = ferramenta === 'mover' ? 'selecionar' : ferramenta;
      set({ cursor: point });
      if (efetiva === 'parede' && primeiroPonto) {
        set({ rascunho: comEncaixe(point) });
      }
    },

    confirmarOuIniciar: (point) => {
      const { primeiroPonto, ferramenta } = get();
      if (ferramenta !== 'parede') return;
      const snap = comEncaixe(point);

      if (!primeiroPonto) {
        set({ primeiroPonto: snap.point, rascunho: null });
        return;
      }

      const primeiro = ensureVertex(get().plan, primeiroPonto);
      const segundo = ensureVertex(primeiro.plan, snap.point);
      const resultado = addWall(segundo.plan, primeiro.id, segundo.id);
      if (!resultado.ok) {
        set({ primeiroPonto: null, rascunho: null });
        return;
      }
      commit(resultado.plan);
      set({ primeiroPonto: null, rascunho: null, selecao: { tipo: 'parede', id: resultado.wall.id } });
    },

    arrastarVertice: (id, point) => {
      const snap = comEncaixe(point, id);
      const atual = get();
      const vertex = atual.plan.vertices[id];
      if (!vertex) return;

      if (vertex.x === snap.point.x && vertex.y === snap.point.y) {
        set({ selecao: { tipo: 'vertice', id } });
        return;
      }

      const origem = atual.antesDoArrasto ?? atual.plan;
      const { plan } = moveVertex(atual.plan, id, snap.point);
      set({ plan, antesDoArrasto: origem, selecao: { tipo: 'vertice', id } });
    },

    soltarVertice: () => {
      const { plan, historico, antesDoArrasto } = get();
      if (antesDoArrasto === null || antesDoArrasto === plan) {
        set({ antesDoArrasto: null });
        return;
      }
      set({
        historico: [...historico, antesDoArrasto].slice(-HISTORY_LIMIT),
        futuro: [],
        antesDoArrasto: null,
      });
    },

    cancelar: () => set({ primeiroPonto: null, rascunho: null, selecao: null }),

    selecionarEm: (point) => {
      const { plan, ferramenta } = get();

      if (ferramenta === 'apagar') {
        const id = nearestVertex(plan, point, PICK_TOLERANCE_PX);
        if (id) {
          const r = deleteVertex(plan, id, get().scale);
          commit(r.plan, r.report);
          set({ selecao: null });
          return;
        }
        const hit = hitTestWalls(plan, point, PICK_TOLERANCE_PX);
        if (hit) {
          const r = deleteWall(plan, hit.wallId);
          commit(r.plan, r.report);
          set({ selecao: null });
        }
        return;
      }

      const id = nearestVertex(plan, point, PICK_TOLERANCE_PX);
      if (id) {
        set({ selecao: { tipo: 'vertice', id } });
        return;
      }
      const hit = hitTestWalls(plan, point, PICK_TOLERANCE_PX);
      set({ selecao: hit ? { tipo: 'parede', id: hit.wallId } : null });
    },

    desfazer: () => {
      const { historico, plan, futuro } = get();
      const anterior = historico[historico.length - 1];
      if (!anterior) return;
      set({
        plan: anterior,
        historico: historico.slice(0, -1),
        futuro: [plan, ...futuro].slice(0, HISTORY_LIMIT),
        selecao: null,
        antesDoArrasto: null,
      });
    },

    refazer: () => {
      const { historico, plan, futuro } = get();
      const proximo = futuro[0];
      if (!proximo) return;
      set({
        plan: proximo,
        historico: [...historico, plan].slice(-HISTORY_LIMIT),
        futuro: futuro.slice(1),
        selecao: null,
      });
    },

    limparPlano: () => {
      commit(emptyPlan());
      set({ selecao: null, primeiroPonto: null, rascunho: null });
    },

    fecharRelatorios: () => set({ relatorios: [] }),
  };
});
