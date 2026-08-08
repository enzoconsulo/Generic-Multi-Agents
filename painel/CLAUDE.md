# painel-fabrica

Interface web local ("cockpit") para orquestrar a fábrica de software multi-agente:
painel por projeto, ações da fábrica via botões, análise de código persistida e CI/CD
visível — o usuário nunca manuseia pastas manualmente.

Este painel é a **ferramenta de sistema** (cockpit) da fábrica Gerador_de_projetos e vive
na raiz dela (`<fabrica>/painel/`), versionado no repositório do sistema — não é um projeto
comum sob `projetos/`. Gestão (especificação, plano, tarefas, decisões) em `_gestao/`; o
protocolo de tarefas está em `../_sistema/PROTOCOLO_TAREFAS.md`. Trabalhe em português (BR).

## Stack
- Node.js 22+ / TypeScript estrito; monorepo npm workspaces: `servidor/` e `web/`.
- Backend: Express 5, escutando SOMENTE em 127.0.0.1:8765; SSE nativo (sem lib);
  sem banco — estado lido dos arquivos da fábrica; dados operacionais em `dados/`
  (descartável, fora do git). Frontmatter com `gray-matter`.
- Integração Claude: `@anthropic-ai/claude-agent-sdk` com versão PINADA (sem `^`) —
  ver `_gestao/pesquisas/2026-07-21-claude-code-headless.md` e DECISOES.md.
- Frontend: React 18 + Vite + TS, react-router; CSS puro com variáveis, dark mode
  padrão, tudo em PT-BR.
- Testes: Vitest (+ supertest). `npm test` NUNCA usa rede nem login (SDK falsificado,
  relógio injetado no watchdog). `teste:integracao` roda o teste PAGO do `canUseTool`
  contra o SDK real (`servidor/integracao/`, fora de `testes/` para não cair no `npm test`).

## Como rodar
- Instalar dependências (uma vez): `npm install` na raiz do projeto.
- **Desenvolvimento** (recarrega ao salvar): `npm run dev` — sobe o servidor (tsx watch,
  127.0.0.1:8765) e a web (Vite, http://localhost:5173 com proxy de `/api`). Abrir a 5173.
- **Produção local** (build + servir tudo numa porta só): `npm run build` e depois
  `npm start` → abrir **http://127.0.0.1:8765**.

## Como testar
- Suíte completa: `npm test` (tsc estrito + Vitest no servidor e na web). Sem rede/login.
- `npm run teste:integracao`: **gasta a assinatura de verdade** (~US$0,01 no Haiku) e
  exige Claude Code logado. Valida o `canUseTool` ponta a ponta contra o SDK real:
  pendência criada → job pausa → resposta destrava → fluxo conclui. Validado em
  2026-07-27.
- `npx tsx integracao/medir-esforco.ts`: **gasta a assinatura** (~US$ 2). A/B do `effort`
  nas ações mecânicas, rodando cada uma duas vezes (padrão vs `medium`) e comparando
  custo, TOKENS e arquivos tocados. Restaura o repositório do projeto entre as pernas
  (`reset --hard` no HEAD do início) — sem isso a segunda rodada encontraria o trabalho da
  primeira feito e mediria "não havia nada a fazer". Recusa-se a rodar com árvore suja.

## Arquitetura em 1 minuto
- `servidor/` — Express 5 (TS estrito, ESM). `src/config.ts` resolve a raiz da fábrica
  (`../`, sobrescrevível por `FABRICA_RAIZ`) e o `dados/` (`DADOS_DIR`);
  `src/agregador-rotas.ts` carrega cada arquivo de `src/rotas/` que exporta
  `{ prefixo, router }`. `src/fabrica/` é o LEITOR somente-leitura (frontmatter de tarefas,
  PLANO, ideias, logs) — fonte de dados de tudo. `src/jobs/` é o motor de fila (locks,
  persistência em `dados/`, cancelamento, inputs pendentes) com `claude/` (runner do Agent
  SDK) e `robustez/` (watchdog de inatividade + guardrails por ação). `src/ci/` é o motor
  de CI local: `ecossistemas.ts` detecta a stack por arquivo-marcador (Node, Python, Go,
  Rust, .NET, Maven, Gradle) e deduz os comandos; `config.ts` grava em `_gestao/ci.json`
  do projeto; `processo.ts` roda com timeout e kill de árvore.
  `src/acoes/` traduz ação da fábrica → job e guarda o prompt da análise.
- `web/` — React 18 + Vite (TS estrito). `src/lib/` (helper de fetch, tipos espelhando a
  API, `useDados`, `useJobsAoVivo` = o canal SSE, formatação); `src/componentes/`;
  `src/paginas/inicio` (panorama + ações + projetos), `src/paginas/projeto` (ações, CI/CD,
  kanban, plano, análise, decisões, progresso), `src/paginas/jobs` (console ao vivo) e
  `src/paginas/git` (repositórios: endereço na nuvem, commit e push). Tema dark em
  `src/estilos.css`.
- **Git é uma bifurcação, não um repositório só** (T-030/T-031): a raiz versiona sistema
  + painel; cada `projetos/<nome>` é repositório INDEPENDENTE com remoto próprio (a raiz
  ignora `projetos/`). `fabrica/git.ts` cuida do repositório local (histórico, commit),
  `fabrica/publicacao.ts` de tudo que atravessa a rede (remoto, push, `git init`,
  `.gitignore`) e `fabrica/seguranca.ts` da conferência pré-publicação. O ciclo
  (commitar → conferir → publicar) aparece na aba Git E na página de cada projeto.
- `fabrica/ajustes.ts` + aba Ajustes (T-032): estado das contas Claude/GitHub. Só
  DIAGNOSTICA (existência de credencial, meio de autenticação) — não existe "conectar
  conta" no painel, porque os dois logins são fluxos interativos fora dele.
- **Ações POR PROJETO** (T-033/T-034/T-035): `acoes/acoes-projeto.ts` é o catálogo
  data-driven (ação = uma entrada + um prompt em `prompts/projeto/<id>.md`), com rota
  própria e lock `projeto:<nome>`. Três grupos, que a UI usa para montar as seções:
  `especialista` (despacha um agente da fábrica), `cuidado` (zeladoria do projeto:
  integridade, marco de fase e progresso) e `equipe`. A invariante vale numa direção só —
  ação de `especialista` NUNCA tem agente `orquestrador` (o título da seção mentiria); a
  inversa não, porque `marco` é zeladoria executada pelo `testador`. **O `cwd` é a RAIZ da fábrica, não a pasta do projeto** —
  ao contrário da análise —, porque os `.claude/agents/` só carregam de lá; em troca, o
  confinamento é explícito no texto do prompt.
- `lib/gestao.ts` + `SecaoGestao` (T-036): cruza as `dependencias` das tarefas (que sempre
  vieram na API e não apareciam) para mostrar o que trava o quê, o que já dá para promover
  e o histórico + custo real DESTE projeto. Dependência **inexistente** é separada de
  dependência **não concluída**: a primeira é erro de frontmatter que nunca fecha sozinho
  e bloqueia a promoção; a segunda é o plano funcionando.
- Estado é sempre derivado dos arquivos da fábrica na hora da consulta; `dados/` guarda só
  histórico operacional (descartável, fora do git).

## Convenções
- Rotas do servidor: cada arquivo em `servidor/src/rotas/` exporta `{ prefixo, router }`
  e é carregado dinamicamente pelo agregador — tarefa nova adiciona ARQUIVO novo, nunca
  edita arquivo compartilhado (preserva paralelismo de `areas`).
- Páginas da SPA: cada página vive em `web/src/paginas/<nome>/`; o esqueleto de rotas e
  placeholders é criado na fundação para as tarefas de UI só tocarem a própria pasta.
- Raiz da fábrica resolvida a partir da localização do painel (`../../`), sobrescrevível
  por env `FABRICA_RAIZ` (testes usam fábricas falsas em pastas temporárias).
- O painel escreve POUCO nos arquivos da fábrica: quem escreve são os fluxos Claude
  disparados. Exceções deliberadas: `_gestao/ANALISE.md` (job de análise), `_gestao/ci.json`
  (editor de CI), `_gestao/equipe.json` (editor de equipe, T-035), a importação de projetos
  e — desde 02/08 — o **motor do pipeline**, que grava `pronta` (promoção) e `bloqueada`
  (esgotamento) via `fabrica/escrita-tarefas.ts`. São os dois pontos que a máquina de
  estados decide; todo o resto do arquivo continua sendo dos agentes.
  A escrita é por substituição de LINHA, nunca parse-e-reserializa: reserializar com
  `gray-matter` reescreveria aspas, ordem de chaves e formatação do arquivo inteiro, e o
  diff da tarefa viraria ruído — matando a revisão humana, que é o principal uso do arquivo.
- Textos de UI e mensagens de erro sempre em PT-BR.

## O pipeline em código (T-051, 02/08)

`/trabalhar <projeto>` **não passa mais por um orquestrador-modelo**. Vira um job do tipo
`pipeline` (`src/pipeline/runner-pipeline.ts`), e o laço é código:

- `pipeline/maquina.ts` — decisões puras (promover, ordenar, resolver agente, escalar
  modelo). `pipeline/motor.ts` — o laço. `pipeline/orcamento.ts` — teto com parada limpa.
- `pipeline/despachante.ts` — cada etapa vira UMA `query()` que o painel monta por inteiro.
  O prompt do agente vem de `.claude/agents/<nome>.md`, o MESMO arquivo do chat interativo.
- `contexto/montador.ts` — decide o que cada papel recebe: construtor/verificador levam o
  conteúdo das `areas`; **revisor leva o diff e nenhum fonte**; planejador não leva fonte.
- `pipeline/criterios.ts` — roda os `verificar:` das tarefas e, implicitamente, a suíte do
  projeto (via `ci/ecossistemas.ts`) antes de despachar o verificador.

**Para conferir sem gastar:** `npx tsx integracao/simular-pipeline.ts <projeto>` roda tudo
contra os arquivos reais com um SDK falso e imprime o que aconteceria. Medido no
banco-imobiliario: ~10,4k tokens de contexto por etapa, contra ~53,5k do caminho antigo.

`/trabalhar` SEM projeto continua no modelo — varrer a fábrica e escolher entre projetos é
orquestração, não máquina de estados. `motor: "modelo"|"codigo"` no disparo sobrescreve.

## Armadilhas conhecidas
Coisas que JÁ causaram problema aqui — cada uma custou uma sessão para descobrir.

- **`gray-matter` sem options envenena o cache.** Chame SEMPRE `matter(texto, {})`: sem o
  objeto de options ele cacheia ANTES do parse, e um YAML inválido faz as chamadas
  seguintes com o mesmo conteúdo retornarem "sucesso" com `data` vazio.
- **`_gestao/` pode não existir.** Nem todo diretório sob `projetos/` passou pelo
  `/novo-projeto` ou pela importação — pasta clonada à mão é projeto válido para o leitor.
  Quem escreve em `_gestao/` precisa de `mkdir` recursivo antes (isso já derrubou a config
  de CI com ENOENT/500).
- **Corrigir o teste até passar esconde o bug.** O ENOENT acima ficou mascarado porque o
  fixture do teste foi "consertado" criando a pasta, em vez de o código ser corrigido. Se
  um teste falha, primeiro pergunte se ele está certo e o código errado.
- **Falha que se repete em TODA execução não é flaky.** Um teste de cancelamento foi
  dispensado como "flaky pré-existente" por horas; na verdade usava um runner fake de ~2ms
  e perdia sempre a corrida com o HTTP do supertest. Abra o teste antes de rotular.
- **I/O sob OneDrive é lento e intermitente** (o repo vive em `Documents\`). Já causou
  EBUSY/EPERM na persistência e timeouts em cascata na suíte. Por isso `testTimeout` global
  de 15s no `servidor/vitest.config.ts` e persistência não-fatal na fila.
- **Windows: `npm` é `npm.cmd`.** Spawn precisa de `shell: true`, e matar o processo não
  basta — o `node.exe` filho fica órfão. Use `taskkill /PID <pid> /T /F` (é o que
  `ci/processo.ts` faz, hoje exportado como `encerrarArvore` para não haver segunda cópia).
- **O `timeout` do `execFile` NÃO mata a árvore — e foi isso que fechava o painel** (08/08).
  `pipeline/criterios.ts` roda a suíte do projeto e entregava o teto de tempo ao próprio
  `execFile`. Ele manda SIGTERM só para o filho DIRETO, que com `shell: true` é o `cmd.exe`:
  `npm`, `node --test` e **um processo por arquivo de teste** sobreviviam. Medido no
  banco-imobiliario: **8 `node.exe` órfãos por estouro**, cada um segurando servidor HTTP +
  Socket.IO. Como a passada mecânica roda uma vez por tarefa POR CICLO, uma rodada de
  `/trabalhar` acumulava dezenas deles até a máquina (7,9 GB) não sustentar mais o painel —
  que morria levando junto o job em voo. É a mesma armadilha do item acima, num arquivo que
  não recebeu a correção. Ao dar `spawn`/`execFile` em comando de ecossistema: o teto de
  tempo é SEU, e o kill é de árvore.
- **Diagnosticar queda exige que a queda deixe rastro.** Os jobs `67de2cb4` e `57cb7ac9`
  sumiram sem UMA linha: o `<id>.log.jsonl` só é gravado no assentamento, então processo
  morto no meio não deixa log — e o `index.ts` não tinha `uncaughtException` nem
  `unhandledRejection`, então qualquer exceção assíncrona sem dono derrubava tudo em
  silêncio. Hoje as duas são registradas em `dados/quedas.log` e **o processo segue**: num
  cockpit local, morrer destrói trabalho de agente já pago, e seguir degradado com rastro é
  estritamente melhor. Corolário: **ausência de `.log.jsonl` num job terminal é sintoma de
  queda do processo**, não de job silencioso.
- **`res.write` num SSE morto LANÇA — e dentro de `setInterval` não há quem pegue.** O
  heartbeat de `rotas/eventos.ts` escrevia sem `try`, e o `res` não tinha listener de
  `error`. O `try/catch` do hub protegia só o caminho do `publicar`. Um ECONNRESET no
  socket viraria `uncaughtException`. Toda escrita passa por `escreverSeguro`, e o
  encerramento é idempotente (pode chegar por `close`, por `error` ou pela escrita falhando).
- **Eventos emitidos no construtor do gerenciador se perdem**: o hub SSE só conecta depois
  (`inicializar.ts`). Por isso o saneamento de boot é publicado por
  `publicarSaneamentoDeBoot()`, chamado APÓS `hub.conectar`.
- **`sessionId` só no fim é inútil.** Ele é gravado no `system/init` via `ctx.anotar` —
  esperar o `result` significaria ter o dado só quando a retomada não importa mais.
- **Uma conexão SSE por página.** `Projeto.tsx` chama `useJobsAoVivo()` uma vez e passa o
  estado para baixo (ex.: `SecaoCi`). Abrir uma segunda quebra a decisão de canal único.
- **DÁ para ver a tela: use `../_sistema/ferramentas/captura.mjs`.** Isso resolveu a maior lacuna do
  projeto (nenhuma tela tinha sido vista renderizada até 2026-07-28).
  `node ../_sistema/ferramentas/captura.mjs <url> <arquivo.png> --espera=3000` dirige o
  Edge/Chrome já instalado no Windows via DevTools Protocol — sem instalar nada — e o PNG
  pode ser LIDO. Antes de marcar tarefa de UI como `concluida`, capture e olhe.
  (Morava em `painel/ferramentas/`; subiu para `_sistema/` em 31/07, quando a prova visual
  passou a ser exigida dos agentes em QUALQUER projeto web, não só aqui.)
  - Não use `--screenshot` direto do navegador: captura antes de o React resolver os
    fetches e sai "Carregando…" em toda seção. E `--virtual-time-budget`, que existiria
    para isso, DERRUBA o navegador nesta máquina (testado). Por isso o script usa CDP.
  - Suba o painel antes (`npm start`) e derrube depois — painel no ar atrapalha a suíte.
  - **Tela que só existe depois de um clique: use `--js`** (T-029). `--js="<expressão>"`
    roda na página antes do retrato e `--pos-espera=<ms>` dá tempo de pintar. Sem isso só
    se vê o estado inicial — caixa fechada, painel não aberto, formulário não expandido.
    Truque que vale ouro: para MEDIR (não só olhar), injete o resultado na própria página
    (`document.body.appendChild(...)`) e ele aparece no PNG — foi assim que se provou que
    o resumão passou a entrar na tela (`scrollY 0 → 1632`).
  - **Página longa sai ilegível na captura**: o PNG inteiro é reduzido para caber, e
    detalhe de 0.7rem some. Para inspecionar de perto, remova as outras seções pelo `--js`
    antes do retrato — a página encurta e a fidelidade sobe.
  - **Para contar REQUISIÇÕES, use o domínio Network do CDP, não um wrapper de `fetch`**
    injetado por `--js`: o `--js` roda depois do bundle, então perde justamente a
    enxurrada de chamadas da montagem, que é o que interessa medir. Foi assim que se
    provou o 15 → 8 da T-042.
- **UI dada por pronta sem ninguém ver a tela é aposta.** Aconteceu duas vezes seguidas
  (T-020, T-023): lógica testada + strings no bundle NÃO provam que a tela ficou boa nem
  que o usuário vê diferença. Hoje não há desculpa — veja o item acima.
- **Execução que não faz nada é sempre a mais barata.** Ao medir corte de custo, compare o
  TRABALHO ENTREGUE, não a fatura. `projeto:conferir` em `effort: medium` marcou −74% de
  custo e ia entrar como vitória: com a mesma entrada, o padrão achou o PROGRESSO.md fora
  de sincronia e corrigiu (+11 linhas), e o `medium` terminou sem achar nada. Pior, o
  instrumento contava arquivos com `git status` DEPOIS da execução — e os agentes de
  zeladoria COMMITAM, então a árvore lê limpa e tudo marcava "0 arquivos tocados",
  inclusive as pernas que commitaram. Meça contra o HEAD do início
  (`git diff --name-only <head> HEAD`) e desconfie de coluna que dá zero para todo mundo.
- **Opção do SDK com nome errado é ignorada EM SILÊNCIO.** O `effort` da T-042 nasceu como
  `outputConfig: { effort }` — objeto que não existe na API do SDK. Compilou (spread
  condicional escapa da checagem de propriedade excedente), passou nos testes, e todo
  fluxo continuou no padrão: a economia configurada simplesmente não acontecia. Na mesma
  cadeia, `lerParams` nem lia a chave — DOIS pontos mudos seguidos. É a família do
  `watchdogMs` que a tabela anunciava e ninguém consumia. Ao passar opção nova ao SDK:
  confira o nome em `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (é a verdade
  da versão PINADA) e escreva teste sobre o objeto `options` que chega ao SDK — não sobre
  a tabela de configuração, que é o lado fácil e não prova nada.
- **`modelUsage` do SDK é um ACUMULADOR VIVO, não um instantâneo por mensagem.** Num job
  multi-sessão os `result` das sessões de fundo são descarregados juntos no fim (sete numa
  janela de **2 ms**, medido na rodada `358c14f1`) e todos leem o acumulador **já final** —
  por isso vieram idênticos enquanto `total_cost_usd`, escalar copiado na criação de cada
  mensagem, preservou a escada 0,79 → 7,42. Consequências: (a) `modelUsage` é cumulativo
  por JOB, sobrescrever está certo e não há subcontagem de tokens; (b) comparar o
  `modelUsage` com o custo **no meio** do fluxo acusa divergência em toda rodada saudável —
  a conferência só vale com os dois valores finais, e há teste travando isso. A invariante
  boa: a soma de `costUSD` do `modelUsage` bate com o `total_cost_usd` até a 9ª casa.
- **Contabilidade presa ao `result` some justo no job caro.** `custoUsd`/`tokens` só eram
  gravados a partir da mensagem `result` do SDK. Job cortado ANTES dela — cota batida,
  cancelamento, watchdog — gravava `null`. Como estourar cota é o desfecho dos jobs mais
  caros, o painel subcontava de forma ENVIESADA: uma rodada de 40 min, 21 despachos de
  agente, 472 chamadas de ferramenta e 5 tarefas concluídas apareceu como US$ 0,00, ao lado
  de um `/status` de 40 s marcando US$ 0,32 — o inverso exato da realidade. Pior, a T-045
  já tinha tentado preservar contabilidade parcial, mas a preservação dependia do mesmo
  `result` que nunca chega. Hoje o `AcumuladorDeUso` lê `message.usage` de cada mensagem
  `assistant`, então a conta existe ANTES de qualquer `result`. Ao acrescentar dado de
  execução: pergunte o que sobra dele quando o fluxo é cortado no meio.
- **`message.usage` repete na mesma volta — deduplique por `message.id`.** O `sdk.d.ts` diz,
  no comentário de `SDKAssistantMessage.timestamp`: *"One API assistant turn may produce
  several assistant messages sharing a message.id"*. O `usage` de cada uma é o da VOLTA
  inteira, não o do pedaço. Somar mensagem a mensagem multiplica a conta pelo número de
  blocos de conteúdo — e o erro é para CIMA, o pior lado: inventa gasto que não existe e
  manda otimizar fantasma.
- **Escrita de cache NÃO é 1,25× — meça antes de acreditar na tabela.** A tabela pública diz
  1,25× (TTL 5 min) e 2× (TTL 1 h); o SDK usa os DOIS, em proporção que varia por job.
  Calibrando contra os 6 jobs reais com telemetria, 1,25× errava 18,5% em média (29% nos
  pequenos) e 1,75× erra 5,8%. Resolvendo a mistura: `5dfb1fe3` deu ~100% em TTL de 1 h
  (bate na 4ª casa), `358c14f1` deu ~22%. **Nenhum multiplicador fixo pode ser exato** — por
  isso a UI rotula com `~` e `≥` em vez de fingir precisão. Se mexer em `precos.ts`, refaça
  a varredura contra `dados/jobs/`; há teste (`precos.test.ts`) travando o erro médio.
- **Hook que abre conexão vira N conexões quando dois componentes o chamam.** `App` assina
  o SSE para o selo do cabeçalho e a página assinava de novo: 2 conexões, 2 fanouts de
  cada evento, `/api/jobs` e `/api/inputs` em dobro — com a regra "uma conexão por página"
  escrita e tida como cumprida. Correção (T-042): estado no MÓDULO + `useSyncExternalStore`,
  com a conexão amarrada à contagem de assinantes. Invariante que depende de quem chama
  lembrar não é invariante. Se fizer isso, o `getSnapshot` PRECISA devolver o mesmo objeto
  enquanto nada muda — objeto novo a cada chamada põe o React em laço infinito de render.
- **Job headless que despacha agente em SEGUNDO PLANO perde o trabalho dele.** O
  `/novo-projeto banco-imobiliario` despachou o `planejador` em background e encerrou o turno
  para "aguardar a notificação". Não existe quem notifique aqui: o modelo para de emitir, a
  sessão fecha, o SDK manda `result` e o job assenta — com o agente ainda escrevendo. Ficou
  `concluido`, `erro: false`, 18 de 150 turnos, US$ 0,57, e 9 das 22 tarefas do plano nunca
  criadas. **Nada na tela dizia isso**: cota, watchdog e teto de turnos tinham aviso próprio;
  "terminou sem fazer" não tinha. Hoje o preâmbulo de `acoes/preambulo.ts` proíbe no prompt,
  o runner conta os `run_in_background` (`despachosFundo`) e a aba Jobs avisa. Ao criar
  caminho novo de disparo, passe pelo preâmbulo — job sem ele volta a poder se perder.
- **Guarda que só pega a forma EXPLÍCITA da falha não pega a forma comum dela.** A proteção
  acima falhou na primeira reincidência (`f72534e8`, 01/08, T-017a, US$ 0,89 por zero
  tarefa). Motivo: `ehDespachoEmFundo` testava `run_in_background === true`, e **segundo
  plano é o PADRÃO da ferramenta `Agent`** — o orquestrador nunca precisou ligar o flag,
  bastou omitir. Cumpriu o preâmbulo ao pé da letra ("é proibido despachar em segundo
  plano"), encerrou o turno em 2min37, e o `servidor` seguiu 10 min órfão. `despachosFundo`
  leu 0, a aba Jobs não avisou, o job ficou verde. O teste "despacho normal (síncrono)`"
  montava o caso seguro OMITINDO o campo: certificava o caminho perigoso como seguro.
  Correções: a checagem virou `!== false`; o preâmbulo MANDA passar `run_in_background:
  false` em vez de proibir `true`; e nasceu `despachosEmVoo`, que casa `tool_use.id` de
  despacho com `tool_use_id` de `tool_result` e conta o que ficou em aberto quando a sessão
  fechou — **dano observado, não risco inferido**, independente de flag, de texto do modelo
  e da versão do SDK. Lição geral: ao proteger contra um modo de falha, pergunte qual é o
  DEFAULT do mecanismo — e prefira medir a consequência a medir a intenção.
- **Log que só existe em memória some justo quando é preciso.** O log de execução vivia no
  buffer do hub SSE — 500 eventos para a fábrica INTEIRA —, então abrir um job de ontem dava
  console vazio, e a única memória era o `resumos`, escrito por um modelo pequeno (numa
  rodada real ele afirmou "22 tarefas geradas" quando 13 existiam). Diagnosticar a parada
  acima só foi possível pelo texto final gravado em `resultado`, por sorte. Agora o
  `<id>.log.jsonl` é gravado no fim da execução (`jobs/historico-log.ts`); o corte por teto
  tira o MEIO, nunca o fim, que é onde o fluxo quebra.
- **Parser próprio de markdown precisa cobrir o que os documentos REAIS usam.** O de
  `lib/markdown.ts` passava nos testes e mesmo assim a aba "Análise e docs" saía quebrada:
  continuação indentada de item virava parágrafo NO MEIO da lista (partindo item e texto),
  sublista era achatada no nível do pai, e linhas `**Decisão:**`/`**Motivo:**`/`**Quem:**`
  eram emendadas numa frase só. Os testes usavam exemplos de uma linha; o conteúdo da
  fábrica quebra linha o tempo todo. Ao mexer aí, teste com um TRECHO COPIADO de um `.md`
  de projeto. Corolário: quem renderiza documento dentro de uma `<ol>`/`<ul>` precisa fixar
  `list-style-type` — o navegador conta o aninhamento do HTML, não o do documento.
- **Recorte por LINHAS do markdown cru mostra o gabarito, não o conteúdo.** DECISOES.md e
  PROGRESSO.md começam pelo modelo do formato (`## AAAA-MM-DD — <título>`), então cortar as
  14 primeiras linhas exibia rótulo com placeholder e escondia todo o dado real atrás do
  "Mostrar tudo". `lib/documento.ts` separa gabarito de entradas — corte de documento se faz
  por SEÇÃO, nunca por contagem de linhas.
- **Entregue onde o usuário OLHA.** A T-023 pôs a visualização de agentes na página do
  projeto; o usuário acompanha execução na página de **Jobs**, que ficou como estava. Ao
  receber um pedido de UI, confirme em QUAL tela ele acontece.
- **Navegador NÃO dá caminho absoluto de pasta.** `webkitdirectory` e
  `showDirectoryPicker()` entregam os arquivos e escondem onde eles estão. Por isso o
  seletor de pasta da importação roda no BACKEND (`projetos/seletor-pasta.ts`) — só é
  possível porque o painel é local. Ao mexer nele: `-STA` obrigatório, `OutputEncoding`
  UTF-8 (acento no caminho), Form `TopMost` como owner (senão abre atrás do navegador) e
  cadeado liberado em `finally`.
- **A fábrica constrói QUALQUER stack — não presuma Node.** Já aconteceu duas vezes: o CI
  só sabia `npm` (projeto Python/Go/Rust ficava sem pipeline) e a importação só ignorava
  `node_modules` (arrastava `.venv/`, `target/`). Ao tocar em CI/importação, use
  `ci/ecossistemas.ts` e `PASTAS_IGNORADAS` em vez de cravar um comando de ecossistema.
- **Comando "seguro" não testa permissão.** `echo`/`ls` são auto-aprovados pelo
  classificador ANTES de chegar ao `canUseTool` — testar com eles dá falso negativo ("o
  callback está quebrado"). Gatilho confiável: ação genuinamente barrada, como escrever
  num caminho FORA do cwd (o SDK documenta isso em `blockedPath`).
- **Um `/trabalhar` no chat e outro no painel se atropelam.** Os locks do painel não
  enxergam sessões interativas do terminal.
- **Comando de rede sem `GIT_TERMINAL_PROMPT=0` PENDURA o servidor.** Um `git push` que
  precise de senha fica esperando uma resposta que nunca chega, e o painel inteiro trava
  junto. `publicacao.ts` também zera `GIT_ASKPASS` e usa `ssh -o BatchMode=yes`, mais
  teto de tempo. Vale para qualquer comando externo que possa perguntar algo.
- **URL de remoto é lista de PERMISSÃO (https/git@/ssh), nunca lista de proibições.**
  `ext::<comando>` é uma URL que o git aceita e que faz ele EXECUTAR o comando — é
  execução remota disfarçada de endereço. Mesma família do hash de commit que precisa ser
  hexadecimal: argumento não validado vira flag ou vira código.
- **A guarda de segurança mora na OPERAÇÃO, não na rota nem na UI.** `publicar()` chama a
  varredura sozinho; se dependesse de a tela lembrar de conferir antes, bastaria um
  caminho novo de código para publicar sem checagem. Vale para toda ação irreversível.
- **Relatório de segurança nunca repete o segredo encontrado** — só o arquivo e a linha.
  Relatório vira captura de tela, log e print no chat; repetir o valor espalha o
  problema em vez de contê-lo.
- **`credential.helper` no Windows vem do gitconfig do SISTEMA.** Lê-lo com `--global`
  devolve vazio e faz a UI dizer "não conectado" numa máquina que publica normalmente.
- **Configuração que ninguém lê é pior que configuração ausente.** A coluna `watchdogMs`
  da tabela de guardrails existia desde a T-019 e NUNCA foi consultada: o watchdog era
  construído uma vez com o padrão. `/trabalhar` pedia 20 min e recebia 15, e ninguém
  percebeu porque a tabela *parecia* estar no ar. Só apareceu quando uma execução real foi
  cortada com um limite que não era o configurado. Ao acrescentar campo em tabela
  data-driven, confira quem o CONSOME.
- **A interrupção do watchdog é ASSÍNCRONA.** Checar o estado logo depois de `varrer()` lê
  o estado velho e faz parecer que o watchdog não funciona — use `await aguardarEstado(…)`,
  como os testes antigos já faziam.
- **Chamada barata pelo Agent SDK precisa de QUATRO opções.** Por padrão o SDK monta um
  agente de codificação completo, e nada disso quebra se faltar — só fica caro em silêncio.
  No resumidor (T-039) a conta caiu de **US$ 0,057 para US$ 0,0019** por resumo:
  - `tools: []` — remove as definições das ferramentas. **`allowedTools: []` NÃO faz isso**:
    ele só diz que nenhuma é auto-aprovada, e as definições seguem no contexto. Confundir os
    dois custou 15.893 tokens de ENTRADA para resumir um parágrafo (medido).
  - `settingSources: []` — sem isso, carrega os settings do disco, e o do projeto arrasta os
    `CLAUDE.md` inteiros.
  - `systemPrompt` próprio e curto — sem isso, usa o preset do Claude Code.
  - `thinking: { type: "disabled" }` — vem ligado por padrão; em tarefa mecânica é gasto
    puro (dobrava a saída).
  Ao investigar custo, meça **tokens**, não só preço: foi o que apontou a causa.
- **Resumo de trecho chega ASSÍNCRONO.** Conferir `job.resumos` logo após o job terminar dá
  zero e parece bug; a chamada do resumidor leva alguns segundos depois do `result`.
- **Teste de rota que sobrescreve `FABRICA_RAIZ` só aceita import DINÂMICO.** `config.ts`
  lê a env na CARGA do módulo, e `import` estático é içado: basta um import estático de
  qualquer módulo que importe `config.js` para a raiz apontar para a fábrica real em vez
  da fixture, e os testes quebrarem sem motivo aparente. Já aconteceu ao "melhorar" um
  teste trocando um número fixo por `ACOES_PROJETO.length` — 5 testes caíram de uma vez.
- **Caractere de controle em regex: escreva o ESCAPE, nunca o caractere cru.** A validação
  de URL de remoto em `publicacao.ts` nasceu com os controles (U+0000 a U+001F) literais
  no fonte. A regex funcionava — o estrago era outro: um byte NUL faz o git classificar o
  arquivo como **binário**, e o diff de `publicacao.ts` (tudo que atravessa a rede) parou
  de ser revisável, `Bin 13061 -> 16842 bytes` no lugar das linhas. Passou despercebido um
  commit inteiro. Ao editar, confira que o arquivo não ganhou controle cru: ferramenta de
  edição grava o caractere de verdade quando você quer a grafia dele.
