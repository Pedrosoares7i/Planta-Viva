import {
  checkImageFile,
  correctionHomographyInverse,
  correctedSize,
  cropPixelRect,
  orientForRotation,
  outputSize,
  readFileFailureMessage,
  rotateSize,
  type ImageQualityCheck,
  type ImageTransform,
  type Quad,
} from '@planta-viva/core';

export const DEFAULT_MAX_EDGE = 1800;
const MEASURE_EDGE = 256;

export type LoadedImage = {
  nome: string;
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
  bitmap: ImageBitmap;
};

export type LoadResult =
  | { ok: true; image: LoadedImage; warning: string | null }
  | { ok: false; message: string };

const decode = async (file: File): Promise<ImageBitmap> => {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const element = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('decodificacao da imagem falhou'));
        img.src = url;
      });
      return await createImageBitmap(element);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
};

export const loadImageFile = async (file: File): Promise<LoadResult> => {
  const check = checkImageFile(file);
  if (!check.ok) return { ok: false, message: check.message };

  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch (error) {
    return { ok: false, message: readFileFailureMessage(error, file.name) };
  }

  if (bitmap.width === 0 || bitmap.height === 0) {
    bitmap.close();
    return {
      ok: false,
      message: `A imagem "${file.name}" foi lida, mas não tem pixels decodificáveis. O arquivo pode estar corrompido.`,
    };
  }

  return {
    ok: true,
    warning: check.warning,
    image: {
      nome: file.name,
      mimeType: check.mimeType,
      byteLength: file.size,
      width: bitmap.width,
      height: bitmap.height,
      bitmap,
    },
  };
};

export type ImageStats = {
  meanLuma: number;
  contrast: number;
  edgeDensity: number;
};

const scratch = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = MEASURE_EDGE;
  canvas.height = MEASURE_EDGE;
  return canvas;
};

export const measureImage = (image: ImageBitmap): ImageStats | null => {
  const canvas = scratch();
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, MEASURE_EDGE, MEASURE_EDGE);
  ctx.drawImage(image, 0, 0, MEASURE_EDGE, MEASURE_EDGE);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, MEASURE_EDGE, MEASURE_EDGE).data;
  } catch {
    return null;
  }

  const count = MEASURE_EDGE * MEASURE_EDGE;
  const luma = new Float32Array(count);
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const offset = i * 4;
    const value = 0.299 * data[offset]! + 0.587 * data[offset + 1]! + 0.114 * data[offset + 2]!;
    luma[i] = value;
    sum += value;
  }
  const meanLuma = sum / count;

  let variance = 0;
  for (let i = 0; i < count; i += 1) {
    const delta = luma[i]! - meanLuma;
    variance += delta * delta;
  }
  const contrast = Math.sqrt(variance / count);

  let edges = 0;
  for (let y = 1; y < MEASURE_EDGE - 1; y += 1) {
    for (let x = 1; x < MEASURE_EDGE - 1; x += 1) {
      const i = y * MEASURE_EDGE + x;
      const gx = luma[i + 1]! - luma[i - 1]!;
      const gy = luma[i + MEASURE_EDGE]! - luma[i - MEASURE_EDGE]!;
      if (Math.hypot(gx, gy) > 24) edges += 1;
    }
  }
  const edgeDensity = edges / count;

  return { meanLuma, contrast, edgeDensity };
};

export const rotatedCanvas = (image: ImageBitmap, transform: ImageTransform): HTMLCanvasElement => {
  const size = rotateSize(image.width, image.height, transform.rotation);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.save();
    ctx.translate(size.width / 2, size.height / 2);
    ctx.rotate((orientForRotation(transform.rotation) * Math.PI) / 180);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
  }
  return canvas;
};

export type RenderResult = {
  width: number;
  height: number;
  cropped: boolean;
  perspective: boolean;
};

export const renderPrepared = (
  image: ImageBitmap,
  transform: ImageTransform,
  canvas: HTMLCanvasElement,
): RenderResult | null => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const source = rotatedCanvas(image, transform);
  const quad = transform.perspective;

  const perspectiveSize = quad ? correctedSize(quad) : { width: source.width, height: source.height };
  if (perspectiveSize.width < 1 || perspectiveSize.height < 1) return null;

  const crop = cropPixelRect(transform.crop, perspectiveSize.width, perspectiveSize.height);
  if (crop.width < 1 || crop.height < 1) return null;

  const fitted = outputSize(crop.width, crop.height, transform.maxEdge);
  if (fitted.width < 1 || fitted.height < 1) return null;

  canvas.width = fitted.width;
  canvas.height = fitted.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, fitted.width, fitted.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const scale = fitted.width / crop.width;

  if (quad) {
    const inverse = correctionHomographyInverse(quad, perspectiveSize.width, perspectiveSize.height);
    if (!inverse) return null;
    ctx.setTransform(scale, 0, 0, scale, crop.x, crop.y);
    ctx.transform(inverse[0], inverse[3], inverse[1], inverse[4], inverse[2], inverse[5]);
  } else {
    ctx.setTransform(scale, 0, 0, scale, crop.x, crop.y);
  }

  ctx.drawImage(source, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  return {
    width: fitted.width,
    height: fitted.height,
    cropped: transform.crop !== null,
    perspective: quad !== null,
  };
};

export const defaultQuad = (width: number, height: number, inset = 0.04): Quad => {
  const dx = width * inset;
  const dy = height * inset;
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ];
};

export type CanvasPoint = { x: number; y: number };

export const toCanvasCoords = (event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): CanvasPoint => {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
    y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
  };
};

export const toImageCoords = (point: CanvasPoint, canvas: HTMLCanvasElement, imageWidth: number, imageHeight: number): CanvasPoint => ({
  x: (point.x / canvas.width) * imageWidth,
  y: (point.y / canvas.height) * imageHeight,
});

export const qualityInputFrom = (
  image: LoadedImage,
  stats: ImageStats | null,
): { width: number; height: number; byteLength: number; meanLuma: number | null; contrast: number | null; edgeDensity: number | null } => ({
  width: image.width,
  height: image.height,
  byteLength: image.byteLength,
  meanLuma: stats?.meanLuma ?? null,
  contrast: stats?.contrast ?? null,
  edgeDensity: stats?.edgeDensity ?? null,
});

export const describeQuality = (check: ImageQualityCheck): string => {
  if (check.blocking) return `Bloqueada: ${check.message}`;
  const label = check.level === 'boa' ? 'boa' : check.level === 'razoavel' ? 'razoável' : 'ruim';
  return check.reasons.length === 0
    ? `Qualidade ${label}. ${check.positive.join(', ')}.`
    : `Qualidade ${label}. ${check.reasons.join(' ')}`;
};
