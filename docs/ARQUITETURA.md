# Arquitetura

## Camadas

```
┌─────────────────────────────────────────────────────────┐
│ apps/web  (React + Vite)                                │
│   etapas da jornada, ferramentas do editor, canvas 2D,   │
│   cena three.js, estado + undo/redo                     │
└───────────────────────────┬─────────────────────────────┘
                            │ importa
┌───────────────────────────▼─────────────────────────────┐
│ packages/core  (TypeScript puro, sem DOM)               │
│   modelo de dados · geometria · validação · encaixe     │
│   homografia · geração de cena 3D                       │
└───────────────────────────▲─────────────────────────────┘
                            │ consome via HTTP
┌───────────────────────────┴─────────────────────────────┐
│ apps/server  (Node + Express)                           │
│   /api/recognize · /api/health · /api/measure           │
│   guarda as credenciais;RecognitionProvider             │
└─────────────────────────────────────────────────────────┘
```

O documento do projeto é a fonte única da verdade. O editor 2D, a camada de revisão e a cena 3D são três renderizadores do **mesmo objeto**. Por isso "o 3D corresponde à planta revisada" é estrutural, e não um trabalho de sincronização.

## Decisões de biblioteca

### Editor 2D: Canvas 2D próprio (sem Konva, Fabric ou Paper.js)

Uma parede é um segmento com espessura cujos extremos são **vértices compartilhados**. Uma porta é um parâmetro `t` (de 0 a 1) ao longo de uma parede.

Modelos de biblioteca basados em "objetos com posição e rotação" não expressam isso. Mover um canto compartilhado exigiria notificar e reposicionar N objetos, e a porta sairia da parede junto com eles, porque nada impede que `t` seja tratado como coordenada absoluta em vez de fração do comprimento.

Um renderer próprio dá controle exato sobre teste de acerto, tolerância de encaixe, alvo de toque e cálculo de posição das aberturas. Custa cerca de 600 linhas. Para o MVP, é a opção com menos retrabalho futuro.

### 3D: three.js imperativo (sem react-three-fiber)

Paredes com vãos reais são `THREE.Shape` com `holes` mais `ExtrudeGeometry` — a forma mais direta e leve de obter um buraco de verdade na malha. O react-three-fiber adicionaria uma camada de reconciliação para uma cena que é função pura do documento e reconstrói em cerca de 20 ms. `OrbitControls` cobre girar, aproximar e deslocar.

### Estado e histórico: Zustand

Documentos de planta são pequenos: de dezenas a poucas centenas de elementos. O histórico de desfazer e refazer guarda instantâneos do campo `plan`. É mais simples e mais difícil de quebrar do que um log de comandos com inversas.

### Imagem: canvas nativo e homografia em TypeScript

Rotação, recorte e redimensionamento usam a API nativa do canvas. A correção de perspectiva por quatro cantos resolve uma homografia 3×3 por eliminação de Gauss com pivoteamento parcial (`packages/core/src/image/homography.ts`) e faz a deformação usando a matriz inversa. Isso evita OpenCV.js com WebAssembly, cerca de 8 MB, apenas para uma transformação geométrica.

### Persistência do MVP: IndexedDB

O `localStorage` estoura em cerca de 5 MB com uma única foto. A imagem vai como `Blob` no IndexedDB; o JSON do projeto guarda apenas metadados. A exportação gera um arquivo `.plantaviva.json` com a imagem embutida em base64.

## Modelo de dados

Definido em `packages/core/src/model/types.ts`. Resumo:

```ts
ProjectDocument {
  schemaVersion, id, name, createdAt, updatedAt,
  image:       ImageRef,          // metadados; o Blob fica no IndexedDB
  transform:   ImageTransform,     // rotação, recorte, perspectiva, resize
  scale:       ScaleState,         // pxPorMetro, calibração, altura, espessura
  plan:        PlanDocument,       // a planta editável
  recognition: RecognitionSummary | null
}

PlanDocument {
  vertices: Record<Id, Vertex>
  walls:    Record<Id, Wall>
  openings: Record<Id, Opening>
  rooms:    Record<Id, Room>
}
```

### Por que os vértices são compartilhados

`Wall` guarda `a` e `b` como **ids de vértice**, não coordenadas. Mover um canto move, por construção, todas as paredes que o usam. Não existe estado "sincronizado" que possa ficar dessincronizado. É o que resolve "mover cantos compartilhados sem desconectar paredes" sem código de manutenção.

### Por que as aberturas são paramétricas

`Opening` guarda `wallId` e `t` (de 0 a 1). A posição em pixels é derivada: `a + (b − a) · t`. Redimensionar, dividir ou mover a parede reposiciona a porta e a janela automaticamente, sem recomputar nada.

`splitWall` redistribui assim: uma abertura com `t <= 0.5` vai para o primeiro trecho com `t' = 2t`; caso contrário vai para o segundo com `t' = (t − 0.5) · 2`. A abertura que deixa de caber é **reajustada e marcada para revisão**, nunca deixada inválida em silêncio.

### Origem e revisão

Todo elemento tem `origin: 'auto' | 'manual' | 'demo'` e `review: 'ok' | 'needs-review'`. Isso permite:

- filtrar "só o que o reconhecimento achou" na tela de revisão;
- marcar visualmente tudo o que exige conferência humana;
- rotular honestamente dados de demonstração.

Não existe campo de "confiança". Os algoritmos gravam **`evidence[]`**, com fatos medidos, como `"comprimento 412 px"`, `"espessura estimada 9 px"` ou `"2 junções perpendiculares"`. Isso é auditável; uma porcentagem inventada não seria.

### Unidades

Todas as dimensões físicas (espessura, largura de vão, altura) são gravadas em **metros**, independentes de pixels. A escala (`pixelsPerMeter`) só entra na hora de converter.

Consequência prática: `Wall` guarda `thicknessM`, e o comprimento em metros é **derivado** (`px / pixelsPerMeter`). Isso mantém 2D, 3D e medidas consistentes por construção, e permite recalibrar sem mutar a geometria.

Antes da calibração, `measureStatus()` distingue quatro situações, e a interface mostra uma diferente para cada uma:

| status | significado |
|---|---|
| `sem-escala` | nenhuma referência; comprimentos em metros são `null` |
| `estimada` | escala provisória para pré-visualização, rotulada como estimativa |
| `informada` | o usuário informou a medida de referência |
| `reconhecida` | o número veio do OCR e o usuário precisa confirmar |

## Validação

`validatePlan(plan, scale)` devolve `{ issues, errors, warnings, isValid, needsReviewCount }`, com um conjunto fechado de `IssueCode`. Cobre: parede de comprimento zero, parede duplicada, canto inexistente, vão fora da parede, vão sobreposto, vão com largura inválida, ambiente com menos de 3 cantos, polígono que se cruza, área zero, canto solto, falta de escala e ambiente sem classificação.

A mesma função roda no editor (para mostrar o erro perto da ação), na importação (para reparar arquivo) e antes de gerar o 3D.

`migrateDocument()` é a fronteira de confiança na importação: valida referência por referência e **descarta** o que não fecha (abertura órfã, parede sem canto, ambiente com menos de 3 cantos), devolvendo um aviso por item em vez de deixar o documento quebrado.

## Cascatas de exclusão

Toda operação destrutiva devolve um `CascadeReport` com o que foi removido, recriado, religado e marcado para revisão, mais `notes` em português para exibir ao usuário.

| operação | efeito colateral |
|---|---|
| excluir parede | remove as aberturas vinculadas; marca os ambientes que a usavam |
| dividir parede | recria 2 trechos, redistribui as aberturas por `t` e reajusta as que não couberem |
| excluir canto com 2 paredes | funde as duas em uma e religa as aberturas recalculando `t` |
| excluir canto com 3 ou mais paredes | remove todas e explica por quê (não há como fundir em um trecho) |
| excluir canto de ambiente | remove o ambiente se restarem menos de 3 cantos; senão marca para revisão |

`pruneOrphanVertices` limpa cantos soltos sem tocar em parede ou ambiente.

## Backend

Existe por dois motivos, e só por eles:

1. **Não expor a chave da API.** A chave vive em `apps/server/.env` e nunca chega ao bundle do navegador.
2. **Rodar o pipeline de visão computacional em Node**, com `sharp` para entrada e saída de imagem.

Endpoints planejados:

| rota | função |
|---|---|
| `GET /api/health` | informa **quais** provedores estão configurados, sem chamar nenhum |
| `POST /api/recognize` | executa o pipeline; devolve resultado parcial ou erro tipado |
| `POST /api/measure/confirm` | confirma uma medida reconhecida pelo usuário |

`GET /api/health` existe para a interface conseguir distinguir "análise indisponível" de "análise falhou", que são situações diferentes para o usuário.

## Armazenamento

Interface `ProjectRepository` no cliente, com implementação IndexedDB. O MVP é **local**: sem servidor, sem conta e sem sincronização. A limitação é explícita na interface — o mesmo projeto não aparece em outro aparelho.
