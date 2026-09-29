export const MIN_USABLE_EDGE = 800;
export const WORKING_EDGE = 1800;

/**
 * Peso de cada defeito. Exposicao, contraste e ausencia de linhas recebem 3 porque
 * cada um deles, sozinho, ja quebra a deteccao de paredes. Resolucao e compressao
 * pioram o resultado sem necessariamente impedir a deteccao.
 */
const WEIGHT = {
  lowResolution: 2,
  highCompression: 1,
  badExposure: 3,
  lowContrast: 3,
  noLines: 3,
} as const;

const RUIM_THRESHOLD = 3;
const RAZOAVEL_THRESHOLD = 2;

export type ImageQualityLevel = 'boa' | 'razoavel' | 'ruim';

export type ImageQualityInput = {
  width: number;
  height: number;
  byteLength: number;
  meanLuma?: number | null;
  contrast?: number | null;
  edgeDensity?: number | null;
};

export type ImageQualityCheck =
  | { level: ImageQualityLevel; reasons: string[]; blocking: false; positive: string[] }
  | { level: ImageQualityLevel; reasons: string[]; blocking: true; code: string; message: string; positive: string[] };

const buildCheck = (
  input: ImageQualityInput,
): {
  reasons: string[];
  positive: string[];
  blockCode: string | null;
  blockMessage: string | null;
  level: ImageQualityLevel;
} => {
  const reasons: string[] = [];
  const positive: string[] = [];
  let blockCode: string | null = null;
  let blockMessage: string | null = null;
  let score = 0;

  const minEdge = Math.min(input.width, input.height);
  if (minEdge < MIN_USABLE_EDGE) {
    score += WEIGHT.lowResolution;
    reasons.push(
      `Resolução baixa (${minEdge} px no lado menor): linhas finas da planta podem não ser reconhecidas.`,
    );
    if (minEdge < 480) {
      blockCode = 'resolution-too-low';
      blockMessage = `Resolução muito baixa (${minEdge} px). Fotografe ou exporte com pelo menos 1200 px no lado menor.`;
    }
  } else {
    positive.push('Resolução suficiente');
  }

  const pixels = input.width * input.height;
  const bytesPerPixel = pixels > 0 ? input.byteLength / pixels : 0;
  if (bytesPerPixel > 0 && bytesPerPixel < 0.02) {
    score += WEIGHT.highCompression;
    reasons.push('Compressão alta: traços finos e legendas podem ter desaparecido da imagem.');
  }

  if (input.meanLuma != null) {
    if (input.meanLuma < 40) {
      score += WEIGHT.badExposure;
      reasons.push('Imagem muito escura: sombras fortes atrapalham a detecção de linhas.');
    } else if (input.meanLuma > 215) {
      score += WEIGHT.badExposure;
      reasons.push('Imagem muito clara, possivelmente estourada.');
    } else if (input.meanLuma >= 60 && input.meanLuma <= 200) {
      positive.push('Iluminação uniforme');
    }
  }

  if (input.contrast != null && input.contrast < 18) {
    score += WEIGHT.lowContrast;
    reasons.push('Contraste baixo: lápis claro sobre papel pode não gerar linhas detectáveis.');
  }

  if (input.edgeDensity != null && input.edgeDensity < 0.01) {
    score += WEIGHT.noLines;
    reasons.push('Poucas linhas visíveis na imagem: pode não ser uma planta arquitetônica.');
  }

  const level: ImageQualityLevel =
    blockCode !== null
      ? 'ruim'
      : score >= RUIM_THRESHOLD
        ? 'ruim'
        : score >= RAZOAVEL_THRESHOLD
          ? 'razoavel'
          : 'boa';

  return { reasons, positive, blockCode, blockMessage, level };
};

export const estimateImageQuality = (input: ImageQualityInput): ImageQualityCheck => {
  const { reasons, positive, blockCode, blockMessage, level } = buildCheck(input);
  const notes = positive.length > 0 ? positive : ['Imagem recebida'];

  if (blockCode !== null && blockMessage !== null) {
    return { level, reasons, blocking: true, code: blockCode, message: blockMessage, positive: notes };
  }

  return { level, reasons, blocking: false, positive: notes };
};
