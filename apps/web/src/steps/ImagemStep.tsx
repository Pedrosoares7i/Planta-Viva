import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCEPT_ATTRIBUTE, rotateSize, type NormalizedRect } from '@planta-viva/core';
import { useStore } from '../state/store.js';
import { describeQuality, renderPrepared, rotatedCanvas } from '../lib/image.js';

const DISPLAY_EDGE = 1400;
const HANDLE_HIT = 22;

type Arraste =
  | { tipo: 'canto'; indice: number; origem: NormalizedRect }
  | { tipo: 'mover'; ponto: { x: number; y: number }; origem: NormalizedRect };

const RETANGULO_INTEIRO: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

const limitar = (rect: NormalizedRect): NormalizedRect => {
  const width = Math.max(0.05, Math.min(1, rect.width));
  const height = Math.max(0.05, Math.min(1, rect.height));
  return {
    width,
    height,
    x: Math.max(0, Math.min(1 - width, rect.x)),
    y: Math.max(0, Math.min(1 - height, rect.y)),
  };
};

const cornersOf = (rect: NormalizedRect): { x: number; y: number }[] => [
  { x: rect.x, y: rect.y },
  { x: rect.x + rect.width, y: rect.y },
  { x: rect.x + rect.width, y: rect.y + rect.height },
  { x: rect.x, y: rect.y + rect.height },
];

const Seta = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="icone">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ARROW = {
  esquerda: 'M15 18l-6-6 6-6',
  direita: 'M9 18l6-6-6-6',
  cima: 'M6 15l6-6 6 6',
  baixo: 'M6 9l6 6 6-6',
  refazer: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5',
  desfazer: 'M21 12a9 9 0 1 1-3-6.7L21 8m0-5v5h-5',
  caminha: 'M4 8h3l2-2h6l2 2h3v11H4z M12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  arquivo: 'M14 3v5h5M6 3h8l5 5v13H6z',
  perspectiva: 'M4 4h16v16H4z M4 4l6 4h10 M10 8v12',
  recorte: 'M6 3v15h15 M3 6h15v15',
  lixeira: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
};

const DropZone = () => {
  const carregar = useStore((s) => s.carregar);
  const carregando = useStore((s) => s.carregando);
  const [sobre, setSobre] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  const receber = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void carregar(file);
    },
    [carregar],
  );

  return (
    <section className="dropzone" onDragOver={(e) => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)} onDrop={(e) => { e.preventDefault(); setSobre(false); receber(e.dataTransfer.files); }}>
      <h2>Envie a planta</h2>
      <p>Uma foto do papel, uma captura de tela ou um PDF convertido em imagem. JPG, PNG ou WebP, até 25 MB.</p>

      <div className="dropzone-botoes">
        <button type="button" className="primario" onClick={() => input.current?.click()} disabled={carregando}>
          <Seta d={ARROW.arquivo} /> Escolher arquivo
        </button>
        <button type="button" onClick={() => camera.current?.click()} disabled={carregando}>
          <Seta d={ARROW.caminha} /> Usar a câmera
        </button>
      </div>

      {carregando && <p className="carregando">Lendo a imagem…</p>}

      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        hidden
        onChange={(e) => { receber(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => { receber(e.target.files); e.target.value = ''; }}
      />

      <ul className="dicas">
        <li>Prefira luz uniforme e sem sombra sobre a planta.</li>
        <li>Inclua as bordas do papel para facilitar o ajuste de perspectiva.</li>
        <li>A calibração de escala é feita depois, na etapa de revisão.</li>
      </ul>

      {sobre && <div className="dropzone-sobre">Solte a imagem aqui</div>}
    </section>
  );
};

const PainelQualidade = () => {
  const qualidade = useStore((s) => s.qualidade);
  const image = useStore((s) => s.image);
  if (!qualidade || !image) return null;

  return (
    <div className={`cartao qualidade ${qualidade.blocking ? 'ruim' : qualidade.level}`}>
      <h3>Imagem</h3>
      <dl>
        <div><dt>Arquivo</dt><dd>{image.nome}</dd></div>
        <div><dt>Origem</dt><dd>{image.width} × {image.height} px</dd></div>
        <div><dt>Peso</dt><dd>{(image.byteLength / 1024 / 1024).toFixed(2)} MB</dd></div>
        <div><dt>Formato</dt><dd>{image.mimeType}</dd></div>
      </dl>
      <p className="qualidade-linha">{describeQuality(qualidade)}</p>
      {qualidade.blocking && (
        <p className="bloqueio">Você pode continuar, mas o resultado da análise será menos confiável.</p>
      )}
    </div>
  );
};

const HistoricoTransformacoes = () => {
  const steps = useStore((s) => s.transform.steps);
  if (steps.length === 0) return null;
  return (
    <div className="cartao">
      <h3>Transformações</h3>
      <ol className="passos-lista">
        {steps.map((step, index) => (
          <li key={`${step.at}-${index}`}>
            <span className={`marca-passo ${step.kind}`} />
            {step.detail}
          </li>
        ))}
      </ol>
    </div>
  );
};

export const ImagemStep = () => {
  const image = useStore((s) => s.image);
  const transform = useStore((s) => s.transform);
  const modo = useStore((s) => s.modo);
  const historico = useStore((s) => s.historico);
  const futuro = useStore((s) => s.futuro);
  const girar = useStore((s) => s.girar);
  const entrarPerspectiva = useStore((s) => s.entrarPerspectiva);
  const entrarRecorte = useStore((s) => s.entrarRecorte);
  const sairDoModo = useStore((s) => s.sairDoModo);
  const moverCanto = useStore((s) => s.moverCanto);
  const soltarCanto = useStore((s) => s.soltarCanto);
  const definirRecorte = useStore((s) => s.definirRecorte);
  const limparTransform = useStore((s) => s.limparTransform);
  const desfazer = useStore((s) => s.desfazer);
  const refazer = useStore((s) => s.refazer);
  const irParaEtapa = useStore((s) => s.irParaEtapa);

  const canvas = useRef<HTMLCanvasElement>(null);
  const arraste = useRef<Arraste | null>(null);
  const [recorte, setRecorte] = useState<NormalizedRect>(RETANGULO_INTEIRO);
  const [logico, setLogico] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (modo === 'recorte') setRecorte(transform.crop ?? RETANGULO_INTEIRO);
  }, [modo, transform.crop]);

  useEffect(() => {
    const elemento = canvas.current;
    if (!elemento || !image) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    let tamanho: { width: number; height: number } | null = null;

    if (modo === 'perspectiva') {
      const rotated = rotatedCanvas(image.bitmap, transform);
      tamanho = escalado(rotated.width, rotated.height);
      elemento.width = tamanho.width * dpr;
      elemento.height = tamanho.height * dpr;
      const ctx = elemento.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, tamanho.width, tamanho.height);
        ctx.drawImage(rotated, 0, 0, tamanho.width, tamanho.height);
      }
    } else {
      const rascunho = document.createElement('canvas');
      const semRecorte = modo === 'recorte' ? { ...transform, crop: null } : transform;
      const limite = modo === 'recorte' ? DISPLAY_EDGE : transform.maxEdge;
      const resultado = renderPrepared(image.bitmap, { ...semRecorte, maxEdge: limite }, rascunho);
      if (!resultado) return;
      tamanho = { width: resultado.width, height: resultado.height };
      elemento.width = resultado.width * dpr;
      elemento.height = resultado.height * dpr;
      const ctx = elemento.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, resultado.width, resultado.height);
        ctx.drawImage(rascunho, 0, 0);
      }
    }

    if (!tamanho) return;
    setLogico(tamanho);

    if (modo === 'perspectiva' && transform.perspective && tamanho) {
      const ctx = elemento.getContext('2d');
      if (!ctx) return;
      const rotated = rotateSize(transform.sourceWidth, transform.sourceHeight, transform.rotation);
      const fx = tamanho.width / rotated.width;
      const fy = tamanho.height / rotated.height;
      const quad = transform.perspective;

      ctx.save();
      ctx.beginPath();
      quad.forEach((p, i) => {
        const x = p.x * fx;
        const y = p.y * fy;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(15, 20, 25, 0.45)';
      ctx.fill('evenodd');
      ctx.restore();

      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      quad.forEach((p, indice) => {
        const x = p.x * fx;
        const y = p.y * fy;
        if (indice === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();

      quad.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x * fx, p.y * fy, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#4ade80';
        ctx.fill();
        ctx.strokeStyle = '#0f1419';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    if (modo === 'recorte') {
      const ctx = elemento.getContext('2d');
      if (!ctx) return;
      const r = recorte;
      const x = r.x * tamanho.width;
      const y = r.y * tamanho.height;
      const w = r.width * tamanho.width;
      const h = r.height * tamanho.height;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 20, 25, 0.55)';
      ctx.beginPath();
      ctx.rect(0, 0, tamanho.width, tamanho.height);
      ctx.rect(x, y, w, h);
      ctx.fill('evenodd');
      ctx.restore();

      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      for (const corner of cornersOf(r)) {
        ctx.beginPath();
        ctx.arc(corner.x * tamanho.width, corner.y * tamanho.height, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#4ade80';
        ctx.fill();
      }
    }
  }, [image, transform, modo, recorte]);

  const paraLogico = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const elemento = canvas.current;
      if (!elemento || logico.width === 0) return { x: 0, y: 0 };
      const bounds = elemento.getBoundingClientRect();
      return {
        x: ((event.clientX - bounds.left) / bounds.width) * logico.width,
        y: ((event.clientY - bounds.top) / bounds.height) * logico.height,
      };
    },
    [logico],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image) return;
    const ponto = paraLogico(event);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (modo === 'perspectiva') {
      const tamanho = rotateSize(transform.sourceWidth, transform.sourceHeight, transform.rotation);
      const alvo = { x: ponto.x * (tamanho.width / logico.width), y: ponto.y * (tamanho.height / logico.height) };
      if (!transform.perspective) return;
      const distances = transform.perspective.map((p) => Math.hypot(p.x - alvo.x, p.y - alvo.y));
      const indice = distances.indexOf(Math.min(...distances));
      const limite = HANDLE_HIT * (tamanho.width / logico.width);
      if (distances[indice]! > limite * 1.5) return;
      moverCanto(indice, alvo);
      return;
    }

    if (modo === 'recorte') {
      const normalizado = { x: ponto.x / logico.width, y: ponto.y / logico.height };
      const corners = cornersOf(recorte);
      const raio = HANDLE_HIT / logico.width;
      const indice = corners.findIndex(
        (c) => Math.abs(c.x - normalizado.x) < raio && Math.abs(c.y - normalizado.y) < raio,
      );
      if (indice >= 0) {
        arraste.current = { tipo: 'canto', indice, origem: recorte };
      } else {
        arraste.current = { tipo: 'mover', ponto: normalizado, origem: recorte };
      }
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image) return;
    const atual = arraste.current;
    if (!atual) return;
    const ponto = paraLogico(event);

    if (modo === 'recorte' && atual) {
      const nx = ponto.x / logico.width;
      const ny = ponto.y / logico.height;
      if (atual.tipo === 'mover') {
        setRecorte(
          limitar({
            ...atual.origem,
            x: atual.origem.x + (nx - atual.ponto.x),
            y: atual.origem.y + (ny - atual.ponto.y),
          }),
        );
      } else {
        const base = atual.origem;
        const direita = base.x + base.width;
        const baixo = base.y + base.height;
        let x = base.x;
        let y = base.y;
        let largura = base.width;
        let altura = base.height;
        if (atual.indice === 0) {
          x = nx; y = ny; largura = direita - nx; altura = baixo - ny;
        } else if (atual.indice === 1) {
          y = ny; largura = nx - base.x; altura = baixo - ny;
        } else if (atual.indice === 2) {
          largura = nx - base.x; altura = ny - base.y;
        } else {
          x = nx; largura = direita - nx; altura = ny - base.y;
        }
        setRecorte(limitar({ x, y, width: largura, height: altura }));
      }
    }
  };

  const onPointerUp = () => {
    if (modo === 'perspectiva') soltarCanto();
    arraste.current = null;
  };

  if (!image) return <DropZone />;

  return (
    <section className="editor">
      <div className="ferramentas">
        <button type="button" onClick={() => girar(-90)} title="Girar à esquerda">
          <Seta d={ARROW.esquerda} /> Esquerda
        </button>
        <button type="button" onClick={() => girar(90)} title="Girar à direita">
          <Seta d={ARROW.direita} /> Direita
        </button>
        <span className="separador" />
        <button
          type="button"
          className={modo === 'perspectiva' ? 'ativo' : ''}
          onClick={() => (modo === 'perspectiva' ? soltarCanto() : entrarPerspectiva())}
        >
          <Seta d={ARROW.perspectiva} /> Perspectiva
        </button>
        <button
          type="button"
          className={modo === 'recorte' ? 'ativo' : ''}
          onClick={() => (modo === 'recorte' ? sairDoModo() : entrarRecorte())}
        >
          <Seta d={ARROW.recorte} /> Recorte
        </button>
        <span className="separador" />
        <button type="button" onClick={desfazer} disabled={historico.length === 0} title="Desfazer">
          <Seta d={ARROW.desfazer} />
        </button>
        <button type="button" onClick={refazer} disabled={futuro.length === 0} title="Refazer">
          <Seta d={ARROW.refazer} />
        </button>
        <span className="separador" />
        <button type="button" onClick={limparTransform} title="Descartar transformações">
          <Seta d={ARROW.lixeira} /> Limpar
        </button>
      </div>

      {modo !== 'nenhuma' && (
        <div className="faixa-modo">
          {modo === 'perspectiva' ? (
            <>
              <p>Arraste os quatro cantos para o papel. O que ficar fora da área é descartado.</p>
              <button type="button" className="primario" onClick={soltarCanto}>Aplicar</button>
            </>
          ) : (
            <>
              <p>Arraste os cantos para cortar as margens.</p>
              <button type="button" className="primario" onClick={() => { definirRecorte(recorte); sairDoModo(); }}>
                Aplicar
              </button>
              <button type="button" onClick={() => { definirRecorte(null); setRecorte(RETANGULO_INTEIRO); }}>
                Remover
              </button>
            </>
          )}
        </div>
      )}

      <div className="palco">
        <canvas
          ref={canvas}
          className={modo === 'nenhuma' ? '' : 'editando'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      <div className="rodape-etapa">
        <p className="saida">
          Saída: <strong>{transform.outputWidth} × {transform.outputHeight} px</strong>
          {transform.perspective && ' · perspectiva corrigida'}
          {transform.crop && ' · recortada'}
        </p>
        <button type="button" className="primario grande" onClick={() => irParaEtapa(1)}>
          Continuar para a análise
        </button>
      </div>

      <aside className="lateral">
        <PainelQualidade />
        <HistoricoTransformacoes />
        <div className="cartao dica">
          <h3>Comparar com a foto</h3>
          <p>
            Esta versão mostra a imagem preparada inteira. A comparação entre o traçado e a foto é feita na
            etapa de revisão, com sobreposição e ajuste de opacidade.
          </p>
        </div>
      </aside>
    </section>
  );
};

const escalado = (width: number, height: number): { width: number; height: number } => {
  const ratio = Math.min(1, DISPLAY_EDGE / Math.max(width, height));
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
};
