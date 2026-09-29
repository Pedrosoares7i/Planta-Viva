import { useCallback, useEffect, useRef, useState } from 'react';
import {
  formatMeters,
  measureStatus,
  measureStatusLabel,
  validatePlan,
  vertexDegree,
  wallLengthM,
  wallLengthPx,
  wallsAtVertex,
  type CascadeReport,
  type Id,
  type Point,
} from '@planta-viva/core';
import { useStore } from '../state/store.js';
import { usePlanStore, type Tool } from '../state/planStore.js';
import { desenharPlano, toPlan } from '../lib/planRender.js';

const FERRAMENTAS: { id: Tool; label: string; atalho: string; dica: string }[] = [
  { id: 'parede', label: 'Parede', atalho: 'W', dica: 'Clique no primeiro ponto e depois no segundo. Encaixa em cantos e eixos existentes.' },
  { id: 'selecionar', label: 'Selecionar', atalho: 'V', dica: 'Clique numa parede ou num canto para selecionar.' },
  { id: 'mover', label: 'Mover', atalho: 'M', dica: 'Selecione um canto e arraste. Paredes e vãos ligados acompanham.' },
  { id: 'apagar', label: 'Apagar', atalho: 'X', dica: 'Clique para apagar. Ao apagar um canto com duas paredes, elas viram uma.' },
];

const Relatorio = ({ report, onFechar }: { report: CascadeReport; onFechar: () => void }) => {
  const linhas = report.notes;
  if (linhas.length === 0) return null;
  return (
    <div className="alerta aviso" role="status">
      <span>Mudança no traçado</span>
      <ul className="notas-relatorio">
        {linhas.map((linha, i) => (
          <li key={i}>{linha}</li>
        ))}
      </ul>
      <button type="button" onClick={onFechar}>Entendi</button>
    </div>
  );
};

const BarraStatus = () => {
  const plan = usePlanStore((s) => s.plan);
  const scale = usePlanStore((s) => s.scale);
  const selecao = usePlanStore((s) => s.selecao);
  const transform = useStore((s) => s.transform);

  const paredes = Object.keys(plan.walls).length;
  const vertices = Object.keys(plan.vertices).length;
  const validacao = validatePlan(plan, scale);
  const status = measureStatusLabel[measureStatus(scale)];

  let detalhe = 'nada selecionado';
  if (selecao?.tipo === 'parede') {
    const wall = plan.walls[selecao.id];
    if (wall) {
      const metros = wallLengthM(plan, wall, scale);
      const comprimento =
        metros === null
          ? `${Math.round(wallLengthPx(plan, wall) ?? 0)} px (${formatMeters(null, scale.unit)})`
          : formatMeters(metros, scale.unit);
      detalhe = `parede selecionada · ${comprimento} · ${wallsAtVertex(plan, wall.a).length + wallsAtVertex(plan, wall.b).length} ligações`;
    }
  } else if (selecao?.tipo === 'vertice') {
    const grau = vertexDegree(plan, selecao.id);
    detalhe = `canto selecionado · ${grau} parede${grau === 1 ? '' : 's'}`;
  }

  return (
    <div className="barra-status">
      <span><strong>{paredes}</strong> paredes</span>
      <span><strong>{vertices}</strong> cantos</span>
      <span>escala: <strong>{status}</strong></span>
      <span>imagem: {transform.outputWidth}×{transform.outputHeight}</span>
      {validacao.issues.length > 0 && (
        <span className="problemas">{validacao.issues.length} aviso(s)</span>
      )}
      <span className="detalhe-selecao">{detalhe}</span>
    </div>
  );
};

export const RevisaoStep = () => {
  const image = useStore((s) => s.image);
  const transform = useStore((s) => s.transform);
  const irParaEtapa = useStore((s) => s.irParaEtapa);

  const plan = usePlanStore((s) => s.plan);
  const scale = usePlanStore((s) => s.scale);
  const ferramenta = usePlanStore((s) => s.ferramenta);
  const selecao = usePlanStore((s) => s.selecao);
  const view = usePlanStore((s) => s.view);
  const primeiroPonto = usePlanStore((s) => s.primeiroPonto);
  const rascunho = usePlanStore((s) => s.rascunho);
  const historico = usePlanStore((s) => s.historico);
  const futuro = usePlanStore((s) => s.futuro);
  const relatorios = usePlanStore((s) => s.relatorios);

  const setTool = usePlanStore((s) => s.setTool);
  const ajustarZoom = usePlanStore((s) => s.ajustarZoom);
  const redefinirVista = usePlanStore((s) => s.redefinirVista);
  const moverCursor = usePlanStore((s) => s.moverCursor);
  const confirmarOuIniciar = usePlanStore((s) => s.confirmarOuIniciar);
  const arrastarVertice = usePlanStore((s) => s.arrastarVertice);
  const soltarVertice = usePlanStore((s) => s.soltarVertice);
  const selecionarEm = usePlanStore((s) => s.selecionarEm);
  const cancelar = usePlanStore((s) => s.cancelar);
  const desfazer = usePlanStore((s) => s.desfazer);
  const refazer = usePlanStore((s) => s.refazer);
  const limparPlano = usePlanStore((s) => s.limparPlano);
  const fecharRelatorios = usePlanStore((s) => s.fecharRelatorios);

  const canvas = useRef<HTMLCanvasElement>(null);
  const fundo = useRef<HTMLCanvasElement>(null);
  const arrasto = useRef<Id | null>(null);
  const [tamanho, setTamanho] = useState({ width: 900, height: 560 });
  const [opacidade, setOpacidade] = useState(0.45);
  const [mostrarGrade, setMostrarGrade] = useState(true);
  const [dica, setDica] = useState(FERRAMENTAS[0]!.dica);

  useEffect(() => {
    setDica(FERRAMENTAS.find((f) => f.id === ferramenta)?.dica ?? '');
  }, [ferramenta]);

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent): void => {
      const alvo = evento.target as HTMLElement | null;
      if (alvo && ['INPUT', 'TEXTAREA'].includes(alvo.tagName)) return;
      const chave = evento.key.toLowerCase();
      const encontrada = FERRAMENTAS.find((f) => f.atalho.toLowerCase() === chave);
      if (encontrada) {
        evento.preventDefault();
        setTool(encontrada.id);
        return;
      }
      if (chave === 'escape') cancelar();
      if (chave === 'z' && (evento.ctrlKey || evento.metaKey)) {
        evento.preventDefault();
        if (evento.shiftKey) refazer();
        else desfazer();
      }
      if (chave === '0') redefinirVista();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [cancelar, desfazer, redefinirVista, refazer, setTool]);

  const desenharFundo = useCallback(() => {
    const elemento = fundo.current;
    if (!elemento) return;
    const ctx = elemento.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    elemento.width = tamanho.width * dpr;
    elemento.height = tamanho.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, tamanho.width, tamanho.height);
    if (!image) return;
    ctx.globalAlpha = opacidade;
    ctx.drawImage(image.bitmap, view.panX, view.panY, transform.outputWidth * view.zoom, transform.outputHeight * view.zoom);
    ctx.globalAlpha = 1;
  }, [image, opacidade, tamanho, transform.outputHeight, transform.outputWidth, view.panX, view.panY, view.zoom]);

  useEffect(() => { desenharFundo(); }, [desenharFundo]);

  useEffect(() => {
    const elemento = canvas.current;
    if (!elemento) return;
    const ctx = elemento.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    elemento.width = tamanho.width * dpr;
    elemento.height = tamanho.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    desenharPlano(ctx, tamanho.width, tamanho.height, {
      plan,
      scale,
      view,
      selection: selecao,
      primeiroPonto,
      rascunho,
      cursor: usePlanStore.getState().cursor,
      mostrarGrade,
      envelopeIds: new Set(),
    });
  }, [plan, scale, view, selecao, primeiroPonto, rascunho, tamanho, mostrarGrade]);

  const paraTela = useCallback((evento: { clientX: number; clientY: number }): Point => {
    const elemento = canvas.current;
    if (!elemento) return { x: 0, y: 0 };
    const bounds = elemento.getBoundingClientRect();
    return {
      x: ((evento.clientX - bounds.left) / bounds.width) * tamanho.width,
      y: ((evento.clientY - bounds.top) / bounds.height) * tamanho.height,
    };
  }, [tamanho]);

  const onPointerDown = (evento: React.PointerEvent<HTMLCanvasElement>): void => {
    const tela = paraTela(evento);
    const ponto = toPlan(tela, view);
    evento.currentTarget.setPointerCapture(evento.pointerId);

    if (ferramenta === 'parede') {
      confirmarOuIniciar(ponto);
      return;
    }
    if (ferramenta === 'apagar') {
      selecionarEm(ponto);
      return;
    }

    selecionarEm(ponto);
    if (ferramenta === 'mover' && selecao?.tipo === 'vertice') {
      arrasto.current = selecao.id;
      arrastarVertice(selecao.id, ponto);
    }
  };

  const onPointerMove = (evento: React.PointerEvent<HTMLCanvasElement>): void => {
    const tela = paraTela(evento);
    const ponto = toPlan(tela, view);
    if (arrasto.current) {
      arrastarVertice(arrasto.current, ponto);
      return;
    }
    moverCursor(ponto);
  };

  const onPointerUp = (): void => {
    if (arrasto.current) soltarVertice();
    arrasto.current = null;
  };

  const onWheel = (evento: React.WheelEvent<HTMLCanvasElement>): void => {
    const tela = paraTela(evento);
    ajustarZoom(evento.deltaY < 0 ? 1.12 : 1 / 1.12, tela);
  };

  if (!image) {
    return (
      <section className="etapa-informativa">
        <h2>Revisão do traçado</h2>
        <div className="alerta aviso" role="status">
          <span>Sem imagem</span>
          <p>Envie uma imagem na primeira etapa para começar a desenhar o traçado.</p>
        </div>
        <button type="button" className="primario" onClick={() => irParaEtapa(0)}>Ir para a imagem</button>
      </section>
    );
  }

  return (
    <section className="editor-revisao">
      <div className="barra-ferramentas">
        {FERRAMENTAS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={ferramenta === f.id ? 'ativo' : ''}
            onClick={() => setTool(f.id)}
            title={`${f.dica} (${f.atalho})`}
          >
            {f.label} <kbd>{f.atalho}</kbd>
          </button>
        ))}
        <span className="separador" />
        <button type="button" onClick={desfazer} disabled={historico.length === 0}>Desfazer</button>
        <button type="button" onClick={refazer} disabled={futuro.length === 0}>Refazer</button>
        <button type="button" onClick={redefinirVista} title="Ajustar à janela (0)">Enquadrar</button>
        <button type="button" onClick={limparPlano} disabled={Object.keys(plan.walls).length === 0}>Limpar</button>
      </div>

      <div className="controles-revisao">
        <label>
          Opacidade da foto
          <input type="range" min={0} max={1} step={0.05} value={opacidade} onChange={(e) => setOpacidade(Number(e.target.value))} />
          <span>{Math.round(opacidade * 100)}%</span>
        </label>
        <label className="caixa">
          <input type="checkbox" checked={mostrarGrade} onChange={(e) => setMostrarGrade(e.target.checked)} />
          Grade
        </label>
        <div className="zoom">
          <button type="button" onClick={() => ajustarZoom(1 / 1.2)} aria-label="Diminuir zoom">−</button>
          <span>{Math.round(view.zoom * 100)}%</span>
          <button type="button" onClick={() => ajustarZoom(1.2)} aria-label="Aumentar zoom">+</button>
        </div>
        <p className="dica-ferramenta">{dica}</p>
      </div>

      {relatorios.length > 0 && (
        <Relatorio report={relatorios[0]!} onFechar={fecharRelatorios} />
      )}

      <div className="palco-revisao">
        <canvas ref={fundo} className="fundo" style={{ width: tamanho.width, height: tamanho.height }} />
        <canvas
          ref={canvas}
          className="plano"
          style={{ width: tamanho.width, height: tamanho.height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        />
      </div>

      <BarraStatus />
    </section>
  );
};
