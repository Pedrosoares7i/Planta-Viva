import { describe, expect, it } from 'vitest';
import {
  checkImageFile,
  extensionOf,
  isAcceptedMime,
  mimeFromName,
  readFileFailureMessage,
  sniffImageMime,
  MAX_FILE_BYTES,
} from './file.js';

describe('extensionOf', () => {
  it('extrai a extensao em minusculas', () => {
    expect(extensionOf('planta.JPG')).toBe('jpg');
    expect(extensionOf('minha plantafinal.png')).toBe('png');
    expect(extensionOf('arquivo.webp')).toBe('webp');
  });

  it('devolve string vazia quando nao ha extensao', () => {
    expect(extensionOf('planta')).toBe('');
    expect(extensionOf('planta.')).toBe('');
  });
});

describe('mimeFromName', () => {
  it('reconhece jpg, jpeg, jfif, png e webp', () => {
    expect(mimeFromName('a.jpg')).toBe('image/jpeg');
    expect(mimeFromName('a.jpeg')).toBe('image/jpeg');
    expect(mimeFromName('a.JFIF')).toBe('image/jpeg');
    expect(mimeFromName('a.png')).toBe('image/png');
    expect(mimeFromName('a.webp')).toBe('image/webp');
  });

  it('devolve null para extensao desconhecida', () => {
    expect(mimeFromName('a.gif')).toBeNull();
    expect(mimeFromName('a.pdf')).toBeNull();
  });
});

describe('isAcceptedMime', () => {
  it('aceita os tres formatos', () => {
    expect(isAcceptedMime('image/jpeg')).toBe(true);
    expect(isAcceptedMime('image/png')).toBe(true);
    expect(isAcceptedMime('image/webp')).toBe(true);
  });

  it('ignora caixa e parametros', () => {
    expect(isAcceptedMime('IMAGE/PNG')).toBe(true);
    expect(isAcceptedMime('image/jpeg; charset=binary')).toBe(true);
  });

  it('rejeita outros tipos', () => {
    expect(isAcceptedMime('image/gif')).toBe(false);
    expect(isAcceptedMime('application/pdf')).toBe(false);
    expect(isAcceptedMime('image/svg+xml')).toBe(false);
  });
});

describe('sniffImageMime', () => {
  it('detecta JPEG pelo cabecalho FF D8 FF', () => {
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });

  it('detecta PNG pela assinatura de 8 bytes', () => {
    expect(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
  });

  it('detecta WebP por RIFF....WEBP', () => {
    const bytes = new Uint8Array(12);
    bytes.set([0x52, 0x49, 0x46, 0x46], 0);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffImageMime(bytes)).toBe('image/webp');
  });

  it('devolve null para dados que nao sao imagem suportada', () => {
    expect(sniffImageMime(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();
    expect(sniffImageMime(new Uint8Array([]))).toBeNull();
  });
});

describe('checkImageFile', () => {
  const base = { name: 'planta.png', type: 'image/png', size: 2_000_000 };

  it('aceita PNG valido', () => {
    const result = checkImageFile(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mimeType).toBe('image/png');
  });

  it('rejeita GIF com mensagem que cita o formato recebido', () => {
    const result = checkImageFile({ name: 'a.gif', type: 'image/gif', size: 1000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('unsupported-format');
      expect(result.message).toContain('image/gif');
      expect(result.message).toContain('JPG, PNG ou WebP');
    }
  });

  it('rejeita PDF', () => {
    const result = checkImageFile({ name: 'planta.pdf', type: 'application/pdf', size: 5000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('unsupported-format');
  });

  it('detecta arquivo vazio', () => {
    const result = checkImageFile({ ...base, size: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('empty-file');
      expect(result.message).toContain('0 bytes');
    }
  });

  it('detecta arquivo corrompido minúsculo', () => {
    const result = checkImageFile({ ...base, size: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('empty-file');
  });

  it('rejeita arquivo acima de 25 MB informando o tamanho', () => {
    const result = checkImageFile({ ...base, size: MAX_FILE_BYTES + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('file-too-large');
      expect(result.message).toMatch(/25 MB/);
    }
  });

  it('avisa sobre JPEG muito grande', () => {
    const result = checkImageFile({
      name: 'foto.jpg',
      type: 'image/jpeg',
      size: 15 * 1024 * 1024,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warning).toContain('JPEG muito grande');
      expect(result.mimeType).toBe('image/jpeg');
    }
  });

  it('recupera o tipo pela extensao quando o navegador nao informa type', () => {
    const result = checkImageFile({ name: 'capture.jpg', type: '', size: 800_000 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mimeType).toBe('image/jpeg');
  });

  it('recusa quando type e vazio e a extensao tambem nao ajuda', () => {
    const result = checkImageFile({ name: 'capture-001', type: '', size: 800_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('unsupported-format');
      expect(result.message).toContain('sem tipo informado');
    }
  });

  it('usa type valido mesmo com extensao estranha', () => {
    const result = checkImageFile({ name: 'sem-extensao', type: 'image/png', size: 900_000 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mimeType).toBe('image/png');
  });
});

describe('readFileFailureMessage', () => {
  it('inclui o nome do arquivo e o detalhe tecnico', () => {
    const message = readFileFailureMessage(new Error('Unexpected end of stream'), 'planta.jpg');
    expect(message).toContain('planta.jpg');
    expect(message).toContain('Unexpected end of stream');
  });

  it('funciona sem Error', () => {
    const message = readFileFailureMessage(undefined, 'a.png');
    expect(message).toContain('a.png');
    expect(message).not.toContain('undefined');
  });
});
