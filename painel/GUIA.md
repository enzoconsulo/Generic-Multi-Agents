# GUIA — painel-fabrica

Como o painel é organizado e como se faz cada coisa nele. Escrito à mão, e é o primeiro
arquivo a ler antes de tocar em qualquer código daqui.

**Três documentos, três perguntas — não os confunda:**

| arquivo | responde | quem escreve |
|---|---|---|
| **este GUIA** | *onde mexo, como faço, o que já existe* | à mão |
| `_gestao/MAPA.md` | *o que existe e onde* (árvore + assinatura de cada símbolo) | gerado por `_sistema/ferramentas/mapa.mjs` |
| `CLAUDE.md` | *o que já deu errado aqui* (armadilhas com o incidente que as criou) | à mão |

O padrão que isto instancia vale para todo projeto da fábrica:
[`_sistema/PADRAO_DE_PROJETO.md`](../_sistema/PADRAO_DE_PROJETO.md).

---

## 1. Em uma tela

- **O que é:** cockpit web local da fábrica. Vê o estado de tudo e dispara os fluxos reais
  por botão, sem abrir pasta nem terminal.
- **Stack:** Node 22+, TypeScript estrito, ESM. Monorepo npm workspaces: `servidor/`
  (Express 5 + SSE, escutando só em 127.0.0.1:8765) e `web/` (React 18 + Vite, CSS puro,
  tema dark). Sem banco — o estado é lido dos arquivos da fábrica na hora da consulta.
- **Rodar em desenvolvimento:** `npm run dev` → abrir http://localhost:5173
- **Rodar como o usuário usa:** `npm run build && npm start` → http://127.0.0.1:8765
- **Testar:** `npm test` (tsc estrito + Vitest nos dois workspaces). **Nunca usa rede nem
  login.** É este comando que precisa passar antes de qualquer commit do painel.
- **Ver a tela de verdade:** `node ../_sistema/ferramentas/captura.mjs <url> <arquivo.png>
  --espera=3000` — sobe o painel antes e derrube depois. Tarefa de UI dada por pronta sem
  ninguém olhar o PNG é aposta, e já falhou duas vezes.

---

## 2. Onde fica o quê

### Servidor (`servidor/src/`)

| módulo | responsabilidade | quando mexer aqui |
|---|---|---|
| `config.ts` | resolve a raiz da fábrica (`FABRICA_RAIZ`) e o `dados/` | quase nunca |
| `agregador-rotas.ts` | carrega automaticamente todo arquivo de `rotas/` que exporte `{ prefixo, router }` | nunca — é o que permite rota nova sem editar arquivo compartilhado |
| `rotas/` | um arquivo por recurso HTTP; só traduz HTTP ↔ operação | endpoint novo |
| `fabrica/` | **leitor** dos arquivos da fábrica (tarefas, plano, equipe, ideias, logs, git) | ler algo novo do disco |
| `fabrica/escrita-tarefas.ts` | as ÚNICAS escritas de status que o painel faz (promoção e bloqueio) | quase nunca — e leia o cabeçalho antes |
| `jobs/` | fila: locks por escopo, persistência em `dados/`, cancelamento, inputs pendentes | mexer em execução, estado de job, retomada |
| `jobs/claude/` | runner do Agent SDK (`runner-claude.ts`) e tabela de preços (`precos.ts`) | contabilidade, tokens, desfecho de fluxo |
| `jobs/robustez/` | watchdog de inatividade e guardrails por ação (tetos) | teto de turnos/custo/silêncio |
| `jobs/resumo/` | resumidor barato dos trechos do log | mexer no resumo por agente |
| `pipeline/` | **o `/trabalhar` em código** — ver o detalhe abaixo | tudo que é decisão do laço |
| `contexto/montador.ts` | decide QUE contexto cada papel recebe (construtor leva as `areas`; revisor leva o diff) | custo de contexto por despacho |
| `ci/` | motor de CI local: detecta o ecossistema por arquivo-marcador e roda os estágios | suporte a stack nova, timeout, kill de processo |
| `acoes/` | traduz ação da fábrica → job; prompts em `prompts/` | ação nova, texto de prompt |
| `eventos/hub.ts` | canal SSE único (com replay por `Last-Event-ID`) | evento novo para a tela |

### O pipeline em código (`servidor/src/pipeline/`)

É o subsistema mais denso do painel. A fronteira que o organiza: **cabe num teste? então é
código; é julgamento? continua no modelo.**

| arquivo | papel |
|---|---|
| `motor.ts` | o LAÇO. Ordem de uma volta: relê tarefas do disco → promove → passada mecânica → consulta orçamento → despacha |
| `maquina.ts` | decisões PURAS: promover, ordenar, resolver o agente, escalar modelo |
| `despachante.ts` | transforma um passo numa `query()` do SDK (prompt, modelo, ferramentas, contexto) |
| `criterios.ts` | roda os `verificar:` das tarefas e a suíte do projeto ANTES de gastar o verificador |
| `diagnostico.ts` | classifica POR QUE a tarefa voltou e deriva modelo, teto de voltas e escopo |
| `orcamento.ts` | teto de custo com parada limpa — nunca corta agente em voo |
| `marco.ts` | detecta fase completa e grava a linha `Marco:` |
| `trabalho-parcial.ts` | pergunta à árvore git se houve trabalho não registrado |
| `coleta-processos.ts` / `guarda-processos.ts` | recolhe órfãos; impede o agente de matar o painel |
| `runner-pipeline.ts` | o Runner: liga tudo acima à fila de jobs e monta o relatório |

### Web (`web/src/`)

| módulo | responsabilidade | quando mexer aqui |
|---|---|---|
| `lib/` | **toda a lógica** — pura, testável, sem DOM | qualquer decisão ou formatação |
| `lib/tipos.ts` | espelho dos contratos da API | mudou o servidor |
| `lib/useJobsAoVivo.ts` | canal SSE ÚNICO, em estado de módulo | nunca abra uma segunda conexão |
| `componentes/` | peças reutilizáveis (`Markdown`, `Estados`, `GrafoGit`…) | peça usada em 2+ telas |
| `paginas/<nome>/` | uma pasta por tela | mexer numa tela |
| `estilos.css` | CSS puro com variáveis, tema dark | aparência |

**A regra que governa a web:** decisão vai para `lib/`, componente só monta e desenha. Os
testes da web são de lógica pura (sem DOM), então **lógica dentro de componente é lógica não
verificada**. Se você está prestes a escrever um `if` com regra de negócio dentro do JSX,
ele pertence a `lib/`.

---

## 3. Receitas

### Acrescentar um endpoint
1. **arquivo novo** em `servidor/src/rotas/` exportando `{ prefixo, router }` — o agregador
   acha sozinho, não edite nada compartilhado.
2. A operação de verdade vai em `fabrica/`, `jobs/` ou `acoes/`; a rota só traduz HTTP.
3. Teste em `servidor/testes/rotas/`. **Import DINÂMICO** se o teste sobrescreve
   `FABRICA_RAIZ` (`config.ts` lê a env na carga do módulo).
4. Espelhe o contrato em `web/src/lib/tipos.ts`.

### Acrescentar uma tela
1. Pasta nova em `web/src/paginas/<nome>/`.
2. Rota em `web/src/App.tsx`.
3. Lógica em `web/src/lib/<assunto>.ts` + teste em `web/testes/`.
4. Estilos no fim de `estilos.css`, com um comentário dizendo por que a decisão visual existe.
5. **Capture a tela e olhe** antes de dar por pronto.

### Acrescentar uma ação da fábrica (botão que dispara fluxo)
1. `servidor/src/fabrica/catalogo-acoes.ts` (ação global) ou
   `servidor/src/acoes/acoes-projeto.ts` (ação por projeto) — as duas são data-driven.
2. Prompt em `servidor/src/acoes/prompts/…`.
3. Guardrails (teto de turnos, custo, watchdog) em `jobs/robustez/guardrails.ts`.
4. **Passe pelo preâmbulo** (`acoes/preambulo.ts`): job novo sem ele volta a poder abandonar
   agente em segundo plano.

### Mudar o que o agente recebe num despacho
1. `contexto/montador.ts` — é o único lugar que decide contexto por papel.
2. `despachante.ts` se for opção do SDK. **Confira o nome da opção em
   `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`** e escreva o teste sobre o objeto
   `options` que chega ao SDK: nome errado é ignorado em silêncio.
3. Conferir sem gastar: `npx tsx integracao/simular-pipeline.ts <projeto>`.

### Mostrar algo novo do job na tela
1. O servidor grava em `job.resultado` (runner) ou emite um evento (`ctx.emitir`).
2. `web/src/lib/tipos.ts` ganha o campo.
3. A decisão sobre ele vai para `lib/` (com teste); a página só desenha.
4. **Pergunte o que sobra do dado quando o fluxo é cortado no meio** — é o caso dos jobs mais
   caros, e contabilidade presa ao `result` some justamente neles.

---

## 4. Já existe — não reinvente

| preciso de… | use | onde |
|---|---|---|
| ler frontmatter | `separarFrontmatter`, `campoTexto`, `campoLista` | `servidor/src/fabrica/frontmatter.ts` |
| commitar de um projeto | `commitarCaminhos` (escopado) / `commitar` (`add -A`, só no botão da aba Git) | `servidor/src/fabrica/git.ts` |
| saber se sobrou coisa fora de um escopo | `alteracoesForaDe`, `lerHead` | `servidor/src/fabrica/git.ts` |
| mudar status de tarefa | `gravarStatusTarefa`, `anexarNaSecao` | `servidor/src/fabrica/escrita-tarefas.ts` |
| rodar comando externo com teto de tempo | `executarComando` | `servidor/src/ci/processo.ts` |
| matar processo (é ÁRVORE, não processo) | `encerrarArvore` | `servidor/src/ci/processo.ts` |
| descobrir a stack de um projeto | `detectarEcossistema` | `servidor/src/ci/ecossistemas.ts` |
| estimar custo por tokens | `estimarCusto` | `servidor/src/jobs/claude/precos.ts` |
| reconhecer cota estourada | `ehLimiteDeUso`, `horaDeReabertura` | `servidor/src/jobs/claude/runner-claude.ts` |
| varrer segredos antes de publicar | `varrerRepo` | `servidor/src/fabrica/seguranca.ts` |
| chamar a API do painel na web | `api()`, `ErroApi` | `web/src/lib/api.ts` |
| dados de um GET com carregando/erro | `useDados` | `web/src/lib/useDados.ts` |
| jobs/log/pendências ao vivo | `useJobsAoVivo` (conexão ÚNICA) | `web/src/lib/useJobsAoVivo.ts` |
| desfecho de um job (o selo e o texto) | `desfechoDoJob` | `web/src/lib/desfecho.ts` |
| condensar log em tópicos legíveis | `montarTopicos` | `web/src/lib/topicos.ts` |
| saber quem trabalha / em que etapa | `agenteAtivo`, `etapaDoAgente`, `segmentarPorAgente` | `web/src/lib/atividade.ts` |
| custo de um job na tela | `custoDoJob`, `formatarCusto`, `ratearPorAgente` | `web/src/lib/custo.ts` |
| rótulo/duração/número/dia | `rotuloStatus`, `duracaoLegivel`, `milhares`, `diaLegivel` | `web/src/lib/formato.ts` |
| renderizar markdown | `<Markdown>` / `parseMarkdown` | `web/src/componentes/Markdown.tsx` |
| estado de carregando/erro/vazio | `<Carregando>`, `<MensagemErro>`, `<Vazio>` | `web/src/componentes/Estados.tsx` |

**Ao criar um helper que outra tarefa vai querer, acrescente-o aqui na mesma tarefa.** Uma
linha agora contra a segunda cópia depois — e é a segunda cópia, não o tempo perdido, que faz
o estrago: a partir dela as duas divergem sem ninguém ver.

---

## Convenções que não estão no código

- **Tudo em PT-BR**: nomes de arquivo, símbolos, textos de UI e mensagens de erro.
- **Arquivo novo em vez de arquivo compartilhado.** `areas` é o mutex do paralelismo da
  fábrica; editar um arquivo que todos tocam produz conflito onde não havia.
- **Cabeçalho de arquivo diz POR QUE.** O "o que" o código mostra e o MAPA extrai; o que se
  perde é a razão — e é ela que impede o próximo de "consertar" uma decisão deliberada.
- **O painel escreve POUCO nos arquivos da fábrica.** As exceções são deliberadas e estão
  listadas no `CLAUDE.md`; escrita nova exige a mesma justificativa.
- **O painel é mantido à mão** — fica fora do pipeline executor/testador/revisor, que só
  opera em `projetos/`. Mudou o painel: rode `npm test` e commite na raiz (`painel: ...`).

## Antes de mexer, leia também

- `CLAUDE.md` (deste diretório) — **as armadilhas**. Cada entrada custou uma sessão para
  alguém descobrir; ler custa dois minutos.
- `_gestao/DECISOES.md` — o que já foi decidido e por quê.
- `../_sistema/DECISOES_FECHADAS.md` — perguntas já respondidas que não devem ser reabertas.
