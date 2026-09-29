# Planta Viva

Transforma a foto de uma planta de casa em uma representação 2D editável e um modelo 3D simples.

## Estado atual

**Etapas 1, 2 e 3 concluídas.** O núcleo do domínio, a preparação de imagem e o editor de paredes estão implementados, com **219 testes automatizados** e typecheck limpo. A app sobe e roda no navegador.

| Etapa | Status |
|---|---|
| 1. Núcleo: modelo, geometria, validação, homografia | concluída |
| 2. Ingestão e preparação de imagem | concluída |
| 3. Editor 2D (paredes, cantos, undo/redo) | concluída |
| 4. Aberturas e ambientes | pendente |
| 5. Escala e medição | pendente |
| 6. Serviço de reconhecimento | pendente |
| 7. Camada de revisão sobre a foto | pendente |
| 8. Cena 3D | pendente |
| 9. Persistência e export/import | pendente |
| 10. Polimento e verificação em dispositivo | pendente |

## Rodar

```bash
npm install
npm run dev
```

Abre **http://localhost:5173**. O comando sobe o servidor de desenvolvimento com recarga automática; `Ctrl+C` encerra.

Para gerar a versão de produção:

```bash
npm run build --workspace @planta-viva/web   # gera apps/web/dist
npm run preview --workspace @planta-viva/web # serve o dist
```

## Testes e tipos

```bash
npm test             # 219 testes: 178 no core, 41 na web
npm run typecheck    # checa os tipos de todos os pacotes
```

Para assistir os testes do core enquanto edita:

```bash
npm run test:watch --workspace @planta-viva/core
```

## O que dá para fazer agora

Na **etapa 1**, envie uma imagem (JPG, PNG ou WebP, por arquivo ou pela câmera) e use a barra de ferramentas:

- **Girar** em 90°, com o quadrilátero de perspectiva acompanhando a rotação.
- **Perspectiva**: arraste os quatro cantos até as bordas do papel. A imagem é retificada por homografia.
- **Recorte**: arraste os cantos para remover margens. O recorte é guardado normalizado, então sobrevive a mudanças de resolução.
- **Desfazer / refazer** sobre todas as transformações.
- Um painel mede a imagem de verdade (brilho médio, contraste e densidade de linhas) e diz se ela tende a funcionar bem.

A ordem do pipeline é **rotacionar → corrigir perspectiva → recortar → reduzir**. Cada etapa fica registrada no histórico.

Na **etapa de revisão** (3ª aba), você desenha o traçado sobre a foto:

| Ferramenta | Atalho | O que faz |
|---|---|---|
| Parede | `W` | Dois cliques desenham uma parede. Encaixa em cantos e eixos existentes. |
| Selecionar | `V` | Seleciona parede ou canto. |
| Mover | `M` | Arrasta um canto. Todas as paredes ligadas acompanham. |
| Apagar | `X` | Apaga. Ao apagar um canto com duas paredes, elas viram uma. |

- **Roda do mouse** dá zoom, `Ctrl+Z` desfaz, `Esc` cancela, `0` reenquadra.
- A foto tem opacidade ajustável, para comparar o traçado com o original.
- A barra de status mostra contagem de paredes e cantos, o estado da escala e a seleção.

Nas **etapas de análise e 3D**, o estado é honesto: a análise consulta `/api/health` de verdade e informa que o servidor ainda não existe, e a 3D diz o que ainda vai ser construído. **Nada é simulado.**

## Estrutura

```
packages/core     TypeScript puro, sem DOM. Modelo de dados, geometria,
                  validação, encaixe (snapping), homografia, recorte,
                  transformação e avaliação de qualidade de imagem.
apps/web          React + Vite. Preparação de imagem e editor de planta.
                  (etapas 4-5, 7-8)
apps/server       Node + Express. Proxy de reconhecimento. (etapa 6)
docs              Decisões de arquitetura e de reconhecimento.
```

`packages/core` não importa nada do navegador nem de Node. Ele é TypeScript puro de propósito: é o mesmo código que valida a geometria no editor, que monta a cena 3D e que importa um arquivo de projeto.

A lógica que dá para testar sem DOM mora no core. Em `apps/web` fica o que precisa de canvas: decodificar, medir e desenhar. O estado do editor (`planStore`) não toca no DOM e tem 30 testes próprios.

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) - camadas, decisões de biblioteca, modelo de dados
- [`docs/RECONHECIMENTO.md`](docs/RECONHECIMENTO.md) - abordagem de reconhecimento, providers, limitações
- [`packages/core/README.md`](packages/core/README.md) - referência da API do core

## Avisos

**Armazenamento.** Na versão do MVP os projetos ficam salvos **apenas neste navegador**. Não há sincronização entre aparelhos nem entre computadores. Existe exportação e importação de um arquivo `.plantaviva.json` para levar o projeto a outro lugar.

**Dependências.** O `npm audit` reporta 5 vulnerabilidades (3 moderadas, 1 alta, 1 crítica) herdadas das dependências de build. Ainda não foram avaliadas.
