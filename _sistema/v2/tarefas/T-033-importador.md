---
id: T-033
titulo: Importador das 89 tarefas vivas da v1
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-002, T-032]
areas: [lib/mix/tasks/fabrica.importar.ex, test/mix/importar_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Ler os arquivos de tarefa da v1 (`projetos/*/_gestao/tarefas/*.md`) e trazer o estado
inteiro para o banco da v2, sem perder historico.

## Contexto
E o que decide se a v2 nasce com historico ou vazia. Sao 89 tarefas em 3 projetos, um deles
com meses de trabalho (banco-imobiliario, 72 tarefas).

Leia o frontmatter e as secoes; mapeie: `status` -> enum, `dependencias` -> tabela de
ligacao, `areas` -> tabela, `tentativas` -> coluna, `agente` -> especialista, e as secoes
Verificacao/Conformidade/Revisao -> linhas em `ciclos` (uma por relatorio encontrado, na
ordem em que aparecem).

Importe tambem `_gestao/equipe.json` como `especialistas`, e `_gestao/PLANO.md` como as
fases com seus marcos.

**IDEMPOTENTE, e este e o criterio que mais importa:** rodar duas vezes deixa o banco no
mesmo estado. Use o par `(projeto, codigo)` como chave. Sem isso, um reimport acidental
duplica 89 tarefas e o estrago e silencioso.

Tarefa com status desconhecido ou frontmatter quebrado: NAO adivinhe. Importe com
`status: bloqueada`, registre o motivo, e reporte a lista ao fim. A v1 tem uma tarefa com
status estranho de proposito nas fixtures — ela e o caso de teste.

## Criterios de aceite
- [ ] Importar um diretorio de fixtures traz tarefas, dependencias, areas, tentativas e ciclos corretos.
      `verificar: mix test test/mix/importar_test.exs`
- [ ] Rodar o importador DUAS vezes deixa o banco no mesmo estado (idempotencia).
      `verificar: mix test test/mix/importar_test.exs`
- [ ] Tarefa com frontmatter quebrado entra como `bloqueada` com motivo, e aparece na lista final.
      `verificar: mix test test/mix/importar_test.exs`
- [ ] `equipe.json` vira especialistas e `PLANO.md` vira fases com marcos.
      `verificar: mix test test/mix/importar_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

