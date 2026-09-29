import { create } from 'zustand';
import {
  createTransform,
  estimateImageQuality,
  normalizeQuad,
  outputSize,
  rebaseQuadForRotation,
  rotateSize,
  type ImageQualityCheck,
  type ImageTransform,
  type NormalizedRect,
  type Point,
  type Quad,
  type TransformStep,
} from '@planta-viva/core';
import {
  DEFAULT_MAX_EDGE,
  loadImageFile,
  measureImage,
  qualityInputFrom,
  type LoadedImage,
} from '../lib/image.js';

export const STEPS = [
  { id: 0, label: 'Imagem', hint: 'Enviar e preparar' },
  { id: 1, label: 'Análise', hint: 'Reconhecer a planta' },
  { id: 2, label: 'Revisão', hint: 'Corrigir o traçado' },
  { id: 3, label: '3D', hint: 'Ver o volume' },
] as const;

export type EditMode = 'nenhuma' | 'perspectiva' | 'recorte';

type State = {
  etapa: number;
  image: LoadedImage | null;
  transform: ImageTransform;
  qualidade: ImageQualityCheck | null;
  erro: string | null;
  aviso: string | null;
  carregando: boolean;
  modo: EditMode;
  arrasto: number | null;
  historico: ImageTransform[];
  futuro: ImageTransform[];
};

type Actions = {
  carregar: (file: File) => Promise<void>;
  irParaEtapa: (etapa: number) => void;
  girar: (delta: 90 | -90) => void;
  entrarPerspectiva: () => void;
  entrarRecorte: () => void;
  sairDoModo: () => void;
  moverCanto: (indice: number, point: Point) => void;
  soltarCanto: () => void;
  definirRecorte: (rect: NormalizedRect | null) => void;
  limparTransform: () => void;
  desfazer: () => void;
  refazer: () => void;
  limparMensagens: () => void;
};

const HISTORY_LIMIT = 40;

const logStep = (steps: TransformStep[], kind: TransformStep['kind'], detail: string): TransformStep[] => [
  ...steps,
  { kind, detail, at: new Date().toISOString() },
];

const withOutput = (transform: ImageTransform): ImageTransform => {
  const rotated = rotateSize(transform.sourceWidth, transform.sourceHeight, transform.rotation);
  const size = outputSize(rotated.width, rotated.height, transform.maxEdge);
  return { ...transform, outputWidth: size.width, outputHeight: size.height };
};

const normalizeRotation = (degrees: number): 0 | 90 | 180 | 270 => {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 90) return 90;
  if (normalized === 180) return 180;
  if (normalized === 270) return 270;
  return 0;
};

const emptyTransform = (): ImageTransform => withOutput(createTransform(1, 1, DEFAULT_MAX_EDGE));

export const useStore = create<State & Actions>((set, get) => {
  const commit = (next: ImageTransform): void => {
    const { transform, historico } = get();
    if (next === transform) return;
    set({
      transform: next,
      historico: [...historico, transform].slice(-HISTORY_LIMIT),
      futuro: [],
    });
  };

  return {
    etapa: 0,
    image: null,
    transform: emptyTransform(),
    qualidade: null,
    erro: null,
    aviso: null,
    carregando: false,
    modo: 'nenhuma',
    arrasto: null,
    historico: [],
    futuro: [],

    carregar: async (file) => {
      set({ carregando: true, erro: null, aviso: null });
      const result = await loadImageFile(file);
      if (!result.ok) {
        set({ carregando: false, erro: result.message });
        return;
      }
      get().image?.bitmap.close();
      const transform = withOutput(createTransform(result.image.width, result.image.height, DEFAULT_MAX_EDGE));
      const stats = measureImage(result.image.bitmap);
      set({
        image: result.image,
        transform,
        qualidade: estimateImageQuality(qualityInputFrom(result.image, stats)),
        aviso: result.warning,
        historico: [],
        futuro: [],
        modo: 'nenhuma',
        carregando: false,
        etapa: 0,
      });
    },

    irParaEtapa: (etapa) => {
      const clamped = Math.max(0, Math.min(STEPS.length - 1, etapa));
      set({ etapa: clamped, modo: 'nenhuma', arrasto: null });
    },

    girar: (delta) => {
      const { transform } = get();
      const next = normalizeRotation(transform.rotation + delta);
      const previousSize = rotateSize(transform.sourceWidth, transform.sourceHeight, transform.rotation);
      const nextSize = rotateSize(transform.sourceWidth, transform.sourceHeight, next);
      const perspective = transform.perspective
        ? normalizeQuad(
            rebaseQuadForRotation(transform.perspective, transform.rotation, next, previousSize),
            nextSize.width,
            nextSize.height,
          )
        : null;
      commit(
        withOutput({
          ...transform,
          rotation: next,
          perspective,
          steps: logStep(transform.steps, 'rotate', `Rotação ${next}°`),
        }),
      );
    },

    entrarPerspectiva: () => {
      const { transform } = get();
      const size = rotateSize(transform.sourceWidth, transform.sourceHeight, transform.rotation);
      const quad: Quad = transform.perspective
        ? normalizeQuad(transform.perspective, size.width, size.height)
        : [
            { x: size.width * 0.06, y: size.height * 0.06 },
            { x: size.width * 0.94, y: size.height * 0.06 },
            { x: size.width * 0.94, y: size.height * 0.94 },
            { x: size.width * 0.06, y: size.height * 0.94 },
          ];
      commit(
        withOutput({
          ...transform,
          perspective: quad,
          steps: logStep(transform.steps, 'perspective', 'Correção de perspectiva'),
        }),
      );
      set({ modo: 'perspectiva', arrasto: null });
    },

    entrarRecorte: () => set({ modo: 'recorte', arrasto: null }),

    sairDoModo: () => set({ modo: 'nenhuma', arrasto: null }),

    moverCanto: (indice, point) => {
      const { transform } = get();
      if (!transform.perspective) return;
      const size = rotateSize(transform.sourceWidth, transform.sourceHeight, transform.rotation);
      const next: Quad = [...transform.perspective] as Quad;
      next[indice] = {
        x: Math.max(0, Math.min(size.width, point.x)),
        y: Math.max(0, Math.min(size.height, point.y)),
      };
      set({ transform: { ...transform, perspective: next }, arrasto: indice });
    },

    soltarCanto: () => set({ modo: 'nenhuma', arrasto: null }),

    definirRecorte: (rect) => {
      const { transform } = get();
      commit(
        withOutput({
          ...transform,
          crop: rect,
          steps: logStep(
            transform.steps,
            'crop',
            rect ? `Recorte aplicado (${Math.round(rect.width * 100)}% × ${Math.round(rect.height * 100)}%)` : 'Recorte removido',
          ),
        }),
      );
    },

    limparTransform: () => {
      const { transform, image } = get();
      if (!image) return;
      commit(
        withOutput({
          ...createTransform(image.width, image.height, DEFAULT_MAX_EDGE),
          steps: logStep(transform.steps, 'resize', 'Transformações limpas'),
        }),
      );
      set({ modo: 'nenhuma', arrasto: null });
    },

    desfazer: () => {
      const { historico, transform, futuro } = get();
      const previous = historico[historico.length - 1];
      if (!previous) return;
      set({
        transform: previous,
        historico: historico.slice(0, -1),
        futuro: [transform, ...futuro].slice(0, HISTORY_LIMIT),
        modo: 'nenhuma',
        arrasto: null,
      });
    },

    refazer: () => {
      const { historico, transform, futuro } = get();
      const next = futuro[0];
      if (!next) return;
      set({
        transform: next,
        historico: [...historico, transform].slice(-HISTORY_LIMIT),
        futuro: futuro.slice(1),
        modo: 'nenhuma',
        arrasto: null,
      });
    },

    limparMensagens: () => set({ erro: null, aviso: null }),
  };
});
