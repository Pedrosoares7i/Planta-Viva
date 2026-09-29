export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

export const ACCEPT_ATTRIBUTE = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MIN_FILE_BYTES = 64;
export const MIN_EDGE_PX = 320;

export type ImageFileRejectionCode =
  | 'unsupported-format'
  | 'empty-file'
  | 'too-small'
  | 'file-too-large'
  | 'read-failed';

export type ImageFileCheck =
  | { ok: true; mimeType: AcceptedMimeType; warning: string | null }
  | { ok: false; code: ImageFileRejectionCode; message: string };

const EXTENSION_MIME: Record<string, AcceptedMimeType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const extensionOf = (name: string): string => {
  const index = name.lastIndexOf('.');
  if (index < 0 || index === name.length - 1) return '';
  return name.slice(index + 1).toLowerCase();
};

export const mimeFromName = (name: string): AcceptedMimeType | null =>
  EXTENSION_MIME[extensionOf(name)] ?? null;

export const isAcceptedMime = (type: string): type is AcceptedMimeType =>
  (ACCEPTED_MIME_TYPES as readonly string[]).includes(type.split(';')[0]!.trim().toLowerCase());

export const sniffImageMime = (bytes: Uint8Array): AcceptedMimeType | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8) {
    const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (header.every((byte, index) => bytes[index] === byte)) return 'image/png';
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
    const webp = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  }
  return null;
};

export type ImageFileDescriptor = {
  name: string;
  type: string;
  size: number;
};

const describeFormat = (descriptor: ImageFileDescriptor): string => {
  const byType = isAcceptedMime(descriptor.type) ? descriptor.type.split(';')[0]! : null;
  const byName = mimeFromName(descriptor.name);
  const label = byType ?? byName ?? descriptor.type ?? 'desconhecido';
  return label.trim() || 'sem tipo informado';
};

export const checkImageFile = (descriptor: ImageFileDescriptor): ImageFileCheck => {
  const byType = isAcceptedMime(descriptor.type);
  const byName = mimeFromName(descriptor.name);

  if (!byType && !byName) {
    return {
      ok: false,
      code: 'unsupported-format',
      message: `Formato não suportado: ${describeFormat(descriptor)}. Envie uma imagem JPG, PNG ou WebP.`,
    };
  }

  if (descriptor.size < MIN_FILE_BYTES) {
    return {
      ok: false,
      code: 'empty-file',
      message:
        descriptor.size === 0
          ? 'O arquivo está vazio (0 bytes). A leitura da imagem não retornou nenhum dado.'
          : `Arquivo muito pequeno (${descriptor.size} bytes). Pode estar corrompido ou ter sido salvo errado.`,
    };
  }

  if (descriptor.size > MAX_FILE_BYTES) {
    const mb = (descriptor.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      code: 'file-too-large',
      message: `Arquivo de ${mb} MB excede o limite de 25 MB. Reduza a resolução ou fotografe novamente.`,
    };
  }

  const mimeType = byType ? (descriptor.type.split(';')[0]!.trim() as AcceptedMimeType) : byName!;
  const warning =
    mimeType === 'image/jpeg' && descriptor.size > 12 * 1024 * 1024
      ? 'JPEG muito grande: a compressão pode ter apagado linhas finas da planta.'
      : null;

  return { ok: true, mimeType, warning };
};

export const readFileFailureMessage = (error: unknown, name: string): string => {
  const detail =
    error instanceof Error && error.message
      ? ` Detalhe técnico: ${error.message}`
      : '';
  return `Não foi possível ler a imagem "${name}". O arquivo pode estar corrompido ou o navegador pode ter bloqueado a leitura.${detail}`;
};
