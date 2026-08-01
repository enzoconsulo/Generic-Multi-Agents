---
description: Checagem de integridade da fábrica - valida tarefas, git e estrutura; corrige o que é seguro e reporta o resto
---

Rodar a manutenção da fábrica. Você é o orquestrador (regras no CLAUDE.md raiz).
Corrija sozinho tudo que for mecânico e inequívoco; o que exigir julgamento de escopo,
apenas reporte. Rodar tipicamente 1x por semana ou quando o /status parecer inconsistente.

1. **Estrutura:** confirme que existem os **11 agentes** em `.claude/agents/` — trilha de
   software (`planejador`, `executor`, `executor-reforcado`, `testador`, `revisor`), trilha
   genérica (`planejador-generico`, `construtor`, `construtor-reforcado`, `conferente`,
   `revisor-generico`) e os comuns (`documentador`, `pesquisador`) —, os 6 comandos em
   `.claude/commands/`, os templates em `_sistema/templates/`, o `PROTOCOLO_TAREFAS.md`,
   o `BIBLIOTECAS.md` e o `DOMINIOS.md`. Arquivo faltando ou frontmatter de agente sem
   `name/description/model` → reporte (não recrie por conta própria).

   **Trilha de cada projeto:** leia o `dominio` de `_gestao/equipe.json`. Domínio diferente
   de `software` num projeto cujas tarefas foram claramente construídas pelo pipeline de
   software (ou o contrário) → reporte; trilha trocada no meio do caminho desperdiça todo
   ciclo seguinte. `equipe.json` presente mas SEM o campo `dominio` num projeto que não é
   software é o erro mais provável: o projeto está rodando na trilha errada em silêncio.
2. **Tarefas** (escaneie os frontmatters via busca, projeto a projeto):
   - `status` fora do vocabulário do protocolo, `id` diferente do nome do arquivo,
     `projeto` errado → corrija o que for óbvio; o resto, reporte.
   - `dependencias` apontando para tarefa inexistente ou formando ciclo → reporte com a
     cadeia exata.
   - Tarefa presa sem agente rodando → saneamento do protocolo: `em-teste`/`em-revisao`
     mantêm o status (a etapa será despachada pelo próximo /trabalhar); `em-execucao`
     volta para `pronta`, preservando notas parciais.
   - `tentativas >= 3` ainda ativa → marque `bloqueada` com motivo consolidado.
   - `backlog` com todas as dependências `concluida` → promova para `pronta`.
   - **Id citado nas fases do PLANO.md sem arquivo em `_gestao/tarefas/`** → planejamento
     cortado no meio (acontece quando um fluxo termina com o planejador ainda escrevendo).
     A tarefa não existe para a fábrica: nada a promove nem a executa. Reporte com a lista
     exata dos ids e sugira despachar o `planejador` para completá-los — não invente as
     tarefas você mesmo, decomposição é dele.
3. **Git por projeto:** repositório existe? `git status` limpo? Alterações não
   commitadas órfãs → commit de resgate `chore: resgate de manutenção` e anote no log
   qual tarefa provavelmente as gerou. Na raiz da fábrica: mudanças de
   `_sistema/`/`.claude/` não commitadas → commit `chore: manutenção AAAA-MM-DD`.
4. **Higiene:** ideias com `status: nova` há mais de 7 dias (liste para o usuário);
   comandos de rodar/testar do `CLAUDE.md` de cada projeto ainda funcionam? Divergência
   grosseira entre docs e realidade → despache o `documentador`.
5. **Registre** o resultado no log do dia (`_sistema/logs/AAAA-MM-DD.md`).

Relatório final ao usuário em 3 blocos: **verificado ok** (1 linha por área),
**corrigido automaticamente** (item a item) e **precisa de você** (com a ação sugerida).
