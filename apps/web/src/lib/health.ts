/**
 * Consulta de saúde do serviço de análise.
 *
 * Existe um caso que não é erro: enquanto `apps/server` não existir, o Vite
 * devolve 404 para requisições que pedem JSON. Isso é o estado esperado do
 * projeto, então é classificado como "não construído" e não como falha.
 */

export type HealthState =
  | { status: 'consultando' }
  | { status: 'disponivel'; providers: string[] }
  | { status: 'nao-construido'; detalhe: string }
  | { status: 'sem-credencial' }
  | { status: 'erro'; detalhe: string };

export type HealthPayload = {
  status?: string;
  providers?: { id: string; configured: boolean }[];
};

export type Buscar = (
  url: string,
  init: { signal: AbortSignal; headers: { Accept: string } },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

const PADRAO: Buscar = (url, init) => fetch(url, init);

export async function consultarHealth(
  signal: AbortSignal,
  buscar: Buscar = PADRAO,
): Promise<HealthState> {
  let resposta: Awaited<ReturnType<Buscar>>;
  try {
    resposta = await buscar('/api/health', { signal, headers: { Accept: 'application/json' } });
  } catch (erro) {
    if (signal.aborted) throw erro;
    const detalhe = erro instanceof Error ? erro.message : 'erro desconhecido';
    return { status: 'nao-construido', detalhe: `Falha de rede ao consultar /api/health: ${detalhe}` };
  }

  const contentType = resposta.headers.get('content-type') ?? '';

  if (resposta.status === 404) {
    return {
      status: 'nao-construido',
      detalhe:
        'O endereço /api/health respondeu 404. Não existe servidor de análise neste projeto ainda, então o reconhecimento automático está indisponível.',
    };
  }

  if (!contentType.includes('application/json')) {
    return {
      status: 'nao-construido',
      detalhe: `O endereço /api/health respondeu ${resposta.status} com "${
        contentType || 'conteúdo sem tipo'
      }" em vez de JSON.`,
    };
  }

  if (!resposta.ok) {
    return { status: 'erro', detalhe: `O serviço respondeu ${resposta.status} ${resposta.statusText}.` };
  }

  let dados: HealthPayload;
  try {
    dados = (await resposta.json()) as HealthPayload;
  } catch {
    return { status: 'erro', detalhe: 'A resposta do serviço não é um JSON válido.' };
  }

  const configurados = (dados.providers ?? []).filter((p) => p.configured).map((p) => p.id);
  if (configurados.length === 0) return { status: 'sem-credencial' };
  return { status: 'disponivel', providers: configurados };
}
