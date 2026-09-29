# @planta-viva/core

TypeScript puro, sem DOM e sem dependência de runtime. É o mesmo código que valida a geometria no editor, monta a cena 3D e importa um arquivo de projeto.

## Mapa dos arquivos

```
src/
  index.ts                  barrel público
  model/
    types.ts                o modelo de dados completo
    ids.ts                  gerador de identificadores
    factory.ts              construtores e calibração
    migrations.ts           importação confiável (valida e repara)
  geometry/
    vec2.ts                 vetores, distância, projeção, interseção
    polygon.ts              área, centroide, simplicidade, ponto interno
    scale.ts                status de escala, conversões, formatação
    wall.ts                 comprimento, direção, contorno, vão por metro
    openings.ts             posicionamento, ajuste e sobreposição de vãos
    snapping.ts             encaixe em canto e eixo, teste de acerto
    plan-ops.ts             topologia: dividir, fundir, excluir em cascata
    validate.ts             validação do documento com IssueCode
  image/
    homography.ts           perspectiva de 4 cantos e matriz inversa
  testing/
    fixtures.ts             PlanBuilder e plantas prontas para teste
```

## Convenções

**Imutabilidade.** Toda função de `plan-ops` devolve um novo `PlanDocument` e nunca muta a entrada. Isso é o que torna o histórico de desfazer e refazer trivialmente correto.

**O plano vive em pixels da imagem preparada.** Ou seja, o espaço depois de rotação, recorte, perspectiva e redimensionamento. É por isso que a saída da detecção é diretamente utilizável e que a sobreposição do overlay de revisão é 1:1 com o que o usuário vê.

**Espaço de origem.** Cada elemento tem `origin: 'auto' | 'manual' | 'demo'`. Um canto nunca é duplicado por acidente entre uma parede e outra: `addWall` recusa comprimento zero e parede duplicada.

**Nada de porcentagem de confiança.** `evidence[]` guarda fatos medidos, com a fonte e a unidade.

## APIs que você mais vai usar

```ts
// criar e modificar
addVertex(plan, { x, y })            -> { plan, vertex }
moveVertex(plan, vertexId, ponto)    -> { plan, vertex }
addWall(plan, aId, bId)              -> { ok, plan, wall } | { ok: false, reason }
splitWall(plan, wallId, t, scale)    -> { plan, report }
deleteWall(plan, wallId)             -> { plan, report }
deleteVertex(plan, vertexId, scale)  -> { plan, report }   // funda 2 paredes se possível
addOpening(plan, wallId, t, kind, scale) -> { plan, opening, report }
addRoom(plan, vertexIds, opts)       -> { plan, room }
renameRoom(plan, roomId, nome)       -> { plan, room }

// medidas
calibrate(scale, a, b, metros)       -> ScaleState
measureStatus(scale)                 -> 'sem-escala' | 'estimada' | 'informada' | 'reconhecida'
wallLengthM(plan, wall, scale)       -> number | null

// interação
snapPoint(plan, ponto, opcoes)       -> { point, kind, targetId, delta }
hitTestWalls(plan, ponto, tol)       -> { wallId, t, point } | null

// validação e importação
validatePlan(plan, scale)            -> { issues, errors, warnings, isValid, needsReviewCount }
migrateDocument(json)                -> { ok, document, warnings } | { ok: false, error }

// perspectiva
correctionHomography(quad, w, h)     -> Matrix3 | null
correctionHomographyInverse(quad, w, h) -> Matrix3 | null
```

## Testes

105 testes cobrindo vetores e polígonos, cantos compartilhados, divisão de parede, exclusão em cascata, vínculo de aberturas, encaixe, escala, validação, persistência e a homografia.

```bash
npm test --workspace @planta-viva/core
```

Ao escrever testes de planta, use o `PlanBuilder` em vez de encadear `addVertex`. As operações do core são imutáveis, então encadear chamadas sem guardar o `plan` descartaria os vértices anteriores silenciosamente.

```ts
const builder = new PlanBuilder();
const a = builder.vertex(0, 0);
const b = builder.vertex(400, 0);
builder.wall(a, b);
const plan = builder.snapshot();
```
