import { beforeEach, describe, expect, it } from 'vitest';
import { usePlanStore } from './planStore.js';

const s = () => usePlanStore.getState();
const paredes = () => Object.keys(s().plan.walls).length;
const cantos = () => Object.keys(s().plan.vertices).length;

/** Primeiro par de cantos da primeira parede, ou null se não houver parede. */
const parDaPrimeira = (): { a: string; b: string } | null => {
  const unica = Object.values(s().plan.walls)[0];
  return unica ? { a: unica.a, b: unica.b } : null;
};

const parede = (x1: number, y1: number, x2: number, y2: number): void => {
  s().confirmarOuIniciar({ x: x1, y: y1 });
  s().confirmarOuIniciar({ x: x2, y: y2 });
};

beforeEach(() => {
  s().limparPlano();
  usePlanStore.setState({
    historico: [],
    futuro: [],
    selecao: null,
    primeiroPonto: null,
    rascunho: null,
    ferramenta: 'parede',
    view: { zoom: 1, panX: 0, panY: 0 },
    relatorios: [],
  });
});

describe('criação de paredes', () => {
  it('cria uma parede com dois cliques', () => {
    parede(0, 0, 400, 0);
    expect(paredes()).toBe(1);
    expect(cantos()).toBe(2);
  });

  it('não cria nada com um clique só', () => {
    s().confirmarOuIniciar({ x: 10, y: 10 });
    expect(paredes()).toBe(0);
    expect(s().primeiroPonto).not.toBeNull();
  });

  it('não cria parede de comprimento zero', () => {
    parede(100, 100, 100, 100);
    expect(paredes()).toBe(0);
  });

  it('não cria parede duplicada no mesmo par de cantos', () => {
    parede(0, 0, 300, 0);
    parede(0, 0, 300, 0);
    expect(paredes()).toBe(1);
    expect(cantos()).toBe(2);
  });

  it('reaproveita o canto quando o segundo clique cai perto do primeiro', () => {
    parede(0, 0, 400, 0);
    parede(400, 0, 400, 300);
    // os dois cantos em (400,0) viraram um só
    expect(cantos()).toBe(3);
    expect(paredes()).toBe(2);
  });

  it('liga as paredes pelo mesmo id de vértice', () => {
    parede(0, 0, 400, 0);
    parede(400, 0, 400, 300);
    const lista = Object.values(s().plan.walls);
    const primeira = lista[0]!;
    const segunda = lista[1]!;
    const compartilhado = [primeira.a, primeira.b].find(
      (id) => id === segunda.a || id === segunda.b,
    );
    expect(compartilhado).toBeDefined();
  });

  it('cria um quadrado fechado com quatro cliques', () => {
    parede(0, 0, 400, 0);
    parede(400, 0, 400, 300);
    parede(400, 300, 0, 300);
    parede(0, 300, 0, 0);
    expect(paredes()).toBe(4);
    expect(cantos()).toBe(4);
  });
});

describe('mover canto compartilhado', () => {
  it('mexe em todas as paredes que usam o canto', () => {
    parede(0, 0, 400, 0);
    parede(400, 0, 400, 300);
    parede(400, 300, 0, 300);
    parede(0, 300, 0, 0);

    const canto = s().plan.vertices[Object.values(s().plan.walls)[0]!.b]!;
    s().arrastarVertice(canto.id, { x: 450, y: -20 });
    s().soltarVertice();

    expect(canto).toBeDefined();
    const vertice = s().plan.vertices[canto.id]!;
    expect(vertice.x).toBe(450);
    expect(vertice.y).toBe(-20);

    const total = Object.values(s().plan.walls).reduce((acc, w) => {
      const a = s().plan.vertices[w.a]!;
      const b = s().plan.vertices[w.b]!;
      return acc + Math.hypot(b.x - a.x, b.y - a.y);
    }, 0);
    expect(total).toBeGreaterThan(1200);
  });

  it('desfaz o arrasto devolvendo o canto à posição anterior', () => {
    parede(0, 0, 400, 0);
    const canto = s().plan.vertices[parDaPrimeira()!.a]!;
    const antesDoArrasto = s().plan;

    s().arrastarVertice(canto.id, { x: 50, y: 50 });
    s().soltarVertice();
    expect(s().plan.vertices[canto.id]!.x).toBe(50);

    s().desfazer();
    expect(s().plan).toBe(antesDoArrasto);
    expect(s().plan.vertices[canto.id]!.x).toBe(canto.x);
    expect(s().plan.vertices[canto.id]!.y).toBe(canto.y);
  });

  it('agrupa arrastos repetidos em um único passo de desfazer', () => {
    parede(0, 0, 400, 0);
    const canto = s().plan.vertices[parDaPrimeira()!.a]!;
    const historicoAntes = s().historico.length;

    s().arrastarVertice(canto.id, { x: 100, y: 100 });
    s().arrastarVertice(canto.id, { x: 200, y: 200 });
    s().arrastarVertice(canto.id, { x: 300, y: 300 });
    s().soltarVertice();

    expect(s().plan.vertices[canto.id]!.x).toBe(300);
    expect(s().historico.length).toBe(historicoAntes + 1);

    s().desfazer();
    expect(s().plan.vertices[canto.id]!.x).toBe(canto.x);
  });

  it('não registra histórico quando o arrasto não move nada', () => {
    parede(0, 0, 400, 0);
    const canto = s().plan.vertices[parDaPrimeira()!.a]!;
    const historicoAntes = s().historico.length;
    s().arrastarVertice(canto.id, { x: canto.x, y: canto.y });
    s().soltarVertice();
    expect(s().historico.length).toBe(historicoAntes);
  });
});

describe('apagar', () => {
  it('apaga a parede e fica com o canto órfão', () => {
    parede(0, 0, 400, 0);
    s().setTool('apagar');
    s().selecionarEm({ x: 200, y: 0 });
    expect(paredes()).toBe(0);
    expect(cantos()).toBe(2);
  });

  it('funde as duas paredes ao apagar um canto que as liga', () => {
    parede(0, 0, 400, 0);
    parede(400, 0, 400, 300);
    expect(paredes()).toBe(2);

    s().setTool('apagar');
    s().selecionarEm({ x: 400, y: 0 });

    expect(paredes()).toBe(1);
    expect(cantos()).toBe(2);
  });

  it('registra o relatório da cascata', () => {
    parede(0, 0, 400, 0);
    parede(400, 0, 400, 300);
    s().setTool('apagar');
    s().selecionarEm({ x: 400, y: 0 });
    expect(s().relatorios.length).toBeGreaterThan(0);
    expect(s().relatorios[0]!.notes.length).toBeGreaterThan(0);
  });

  it('remove todas as paredes ao apagar um canto com três ligações', () => {
    // junção em T: três paredes nascem no canto (400,0)
    parede(0, 0, 400, 0);
    parede(400, 0, 400, 300);
    parede(400, 0, 200, 300);
    expect(paredes()).toBe(3);

    s().setTool('apagar');
    s().selecionarEm({ x: 400, y: 0 });
    expect(paredes()).toBe(0);
  });

  it('não faz nada ao apagar em ponto vazio', () => {
    parede(0, 0, 400, 0);
    s().setTool('apagar');
    s().selecionarEm({ x: 900, y: 900 });
    expect(paredes()).toBe(1);
  });
});

describe('seleção', () => {
  it('seleciona a parede pelo ponto médio', () => {
    parede(0, 0, 400, 0);
    s().setTool('selecionar');
    s().selecionarEm({ x: 200, y: 0 });
    expect(s().selecao?.tipo).toBe('parede');
  });

  it('seleciona o canto com precedência sobre a parede', () => {
    parede(0, 0, 400, 0);
    s().setTool('selecionar');
    s().selecionarEm({ x: 0, y: 0 });
    expect(s().selecao?.tipo).toBe('vertice');
  });

  it('limpa a seleção ao clicar fora de tudo', () => {
    parede(0, 0, 400, 0);
    s().setTool('selecionar');
    s().selecionarEm({ x: 800, y: 800 });
    expect(s().selecao).toBeNull();
  });
});

describe('desfazer e refazer', () => {
  it('desfaz a criação de uma parede', () => {
    parede(0, 0, 400, 0);
    expect(paredes()).toBe(1);
    s().desfazer();
    expect(paredes()).toBe(0);
  });

  it('refaz o que foi desfeito', () => {
    parede(0, 0, 400, 0);
    s().desfazer();
    s().refazer();
    expect(paredes()).toBe(1);
  });

  it('desfaz várias paredes na ordem', () => {
    parede(0, 0, 400, 0);
    parede(400, 0, 400, 300);
    parede(400, 300, 0, 300);
    expect(paredes()).toBe(3);
    s().desfazer();
    expect(paredes()).toBe(2);
    s().desfazer();
    expect(paredes()).toBe(1);
    s().desfazer();
    expect(paredes()).toBe(0);
  });

  it('descarta o futuro ao criar depois de desfazer', () => {
    parede(0, 0, 400, 0);
    parede(400, 0, 400, 300);
    s().desfazer();
    expect(s().futuro.length).toBe(1);
    parede(0, 0, 0, 300);
    expect(s().futuro.length).toBe(0);
  });

  it('não faz nada ao desfazer sem histórico', () => {
    parede(0, 0, 400, 0);
    usePlanStore.setState({ historico: [] });
    s().desfazer();
    expect(paredes()).toBe(1);
  });

  it('desfaz a fusão de paredes', () => {
    parede(0, 0, 400, 0);
    parede(400, 0, 400, 300);
    s().setTool('apagar');
    s().selecionarEm({ x: 400, y: 0 });
    expect(paredes()).toBe(1);
    s().desfazer();
    expect(paredes()).toBe(2);
  });
});

describe('encaixe', () => {
  it('encaixa no canto existente ao criar uma parede', () => {
    parede(0, 0, 400, 0);
    parede(400, 0, 400, 300);
    expect(cantos()).toBe(3);

    s().confirmarOuIniciar({ x: 0, y: 0 });
    // o segundo ponto a 5 px de (400,300) deve pegar o canto existente
    s().confirmarOuIniciar({ x: 404, y: 304 });
    expect(cantos()).toBe(3);
  });

  it('não encaixa quando o ponto está longe', () => {
    parede(0, 0, 400, 0);
    parede(0, 0, 0, 300);
    expect(cantos()).toBe(3);
  });
});

describe('zoom', () => {
  it('limita o zoom mínimo e máximo', () => {
    s().ajustarZoom(0.0001);
    expect(s().view.zoom).toBeCloseTo(0.15, 5);
    s().ajustarZoom(100000);
    expect(s().view.zoom).toBeCloseTo(12, 5);
  });

  it('redefine a vista', () => {
    s().ajustarZoom(2);
    s().redefinirVista();
    expect(s().view).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});

describe('cancelar', () => {
  it('limpa o ponto inicial', () => {
    s().confirmarOuIniciar({ x: 10, y: 10 });
    expect(s().primeiroPonto).not.toBeNull();
    s().cancelar();
    expect(s().primeiroPonto).toBeNull();
    expect(s().selecao).toBeNull();
  });
});
