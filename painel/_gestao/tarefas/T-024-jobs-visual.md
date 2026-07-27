---
id: T-024
titulo: Página de Jobs visual — linha do tempo da execução, agente atual e progresso
projeto: painel-fabrica
status: pronta
prioridade: alta
dependencias: [T-023]
areas: [web/src/paginas/jobs/]
tentativas: 0
criada: 2026-07-27
atualizada: 2026-07-27
---

## Objetivo
Transformar a página de Jobs de um LOG CRU numa visualização de execução: ver, sem ler
texto, qual agente está trabalhando, em que tarefa, em que etapa do pipeline e o que já
foi feito.

## Contexto
**Erro de alvo da T-023, reconhecido pelo usuário.** O pedido original era "detalhe dos
jobs e o que está fazendo, assim como cada agente". A T-023 entregou a visualização de
agentes na PÁGINA DO PROJETO — que é justamente onde ninguém fica durante uma execução.
A página de Jobs, o lugar onde se acompanha o trabalho acontecendo, continuou uma parede
de texto monoespaçado com prefixos (`▶ ◆ ↳ ⚙ ■`). Reação do usuário: *"está uma merda e
nem dá pra ver diferença nenhuma"*.

O que JÁ existe e pode ser reaproveitado:
- `useJobsAoVivo` entrega `jobs`, `logs` (por jobId), `estagiosCi`, `pendencias`.
- `lib/atividade.ts` já parseia despacho de agente do log (`Agent → domain`) — é a base
  para agrupar por agente; hoje é usado só pela página do projeto.
- O runner emite `nivel`: `inicio` | `assistente` | `subagente` | `ferramenta` |
  `resultado` | `erro`, e o evento `result` traz custo e nº de turnos.

## Critérios de aceite
- [ ] **Cabeçalho ao vivo** do job selecionado: agente trabalhando AGORA (destacado),
      há quanto tempo o job roda, turnos e custo acumulado quando disponíveis.
- [ ] **Trilha do pipeline**: faixa mostrando construtor → testador → revisor, com a
      etapa atual destacada e as já cumpridas marcadas — dá para saber em que ponto do
      ciclo a tarefa está sem ler uma linha de log.
- [ ] **Linha do tempo agrupada por agente**: cada despacho vira um bloco que agrupa o
      que aquele agente fez (ferramentas usadas, texto produzido), com duração. Blocos
      colapsáveis; o do agente ativo abre por padrão.
- [ ] **Tarefa em foco**: quando o log mencionar `T-NNN`, mostrar qual tarefa está sendo
      trabalhada (o orquestrador cita o id ao despachar).
- [ ] O **log cru continua acessível**, atrás de um "ver log técnico" — não remover, só
      deixar de ser a visão principal.
- [ ] Lista de jobs à esquerda mostra progresso/estado visual, não só um badge de texto.
- [ ] Funciona com job já terminado (histórico), não só ao vivo.
- [ ] Lógica de agrupamento em função PURA e testada (`lib/`), como em `atividade.ts`.

## Contexto técnico / armadilhas
- **O log NÃO sobrevive à sessão**: `dados/` guarda metadados do job, não o stdout. Um
  job antigo reaberto vem sem linhas. A tela precisa lidar com isso honestamente ("log
  desta execução não está mais em memória") em vez de parecer vazia/quebrada.
- O buffer de replay do hub SSE é ~500 eventos: execução longa perde o começo.
- Não abrir uma segunda conexão SSE (decisão de canal único, DECISOES.md 2026-07-21).
- Verificar no navegador de verdade antes de dar por pronta — a T-023 foi entregue sem
  ninguém ver a tela, e é parte do motivo deste retrabalho.

## Notas de execução


## Verificação


## Revisão
