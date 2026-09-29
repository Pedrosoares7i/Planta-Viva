import { STEPS, useStore } from './state/store.js';
import { ImagemStep } from './steps/ImagemStep.js';
import { AnaliseStep } from './steps/AnaliseStep.js';
import { RevisaoStep } from './steps/RevisaoStep.js';
import { VistaStep } from './steps/VistaStep.js';

const stepState = (index: number, hasImage: boolean): string => {
  if (index === 0) return hasImage ? 'pronto' : 'pendente';
  if (index === 1) return hasImage ? 'disponivel' : 'bloqueado';
  return hasImage ? 'disponivel' : 'bloqueado';
};

export const App = () => {
  const etapa = useStore((s) => s.etapa);
  const irParaEtapa = useStore((s) => s.irParaEtapa);
  const image = useStore((s) => s.image);
  const erro = useStore((s) => s.erro);
  const aviso = useStore((s) => s.aviso);
  const limpar = useStore((s) => s.limparMensagens);

  return (
    <div className="app">
      <header className="cabecalho">
        <div className="marca">
          <span className="marca-ponto" />
          <div>
            <h1>Planta Viva</h1>
            <p>Da foto da planta ao modelo 3D</p>
          </div>
        </div>
      </header>

      <nav className="passos" aria-label="Etapas">
        {STEPS.map((step) => {
          const state = stepState(step.id, image !== null);
          const disabled = state === 'bloqueado';
          const dica = disabled ? 'Requer imagem' : step.hint;
          return (
            <button
              key={step.id}
              type="button"
              className={`passo ${etapa === step.id ? 'ativo' : ''} ${state}`}
              onClick={() => irParaEtapa(step.id)}
              disabled={disabled}
              aria-current={etapa === step.id ? 'step' : undefined}
            >
              <span className="passo-num">{step.id + 1}</span>
              <span className="passo-texto">
                <strong>{step.label}</strong>
                <small>{dica}</small>
              </span>
            </button>
          );
        })}
      </nav>

      {(erro || aviso) && (
        <div className="mensagens">
          {erro && (
            <div className="alerta erro" role="alert">
              <span>Erro</span>
              <p>{erro}</p>
            </div>
          )}
          {aviso && (
            <div className="alerta aviso" role="status">
              <span>Atenção</span>
              <p>{aviso}</p>
            </div>
          )}
          <button type="button" className="fechar" onClick={limpar} aria-label="Fechar mensagens">
            Fechar
          </button>
        </div>
      )}

      <main className="conteudo">
        {etapa === 0 && <ImagemStep />}
        {etapa === 1 && <AnaliseStep />}
        {etapa === 2 && <RevisaoStep />}
        {etapa === 3 && <VistaStep />}
      </main>
    </div>
  );
};
