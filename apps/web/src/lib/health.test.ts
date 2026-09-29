import { describe, expect, it } from 'vitest';
import { consultarHealth, type Buscar, type HealthState } from './health.js';

const sinal = new AbortController().signal;

const resposta = (
  opcoes: Partial<{
    ok: boolean;
    status: number;
    statusText: string;
    contentType: string | null;
    corpo: unknown;
    jsonFalha: boolean;
  }> = {},
) => {
  const {
    ok = true,
    status = 200,
    statusText = 'OK',
    contentType = 'application/json',
    corpo = {},
    jsonFalha = false,
  } = opcoes;
  return {
    ok,
    status,
    statusText,
    headers: { get: (nome: string) => (nome.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => {
      if (jsonFalha) throw new SyntaxError('Unexpected token');
      return corpo;
    },
  };
};

const buscarQue = (r: ReturnType<typeof resposta>): Buscar => async () => r as never;

async function consultar(r: ReturnType<typeof resposta>): Promise<HealthState> {
  return consultarHealth(sinal, buscarQue(r));
}

describe('consultarHealth', () => {
  it('classifica 404 como recurso não construído, não como erro', async () => {
    // caso real: o Vite devolve 404 sem content-type para Accept: application/json
    const estado = await consultar(resposta({ ok: false, status: 404, contentType: null }));
    expect(estado.status).toBe('nao-construido');
    if (estado.status === 'nao-construido') expect(estado.detalhe).toContain('404');
  });

  it('trata HTML com 200 como recurso não construído', async () => {
    const estado = await consultar(resposta({ contentType: 'text/html' }));
    expect(estado.status).toBe('nao-construido');
    if (estado.status === 'nao-construido') expect(estado.detalhe).toContain('text/html');
  });

  it('trata ausência de content-type como recurso não construído', async () => {
    const estado = await consultar(resposta({ contentType: null }));
    expect(estado.status).toBe('nao-construido');
    if (estado.status === 'nao-construido') expect(estado.detalhe).toContain('conteúdo sem tipo');
  });

  it('trata falha de rede como recurso não construído', async () => {
    const estado = await consultarHealth(sinal, async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(estado.status).toBe('nao-construido');
    if (estado.status === 'nao-construido') expect(estado.detalhe).toContain('Failed to fetch');
  });

  it('reporta erro quando o serviço responde com falha e JSON', async () => {
    const estado = await consultar(resposta({ ok: false, status: 503, statusText: 'Service Unavailable' }));
    expect(estado.status).toBe('erro');
    if (estado.status === 'erro') expect(estado.detalhe).toContain('503');
  });

  it('reporta erro quando o JSON é inválido', async () => {
    const estado = await consultar(resposta({ jsonFalha: true }));
    expect(estado.status).toBe('erro');
  });

  it('sinaliza falta de credencial quando nenhum provedor está configurado', async () => {
    const estado = await consultar(
      resposta({ corpo: { providers: [{ id: 'gemini', configured: false }] } }),
    );
    expect(estado.status).toBe('sem-credencial');
  });

  it('aceita resposta sem a lista de provedores como sem credencial', async () => {
    expect((await consultar(resposta({ corpo: { status: 'ok' } }))).status).toBe('sem-credencial');
  });

  it('lista apenas os provedores configurados', async () => {
    const estado = await consultar(
      resposta({
        corpo: {
          providers: [
            { id: 'gemini', configured: true },
            { id: 'openai', configured: false },
            { id: 'nenhum', configured: true },
          ],
        },
      }),
    );
    expect(estado).toEqual({ status: 'disponivel', providers: ['gemini', 'nenhum'] });
  });

  it('pede JSON explicitamente, para não receber o fallback HTML do Vite', async () => {
    let acceptVisto: string | undefined;
    await consultarHealth(sinal, async (_url, init) => {
      acceptVisto = init.headers.Accept;
      return resposta({ ok: false, status: 404, contentType: null }) as never;
    });
    expect(acceptVisto).toBe('application/json');
  });

  it('propaga o erro quando a consulta foi cancelada', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      consultarHealth(controller.signal, async () => {
        const e = new Error('abortado');
        throw e;
      }),
    ).rejects.toThrow('abortado');
  });
});
