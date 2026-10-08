# Plano — repositório do TCC, do zero, uma branch por etapa

Pedido do Enzo (08/10/2026): recriar o projeto num repositório git NOVO, em que cada etapa do plano
(E1–E7) é uma branch com vários commits incrementais (desenvolvimento em cascata simulado); ele
faz o merge na `main` no dia da apresentação de cada etapa. Código e comentários em inglês, nos
padrões oficiais do Elixir, com bem menos comentário. Tarefas curtas estilo Jira, em PT e EN.
Um documento Word por etapa; uma apresentação principal com toda a análise.

## Decisões (tomadas pelo orquestrador; registrar aqui qualquer mudança)

| decisão | valor |
|---|---|
| repositório novo | `projetos/fabrica-tcc` (git próprio, sem remoto — o Enzo cria no GitHub) |
| base de trabalho | `projetos/_tcc-alvo` (cópia do `fabrica-v2` HEAD `12d0ce7`, traduzida aqui primeiro) |
| app Elixir | `:fabrica` → `:factory`, `Fabrica` → `Factory`, `FabricaWeb` → `FactoryWeb` |
| fora do repositório | importador e "linha de base" da versão anterior (T-008, T-033, T-034b, T-076) |
| branches | `main` (só README) · `etapa/e1-planejamento` → `etapa/e2-fundacao` → … → `etapa/e7-painel`, cada uma criada a partir da anterior |
| commits | um ou mais por tarefa, mensagens em inglês (Conventional Commits), cada etapa termina com a bateria verde |
| datas dos commits | as REAIS do momento da criação — nenhuma data é retroativa |
| tarefas | chaves `FAB-<etapa><nn>` (ex.: FAB-301), uma por pacote do plano (E3.1…), em `docs/tasks/pt/` e `docs/tasks/en/` |
| docs por etapa | `docs/etapas/E<n>-<nome>.docx` (português), na branch da etapa |
| apresentação principal | `apresentacao-orientador/apresentacao-principal.pptx` (fora do repo, porque cobre todas as etapas) |

## Fases

1. **Glossário** PT→EN de módulos, funções públicas, campos, tabelas, estados (`_traducao/GLOSSARY.json`).
2. **Tradução** do código inteiro em `_tcc-alvo`, por lotes de arquivos, seguindo `_traducao/STYLE.md`.
3. **Integração**: `mix factory.ci` 6/6 verde no código traduzido inteiro.
4. **Tarefas novas** (FAB-xxx) por pacote do plano + mapa arquivo → tarefa → etapa.
5. **Branches**: E1 (só documentos) e de E2 a E7, cada uma acrescentando os arquivos da etapa e adaptando os
   que crescem (`application.ex`, `fila/trabalho.ex`…), com a bateria verde no fim de cada uma.
6. **Documentos**: tarefas PT/EN, Word por etapa com dados medidos na própria branch, apresentação principal.
7. **Conferência final** e relatório ao Enzo (sugestões só no fim).

## Estado

- [x] Checkpoint `checkpoint-2026-10-08` nos dois repositórios; piloto parado.
- [x] `_tcc-alvo` criado; vocabulário extraído (`_traducao/vocab.json`), dependências (`deps.json`), etapa por arquivo (`stage.json`).
- [ ] Fase 1 · [ ] Fase 2 · [ ] Fase 3 · [ ] Fase 4 · [ ] Fase 5 · [ ] Fase 6 · [ ] Fase 7
