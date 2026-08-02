# MAPA — painel

<!-- GERADO por _sistema/ferramentas/mapa.mjs. NÃO editar à mão — a próxima geração sobrescreve. HEAD: 9d43b61 · 2026-08-02 -->

Índice denso deste projeto: o que existe, onde, e a assinatura de cada símbolo
público. **Existe para você não precisar varrer o projeto para se orientar** — ler o
código inteiro custa ~20× mais que ler isto, e é pago em toda tarefa por todo agente.

Como usar: leia este arquivo primeiro; depois abra na íntegra **só** os arquivos que
você vai modificar ou cujo comportamento interno você precisa conferir.

## Árvore

```
(raiz)  .gitignore, CLAUDE.md, README.md, package-lock.json, package.json
_gestao/  DECISOES.md, ESPECIFICACAO.md, PLANO.md, PROGRESSO.md
_gestao/pesquisas/  2026-07-21-agentes-dinamicos.md, 2026-07-21-claude-code-headless.md, 2026-07-31-economia-do-pipeline.md
_gestao/tarefas/  T-001-spike-agent-sdk.md, T-002-esqueleto-monorepo.md, T-003-leitor-estado-fabrica.md, T-004-api-leitura.md, T-005-pagina-inicial.md, T-006-pagina-projeto.md, T-007-nucleo-jobs.md, T-008-runner-claude.md, T-009-sse-eventos.md, T-010-inputs-pendentes.md, T-011-acoes-fabrica.md, T-012-acao-analise.md … (+30)
dados/ci/  _cronometro.json, teste-todo-cli.json
dados/jobs/  0d5ef7b2.json, 10711214.json, 16273f2b.json, 222d2495.json, 284211c8.json, 28943cc8.json, 2a8be82a.json, 33a01a83.json, 358c14f1.json, 3bb93223.json, 3d2f928c.json, 3d84b678.json … (+50)
experimentos/spike-sdk/  .gitignore, LEIA-ME.md, index.mjs, package-lock.json, package.json
servidor/  package.json, tsconfig.build.json, tsconfig.json, vitest.config.ts
servidor/integracao/  bench-escala.ts, bench-leitor.ts, canusetool.ts, medir-esforco.ts, veredito.ts
servidor/src/  agregador-rotas.ts, app.ts, config.ts, index.ts, inicializar.ts
servidor/src/acoes/  acoes-projeto.ts, acoes.ts, agentes-dinamicos.ts, analise.ts, preambulo.ts
servidor/src/acoes/prompts/  analise.md
servidor/src/acoes/prompts/projeto/  conferir.md, documentar.md, marco.md, pesquisar.md, progresso.md, recriar-equipe.md, replanejar.md, revisar.md, testar.md
servidor/src/ci/  config.ts, ecossistemas.ts, processo.ts, resultados.ts, runner-ci.ts
servidor/src/eventos/  hub.ts
servidor/src/fabrica/  ajustes.ts, analise-estruturada.ts, catalogo-acoes.ts, equipe-escrita.ts, equipe.ts, fabrica.ts, frontmatter.ts, git.ts, index.ts, plano.ts, publicacao.ts, seguranca.ts … (+3)
servidor/src/jobs/  fila.ts, historico-log.ts, inputs.ts, instancia.ts, persistencia.ts, runner-fake.ts, tipos.ts
servidor/src/jobs/claude/  precos.ts, runner-claude.ts
servidor/src/jobs/resumo/  gerente-resumos.ts, resumidor.ts, segmentos.ts
servidor/src/jobs/robustez/  guardrails.ts, watchdog.ts
servidor/src/projetos/  importar.ts, runner-importar.ts, seletor-pasta.ts
servidor/src/rotas/  acoes-projeto.ts, acoes.ts, ajustes.ts, cadastro.ts, ci.ts, equipe.ts, eventos.ts, fabrica.ts, git.ts, inputs.ts, jobs.ts, projetos.ts … (+2)
servidor/testes/  erros.test.ts, precos.test.ts, saude.test.ts, veredito-esforco.test.ts
servidor/testes/acoes/  acoes-projeto-rota.test.ts, acoes-projeto.test.ts, acoes-rota.test.ts, acoes.test.ts, agentes-dinamicos.test.ts
servidor/testes/analise/  analise-rota.test.ts, analise.test.ts
servidor/testes/cadastro/  cadastro-rota.test.ts, importar.test.ts, seletor-pasta.test.ts
servidor/testes/ci/  ci-lock.test.ts, ci-rota.test.ts, config.test.ts, processo.test.ts, resultados.test.ts, runner-ci.test.ts
servidor/testes/eventos/  hub.test.ts
servidor/testes/fabrica/  ajustes-cache.test.ts, analise-estruturada.test.ts, equipe-escrita.test.ts, equipe.test.ts, fabrica.test.ts, git.test.ts, plano.test.ts, projeto.test.ts, publicacao.test.ts, seguranca.test.ts, tarefas.test.ts
servidor/testes/fixtures/fabrica-falsa/_sistema/ideias/  2026-07-10-modo-relatorio.md, 2026-07-12-atalhos-teclado.md, 2026-07-13-ideia-estranha.md, README.md
servidor/testes/fixtures/fabrica-falsa/_sistema/logs/  2026-07-18.md, 2026-07-20.md, LEIA-ME.md
servidor/testes/fixtures/fabrica-falsa/projetos/  solto.txt
servidor/testes/fixtures/fabrica-falsa/projetos/alfa/_gestao/  ANALISE.md, DECISOES.md, PLANO.md, PROGRESSO.md
servidor/testes/fixtures/fabrica-falsa/projetos/alfa/_gestao/tarefas/  T-001-fundacao.md, T-002-nucleo.md, T-003-status-estranho.md, T-004-quebrada.md, T-005-replanejada.md
servidor/testes/fixtures/fabrica-falsa/projetos/beta/  README.md
servidor/testes/inputs/  inputs.test.ts
servidor/testes/jobs/  ajudantes.ts, api.test.ts, fila-historico.test.ts, fila.test.ts, historico-log.test.ts, persistencia.test.ts, robustez.test.ts
servidor/testes/jobs-claude/  runner-claude.test.ts
servidor/testes/resumo/  gerente-resumos.test.ts, resumidor.test.ts, segmentos.test.ts
servidor/testes/robustez/  guardrails.test.ts, metadados-retomada.test.ts, recuperacao-boot.test.ts, watchdog.test.ts
servidor/testes/rotas/  catalogo-acoes.test.ts, equipe-rota.test.ts, fabrica.test.ts, git.test.ts, projetos.test.ts, publicacao.test.ts
web/  index.html, package.json, tsconfig.json, vite.config.ts, vitest.config.ts
web/src/  App.tsx, estilos.css, main.tsx
web/src/componentes/  Documento.tsx, Estados.tsx, ExplicaAcao.tsx, GrafoGit.tsx, Indicadores.tsx, Markdown.tsx, PainelCommit.tsx, PublicacaoRepo.tsx, TextoLongo.tsx
web/src/lib/  api.ts, atividade.ts, avisos-job.ts, custo.ts, documento.ts, formato.ts, gestao.ts, grafo-git.ts, limite-uso.ts, markdown.ts, tipos.ts, useAgora.ts … (+3)
web/src/paginas/ajustes/  Ajustes.tsx
web/src/paginas/como-funciona/  ComoFunciona.tsx
web/src/paginas/git/  Git.tsx
web/src/paginas/inicio/  Inicio.tsx
web/src/paginas/jobs/  Jobs.tsx
web/src/paginas/projeto/  AcoesProjeto.tsx, EquipeAoVivo.tsx, EspecialistasProjeto.tsx, MapaPlano.tsx, PainelAnalise.tsx, Projeto.tsx, SecaoEquipe.tsx, SecaoGestao.tsx, proximo-passo.ts
web/src/paginas/projeto/ci/  PainelCi.tsx
web/testes/  acoes-projeto.test.ts, api.test.ts, atividade.test.ts, avisos-job.test.ts, custo.test.ts, documento.test.ts, estrategia.test.ts, gestao.test.ts, grafo-git.test.ts, limite-uso.test.ts, markdown.test.ts, proximo-passo.test.ts … (+2)
```

## Símbolos públicos por arquivo

### `experimentos/spike-sdk/index.mjs` — Spike T-001 — valida o @anthropic-ai/claude-agent-sdk na maquina do usuario: 1.

### `servidor/integracao/bench-escala.ts` — Escalonamento do leitor: fábrica SINTÉTICA com N projetos × M tarefas.

### `servidor/integracao/bench-leitor.ts` — Mede o LEITOR da fábrica contra o disco de verdade.
- `medir(nome: string, fn: () => Promise<unknown>, n = 9)`

### `servidor/integracao/canusetool.ts` — TESTE DE INTEGRAÇÃO PAGO — validação real do `canUseTool` (T-010) com o SDK.

### `servidor/integracao/medir-esforco.ts` — Mede o efeito REAL do `effort` nas ações mecânicas (T-042).

### `servidor/integracao/veredito.ts` — Julgamento de um A/B de esforço: as duas pernas entregaram a MESMA coisa? (T-051) Separado de `medir-esforco.ts` porque aquele arquivo roda `git` na …
- `Entrega` *(interface)* — O que uma perna do experimento entregou.
- `TipoVeredito` *(tipo)*
- `Veredito` *(interface)*
- `nomeCanonicoDeAcao(rotulo: string)` — Nome canônico de uma ação para o filtro `--acoes=`: só o trecho final, sem caminho e sem caixa.
- `linhasSignificativas(texto: string)` — Linhas significativas de um texto: sem vazias, sem espaço de borda.
- `similaridade(a: readonly string[], b: readonly string[])` — Similaridade de Jaccard entre dois conjuntos.
- `palavras(linhas: readonly string[])` — Palavras significativas de um texto, para comparar prosa sem depender da redação.
- `similaridadeDe(tipo: Entrega["tipoArtefato"], a: readonly string[], b: readonly string[])` — Similaridade adequada ao TIPO de artefato — e isto foi aprendido errando.
- `julgar(a: Entrega, b: Entrega)` — Compara a perna cara (`a`, esforço padrão) com a barata (`b`, esforço reduzido).

### `servidor/src/acoes/acoes-projeto.ts`
- `PesoAcao` *(tipo)* — Quão "pesado" o fluxo tende a ser — alimenta a estimativa de custo na UI.
- `GrupoAcaoProjeto` *(tipo)* — Duas famílias, porque respondem a perguntas diferentes e a UI as separa: `especialista` = um agente da fábrica faz um serviço; `cuidado` = zeladoria …
- `AcaoProjeto` *(interface)*
- `ACOES_PROJETO` *(valor)* — As cinco de especialista (T-033) e as duas de cuidado do projeto (T-034).
- `acaoProjetoPorId(id: string)` — Ação do catálogo pelo id, ou null se não existe.
- `ErroAcaoProjetoDesconhecida` *(classe)* — Ação de projeto desconhecida — a rota traduz para 404.
- `OpcoesAcaoProjeto` *(interface)*
- `lerPromptProjeto(id: string, raizPainel: string = config.raizPainel)` — Prompt versionado da ação.
- `montarJobAcaoProjeto(idAcao: string, projeto: string, fabricaRaiz: string, opcoes: OpcoesAcaoProjeto)` — Monta o job "claude" de uma ação de agente sobre um projeto.
- `montarDespacho(modelo: string, valores: { projeto: string; dirProjeto: string; entrada: string })` — Substitui os marcadores do prompt versionado.

### `servidor/src/acoes/acoes.ts`
- `ErroAcaoDesconhecida` *(classe)* — Ação inexistente (a rota traduz para 404).
- `PedidoAcao` *(interface)*
- `montarJobAcao(pedido: PedidoAcao, fabricaRaiz: string)`

### `servidor/src/acoes/agentes-dinamicos.ts`
- `AgenteSDK` *(interface)* — Formato aceito por `options.agents` do SDK (subconjunto de AgentDefinition).
- `SUFIXO_REFORCO` *(valor)* — Sufixo das variantes reforçadas.
- `SEPARADOR_PROJETO` *(valor)* — Separador do nome QUALIFICADO (`<projeto>__<id>`), usado só quando o mesmo `id` existe em mais de um projeto injetado.
- `nomeDoAgente(projeto: string, id: string, qualificar: boolean)` — Nome do subagente para um especialista: nu quando o id é único, qualificado quando não.
- `agentesParaAcao(raiz: string, idAcao: string, argumentos: string, /** * Modelo do RETRABALHO (`estrategia…)` — Retorna os agentes a injetar para uma ação, ou undefined quando não se aplica (ação != trabalhar, ou nenhum projeto com equipe válida).

### `servidor/src/acoes/analise.ts`
- `ErroProjetoInexistente` *(classe)* — Projeto inexistente (ou nome com travessia de caminho) — a rota traduz para 404.
- `dirProjeto(fabricaRaiz: string, projeto: string)` — Resolve o diretório de um projeto sob `<fabrica>/projetos/`, barrando travessia de caminho (nome com `..`, barra absoluta etc.).
- `lerPromptAnalise(raizPainel: string = config.raizPainel)` — Lê o prompt de análise versionado.
- `OpcoesAnalise` *(interface)*
- `montarJobAnalise(projeto: string, fabricaRaiz: string, opcoes: OpcoesAnalise)` — Monta o job "claude" da análise de um projeto.

### `servidor/src/acoes/preambulo.ts` — Preâmbulo injetado em TODO prompt de job do painel (T-048).
- `PREAMBULO_HEADLESS` *(valor)*
- `blocoReforco(modelo: string, reforco: string, ids: readonly string[])` — Bloco de escalonamento de modelo (protocolo, regra 12).
- `comPreambuloHeadless(prompt: string, extra = "")` — Prefixa o preâmbulo a um prompt de job.

### `servidor/src/agregador-rotas.ts`
- `carregarRotas(app: Express)` — Agregador dinâmico de rotas: carrega todos os arquivos de `src/rotas/`, cada um exportando `{ prefixo, router }`, e monta cada router no app.

### `servidor/src/app.ts`
- `criarApp()` — Cria o app Express com rotas dinâmicas, SPA buildada e tratamento de erro.

### `servidor/src/ci/config.ts`
- `ESTAGIOS_CI` *(valor)* — Configuração de CI por projeto (T-017): `_gestao/ci.json` do PROJETO (não do painel — decisão em _gestao/DECISOES.md 2026-07-21).
- `EstagioCi` *(tipo)*
- `ConfigEstagioCi` *(interface)*
- `ConfigCi` *(interface)*
- `TIMEOUT_PADRAO_MS` *(valor)*
- `ErroConfigCiInvalida` *(classe)* — `_gestao/ci.json` existe mas o conteúdo não tem o formato esperado.
- `deduzirDefaults(dirProjeto: string)` — Deduz a config default do projeto a partir do ECOSSISTEMA detectado (Node, Python, Go, Rust, .NET, Java…) — ver `ecossistemas.ts`.
- `lerOuCriarConfig(dirProjeto: string)` — Lê `_gestao/ci.json`; se não existir, deduz os defaults do ecossistema do projeto, GRAVA o arquivo (para a UI/próxima leitura editarem em cima de alg…
- `salvarConfig(dirProjeto: string, bruto: unknown)` — Valida e grava a config (usado pelo PUT de edição).
- `validarConfig(bruto: unknown)` — Validação estrutural estrita — usada tanto na leitura do disco quanto no PUT da UI.

### `servidor/src/ci/ecossistemas.ts`
- `Ecossistema` *(interface)* — Detecção de ecossistema para deduzir o pipeline de CI (T-017, generalizado).
- `ECOSSISTEMAS` *(valor)* — Ordem = prioridade de detecção.
- `detectarEcossistema(dirProjeto: string)` — Detecta o ecossistema de um projeto pelos arquivos da raiz.

### `servidor/src/ci/processo.ts`
- `MotivoEncerramento` *(tipo)* — Execução de um comando de estágio de CI (T-017): spawn via shell (necessário no Windows — `npm` é `npm.cmd`), streaming de stdout/stderr linha a linh…
- `ResultadoProcesso` *(interface)*
- `OpcoesExecutarComando` *(interface)*
- `executarComando(opcoes: OpcoesExecutarComando)` — Executa um comando de estágio.

### `servidor/src/ci/resultados.ts`
- `EstadoEstagioCi` *(tipo)* — Persistência dos resultados de execução de CI (T-017): decisão em DECISOES.md 2026-07-21 — resultado da execução é operacional, fica em `dados/ci/<pr…
- `EstadoResultadoCi` *(tipo)*
- `ResultadoEstagio` *(interface)*
- `ResultadoCi` *(interface)*
- `lerResultados(dirDados: string, projeto: string)` — Lê o arquivo de resultados do projeto (último + histórico); null se nunca rodou.
- `reconciliarResultadosOrfaos(dirDados: string)` — Reconcilia resultados de CI deixados como `executando` por um processo que caiu (T-019).
- `salvarResultado(dirDados: string, resultado: ResultadoCi)` — Grava/atualiza o resultado (mesmo jobId reescreve a entrada — usado durante a execução).

### `servidor/src/ci/runner-ci.ts`
- `montarJobCi(projeto: string, fabricaRaiz: string, dirDados: string)` — Monta o job "ci". Valida a existência do projeto e da config (cria defaults do ecossistema se faltar) ANTES de enfileirar — projeto inexistente falha…
- `RunnerCi` *(classe)*

### `servidor/src/config.ts`
- `TierCusto` *(tipo)* — Tier de custo relativo (não é preço — é referência de "quão caro tende a ser").
- `EstrategiaModelo` *(interface)* — Estratégia de modelo oferecida ao disparar um fluxo.
- `config` *(valor)*
- `resolverEstrategia(id: string)` — Resolve uma estratégia pelo id (ou undefined se não existir).
- `fabricaRaizExiste()`

### `servidor/src/eventos/hub.ts`
- `EventoNumerado` *(interface)* — Hub de eventos SSE (T-009): canal ÚNICO multiplexado (cada evento carrega `jobId`).
- `HubEventos` *(classe)*
- `hub` *(valor)* — Instância única do hub (a rota e a inicialização usam a mesma).

### `servidor/src/fabrica/ajustes.ts`
- `comCache(ttlMs: number, ler: () => Promise<T>)` — Exportado para teste: o comportamento interessante é o TTL, a dedupe e a invalidação.
- `ContaGitHub` *(interface)* — ---------------------------------- GitHub ----------------------------------
- `lerContaGitHub` *(valor)* — Diagnóstico do GitHub, com cache de {@link TTL_DIAGNOSTICO_MS}.
- `definirIdentidade(nome: string, email: string)` — Grava a identidade dos commits (global).
- `ErroAjustes` *(classe)*
- `ContaClaude` *(interface)* — ---------------------------------- Claude ----------------------------------
- `lerContaClaude` *(valor)* — Diagnóstico do Claude, com cache de {@link TTL_DIAGNOSTICO_MS}.
- `AjustesPainel` *(interface)* — ---------------------------------- Painel ----------------------------------
- `Ajustes` *(interface)*

### `servidor/src/fabrica/analise-estruturada.ts`
- `PecaAnalise` *(interface)* — Leitor da análise ESTRUTURADA do projeto (T-041) — `_gestao/analise.json`.
- `GravidadeAtencao` *(tipo)*
- `PontoAtencao` *(interface)*
- `AnaliseEstruturada` *(interface)*
- `normalizarAnalise(dados: unknown)` — Normaliza o que veio do disco.
- `lerAnaliseEstruturada(raiz: string, nomeProjeto: string)` — Lê `projetos/<nome>/_gestao/analise.json`.

### `servidor/src/fabrica/catalogo-acoes.ts`
- `IDS_ACOES` *(valor)* — Catálogo das 6 ações globais da fábrica (/novo-projeto, /ideia, /trabalhar, /status, /encerrar-dia, /manutencao).
- `IdAcao` *(tipo)*
- `PesoAcao` *(tipo)* — Quão "pesado" (custo/tempo) o fluxo tende a ser — entra na estimativa de custo.
- `AcaoFabrica` *(interface)*
- `catalogoAcoes(raiz: string)` — Monta o catálogo lendo `.claude/commands/*.md` da raiz da fábrica informada.

### `servidor/src/fabrica/equipe-escrita.ts`
- `ErroEquipe` *(classe)* — ESCRITA da equipe do projeto (T-035) — `projetos/<nome>/_gestao/equipe.json`.
- `AgenteEntrada` *(interface)* — Um agente como ele chega da web (antes de validar).
- `AgenteGravavel` *(interface)* — Agente já validado, no formato exato que `equipe.json` guarda.
- `validarEquipe(bruto: unknown)` — Valida a lista inteira e devolve os agentes prontos para gravar, ou a lista de problemas.
- `gravarEquipe(fabricaRaiz: string, projeto: string, bruto: unknown)` — Grava `equipe.json` do projeto.

### `servidor/src/fabrica/equipe.ts`
- `lerEquipe(raiz: string, nomeProjeto: string)` — Leitor da EQUIPE do projeto (agentes dinâmicos) — `projetos/<nome>/_gestao/equipe.json`.
- `ehTrilhaGenerica(equipe: EquipeProjeto)` — `true` quando o projeto roda na trilha genérica (qualquer domínio != software).
- `agentesValidos(equipe: EquipeProjeto)` — Só os agentes prontos para injeção (id + prompt válidos, sem erros de validação).

### `servidor/src/fabrica/fabrica.ts`
- `lerFabrica(raiz: string)` — Visão geral da fábrica: todos os projetos (resumo com tarefas, contagem por status e fase atual), ideias da caixa de entrada e o log diário mais rece…
- `lerProjeto(raiz: string, nome: string)` — Visão completa de um projeto: tarefas com corpo (seções), plano inteiro, e textos de DECISOES.md, PROGRESSO.md e ANALISE.md (null quando o arquivo nã…
- `listarProjetos(raiz: string, erros: string[] = [])` — Nomes dos projetos da fábrica, em ordem alfabética.

### `servidor/src/fabrica/frontmatter.ts`
- `ResultadoFrontmatter` *(interface)* — Resultado do parse de frontmatter que nunca lança: YAML inválido vira `erro`.
- `separarFrontmatter(texto: string)`
- `mensagemDoErro(causa: unknown)`
- `campoTexto(valor: unknown)` — String não vazia (trim aplicado) ou null.
- `campoLista(valor: unknown)` — Lista de strings ou null quando o valor não é um array.
- `normalizarData(valor: unknown)` — Normaliza data do YAML para "AAAA-MM-DD".

### `servidor/src/fabrica/git.ts`
- `CommitGit` *(interface)*
- `HistoricoGit` *(interface)*
- `lerHistorico(dirRepo: string, limite = 80)` — Lê o histórico de um repositório.
- `ArquivoAlterado` *(interface)* — ------------------------- Detalhe de um commit -------------------------
- `DetalheCommit` *(interface)*
- `lerDetalheCommit(dirRepo: string, hash: string)` — Resumo do que um commit mudou — arquivos tocados e quantas linhas.
- `AlteracaoPendente` *(interface)* — ------------------------- Alterações e commit -------------------------
- `lerAlteracoes(dirRepo: string)` — O que está pendente de commit no repositório.
- `ErroCommit` *(classe)*
- `commitar(dirRepo: string, mensagem: string)` — Faz `git add -A` + `git commit` no repositório.
- `lerBranch(dirRepo: string)`

### `servidor/src/fabrica/index.ts` — Leitor do estado da fábrica — módulo SOMENTE-LEITURA que transforma os arquivos da fábrica (projetos, tarefas, planos, ideias, logs) em dados tipados.
- reexporta `lerFabrica, lerProjeto, listarProjetos`
- reexporta `agentesValidos, lerEquipe`
- reexporta `faseAtualDoPlano, parsearMarco, parsearPlano`
- reexporta `lerIdeias, lerLogMaisRecente, parsearIdeia`

### `servidor/src/fabrica/plano.ts`
- `parsearPlano(texto: string)` — Parser do PLANO.md (contrato: `_sistema/templates/PLANO.md`): `# Plano — <nome>`, visão em texto livre, e uma seção `## <nome da fase>` por fase com …
- `parsearMarco(bruto: string)` — Interpreta o valor da linha `Marco:` — `pendente`, `aprovado AAAA-MM-DD` ou `reprovado AAAA-MM-DD (correções: T-NNN, ...)`; resto vira `desconhecido`.
- `faseAtualDoPlano(plano: Plano)` — Fase atual do projeto: primeira fase cujo marco está `pendente` (contrato do protocolo); se nenhuma está pendente, a primeira `reprovado` (fase repro…

### `servidor/src/fabrica/publicacao.ts`
- `FABRICA` *(valor)* — Nome reservado do repositório da raiz (não colide: `/` é proibido em nome de pasta).
- `ErroPublicacao` *(classe)*
- `dirDoRepo(raiz: string, id: string)` — Diretório do repositório pedido (`_fabrica` = raiz), ou `null` se o nome não corresponde a nada.
- `validarUrlRemoto(url: string)` — `null` = URL aceita; string = por que foi recusada (mensagem para a UI).
- `lerRemoto(dirRepo: string)` — URL do `origin`, ou `null` quando não há remoto configurado.
- `definirRemoto(dirRepo: string, url: string)` — Grava (ou troca) o `origin`.
- `EstadoPublicacao` *(interface)* — --------------------------- Estado de publicação ---------------------------
- `lerEstadoPublicacao(dirRepo: string)` — Quanto este repositório está adiantado/atrasado em relação ao que já foi publicado.
- `RepoResumo` *(interface)* — ------------------------------ Lista de repos ------------------------------
- `listarRepos(raiz: string)` — Todos os repositórios da fábrica: a raiz primeiro, depois cada subprojeto.
- `ErroBloqueioSeguranca` *(classe)* — Publicação barrada pela conferência de segurança.
- `ResultadoPush` *(interface)*
- `publicar(dirRepo: string, opcoes: { ignorarAvisos?: boolean } = {})` — Publica o branch atual no `origin`.
- `iniciarRepo(dirRepo: string)` — `git init` numa pasta de projeto que ainda não é repositório.
- `criarGitignore(dirRepo: string)` — Cria um `.gitignore` inicial adequado ao ecossistema detectado.

### `servidor/src/fabrica/seguranca.ts`
- `Achado` *(interface)*
- `RelatorioSeguranca` *(interface)*
- `varrerRepo(dirRepo: string)` — Varre um repositório procurando o que não deveria ser publicado.

### `servidor/src/fabrica/sistema.ts`
- `lerIdeias(raiz: string)` — Ideias da caixa de entrada `_sistema/ideias/` (README.md excluído), em ordem de nome de arquivo (= cronológica, pelo prefixo AAAA-MM-DD).
- `parsearIdeia(arquivo: string, texto: string)` — Parse de um arquivo de ideia; nunca lança (problemas vão para `erros`).
- `lerLogMaisRecente(raiz: string)` — Log diário mais recente de `_sistema/logs/` (nome `AAAA-MM-DD.md`; a ordenação lexicográfica do nome É a cronológica).

### `servidor/src/fabrica/tarefas.ts`
- `lerTarefas(dirTarefas: string)` — Lê todas as tarefas (T-*.md) de uma pasta `_gestao/tarefas/`.
- `lerResumosTarefas(dirTarefas: string)` — Só o frontmatter, SEM quebrar o corpo em seções (T-043).
- `parsearTarefa(arquivo: string, texto: string, comSecoes?: true)` — Transforma o texto de um arquivo de tarefa em dados tipados.
- `parsearTarefa(arquivo: string, texto: string, comSecoes: false)`
- `parsearTarefa(arquivo: string, texto: string, comSecoes = true)`
- `parsearSecoes(corpo: string)` — Quebra o corpo da tarefa nas seções do protocolo (títulos `## `).
- `contarPorStatus(tarefas: readonly TarefaResumo[])` — Contagem por status do protocolo; status fora do vocabulário fica de fora (sinalizado em `erros` da tarefa).

### `servidor/src/fabrica/tipos.ts`
- `STATUS_TAREFA` *(valor)* — Tipos do estado da fábrica — o contrato destes dados é `_sistema/PROTOCOLO_TAREFAS.md` (frontmatter e vocabulário de status), `_sistema/templates/PLA…
- `StatusTarefa` *(tipo)*
- `PRIORIDADES_TAREFA` *(valor)*
- `PrioridadeTarefa` *(tipo)*
- `STATUS_IDEIA` *(valor)*
- `StatusIdeia` *(tipo)*
- `ContagemPorStatus` *(tipo)* — Contagem por status válido do protocolo — sempre com as 8 chaves (zeros incluídos).
- `TarefaResumo` *(interface)* — Frontmatter de uma tarefa.
- `SecoesTarefa` *(interface)* — Corpo (seções markdown) de uma tarefa; seção ausente = string vazia.
- `TarefaCompleta` *(interface)*
- `MarcoFase` *(interface)* — Linha `Marco:` de uma fase do PLANO.md (`pendente` | `aprovado AAAA-MM-DD` | `reprovado AAAA-MM-DD (correções: ...)`).
- `FasePlano` *(interface)*
- `Plano` *(interface)*
- `FaseAtual` *(interface)* — Fase atual = primeira fase cujo marco está `pendente` (contrato); se nenhuma, a primeira `reprovado` — fase reprovada ainda está em andamento.
- `ProjetoResumo` *(interface)*
- `AgenteEspecialista` *(interface)* — Especialista dinâmico do projeto (de `_gestao/equipe.json`, gerado pelo planejador).
- `EquipeProjeto` *(interface)*
- `DOMINIO_PADRAO` *(valor)* — Domínio assumido quando `equipe.json` não declara nada (ou declara lixo).
- `ProjetoDetalhe` *(interface)*
- `Ideia` *(interface)* — Ideia da caixa de entrada `_sistema/ideias/` (README.md é excluído).
- `LogDiario` *(interface)* — Log diário `_sistema/logs/AAAA-MM-DD.md`.
- `EstadoFabrica` *(interface)*

### `servidor/src/inicializar.ts`
- `inicializarPainel()` — Amarra as peças que só valem em produção (não nos testes de rota isolados): registra os runners no gerenciador, liga o hub SSE ao emissor de jobs e s…
- `encerrarPainel()` — Encerra o que a inicialização subiu (usado em testes e no shutdown).

### `servidor/src/jobs/claude/precos.ts` — Tabela de preços por modelo, para ESTIMAR o custo de um job quando o SDK não reportou o valor real (T-049).
- `ERRO_MEDIO_ESTIMATIVA` *(valor)* — Erro médio observado da estimativa contra o custo real, na amostra de calibragem.
- `PrecoModelo` *(interface)* — Preço em USD por 1M tokens, por natureza de token.
- `precoDe(modelo: string)` — Preço de um modelo, ou `null` quando ele não está na tabela (modelo novo).
- `UsoModelo` *(interface)* — Uso de um modelo, na forma que o acumulador do runner produz.
- `EstimativaCusto` *(interface)*
- `estimarCusto(porModelo: Record<string, UsoModelo>)` — Estima o custo de um job a partir do uso por modelo.

### `servidor/src/jobs/claude/runner-claude.ts`
- `ParamsClaude` *(interface)* — Parâmetros que o job "claude" carrega em `job.params`.
- `TokensJob` *(interface)* — Consumo de tokens do fluxo (T-044).
- `UsoAgente` *(interface)* — Consumo de um agente do pipeline dentro de um job.
- `ResultadoClaude` *(interface)*
- `ErroFluxoClaude` *(classe)* — Falha de um fluxo Claude que CARREGA a contabilidade (T-045).
- `ehLimiteDeUso(texto: string)` — O texto indica limite de assinatura batido?
- `horaDeReabertura(texto: string)` — Hora de reabertura anunciada na mensagem ("resets 2:40pm"), para a UI dizer QUANDO voltar em vez de só "falhou".
- `Consulta` *(tipo)* — Assinatura estreita do SDK usada pelo runner (fácil de falsear nos testes).
- `consultaReal` *(valor)* — Adapta o `query` real do SDK à assinatura estreita.
- `RunnerClaude` *(classe)*

### `servidor/src/jobs/fila.ts`
- `ErroJobNaoEncontrado` *(classe)* — Job referenciado não existe (a rota traduz para 404).
- `ErroJobNaoCancelavel` *(classe)* — Job existe mas está em estado que não aceita cancelamento (a rota traduz para 409).
- `OpcoesGerenciador` *(interface)*
- `NovoJob` *(interface)*
- `GerenciadorJobs` *(classe)* — Fila de jobs com locks de concorrência (decisão em _gestao/DECISOES.md 2026-07-21): - `global` executa somente quando NADA mais roda e, enquanto exec…

### `servidor/src/jobs/historico-log.ts`
- `LinhaHistorico` *(interface)* — Histórico de log de um job, gravado em `<dirJobs>/<id>.log.jsonl` (T-048).
- `HistoricoLog` *(interface)*
- `MAX_LINHAS_INICIO` *(valor)* — Teto por job. Um `/trabalhar` longo passa de 10 mil linhas; guardar tudo faria o `dados/` crescer sem controle e o payload da tela junto.
- `MAX_LINHAS_FIM` *(valor)*
- `historicoVazio()` — Buffer vazio para um job que começa.
- `empurrarLinha(historico: HistoricoLog, linha: LinhaHistorico)` — Acrescenta uma linha, cortando o MEIO quando passa do teto.
- `salvarHistorico(dirJobs: string, jobId: string, historico: HistoricoLog)` — Grava o histórico do job.
- `lerHistorico(dirJobs: string, jobId: string)` — Lê o histórico gravado.
- `apagarHistorico(dirJobs: string, jobId: string)` — Apaga o histórico junto com o job podado — senão o `.log.jsonl` viraria lixo órfão.

### `servidor/src/jobs/inputs.ts`
- `ErroInputNaoEncontrado` *(classe)* — Registro em memória das pendências de input (T-010).
- `ErroInputJaRespondido` *(classe)*
- `RegistroInputs` *(classe)*

### `servidor/src/jobs/instancia.ts`
- `obterGerenciador()`
- `reiniciarGerenciador(opcoes?: OpcoesGerenciador)` — Descarta a instância atual e cria outra (runners precisam ser registrados de novo).

### `servidor/src/jobs/persistencia.ts`
- `salvarJob(dirJobs: string, job: Job)` — Persistência dos metadados de job em `<dirJobs>/<id>.json`, um arquivo por job, reescrito a cada transição.
- `carregarJobs(dirJobs: string)` — Carrega todos os jobs persistidos; arquivo ilegível/malformado é avisado e pulado.
- `MAX_JOBS_RETIDOS` *(valor)* — Retenção do histórico (T-045).
- `podarJobs(dirJobs: string, jobs: Job[], max = MAX_JOBS_RETIDOS)` — Apaga do disco os jobs terminais mais antigos que excedem o teto e devolve os que ficaram — assim o chamador não precisa reler o diretório.

### `servidor/src/jobs/resumo/gerente-resumos.ts`
- `GerenteResumos` *(classe)*

### `servidor/src/jobs/resumo/resumidor.ts`
- `MODELO_RESUMO` *(valor)* — Resumidor de trecho (T-039): transforma a fala de um agente em 2 linhas + tópicos.
- `ItemResumo` *(interface)*
- `Resumo` *(interface)*
- `recortar(texto: string, teto = 12000)` — Corta o texto que vai ao resumidor: o custo é por token e o começo/fim carregam o sentido.
- `extrairJson(bruto: string)` — Extrai o JSON da resposta do modelo.
- `normalizar(dados: unknown, indice: number, agente: string | null)` — Valida e normaliza o que o modelo devolveu.
- `resumirTrecho(trecho: TrechoFechado, consulta: Consulta = consultaReal)` — Resume um trecho. Nunca lança: qualquer falha (SDK fora, JSON ruim, modelo tagarela) vira `naoDeu: true` e a UI mostra o texto cru — o console não po…

### `servidor/src/jobs/resumo/segmentos.ts` — Rastreador de TRECHOS de agente no servidor (T-039).
- `LinhaLog` *(interface)* — Linha de log como o runner emite.
- `TrechoFechado` *(interface)*
- `RastreadorTrechos` *(classe)* — Acumula linhas e devolve trechos JÁ FECHADOS.

### `servidor/src/jobs/robustez/guardrails.ts` — Guardrails por tipo de ação (T-019): tetos que impedem um fluxo de girar sem fim.
- `ESFORCOS` *(valor)* — Profundidade de raciocínio do fluxo.
- `Esforco` *(tipo)*
- `ehEsforco(valor: unknown)` — Guarda de tipo para o valor que volta do disco.
- `Guardrails` *(interface)*
- `GUARDRAILS_PADRAO` *(valor)* — Teto para quem não tem entrada própria (ação nova nasce protegida, não ilimitada).
- `guardrailsParaAcao(idAcao: string)` — Guardrails efetivos de uma ação (padrão + ajustes da tabela).

### `servidor/src/jobs/robustez/watchdog.ts`
- `OpcoesWatchdog` *(interface)* — Watchdog de inatividade (T-019): vigia jobs Claude em execução e interrompe os que ficam MUDOS por tempo demais — fluxo travado segurando o lock do p…
- `Watchdog` *(classe)*
- `motivoInatividade(limiteMs: number)`

### `servidor/src/jobs/runner-fake.ts`
- `OpcoesRunnerFake` *(interface)*
- `criarRunnerFake(opcoes: OpcoesRunnerFake = {})` — Runner FAKE para testes (o runner Claude real chega na T-008): emite eventos sintéticos `log` com delays e respeita o AbortSignal — cancelamento no m…

### `servidor/src/jobs/tipos.ts` — Modelo de job do painel (T-007).
- `ESTADOS_JOB` *(valor)* — Modelo de job do painel (T-007).
- `EstadoJob` *(tipo)*
- `ESTADOS_TERMINAIS` *(valor)* — Estados finais: o job nunca sai deles.
- `ESTADOS_CANCELAVEIS` *(valor)* — Estados em que um pedido de cancelamento é aceito.
- `EscopoLock` *(tipo)* — Escopo de lock: `global` (exclusivo total) ou `projeto:<nome>` (exclusivo por projeto).
- `TipoPendencia` *(tipo)* — Tipo de pendência de input (T-010): aprovação de ferramenta ou pergunta ao usuário.
- `NovaPendencia` *(interface)* — Descrição de um input necessário (o runner diz o que precisa; textos em PT-BR).
- `RespostaInput` *(interface)* — Resposta do usuário a uma pendência.
- `Pendencia` *(interface)* — Pendência de input exposta pela API e persistida no metadado do job (auditoria).
- `ItemResumoTrecho` *(interface)* — Um item do resumo de trecho: o que foi entregue ou o que merece atenção (T-039).
- `ResumoTrecho` *(interface)* — Resumo de um trecho de agente, gerado por modelo barato (T-039).
- `Job` *(interface)*
- `EventoJob` *(interface)* — Evento interno de job — vai para o EventEmitter do gerenciador (canal único; a T-009 pluga o SSE nele).
- `DadosTransicao` *(interface)* — Transição de estado transportada em `EventoJob.dados` quando `tipo === "estado"`.
- `ContextoExecucao` *(interface)* — O que o gerenciador entrega ao runner durante a execução.
- `Runner` *(interface)* — Runner plugável: executa um job do seu tipo.

### `servidor/src/projetos/importar.ts`
- `PASTAS_IGNORADAS` *(valor)* — Pastas de DEPENDÊNCIA e CACHE que não são copiadas na importação — a fábrica constrói qualquer tipo de projeto, então ignorar só `node_modules` deixa…
- `ErroImportacao` *(classe)* — Erro de importação com status HTTP para a rota mapear (400 validação, 409 conflito).
- `normalizarNome(bruto: string)` — Normaliza um nome livre (pasta ou informado) para kebab-case seguro de diretório.
- `ImportacaoValidada` *(interface)*
- `validarImportacao(caminho: unknown, nomeBruto: unknown, fabricaRaiz: string)` — Valida (síncrono, rápido) a origem e o nome de uma importação.
- `OpcoesImportar` *(interface)*
- `montarJobImportar(v: ImportacaoValidada, fabricaRaiz: string, opcoes: OpcoesImportar)` — Monta o job NÃO-Claude de importação (a análise é enfileirada pelo runner ao fim).
- `executarImportacao(origem: string, destino: string, fabricaRaiz: string, nome: string, ctx: Pick<ContextoExe…)` — Executa a cópia + git + `_gestao/` mínimo.

### `servidor/src/projetos/runner-importar.ts`
- `RunnerImportar` *(classe)*

### `servidor/src/projetos/seletor-pasta.ts`
- `ErroSeletorIndisponivel` *(classe)*
- `ErroSeletorEmUso` *(classe)*
- `OpcoesSeletor` *(interface)*
- `escolherPasta(opcoes: OpcoesSeletor = {})` — Abre o seletor e resolve com o caminho ABSOLUTO escolhido, ou `null` se o usuário cancelou.

### `servidor/src/rotas/acoes-projeto.ts`
- `prefixo` *(valor)* — Ações de agente por projeto (T-033): listagem do catálogo e disparo.
- `router` *(valor)*

### `servidor/src/rotas/acoes.ts`
- `prefixo` *(valor)* — Disparo das ações da fábrica (T-011): POST cria um job "claude" que roda o comando correspondente.
- `router` *(valor)*

### `servidor/src/rotas/ajustes.ts`
- `prefixo` *(valor)* — Ajustes (T-032): estado das contas de que a fábrica depende — Claude (executa) e GitHub (recebe o que é publicado) — mais a configuração efetiva do p…
- `router` *(valor)*

### `servidor/src/rotas/cadastro.ts`
- `prefixo` *(valor)* — Cadastro de projetos pela web (T-013).
- `router` *(valor)*

### `servidor/src/rotas/ci.ts`
- `prefixo` *(valor)* — CI local por projeto (T-017): disparar o pipeline, consultar resultado/histórico e editar `_gestao/ci.json` pela API.
- `router` *(valor)*

### `servidor/src/rotas/equipe.ts`
- `prefixo` *(valor)* — Equipe de especialistas do projeto (T-035): leitura e gravação de `_gestao/equipe.json`.
- `router` *(valor)*

### `servidor/src/rotas/eventos.ts`
- `prefixo` *(valor)* — Stream SSE único de eventos de jobs (T-009).
- `router` *(valor)*

### `servidor/src/rotas/fabrica.ts`
- `prefixo` *(valor)* — (descrições lidas na hora de `.claude/commands/*.md`) + resumo agregado (nº de projetos e tarefas por status).
- `router` *(valor)*

### `servidor/src/rotas/git.ts`
- `prefixo` *(valor)* — Histórico git (T-028): alimenta o grafo de commits do painel.
- `router` *(valor)*

### `servidor/src/rotas/inputs.ts`
- `prefixo` *(valor)* — Inputs pendentes (T-010): quando um fluxo precisa de aprovação de ferramenta ou faz uma pergunta, o job pausa em `aguardando-input` e a pendência apa…
- `router` *(valor)*

### `servidor/src/rotas/jobs.ts`
- `prefixo` *(valor)* — API de consulta e cancelamento de jobs (T-007).
- `router` *(valor)*

### `servidor/src/rotas/projetos.ts`
- `prefixo` *(valor)* — Projetos da fábrica (T-004, somente leitura): lista com resumo por projeto e detalhe completo (tarefas com corpo, plano, decisões, progresso, análise…
- `router` *(valor)*

### `servidor/src/rotas/publicacao.ts`
- `prefixo` *(valor)* — Publicação (T-030): o link do repositório na nuvem e o push, para a fábrica e para cada subprojeto — que são repositórios INDEPENDENTES, cada um com …
- `router` *(valor)*

### `servidor/src/rotas/saude.ts`
- `prefixo` *(valor)* — Healthcheck do painel — também serve de exemplo do contrato { prefixo, router }.
- `router` *(valor)*

### `servidor/testes/jobs/ajudantes.ts`
- `dirTemporario()` — Diretório temporário exclusivo do teste (fora do projeto; descartável).
- `RunnerManual` *(interface)*
- `criarRunnerManual()` — Runner controlado pelo teste: cada execução fica pendurada até o teste chamar `concluir`/`falhar` — locks de concorrência viram assertivas determinís…
- `aguardarEstado(gerenciador: GerenciadorJobs, jobId: string, estado: EstadoJob, timeoutMs = 2000)` — Espera (via emissor) o job alcançar o estado; resolve na hora se já está nele.

### `web/src/App.tsx`
- `App()`

### `web/src/componentes/Documento.tsx`
- `Documento({ texto }: { texto: string })` — Documento de gestão (ANALISE/DECISOES/PROGRESSO) apresentado por ENTRADAS.

### `web/src/componentes/Estados.tsx` — Blocos reutilizáveis de carregamento, erro e vazio.
- `Carregando({ texto = "Carregando…" }: { texto?: string })` — Blocos reutilizáveis de carregamento, erro e vazio.
- `MensagemErro({ erro, dica }: { erro: string; dica?: string })`
- `Vazio({ texto }: { texto: string })`

### `web/src/componentes/ExplicaAcao.tsx`
- `ExplicaAcao({ acao, custoReal, custoEstimado, }: { acao: AcaoProjetoCatalogo; /** Custo da última exe…)` — "O que isso faz?" — o toggle ao lado do botão (T-040).
- `SeloEscrita({ acao }: { acao: AcaoProjetoCatalogo })` — Selo curto ao lado do título: separa ação que ALTERA de ação que só lê.

### `web/src/componentes/GrafoGit.tsx`
- `GrafoGit(…)`

### `web/src/componentes/Indicadores.tsx` — Indicadores visuais compartilhados: chip de status, badge de marco e resumo.
- `ChipStatus({ status }: { status: string })` — Bolinha colorida + rótulo do status de uma tarefa.
- `BadgeMarco({ marco }: { marco: MarcoFase })` — Estado do marco de uma fase (pendente/aprovado/reprovado) com data, se houver.
- `ResumoStatus({ contagem, mostrarZeros = false, }: { contagem: ContagemPorStatus; mostrarZeros?: boolea…)` — Fileira de blocos com a contagem de tarefas por status.

### `web/src/componentes/Markdown.tsx`
- `Markdown({ texto }: { texto: string })` — Renderiza os documentos da fábrica (ANALISE/DECISOES/PROGRESSO, seções de tarefa) como conteúdo formatado, em vez de despejar markdown cru numa `<pre…
- `Blocos({ blocos }: { blocos: Bloco[] })` — Renderiza blocos já parseados — usado por `Documento`, que fatia o texto por seção.

### `web/src/componentes/PainelCommit.tsx`
- `PainelCommit({ repo, aoCommitar, }: { repo: string; /** Chamado depois de um commit bem-sucedido, para…)` — Commitar pelo painel (T-029), reusável (T-030).

### `web/src/componentes/PublicacaoRepo.tsx`
- `PublicacaoRepo({ repo, aoMudar, }: { repo: RepoResumo; aoMudar: () => void; })` — Publicação de UM repositório (T-030/T-031): endereço na nuvem, conferência de segurança e push.

### `web/src/componentes/TextoLongo.tsx`
- `TextoLongo({ texto, limiteLinhas = 14 }: { texto: string; limiteLinhas?: number })` — Documento longo (ANALISE/DECISOES/PROGRESSO) com colapso (T-026).

### `web/src/lib/api.ts` — Erro lançado quando a API responde com status fora da faixa 2xx.
- `ErroApi` *(classe)* — Erro lançado quando a API responde com status fora da faixa 2xx.
- `api(caminho: string, init?: RequestInit)` — Helper genérico de fetch para a API do painel.

### `web/src/lib/atividade.ts`
- `AtividadeAgente` *(interface)*
- `agenteAtivo(linhas: readonly LinhaLog[])` — Id do agente do despacho mais recente, ou null se nenhum despacho no log.
- `atividadePorAgente(linhas: readonly LinhaLog[])` — Quantas vezes cada agente foi despachado, do mais recente para o mais antigo.
- `EtapaPipeline` *(tipo)* — Etapa do pipeline da fábrica, deduzida de QUEM está trabalhando.
- `etapaDoAgente(agente: string | null)` — Testador e revisor são fixos; qualquer outro agente é um construtor.
- `SegmentoAgente` *(interface)*
- `segmentarPorAgente(linhas: readonly LinhaLog[])` — Agrupa o log em TRECHOS POR AGENTE (T-024): cada despacho `Agent → X` abre um trecho, e tudo que vem depois pertence a ele até o próximo despacho.
- `segmentarPorEstagio(linhas: readonly LinhaLog[])` — Segmenta o log de um job de CI por ESTÁGIO (T-026).
- `tarefaEmFoco(linhas: readonly LinhaLog[])` — Última tarefa (T-NNN) citada no log — o orquestrador cita o id ao despachar.
- `TETO_PARALELO` *(valor)* — Teto de construtores em paralelo no mesmo projeto (regra de ouro do CLAUDE.md raiz).
- `NivelExecucao` *(interface)*
- `GrafoExecucao` *(interface)*
- `montarGrafoExecucao(tarefas: readonly TarefaCompleta[])` — Monta a ordem de execução a partir das `dependencias` (T-025).
- `FaseComProgresso` *(interface)* — --------------------------------- Plano ---------------------------------
- `MapaPlano` *(interface)*
- `montarMapaPlano(plano: Plano | null, tarefas: readonly TarefaCompleta[])` — Cruza o PLANO.md (fases → ids de tarefa) com as tarefas reais, produzindo progresso por fase.

### `web/src/lib/avisos-job.ts` — Aviso de trabalho possivelmente ABANDONADO por um job que terminou "bem" (T-048).
- `ResultadoComDespachos` *(interface)* — Trecho de `job.resultado` que interessa para estes avisos.
- `avisoDespachoFundo(resultado: ResultadoComDespachos | null | undefined)` — Texto do aviso quando o fluxo despachou agente sem pedir execução bloqueante, ou `null` quando não despachou (o caso normal).
- `avisoDespachoEmVoo(resultado: ResultadoComDespachos | null | undefined)` — Aviso de trabalho COMPROVADAMENTE abandonado: agentes que não devolveram resultado até a sessão fechar.

### `web/src/lib/custo.ts`
- `CustoJob` *(interface)* — Leitura de custo de um job (T-049) — o ÚNICO ponto da UI que decide o que é "o custo".
- `custoDoJob(job: Job)` — Custo de um job, real ou estimado.
- `TotalCusto` *(interface)*
- `somarCusto(jobs: Job[])` — Soma o custo de uma lista de jobs preservando o que se sabe sobre a qualidade do número.
- `formatarCusto(c: CustoJob | TotalCusto, casas = 4)` — Formata um custo com o prefixo que declara a sua qualidade: `$1,2345` valor real do SDK `~$1,2345` estimado pela tabela de preços (erro médio medido:…
- `FatiaAgente` *(interface)* — Rateio do custo do job entre os agentes (T-050), ordenado do mais caro para o mais barato.
- `ratearPorAgente(job: Job)`
- `explicarCusto(c: CustoJob | TotalCusto)` — Texto de ajuda (title) coerente com o prefixo — o "~" sozinho não se explica.

### `web/src/lib/documento.ts`
- `EntradaDoc` *(interface)* — Quebra um documento de gestão (`ANALISE.md`, `DECISOES.md`, `PROGRESSO.md`) nas seções de que ele é feito, para a tela mostrar ENTRADAS em vez de um …
- `DocEstruturado` *(interface)*
- `estruturarDocumento(texto: string)` — Estrutura o documento.

### `web/src/lib/formato.ts` — Rótulos e ordenação em PT-BR para os vocabulários da fábrica.
- `ORDEM_STATUS` *(valor)* — Ordem canônica do pipeline (usada nas colunas do kanban e nos resumos).
- `ROTULO_STATUS` *(valor)*
- `ROTULO_PRIORIDADE` *(valor)*
- `classeStatus(status: string)` — Classe CSS de cor por status (ex.: "em-execucao" → "st-em-execucao").
- `classePrioridade(prioridade: string)` — Classe CSS de cor por prioridade; desconhecida cai em "media".
- `rotuloStatus(status: string)`
- `rotuloPrioridade(prioridade: string)`
- `rotuloMarco(estado: string)`
- `classeMarco(estado: string)`
- `ROTULO_ESTADO_JOB` *(valor)*
- `rotuloEstadoJob(estado: string)`
- `classeEstadoJob(estado: string)`
- `ESTADOS_JOB_ATIVOS` *(valor)* — Estados não-terminais: job ainda ocupa o lock do escopo dele (T-016 usa para "job ativo").
- `jobCancelavel(estado: string)`
- `ESTADOS_JOB_TERMINAIS` *(valor)*
- `duracaoLegivel(ms: number)` — Duração legível a partir de milissegundos.
- `decorrido(inicioIso: string | undefined, fimMs: number)` — Tempo decorrido entre duas marcas ISO (ou até `agora`).
- `ROTULO_PESO` *(valor)* — ----------------------------- Peso e custo -----------------------------
- `rotuloPeso(peso: string)`
- `Estimativa` *(interface)*
- `estimarCusto(peso: string, custoModelo: string)` — Estimativa qualitativa de custo = peso da ação + tier de custo do modelo.
- `milhares(n: number)` — Milhares abreviados para leitura de relance: 250900 → "250,9k" (T-044).
- `textoEstrategia(estrategia: { descricao: string; reforco: string | null; })` — Texto de ajuda da estratégia de modelo: a descrição dela mais o modelo de RETRABALHO, quando existe.

### `web/src/lib/gestao.ts`
- `SituacaoDependencia` *(interface)* — Situação de UMA tarefa em relação às suas dependências.
- `MapaDependencias` *(tipo)*
- `mapaDependencias(tarefas: TarefaCompleta[])` — Cruza a lista de tarefas e devolve a situação de cada uma, indexada por id.
- `tarefasBloqueadas(tarefas: TarefaCompleta[])` — Tarefas `bloqueada`, que são as que exigem decisão humana.
- `tarefasPromoviveis(tarefas: TarefaCompleta[], mapa: MapaDependencias)` — Tarefas que já podem sair do backlog.
- `jobsDoProjeto(jobs: Job[], projeto: string)` — Jobs deste projeto, mais recentes primeiro.
- `ultimoCustoDaAcao(jobs: Job[], projeto: string, rotulo: string)` — Custo REAL da última execução de uma ação neste projeto, ou null se nunca rodou aqui (T-040).
- `custosPorAcao(jobs: Job[], projeto: string)` — Custo da última execução de CADA ação, numa passada só (T-042).
- `temJobAtivo(jobs: Job[], projeto: string)` — Há algum job deste projeto ainda em andamento?

### `web/src/lib/grafo-git.ts`
- `Aresta` *(interface)* — Layout do grafo de commits (T-028) — o algoritmo por trás do desenho estilo Git Graph.
- `NoGrafo` *(interface)*
- `Grafo` *(interface)*
- `montarGrafo(commits: readonly CommitGit[])`

### `web/src/lib/limite-uso.ts` — Aviso de cota da assinatura (T-045).
- `ResultadoComMotivo` *(interface)* — Trecho de `job.resultado` que interessa para o aviso.
- `avisoLimiteDeUso(resultado: ResultadoComMotivo | null | undefined)` — Texto do aviso quando o job parou por cota, ou `null` quando não foi o caso (e aí o campo "Erro" normal é que deve aparecer).

### `web/src/lib/markdown.ts` — Parser de Markdown mínimo (T-026) — converte o texto dos documentos da fábrica (`ANALISE.md`, `DECISOES.md`, `PROGRESSO.md`, seções das tarefas) numa…
- `Inline` *(tipo)* — Parser de Markdown mínimo (T-026) — converte o texto dos documentos da fábrica (`ANALISE.md`, `DECISOES.md`, `PROGRESSO.md`, seções das tarefas) numa…
- `ItemLista` *(interface)* — Item de lista, com a sublista que estiver pendurada nele.
- `BlocoLista` *(interface)*
- `ParDefinicao` *(interface)* — Um `**Rótulo:** valor` — o formato das entradas de DECISOES.md e PROGRESSO.md.
- `BlocoDefinicao` *(interface)*
- `Bloco` *(tipo)*
- `parseInline(texto: string)` — Quebra uma linha em pedaços (texto/negrito/código/link/ênfase).
- `textoPuro(conteudo: Inline[])` — Texto sem marcação — para prévias e para casar título com data.
- `parseMarkdown(texto: string)` — Converte o texto inteiro em blocos.

### `web/src/lib/tipos.ts` — Tipos do frontend que espelham o contrato da API de leitura (T-004), definido no servidor em `servidor/src/fabrica/tipos.ts` e `servidor/src/fabrica/…
- `STATUS_TAREFA` *(valor)* — Tipos do frontend que espelham o contrato da API de leitura (T-004), definido no servidor em `servidor/src/fabrica/tipos.ts` e `servidor/src/fabrica/…
- `StatusTarefa` *(tipo)*
- `ContagemPorStatus` *(tipo)*
- `PesoAcao` *(tipo)*
- `TierCusto` *(tipo)*
- `EstrategiaModelo` *(interface)*
- `AcaoFabrica` *(interface)*
- `GrupoAcaoProjeto` *(tipo)* — Ação de agente por projeto (T-033) — espelha `AcaoProjeto` do servidor.
- `AcaoProjetoCatalogo` *(interface)*
- `RespostaAcoesProjeto` *(interface)*
- `MarcoFase` *(interface)*
- `FaseAtual` *(interface)*
- `FasePlano` *(interface)*
- `Plano` *(interface)*
- `SecoesTarefa` *(interface)*
- `TarefaCompleta` *(interface)*
- `AgenteEspecialista` *(interface)*
- `EquipeProjeto` *(interface)*
- `ProjetoResumo` *(interface)*
- `PecaAnalise` *(interface)* — Peça principal do projeto, na análise estruturada (T-041).
- `PontoAtencao` *(interface)*
- `AnaliseEstruturada` *(interface)* — Análise em forma estruturada — espelha o servidor; a tela desenha a partir disto.
- `ProjetoDetalhe` *(interface)*
- `RespostaFabrica` *(interface)* — GET /api/fabrica
- `RespostaProjetos` *(interface)* — GET /api/projetos
- `ESTADOS_JOB` *(valor)* — ----------------------------- Jobs e eventos -----------------------------
- `EstadoJob` *(tipo)*
- `ItemResumoTrecho` *(interface)* — Item do resumo de um trecho (T-039) — espelha o servidor.
- `ResumoTrecho` *(interface)* — Resumo de um trecho de agente, gerado por modelo barato no servidor (T-039).
- `Job` *(interface)*
- `RespostaJobs` *(interface)* — GET /api/jobs
- `Pendencia` *(interface)* — Pendência de input (T-010): o fluxo pausou esperando aprovação ou uma resposta.
- `RespostaInputs` *(interface)* — GET /api/inputs
- `RespostaAcao` *(interface)* — POST /api/acoes/:id
- `EventoJob` *(interface)* — Evento que chega pelo SSE (`GET /api/eventos`, event: "job").
- `LinhaLog` *(interface)* — Linha de log acumulada por job na UI.
- `ESTAGIOS_CI` *(valor)* — ----------------------------------- CI/CD (T-017/T-018) -----------------------------------
- `EstagioCi` *(tipo)*
- `ConfigEstagioCi` *(interface)*
- `ConfigCi` *(interface)*
- `EstadoEstagioCi` *(tipo)*
- `EstadoResultadoCi` *(tipo)*
- `ResultadoEstagio` *(interface)*
- `ResultadoCi` *(interface)*
- `RespostaCi` *(interface)* — GET /api/ci/:projeto
- `RespostaConfigCi` *(interface)* — GET/PUT /api/ci/:projeto/config
- `EstagioCiAoVivo` *(interface)* — Estágio ao vivo (T-018): estado derivado dos eventos SSE `ci-estagio-inicio`/`ci-estagio` ENQUANTO o job ainda está rodando — junta com `ResultadoEst…
- `CommitGit` *(interface)* — ------------------------------ Git (T-028) ------------------------------
- `HistoricoGit` *(interface)* — GET /api/git/:projeto (use `_fabrica` para o repositório da raiz).
- `ArquivoAlterado` *(interface)*
- `DetalheCommit` *(interface)* — GET /api/git/:projeto/commit/:hash — o "resumão" de um commit.
- `AlteracaoPendente` *(interface)*
- `AlteracoesPendentes` *(interface)* — GET /api/git/:projeto/alteracoes.
- `RepoResumo` *(interface)* — Um repositório da fábrica: a raiz (`_fabrica`) ou um subprojeto.
- `ListaRepos` *(interface)* — GET /api/repos
- `ResultadoPush` *(interface)* — POST /api/repos/:id/push
- `AchadoSeguranca` *(interface)* — ---------- Conferência de segurança pré-publicação (T-031) ----------
- `RelatorioSeguranca` *(interface)*
- `ContaGitHub` *(interface)* — ---------- Ajustes e contas (T-032) ----------
- `ContaClaude` *(interface)*
- `AjustesPainel` *(interface)*
- `Ajustes` *(interface)*
- `TokensJob` *(interface)* — Consumo de tokens de um job (T-044).
- `UsoAgente` *(interface)* — Consumo de um agente do pipeline dentro de um job.
- `ResultadoContabil` *(interface)* — Contabilidade de um job, como o servidor a grava em `job.resultado` (T-049).

### `web/src/lib/useAgora.ts`
- `useAgora(ativo: boolean, intervaloMs = 1000)` — Relógio que avança de segundo em segundo — é o que faz o tempo decorrido de uma execução ANDAR na tela, em vez de congelar no valor do último evento …

### `web/src/lib/useDados.ts`
- `buscarDeduplicado(caminho: string)` — Exportada só para teste: as duas propriedades que importam aqui (uma requisição para chamadas simultâneas; nenhum cache depois que resolve) não dão p…
- `useDados(caminho: string)` — Hook de leitura da API: dispara um GET em `caminho`, expõe carregando/dados/erro e cancela atualização de estado se o componente desmontar (evita war…

### `web/src/lib/useHistoricoLog.ts`
- `HistoricoLog` *(interface)* — Log de um job que a sessão atual do navegador NÃO acompanhou (T-048).
- `useHistoricoLog(jobId: string | null, linhasAoVivo: LinhaLog[])`

### `web/src/lib/useJobsAoVivo.ts`
- `EstadoAoVivo` *(interface)*
- `useJobsAoVivo()` — Assina o canal de jobs ao vivo: lista viva, log por job, pendências e estágios de CI.

### `web/src/paginas/ajustes/Ajustes.tsx`
- `Ajustes()` — Ajustes (T-032): estado das duas contas de que a fábrica depende — Claude, que EXECUTA os fluxos, e GitHub, que RECEBE o que é publicado.

### `web/src/paginas/como-funciona/ComoFunciona.tsx`
- `ComoFunciona()` — "Como funciona" (T-023): o modelo mental da fábrica em diagrama.

### `web/src/paginas/git/Git.tsx`
- `Git()` — Aba Git (T-030/T-031): os repositórios da fábrica num lugar só.
- `EstadoPublicacao({ repo }: { repo: RepoResumo })` — O selo que responde "falta publicar alguma coisa?" sem precisar abrir nada.

### `web/src/paginas/inicio/Inicio.tsx`
- `Inicio()`

### `web/src/paginas/jobs/Jobs.tsx`
- `Jobs()` — Página de Jobs (T-024): acompanhar a execução VENDO, não lendo.

### `web/src/paginas/projeto/AcoesProjeto.tsx`
- `jobAtivoDoProjeto(jobs: Job[], projeto: string)` — Job ativo (não-terminal) com lock neste projeto; null se nenhum.
- `AcoesProjeto({ projeto, jobAtivo, }: { projeto: ProjetoDetalhe; jobAtivo: Job | null; })`

### `web/src/paginas/projeto/ci/PainelCi.tsx`
- `SecaoCi({ projeto, jobAtivo, aoVivo, }: { projeto: string; /** Job ativo do projeto (T-016) — usa…)`

### `web/src/paginas/projeto/EquipeAoVivo.tsx`
- `EquipeAoVivo({ equipe, tarefas, logs, jobAtivo, }: { equipe: EquipeProjeto; tarefas: TarefaCompleta[];…)`

### `web/src/paginas/projeto/EspecialistasProjeto.tsx`
- `EspecialistasProjeto({ projeto, jobAtivo, jobs, }: { projeto: string; jobAtivo: Job | null; /** Histórico — de…)` — Chamar UM especialista para UM projeto (T-033).
- `AcoesDoGrupo({ grupo, projeto, jobAtivo, jobs = [], }: { grupo: AcaoProjetoCatalogo["grupo"]; projeto:…)` — Só os cards de um grupo, sem moldura de seção — para quem quer embutir as ações dentro de outra seção (a de Equipe usa isto para pôr "Recriar equipe"…

### `web/src/paginas/projeto/MapaPlano.tsx`
- `MapaPlano({ plano, tarefas, aoSelecionar, }: { plano: Plano | null; tarefas: TarefaCompleta[]; /** …)` — Mapa visual do planejamento (T-023): as fases do PLANO.md com progresso real, e cada tarefa como um bloco colorido pelo status — para ver o plano int…

### `web/src/paginas/projeto/PainelAnalise.tsx`
- `PainelAnalise({ analise }: { analise: AnaliseEstruturada })` — Análise do projeto em painel visual (T-041).

### `web/src/paginas/projeto/Projeto.tsx`
- `Projeto()`

### `web/src/paginas/projeto/proximo-passo.ts`
- `AcaoSugerida` *(tipo)* — "Próximo passo sugerido" (T-022): olha o estado real do projeto e diz, em uma frase, o que fazer agora.
- `PassoSugerido` *(interface)*
- `proximoPasso(projeto: ProjetoDetalhe, jobAtivo: Job | null)`

### `web/src/paginas/projeto/SecaoEquipe.tsx`
- `SecaoEquipe({ projeto, equipe, jobAtivo, aoGravar, }: { projeto: string; equipe: EquipeProjeto; jobAt…)`

### `web/src/paginas/projeto/SecaoGestao.tsx`
- `SecaoGestao({ projeto, tarefas, jobs, aoSelecionar, }: { projeto: string; tarefas: TarefaCompleta[]; …)` — Gestão do projeto (T-036): o que está travado, o que destrava o quê, e o que já rodou AQUI.

## Limites deste mapa

- Extração por padrão de linha, não por AST: declaração exportada em forma incomum
  pode não aparecer aqui. Se algo que você espera não está listado, o arquivo existe
  na árvore acima — abra e leia.
- Só símbolos de TOPO e públicos. Função interna, helper e detalhe de implementação
  ficam de fora de propósito: eles são o que você lê no arquivo quando for mexer nele.
- Descrição é a primeira frase da documentação do símbolo. O resto (parâmetros,
  casos de borda, contratos) está no arquivo.
