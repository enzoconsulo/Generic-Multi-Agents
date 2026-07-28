---
id: T-036
titulo: Visibilidade de gestão do projeto — histórico, bloqueios e dependências
projeto: painel-fabrica
status: backlog
prioridade: media
dependencias: [T-033]
areas: [web/src/paginas/projeto/SecaoGestao.tsx, web/src/paginas/projeto/Projeto.tsx]
tentativas: 0
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Responder, na própria página do projeto: o que já rodou aqui, o que está travado, e o que
destrava o quê.

## Contexto
O histórico de execução é global (aba Jobs, todos os projetos misturados) e as
`dependencias` das tarefas já chegam na API mas não aparecem em lugar nenhum da tela. O
kanban mostra que uma tarefa está `bloqueada`, e não POR QUÊ nem o que falta concluir para
soltá-la. Sem isso, decidir o próximo passo exige abrir arquivo de tarefa à mão — que é
exatamente o que o painel existe para evitar.

## Critérios de aceite
- [ ] Histórico dos jobs DESTE projeto, com estado, custo e duração.
- [ ] Tarefas bloqueadas em destaque, com o motivo registrado.
- [ ] Dependências legíveis nos dois sentidos: o que esta tarefa espera e o que espera por ela.
- [ ] Tarefa pronta para promover (dependências todas concluídas) sinalizada.

## Notas de execução
Os dados já existem: `dependencias` vem no `ProjetoDetalhe` e o histórico sai do mesmo
canal SSE da aba Jobs, filtrado por `escopo === projeto:<nome>`. Esta tarefa é
majoritariamente FRONTEND — se aparecer necessidade de endpoint novo, desconfiar antes de
criar.

**Uma conexão SSE por página** (armadilha registrada no CLAUDE.md do painel): `Projeto.tsx`
já chama `useJobsAoVivo()` uma vez e passa o estado para baixo. A seção nova recebe por
prop; abrir uma segunda quebra a decisão de canal único.

## Verificação


## Revisão
