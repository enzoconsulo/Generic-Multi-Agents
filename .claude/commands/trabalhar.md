---
description: Loop principal da fábrica - executa o pipeline completo (executor → testador → revisor) em todas as tarefas prontas, sem intervenção
argument-hint: "[nome-do-projeto] (vazio = todos os projetos)"
---

Rodar a fábrica. Escopo: $ARGUMENTS (se vazio, todos os projetos em `projetos/`).

Você é o orquestrador (regras no CLAUDE.md raiz; transições em
`_sistema/PROTOCOLO_TAREFAS.md`). Este é o modo totalmente autônomo: NÃO pare para
perguntar nada ao usuário até o fim — decisões são suas, registradas nos arquivos.
Trabalhe até esgotar as tarefas ou tudo estar bloqueado.

## Preparação

1. Leia o log mais recente de `_sistema/logs/` (contexto do que vinha acontecendo).
2. Escaneie os frontmatters de `projetos/*/_gestao/tarefas/*.md` no escopo — um único
   Grep em modo content de `^(status|prioridade|dependencias|areas):`, sem ler os
   arquivos inteiros; leia por completo apenas o que for despachar. Leia também o
   PLANO.md dos projetos ativos (fases e linhas `Marco:`) — é a base para detectar
   marcos de fase.
3. **Saneamento** (sobras de sessão anterior, sem agente rodando): `em-teste`/`em-revisao`
   NÃO regridem — a etapa anterior está commitada/registrada; apenas despache
   testador/revisor no loop normal. `em-execucao` volta para `pronta` — exceto se as
   Notas de execução registrarem trabalho parcial consistente; aí mantenha o status e
   despache o executor para continuar de onde parou.
4. Promova `backlog → pronta` onde todas as dependências estão `concluida`.

## Loop principal (repita até não haver tarefa `pronta` nem pipeline em andamento)

1. **Selecione até 3 tarefas `pronta`** independentes entre si: prioridade `alta`
   primeiro; entre iguais, a que destrava mais dependentes. Mesmo projeto na mesma
   leva: só com `areas` disjuntas.
2. **Despache um `executor` por tarefa** (em paralelo quando a regra acima permitir).
   Prompt de despacho sempre inclui: caminho absoluto do projeto, ID da tarefa e, em
   retrabalho, aviso de que há relatório de reprovação a atender. **Ao retorno de CADA
   agente**, confirme por busca que o status no frontmatter confere com o relatório dele
   antes do próximo despacho; divergência → corrija você mesmo conforme o protocolo e
   anote no log.
3. **Quando um executor terminar:** despache o `testador` da tarefa — respeitando a
   regra de projeto quieto (nenhum executor/testador ativo no MESMO projeto; enquanto
   não der, siga com outras tarefas e despache assim que o projeto liberar). Pulo de
   teste (tarefa trivial sem código executável): registre a decisão e mande direto ao
   revisor. Testador aprovou → despache o `revisor` (pode rodar em paralelo com
   qualquer agente). Reprovou → volta ao executor.
4. **Revisor aprovou** → tarefa `concluida`; promova dependentes que ficaram livres.
   Reprovou → volta ao executor. **Marco de fase:** todas as tarefas da fase `concluida`
   e a linha `Marco:` ainda `pendente` no PLANO.md → despache o `testador` em modo marco
   (meta da fase de ponta a ponta, também sob projeto quieto) e registre o resultado na
   linha `Marco:` (aprovado/reprovado + data). Reprovado: causa raiz única e óbvia →
   crie você a tarefa corretiva pelo template; múltiplas causas ou abordagem em dúvida →
   `planejador` cria as correções (uma por causa raiz).
5. **Controle de ciclos:** tarefa reprovada com `tentativas >= 3` → marque `bloqueada` e
   escreva o motivo consolidado no arquivo. Depois, **autocorreção** (uma vez por
   linhagem): sem `replanejada-de` no frontmatter → despache o `planejador` em modo
   replanejamento; com `replanejada-de` → fica `bloqueada` para o usuário.
6. Entre levas, re-escaneie e mantenha o pipeline cheio (novas `pronta` entram na fila).
   **Checkpoint:** registre no log do dia 1 linha por tarefa concluída/bloqueada assim
   que acontecer — queda de sessão não pode perder histórico.

## Encerramento da sessão de trabalho

1. Projetos com 3+ tarefas concluídas nesta sessão → despache o `documentador`.
2. Consolide `_sistema/logs/AAAA-MM-DD.md` (os checkpoints já estão lá): resumo,
   bloqueadas com motivo, decisões relevantes, estado em que o pipeline parou.
3. **Commits de gestão:** em cada projeto tocado, commite as pendências de `_gestao/`
   (`chore: gestão AAAA-MM-DD`). Se arquivos da fábrica (`_sistema/`, `.claude/`)
   mudaram, commite também a raiz.

## Relatório final ao usuário

Placar por projeto (concluídas / em andamento / bloqueadas), destaques do que foi
construído, bloqueios que precisam dele, e o que a próxima rodada de `/trabalhar` fará.
