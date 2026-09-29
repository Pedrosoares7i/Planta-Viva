# Reconhecimento de imagem

## O problema central

Um modelo de visão não devolve coordenadas geometricamente corretas. Pedir polygons a um modelo multimodal e convertê-los direto em paredes gera paredes tortas, sobrepostas e sem correspondência com a foto. Não é um defeito de prompt: é uma propriedade do que o modelo é, um estimador de semântica, não um detector de geometria.

Então a divisão de trabalho é explícita:

| etapa | responsável | entrega |
|---|---|---|
| A | visão computacional clássica | **geometria**: vértices, paredes, espessuras, vãos, ciclos |
| B | modelo de visão | **semântica**: nome dos ambientes, classificação, medidas escritas |

E uma regra que não se negocia: **nenhuma coordenada vinda do modelo de visão entra na geometria final** sem corresponder a uma linha detectada no Estágio A. Se o modelo e a detecção classical discordarem além de um limiar, o elemento é descartado ou entra marcado `needs-review`. Nunca é aceito em silêncio.

## Estágio A — geometria (determinístico, no backend)

Roda em Node com `sharp` para entrada e saída, e TypeScript puro para a matemática.

1. **Normalização de iluminação.** Divisão de fundo porclosing morfológico de núcleo grande. É o passo que resolve sombra de foto em papel.
2. **Binarização adaptativa de Sauvola.** Limiar local por janela deslizante, com média e variância. Resolve linha de lápis e luz desigual, que um limiar global não resolve.
3. **Deskew.** Ángulo dominante das linhas de texto por transformada de Radon simplificada, aplicado como rotação.
4. **Extração de linhas.** Sobel + supressão de não-máximos, depois análise de comprimento de traço (*run-length*) em múltiplos ângulos. Paredes são traços longos, escuros e retos.
5. **Fusão.** Hypotheses de linha por Hough, depois fusão de segmentos colineares separados por pequenas lacunas — é o que fecha as quinas de parede que a binarização quebrou.
6. **Espessura.** Ridge da transformada de distância ao longo do traço, convertida em metros pela calibração.
7. **Junções perpendiculares.** Detecta quinas em T e em L e **prolonga e ajusta os extremos** para se encontrarem. É este passo que converte "quase certo" em "consistente": a maior parte do erro de coordenada do mundo real vem de extremos que não se tocam, não de ruído no meio do segmento.
8. **Candidatos a ambiente.** Ciclos no grafo de paredes, com ajuste retangular e teste de cobertura das bordas. Em L, U e em T a extração degrada de forma graciosa: o polígono inválido simply não é inserido e o motivo é reportado.
9. **Portas.** Lacuna na parede (a parede some ali) mais arco parcial por Hough de círculos. O sentido de abertura vem da orientação do arco.
10. **Janelas.** Trecho da parede mais fino que a mediana das espessuras da própria planta — o desenho de janela é um traço fino dentro da parede.
11. **Texto.** Detecção de regiões de texto, OCR, e leitura de padrões como `3,45`, `3.45m`, `12'`.

### Evidência, não confiança

Cada elemento detections recebe `evidence[]` com fatos medidos: comprimento, espessura estimada, número de junções. Não existe porcentagem de confiança no modelo de dados, e a interface não mostra barra de progresso nem porcentagem inventada.

## Estágio B — semântica (modelo de visão)

Envia a imagem original e também a versão deskewada e binarizada, e pede saída estruturada:

- nome de cada ambiente e seu polígono aproximado, em coordenadas normalizadas;
- classificação (`cozinha`, `banheiro`, `quarto`, …);
- medidas escritas que o OCR leu;
- lista dos segmentos que o modelo **não** reconhece como parede.

Usos do resultado:

1. **Nomear e classificar ambientes**, quando o nome estiver fundamentado em texto lido da imagem.
2. **Rejeitar falsos positivos** do Estágio A: um segmento que o modelo e a detecção não reconhecem como parede é removido ou marcado.
3. **Nunca** fornecer coordenada final.

Quando não há evidência para chamar um espaço de "quarto" ou "cozinha", o nome é neutro: `Ambiente 1`, `Ambiente 2`. Com `nameOrigin: 'fallback'`, e a interface mostra um aviso de "sem classificação".

## Interface de provedor

```ts
interface RecognitionProvider {
  id: string;
  model: string;
  requiresCredentials: boolean;
  isConfigured(): boolean;
  analyze(input: PreparedImage, hints: AnalysisHints): Promise<RecognitionResult>;
}
```

| provedor | papel | custo |
|---|---|---|
| `gemini` | primário | tier gratuito do Google足以 para o MVP |
| `openai` | alternativa | cerca de US$ 0.01 a 0.05 por imagem em tier rápido |
| `demo` | exemplo, **marcado** | grátis |

### Provedor de demonstração

Existe para desenvolvimento e para a tela de estado vazio, e é explícito em três lugares: o campo `demo: true` em `RecognitionSummary`, um selo "EXEMPLO" na interface, e uma nota no resultado dizendo que os dados são fictícios. Ele nunca é usado silenciosamente como fallback. Se nenhuma credencial estiver configurada, a resposta é **erro**, não exemplo.

### Sem credenciais

`GET /api/health` devolve quais provedores estão configurados. Se nenhum estiver, `POST /api/recognize` responde `503` com:

```json
{
  "error": "recognition_unavailable",
  "message": "Analise automatica indisponivel: nenhuma credencial configurada no servidor.",
  "providers": [],
  "manualEditingAvailable": true
}
```

A interface mostra "análise indisponível" e mantém o caminho de edição manual disponível, com a imagem preservada. Não há simulação de análise bem-sucedida.

## Limitações declaradas

**Geometria**

- Paredes retas e ortogonais ( Manhattan). Paredes curvas são ignoradas.
- Cômodo não retangular degrada a extração de polígono; em L, U e em T o resultado é omitido e reportado, não inventado.
- Sombra muito forte, papel muito inclinado ou lápis muito claro geram falso negativo. O app **diz** isso e marca o que não encontrou.
- Reserva de mobiliário, cortes e elevações estão fora do escopo.
- Um pavimento por projeto.

**Escala**

- Uma fotografia não informa as dimensões reais. Isso é física, não defeito. A escala exige calibração pelo usuário (§6 do enunciado). O aplicativo rotula as medidas como `sem-escala` ou `estimada` até essa calibração existir.
- Perspectiva e distorção da foto afetam as medidas. A correção por quatro cantos reduz, mas não elimina, esse erro.

**Semântica**

- O modelo de visão pode alucinar nome de ambiente. Por isso o nome só é aceito se o OCR fundamentar o texto na imagem; caso contrário fica `Ambiente N`.

## Como verificar que a análise depende da entrada

Testes reais, com behaviour verificável:

1. Submeter a mesma imagem duas vezes: resultado estruturalmente equivalente.
2. Submeter **duas imagens diferentes**: contagens e coordenadas **diferem**. Se forem iguais, o caminho está devolvendo algo fixo, e o teste falha.
3. Imagem de planta digital limpa: mais paredes, menos marcação de revisão.
4. Foto de planta no papel com sombra: menos paredes, mais marcação de revisão, e a lista do que não foi encontrado.
5. Entrada que o pipeline não entende: resultado parcial, com a imagem preservada e edição manual disponível.
6. Sem credenciais: `503`, e nenhuma parede criada.

Itens 2 a 6 dependem do serviço de reconhecimento estar configurado. Sem credencial, apenas o item 6 é executável, e ele é o mais importante: garante que o sistema não inventa resultado.
