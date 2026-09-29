import { useStore } from '../state/store.js';

export const VistaStep = () => {
  const irParaEtapa = useStore((s) => s.irParaEtapa);

  return (
    <section className="etapa-informativa">
      <h2>Visualização 3D</h2>

      <div className="alerta aviso" role="status">
        <span>Etapa ainda não construída</span>
        <p>
          A cena 3D é a etapa 4. Ela vai ser gerada a partir do mesmo documento do editor 2D, com paredes
          extrudadas e vãos vazados de verdade, usando three.js.
        </p>
      </div>

      <div className="cartao">
        <h3>O que já está resolvido</h3>
        <ul className="dicas">
          <li>O modelo guarda espessura e altura em metros, independente de pixels.</li>
          <li>Os vãos são paramétricos, então viram furos na malha sem trabalho extra.</li>
          <li>A escala é uma propriedade do documento: recalibrar não altera a geometria.</li>
        </ul>
      </div>

      <button type="button" onClick={() => irParaEtapa(0)}>Voltar ao início</button>
    </section>
  );
};
