---
description: Painel do estado atual - projetos, tarefas por status, bloqueios e próximos passos
argument-hint: "[nome-do-projeto] (vazio = todos)"
---

Montar o painel de status. Escopo: $ARGUMENTS (se vazio, todos os projetos).

Você é o orquestrador. Comando SOMENTE-LEITURA: não altere nenhum arquivo, não promova
status, não despache agentes de trabalho.

1. Escaneie os frontmatters de `projetos/*/_gestao/tarefas/*.md` (fonte única de
   verdade — nunca use listas em cache). Faça via busca (Grep de `^status:` /
   `^prioridade:`), sem ler os arquivos inteiros; abra por completo apenas as tarefas
   bloqueadas, para resumir o motivo.
2. Leia o log mais recente de `_sistema/logs/` e conte ideias `status: nova` em
   `_sistema/ideias/`.
3. Apresente:
   - **Tabela por projeto:** backlog / pronta / em andamento (em-execucao + em-teste +
     em-revisao) / bloqueada / concluída — e a fase atual do PLANO.md (com o estado da
     linha `Marco:`).
   - **Bloqueios:** cada tarefa `bloqueada` com o motivo (resumido do arquivo) e o que
     destravaria.
   - **Prontas para rodar:** as próximas tarefas `pronta` em ordem de prioridade.
   - **Inconsistências**, se houver (dependência para tarefa inexistente, status
     inválido, tarefa órfã de projeto): apenas reporte — quem corrige é o usuário ou um
     /trabalhar.
   - **Última atividade:** 2–3 linhas do log mais recente + ideias não roteadas.

Feche com a sugestão de próximo comando (normalmente `/trabalhar`, ou o que os
bloqueios pedirem).
