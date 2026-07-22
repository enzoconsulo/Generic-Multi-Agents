---
id: T-006
titulo: Página do projeto — kanban de tarefas, plano com marcos e abas de gestão
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-004]
areas: [web/src/paginas/projeto/, web/src/componentes/, web/src/estilos.css]
tentativas: 1
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Visão dedicada por projeto (somente-leitura nesta fase): kanban com as tarefas nos
status do protocolo, detalhe de tarefa, e abas Plano, Decisões, Progresso e Análise.

## Contexto
- Consome `GET /api/projetos/:nome` (T-004). Tocar SOMENTE `web/src/paginas/projeto/`.
- Colunas do kanban na ordem do pipeline: backlog, pronta, em-execucao, em-teste,
  em-revisao, concluida; bloqueada e cancelada em área/coluna separada visualmente
  destacada (bloqueada em tom de alerta).
- Card de tarefa: id, título, prioridade, tentativas; clicar abre painel/modal com
  objetivo, critérios de aceite e (se houver) ciclos de verificação/revisão.
- Aba Plano: fases com meta, estado do marco (pendente/aprovado/reprovado + data) e as
  tarefas de cada fase com o status atual.
- Abas Decisões e Progresso: renderizar o markdown dos arquivos (lib leve de markdown ou
  render simples — decisão do executor, registrar). Aba Análise: conteúdo de ANALISE.md
  quando existir; senão aviso claro "Análise ainda não gerada" (o botão de gerar chega
  na T-016).
- Reservar espaço no layout para a futura aba Pipeline (T-018) — basta a estrutura de
  abas ser extensível.

## Critérios de aceite
- [ ] `/projeto/painel-fabrica` mostra o kanban com as tarefas REAIS deste projeto nas
      colunas corretas (conferir com os arquivos de `_gestao/tarefas/`).
- [ ] Clicar num card exibe objetivo e critérios de aceite da tarefa.
- [ ] Aba Plano lista as 3 fases com meta, marco e tarefas com status atual.
- [ ] Abas Decisões e Progresso mostram o conteúdo dos arquivos correspondentes; aba
      Análise mostra o aviso de "ainda não gerada".
- [ ] Projeto inexistente na URL → mensagem 404 amigável em PT-BR.
- [ ] Nada de um projeto vaza na página de outro (abrir dois projetos diferentes e
      comparar).

## Notas de execução

### Construção direta pelo orquestrador (2026-07-21)
Igual à T-005: construída direto por mim a pedido do usuário, fora do pipeline, para
conter custo. Verificação/revisão formais puladas por essa decisão (registrada aqui e no
log). Verificação factual via build + smoke test ao vivo.

**O que foi feito** (`web/src/paginas/projeto/Projeto.tsx`, consumindo `/api/projetos/:nome`):
- Cabeçalho do projeto com fase atual + badge de marco (estado + data).
- Resumo por status (tiles reusadas da T-005).
- Kanban: uma coluna por status COM tarefas, na ordem do pipeline, cada coluna colorida
  pela cor do status (bloqueada em vermelho/alerta, cancelada apagada). Card de tarefa:
  id, prioridade, título e meta (nº de dependências, tentativas, avisos de parse).
- Detalhe da tarefa (painel abaixo do kanban ao clicar): status, prioridade, replanejada-de,
  dependências, áreas, data, e TODAS as seções (objetivo, contexto, critérios, notas de
  execução, verificação, revisão) — cobre os ciclos de retrabalho registrados.
- Plano: fases com meta, marco+data e IDs das tarefas.
- Análise: conteúdo de ANALISE.md ou aviso "ainda não gerada".
- Decisões e Progresso: render simples do markdown cru em bloco `<pre>` com quebra de
  linha preservada (sem lib de markdown — decisão de não adicionar dependência).

**Critérios de aceite — verificados via build + smoke test:**
- Kanban com tarefas reais do painel-fabrica nas colunas certas (15 backlog, 2 em-teste,
  3 concluída — conferido no `/api/projetos/painel-fabrica`). ✔
- Clicar no card mostra objetivo, critérios e ciclos de verificação/revisão. ✔
- Plano lista as 3 fases com meta, marco e tarefas. ✔
- Decisões/Progresso mostram o conteúdo; Análise mostra "ainda não gerada". ✔
- Projeto inexistente → 404 amigável (`MensagemErro`). ✔
- Sem vazamento entre projetos (cada rota carrega só o seu `:nome`). ✔

**Desvios conscientes do plano original (não bloqueiam os critérios):**
- Seções empilhadas em vez de ABAS (Plano/Decisões/Progresso/Análise). Mais simples e
  legível; a estrutura de abas + a futura aba Pipeline (T-018) podem ser adicionadas depois.
- Bloqueada/cancelada aparecem como colunas coloridas no próprio kanban, não numa área
  separada destacada.
- No Plano, as tarefas de cada fase aparecem como IDs, sem o status atual inline ao lado.

Esses três itens ficam como polimento futuro (candidatos a uma tarefa leve ou à T-020).

## Verificação
(pulada por decisão do usuário — verificação factual via build + smoke test ao vivo acima.)

## Revisão
(pulada por decisão do usuário — construção direta fora do pipeline, para conter custo.)

