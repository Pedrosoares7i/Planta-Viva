import {
  wallThicknessPx,
  type PlanDocument,
  type Point,
  type ScaleState,
  type SnapResult,
  type Wall,
} from '@planta-viva/core';
import type { Selection, View } from '../state/planStore.js';

export const CORES = {
  fundo: '#0b0f14',
  parede: '#e6edf3',
  paredeSelecionada: '#4ade80',
  paredeEncaixe: '#60a5fa',
  vertice: '#0b0f14',
  verticeBorda: '#e6edf3',
  verticeSelecionado: '#4ade80',
  primeiroPonto: '#fbbf24',
  rascunho: 'rgba(74, 222, 128, 0.7)',
  envelope: '#fbbf24',
  grade: 'rgba(255,255,255,0.045)',
} as const;

export const toScreen = (point: Point, view: View): Point => ({
  x: point.x * view.zoom + view.panX,
  y: point.y * view.zoom + view.panY,
});

export const toPlan = (point: Point, view: View): Point => ({
  x: (point.x - view.panX) / view.zoom,
  y: (point.y - view.panY) / view.zoom,
});

export const desenharGrade = (ctx: CanvasRenderingContext2D, view: View, width: number, height: number): void => {
  const passo = 40 * view.zoom;
  if (passo < 8) return;
  ctx.save();
  ctx.strokeStyle = CORES.grade;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const inicioX = view.panX % passo;
  const inicioY = view.panY % passo;
  for (let x = inicioX; x < width; x += passo) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
  }
  for (let y = inicioY; y < height; y += passo) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
  }
  ctx.stroke();
  ctx.restore();
};

const desenharParede = (
  ctx: CanvasRenderingContext2D,
  plan: PlanDocument,
  wall: Wall,
  view: View,
  scale: ScaleState,
  selection: Selection,
  envelopeId: string | null,
): void => {
  const a = plan.vertices[wall.a];
  const b = plan.vertices[wall.b];
  if (!a || !b) return;
  const pa = toScreen({ x: a.x, y: a.y }, view);
  const pb = toScreen({ x: b.x, y: b.y }, view);
  const selecionada = selection?.tipo === 'parede' && selection.id === wall.id;
  const naEnvelope = envelopeId === wall.id;

  const espessura = Math.max(2, (wallThicknessPx(plan, wall, scale) ?? 6) * view.zoom);

  ctx.save();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = naEnvelope
    ? CORES.paredeEncaixe
    : selecionada
      ? CORES.paredeSelecionada
      : CORES.parede;
  ctx.lineWidth = espessura;
  if (selecionada) {
    ctx.shadowColor = CORES.paredeSelecionada;
    ctx.shadowBlur = 10;
  }
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.stroke();
  ctx.restore();
};

export type DrawState = {
  plan: PlanDocument;
  scale: ScaleState;
  view: View;
  selection: Selection;
  primeiroPonto: Point | null;
  rascunho: SnapResult | null;
  cursor: Point | null;
  mostrarGrade: boolean;
  envelopeIds: Set<string>;
};

export const desenharPlano = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: DrawState,
): void => {
  const { plan, view, selection } = state;

  ctx.clearRect(0, 0, width, height);
  if (state.mostrarGrade) desenharGrade(ctx, view, width, height);

  const envelope = state.envelopeIds.size === 1 ? [...state.envelopeIds][0]! : null;
  for (const wall of Object.values(plan.walls)) {
    desenharParede(ctx, plan, wall, view, state.scale, selection, envelope);
  }

  for (const vertex of Object.values(plan.vertices)) {
    const p = toScreen({ x: vertex.x, y: vertex.y }, view);
    const r = 4 / Math.max(0.5, Math.min(1.5, view.zoom));
    const selecionado = selection?.tipo === 'vertice' && selection.id === vertex.id;
    ctx.beginPath();
    ctx.arc(p.x, p.y, selecionado ? r * 1.8 : r, 0, Math.PI * 2);
    ctx.fillStyle = selecionado ? CORES.verticeSelecionado : CORES.vertice;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = selecionado ? CORES.verticeSelecionado : CORES.verticeBorda;
    ctx.stroke();
  }

  if (state.primeiroPonto) {
    const p = toScreen(state.primeiroPonto, view);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.strokeStyle = CORES.primeiroPonto;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (state.rascunho && state.cursor) {
    const origem = toScreen(state.primeiroPonto ?? state.cursor, view);
    const destino = toScreen(state.rascunho.point, view);
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = CORES.rascunho;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(origem.x, origem.y);
    ctx.lineTo(destino.x, destino.y);
    ctx.stroke();
    ctx.restore();

    if (state.rascunho.kind !== 'none') {
      const alvo = toScreen(state.rascunho.point, view);
      ctx.beginPath();
      ctx.arc(alvo.x, alvo.y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = CORES.paredeEncaixe;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
};
