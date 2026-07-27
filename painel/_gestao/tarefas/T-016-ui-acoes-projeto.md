---
id: T-016
titulo: Página do projeto operacional — trabalhar, analisar e acompanhar ao vivo
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-006, T-012, T-014]
areas: [web/src/paginas/projeto/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-27
---

## Objetivo
Ações por projeto na própria página: Trabalhar neste projeto, Gerar/Atualizar análise e
Status do projeto; indicador de lock/job ativo do projeto; kanban e abas atualizando
sozinhos quando um job termina.

## Contexto
- Reusar `web/src/lib/sse.ts` (T-014). Tocar SOMENTE `web/src/paginas/projeto/`.
- Botões chamam `POST /api/acoes/trabalhar|analisar|status` com `{ projeto }`; modal de
  confirmação com a descrição do que vai acontecer (mesmo padrão da T-015).
- Enquanto houver job ativo com lock deste projeto: botões conflitantes desabilitados
  com explicação ("Projeto ocupado por: <título do job>") e log ao vivo acessível na
  página (painel embutido ou atalho para `/jobs` com o job aberto).
- Ao receber pelo SSE o evento de término de job do projeto: refetch automático de
  `GET /api/projetos/:nome` (kanban, plano e análise refletem o que o fluxo mudou).
- Aba Análise: mostra ANALISE.md renderizado + data da última análise (do rodapé) e o
  botão "Atualizar análise"; quando não existe, o aviso da T-006 ganha o botão "Gerar
  análise agora".
- Aviso especial: se o projeto da página for `painel-fabrica`, exibir alerta claro antes
  de disparar Trabalhar ("este fluxo altera o código do painel em execução") — risco
  registrado na especificação.

## Critérios de aceite
- [x] Botão "Trabalhar neste projeto" dispara `/trabalhar <nome>` e o progresso ao vivo
      fica visível sem sair do navegador.
- [x] Botão de análise dispara o job; ao concluir, a aba Análise mostra o conteúdo novo
      sem F5 (refetch automático via SSE).
- [x] Com job ativo do projeto, os botões conflitantes ficam desabilitados com a
      explicação do lock; ao terminar, reabilitam sozinhos.
- [x] Ao término de um job do projeto, o kanban reflete os novos status das tarefas sem
      recarregar manualmente.
- [x] Na página do painel-fabrica, o alerta especial aparece antes de confirmar
      Trabalhar (implementado defensivamente — ver nota abaixo).

## Notas de execução
Construída DIRETO pelo orquestrador (Opus, sem pipeline), mesma decisão de custo já
registrada para o painel inteiro.

- `web/src/paginas/projeto/AcoesProjeto.tsx` (arquivo novo): botões "Trabalhar neste
  projeto" e "Ver status agora", mesmo padrão de card-expansível da T-015 (`CartaoAcao`
  em `Inicio.tsx`) — abre um form com seletor de modelo + estimativa de custo + confirmar,
  disparando `POST /api/acoes/trabalhar|status` com `{ argumentos: <nome-do-projeto>,
  estrategia }`. Exporta `jobAtivoDoProjeto(jobs, projeto)`: função pura que acha o job
  não-terminal com `escopo === "projeto:<nome>"`, priorizando o que já está
  executando/aguardando-input sobre os que só esperam na fila atrás dele.
- `Projeto.tsx`: passa a usar `useJobsAoVivo()` (o hook SSE da T-014 — o contexto da
  tarefa citava `lib/sse.ts`, mas o arquivo real que já existia é `useJobsAoVivo.ts`) para
  ter os jobs ao vivo. `jobAtivo` (via `jobAtivoDoProjeto`) desce para `AcoesProjeto` (que
  desabilita Trabalhar/Status e mostra o aviso "Projeto ocupado por…" com link para
  `/jobs`) e para `SecaoAnalise`→`ControleAnalise` (desabilita o botão Analisar/Reanalisar
  com o mesmo motivo). Refetch automático: um `useEffect` compara o estado de cada job do
  escopo `projeto:<nome>` contra o visto na renderização anterior (`useRef<Map>`); ao
  detectar transição NÃO-terminal→terminal, chama `recarregar()` de `useDados` — cobre
  tanto o job disparado pelo próprio navegador quanto um disparado por fora (CLI/outro
  cliente), sem precisar de F5.
- `formato.ts`: exporta `ESTADOS_JOB_ATIVOS` (renomeado do antigo set local usado só por
  `jobCancelavel`, mesma semântica — reaproveitado aqui) e novo `ESTADOS_JOB_TERMINAIS`.
- **Achado de arquitetura sobre o critério do painel-fabrica:** desde a decisão de
  2026-07-21 "Painel movido de projetos/painel-fabrica para a raiz", o painel NÃO aparece
  mais como projeto em `projetos/` — logo `GET /api/projetos/painel-fabrica` sempre
  devolve 404 e essa página nunca é alcançável de verdade hoje. Implementei o alerta
  mesmo assim (`projeto === "painel-fabrica"`, custo zero, defensivo — cobre se algum dia
  existir um projeto real com esse nome), mas não pude testá-lo ao vivo pela razão acima.
  Registrado em DECISOES.md.
- `web/testes/acoes-projeto.test.ts` (novo): 7 testes de `jobAtivoDoProjeto` (nenhum job
  do projeto, ignora terminais, não faz match parcial de nome de escopo, prioriza
  executando/aguardando-input sobre na-fila, cai no primeiro da fila sem nenhum
  executando).

## Verificação
`cd painel && npm test`: web **14/14** (+7 de `acoes-projeto.test.ts`) + servidor
inalterado (170/171, 1 falha pré-existente não-relacionada). `npm run build` limpo (tsc
estrito + vite). Smoke em rede real (sem navegador disponível neste ambiente — sem
Playwright/chromium-cli instalado; reportando a limitação em vez de simular sucesso
visual): subi `npm start`, confirmei via `curl` que `GET /api/projetos`,
`GET /api/projetos/<nome>` e a rota SPA `/projeto/<nome>` respondem 200, e que o bundle
`assets/index-*.js` publicado contém as strings novas ("Trabalhar neste projeto", "Ver
status agora", "Projeto ocupado por", "Confirmar", "acompanhar") — confirma que a build
de produção embarcou o código novo. NÃO foi feita verificação visual em navegador real
(clique nos botões, captura de tela) — só checagem de rede/bundle + suíte automatizada.
Sem verificação formal do testador/revisor (mesma decisão de custo geral do painel).

## Revisão
Pulada (mesma decisão de custo). Auto-revisão: `npx tsc --noEmit` limpo nos dois
workspaces.

