import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../state/store.js';
import { consultarHealth, type HealthState } from '../lib/health.js';

export const AnaliseStep = () => {
  const irParaEtapa = useStore((s) => s.irParaEtapa);
  const image = useStore((s) => s.image);
  const transform = useStore((s) => s.transform);
  const [health, setHealth] = useState<HealthState>({ status: 'consultando' });
  const [tentativas, setTentativas] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setHealth({ status: 'consultando' });
    consultarHealth(controller.signal)
      .then(setHealth)
      .catch((erro: unknown) => {
        if (controller.signal.aborted) return;
        setHealth({
          status: 'erro',
          detalhe: erro instanceof Error ? erro.message : 'falha inesperada ao consultar o serviço',
        });
      });
    return () => controller.abort();
  }, [tentativas]);

  const irParaRevisao = useCallback(() => irParaEtapa(2), [irParaEtapa]);
  const tentarDeNovo = useCallback(() => setTentativas((n) => n + 1), []);

  return (
    <section className="etapa-informativa">
      <h2>Análise da planta</h2>

      {health.status === 'consultando' && (
        <p className="carregando">Verificando se o serviço de análise está disponível…</p>
      )}

      {health.status === 'nao-construido' && (
        <div className="cartao destaque">
          <h3>O reconhecimento automático ainda não está pronto</h3>
          <p>
            Esta etapa do projeto ainda não foi construída. Não é um problema com a sua imagem: ela foi
            carregada e está intacta.
          </p>
          <p>
            Enquanto isso, o <strong>editor manual</strong> da aba seguinte já funciona por completo, com
            o mesmo modelo de dados que o reconhecimento vai alimentar.
          </p>
          <p className="nota">
            <button type="button" className="primario" onClick={irParaRevisao}>
              Desenhar a planta manualmente
            </button>
          </p>
          <details className="detalhe-tecnico">
            <summary>Detalhe técnico</summary>
            <p>{health.detalhe}</p>
            <p className="nota">
              O serviço de análise é a etapa 6. Ele guarda as credenciais do modelo de visão no servidor, e
              por isso não pode existir dentro do navegador.
            </p>
            <button type="button" onClick={tentarDeNovo}>Verificar de novo</button>
          </details>
        </div>
      )}

      {health.status === 'sem-credencial' && (
        <div className="alerta aviso" role="status">
          <span>Sem credencial configurada</span>
          <p>
            O serviço de análise está no ar, mas nenhuma chave de modelo de visão foi encontrada. Configure
            <code> GEMINI_API_KEY</code> ou <code>OPENAI_API_KEY</code> no servidor. Enquanto isso, o
            editor manual funciona normalmente.
          </p>
          <p className="nota">
            <button type="button" onClick={tentarDeNovo}>Verificar de novo</button>
          </p>
        </div>
      )}

      {health.status === 'erro' && (
        <div className="alerta erro" role="alert">
          <span>Falha na consulta</span>
          <p>{health.detalhe}</p>
          <p className="nota">
            <button type="button" onClick={tentarDeNovo}>Tentar de novo</button>
          </p>
        </div>
      )}

      {health.status === 'disponivel' && (
        <div className="alerta ok" role="status">
          <span>Serviço pronto</span>
          <p>Provedores configurados: {health.providers.join(', ')}.</p>
        </div>
      )}

      <div className="cartao">
        <h3>Como o reconhecimento vai funcionar</h3>
        <p>
          A análise tem duas etapas. A <strong>geometria</strong> (paredes, vãos e cantos) vem de visão
          computacional clássica. A <strong>semântica</strong> (nomes dos ambientes e medidas escritas) vem
          de um modelo de visão.
        </p>
        <p>
          Nenhuma coordenada do modelo entra no traçado final sem corresponder a uma linha detectada pela
          primeira etapa. Se as duas discordarem, o elemento é descartado ou marcado para revisão — nunca
          aceito em silêncio.
        </p>
        <p>
          Quando o serviço falhar de verdade, o aplicativo <strong>não simula</strong> um resultado: a imagem
          continua preservada e o traçado pode ser feito à mão.
        </p>
      </div>

      <dl className="resumo">
        <div><dt>Imagem</dt><dd>{image?.nome ?? '—'}</dd></div>
        <div><dt>Preparada</dt><dd>{transform.outputWidth} × {transform.outputHeight} px</dd></div>
        <div><dt>Rotação</dt><dd>{transform.rotation}°</dd></div>
        <div><dt>Perspectiva</dt><dd>{transform.perspective ? 'corrigida' : 'não corrigida'}</dd></div>
        <div><dt>Recorte</dt><dd>{transform.crop ? 'aplicado' : 'não aplicado'}</dd></div>
      </dl>

      <button type="button" className="primario grande" onClick={irParaRevisao}>
        Ir para o editor manual
      </button>
    </section>
  );
};
