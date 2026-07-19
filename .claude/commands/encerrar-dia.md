---
description: Fecha o expediente - consolida o log diário, atualiza o progresso dos projetos e prepara o dia seguinte
---

Encerrar o dia de trabalho da fábrica.

Você é o orquestrador. Execute sem perguntar:

1. **Levante o que aconteceu hoje:** escaneie as tarefas com `atualizada` = hoje e o log
   do dia (se já existir parcial). `git log --since=midnight --oneline` nos projetos
   tocados ajuda a conferir.
2. **Consolide `_sistema/logs/AAAA-MM-DD.md`** (crie ou complete) com:
   - Resumo do dia em 2–3 frases;
   - Tarefas concluídas (ID + 1 linha) e bloqueadas (ID + motivo);
   - Decisões relevantes tomadas;
   - **Amanhã:** tarefas `pronta` na fila, bloqueios aguardando o usuário, e a primeira
     coisa que o próximo `/trabalhar` deve fazer.
3. **Atualize `_gestao/PROGRESSO.md`** de cada projeto tocado hoje com uma entrada
   datada curta (o que avançou, estado atual). Se o dia teve 3+ conclusões num projeto
   e o documentador ainda não rodou, despache-o agora.
4. **Higiene rápida:** aponte no log ideias paradas com `status: nova` há mais de 7 dias
   e tarefas presas em status intermediário sem agente rodando (não corrija — o próximo
   /trabalhar saneia).
5. **Commits:** em cada projeto tocado, commite pendências de `_gestao/`
   (`chore: gestão AAAA-MM-DD`). Na raiz da fábrica, commite o log e demais mudanças de
   `_sistema/`/`.claude/` (`chore: encerramento AAAA-MM-DD`).

Relatório final ao usuário: o resumo do dia + o que ficou pronto para amanhã + o que
depende dele (bloqueios, decisões de escopo).
