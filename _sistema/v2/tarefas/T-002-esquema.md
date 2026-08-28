---
id: T-002
titulo: Esquema do banco: projetos, tarefas, ciclos, despachos e custos
projeto: fabrica-v2
versao: v0.1
status: backlog
prioridade: alta
dependencias: [T-001]
areas: [priv/repo/migrations, lib/fabrica/projetos, lib/fabrica/tarefas, test/fabrica/esquema_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Criar as migracoes e os schemas Ecto que sustentam o estado inteiro da fabrica. O banco e
a fonte unica de verdade (decisao 6.2 de `MIGRACAO_V2.md`): nao existe estado que viva so
em arquivo markdown.

## Contexto
Tabelas, com o que cada uma resolve:

- `projetos` — nome, caminho absoluto, dominio (`software` ou outro), inserted_at.
- `especialistas` — projeto_id, identificador, nome, prompt, ativo. E dado VERSIONADO:
  alterar o prompt de um especialista cria linha nova, nao sobrescreve. E isso que
  permite comparar o desempenho do mesmo especialista antes e depois de uma mudanca.
- `tarefas` — projeto_id, codigo (T-NNN), titulo, objetivo, contexto, status (enum dos
  seis estados), prioridade, tentativas, especialista_id, replanejada_de_id.
- `tarefa_dependencias` — tarefa_id, depende_de_id (tabela de ligacao; dependencia e
  relacao, nao lista serializada).
- `tarefa_areas` — tarefa_id, caminho. Um ARQUIVO por linha, nunca pasta.
- `criterios` — tarefa_id, texto, comando (nullable), grau (`executado`/`inspecionado`/`julgado`).
- `ciclos` — tarefa_id, numero, papel, desfecho, relatorio. LINHA NOVA a cada
  retrabalho, nunca sobrescrita: e o que permite perguntar depois quanto custou cada
  ciclo separadamente.
- `despachos` — ciclo_id, operario, modelo, voltas, iniciado_em, terminado_em, desfecho.
- `consumos` — despacho_id, volta, tokens_entrada, tokens_cache_escrita,
  tokens_cache_leitura, tokens_saida, custo_usd, cota_unidades, duracao_ms.
  UMA LINHA POR VOLTA. O total por tarefa e uma soma; o contrario seria impossivel.

Use `citext` para o codigo da tarefa e crie os indices unicos que o dominio exige
(`projetos.nome`, `tarefas(projeto_id, codigo)`).

O status da tarefa e um `Ecto.Enum` com exatamente os seis valores do protocolo:
`backlog`, `pronta`, `em_execucao`, `em_teste`, `em_revisao`, `concluida` — mais
`bloqueada` e `cancelada`, que sao terminais.

ATENCAO ao que NAO fazer aqui: nenhuma logica de transicao entra nesta tarefa. Isto e so
o esquema e os schemas. A maquina de estados e a v0.3.

## Criterios de aceite
- [ ] As migracoes sobem e descem sem erro (round trip completo).
      `verificar: mix ecto.reset`
- [ ] Os testes do esquema passam: insercao de projeto, tarefa com dependencia e area, e leitura de volta.
      `verificar: mix test test/fabrica/esquema_test.exs`
- [ ] Inserir tarefa com status invalido e rejeitado pelo changeset (teste incluido acima).
      `verificar: mix test test/fabrica/esquema_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

