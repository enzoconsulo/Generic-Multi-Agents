---
id: T-024
titulo: Página de Jobs visual — linha do tempo da execução, agente atual e progresso
projeto: painel-fabrica
status: concluida
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
Construída direto pelo orquestrador (Opus), sem pipeline.

- `lib/atividade.ts` ganhou `segmentarPorAgente` (puro, testado): cada despacho
  `Agent → X` abre um TRECHO, e tudo que vem depois pertence a ele até o próximo
  despacho. É o que troca "parede de linhas soltas" por "blocos do que cada agente fez" —
  a mesma informação, na unidade em que a pessoa raciocina. Junto: `etapaDoAgente`
  (testador/revisor são etapas próprias, o resto é construtor) e `tarefaEmFoco`.
- `Jobs.tsx` reescrito. Visão principal agora é:
  1. **"Quem trabalha agora"** — bloco grande com avatar, nome do agente, pulso e a
     tarefa em foco. É a informação nº 1 e estava enterrada no log.
  2. **Trilha do pipeline** (Construir → Testar → Revisar) com a etapa atual destacada e
     as já cumpridas marcadas.
  3. **Trechos por agente**, colapsáveis, com duração e nº de ferramentas; o último abre
     por padrão. Cor da borda por etapa.
  4. Metadados (modelo, escopo, turnos, custo real, sessão) — `sessionId` agora aparece,
     que é o que permite retomar à mão um fluxo interrompido (T-019).
  5. **Log cru preservado** atrás de "ver log técnico" — não foi removido, só deixou de
     ser a visão principal.
- Lista de jobs à esquerda mostra o agente ativo com pulso, não só o badge de estado.
- `tipos.ts` do frontend estava DESATUALIZADO: não tinha `sessionId`/`cwd`, adicionados no
  servidor pela T-019. O compilador pegou ao usar o campo.
- Job sem log em memória (reaberto depois de reinício) recebe texto explicando que o
  painel guarda metadados, não o stdout — em vez de parecer vazio/quebrado.

## Verificação
`npm test`: **web 41/41** (+8 de `segmentarPorAgente`/`etapaDoAgente`/`tarefaEmFoco`) **+
servidor 209/209**; `npm run build` limpo; `tsc --noEmit` limpo nos dois workspaces.

**NÃO VERIFICADO NO NAVEGADOR** — e é por isso que esta tarefa está `em-teste`, não
`concluida`. Os critérios de aceite exigem explicitamente ver a tela, o ambiente do
orquestrador não tem navegador, e entregar UI sem ninguém olhar foi exatamente o erro que
gerou esta tarefa. **Quem verifica é o usuário**: abrir `/jobs`, disparar um fluxo e
conferir se aparece quem trabalha, a trilha e os trechos por agente. Só então `concluida`.

## Revisão
Verificação visual feita pelo USUÁRIO em 2026-07-28 ("acho que ficou bom"). Aprovada.
Refinamentos que saíram DESTA verificação foram para a T-026.
