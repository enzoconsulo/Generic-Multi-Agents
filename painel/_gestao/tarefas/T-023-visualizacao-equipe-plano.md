---
id: T-023
titulo: Visualização — equipe ao vivo, mapa do planejamento e "como funciona"
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: [T-022]
areas: [web/src/paginas/projeto/, web/src/paginas/como-funciona/, web/src/lib/atividade.ts]
tentativas: 0
criada: 2026-07-27
atualizada: 2026-07-27
---

## Objetivo
Tornar VISUAL o que a fábrica está fazendo: quais agentes trabalham, o que cada um fez, o
planejamento inteiro e o modelo de funcionamento — sem obrigar a ler arquivo ou log.

## Contexto
Pedido do usuário após o primeiro uso: *"não está nada claro o que está sendo feito e como
está sendo feito, quais agentes estão trabalhando, o que cada um está fazendo. Gostaria de
uma UI completa e clara do funcionamento (…) tudo isso visual, não quero ficar lendo textos
extensos."*

O que existia era texto: a equipe aparecia como lista de cartões estáticos, o plano como
lista de fases, e o "quem despachou quem" só no console de log.

## Critérios de aceite
- [x] Equipe mostra quem está trabalhando AGORA, com destaque visual.
- [x] Cada especialista mostra as tarefas que são dele e quantas concluiu.
- [x] Testador/revisor aparecem quando atuam, mesmo não estando no `equipe.json`.
- [x] Projeto sem equipe explica como uma equipe nasce (em vez de bloco vazio).
- [x] Plano vira mapa: fases com barra de progresso e tarefas como blocos coloridos.
- [x] Clicar num bloco do mapa abre o detalhe da tarefa no quadro.
- [x] Página "Como funciona" com o ciclo em diagrama, quem é quem e os dois modos.
- [x] Lógica de atividade e de progresso testada (sem navegador).

## Notas de execução
- `web/src/lib/atividade.ts` (puro, testado): `agenteAtivo` / `atividadePorAgente` parseiam
  o log real do runner (`Agent → domain`, `(subagente) Task → testador`) — esse regex é o
  **contrato** com o formato que o `runner-claude.ts` emite; e `montarMapaPlano` cruza
  PLANO.md com as tarefas em disco.
  - Duas escolhas de HONESTIDADE no mapa: id citado no plano sem arquivo vira
    `idsAusentes` e **não entra no total** (plano desatualizado fica visível em vez de
    inflar o percentual); tarefa que nenhuma fase cita vai para "Fora do plano" e nunca
    some da tela. Fase sem tarefa conta 0%, não 100%.
- `EquipeAoVivo.tsx`: junta três fontes que só existiam separadas — `equipe.json` (os
  especialistas sob demanda), o campo `agente:` das tarefas (quem é dono de quê) e o log
  (quem foi realmente despachado). Testador/revisor **não** estão no equipe.json (são
  fixos), mas aparecem no log — entram como "papel fixo", senão a visão mentiria sobre
  quem trabalhou. Só entram os fixos que ATUARAM, para não poluir com quem nunca rodou.
- `MapaPlano.tsx`: fases com barra de progresso, blocos coloridos por status (mostrando o
  agente dono), legenda e seção "Fora do plano". A seleção de tarefa SUBIU para
  `DetalheProjeto` — mapa e quadro apontam para a mesma tarefa, então clicar no bloco abre
  o detalhe e rola até ele.
- `ComoFunciona.tsx` (rota `/como-funciona`, no menu): o ciclo em 6 passos, com cor
  diferente para o que é SEU e o que é da fábrica; "quem é quem" (especialistas sob
  demanda vs. fixos vs. apoio, explicando POR QUE testador/revisor são fixos); e os dois
  modos de uso.

**Achado de ambiente (não é bug do código):** a suíte do servidor abortou com
`ERR_IPC_CHANNEL_CLOSED` no worker pool do vitest. Causa: o painel que o usuário havia
subido continuava rodando (PID na porta 8765) e competia por recursos com os testes, que
sobem processos filhos. Derrubado o processo órfão, a suíte voltou a 209/209. Vale como
armadilha: **testar com um painel no ar dá falha de infraestrutura que parece bug.**

## Verificação
`npm test`: **web 33/33** (+10 de `atividade.test.ts`) **+ servidor 209/209**;
`npm run build` limpo; `tsc --noEmit` limpo nos dois workspaces.
**Não verificado:** a aparência renderizada (sem navegador no ambiente). A lógica por trás
das visualizações é testada caso a caso; o visual, não.

## Revisão
Pulada (decisão de custo geral do painel).
