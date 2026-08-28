---
id: T-002
titulo: Esquema do banco: projetos, tarefas, ciclos, despachos e custos
projeto: fabrica-v2
versao: v0.1
status: concluida
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
Feito em 2026-08-28. Commit do projeto: `649aff9`. 14 arquivos novos.

**O que foi feito.** Nove tabelas em quatro migracoes
(`criar_extensoes`, `criar_projetos`, `criar_tarefas`, `criar_execucao`) e nove schemas
Ecto em `lib/fabrica/projetos/` e `lib/fabrica/tarefas/`. 27 testes novos em
`test/fabrica/esquema_test.exs`.

**O que virou regra do ESQUEMA, e nao pedido em prompt** — que e a tese da v2 aplicada a
esta tarefa:

- `status` e `Ecto.Enum` com os seis estados do protocolo mais `bloqueada` e `cancelada`;
- `citext` no codigo da tarefa, para "t-001" e "T-001" serem a MESMA tarefa no banco;
- indice unico PARCIAL em `especialistas` (`where: "ativo"`). E ele, sozinho, que faz
  trocar o prompt criar linha nova em vez de sobrescrever. Sem o `where`, a segunda versao
  seria recusada e o historico — que e o que permite comparar o mesmo especialista antes e
  depois — nao existiria;
- CHECK de dependencia nao reflexiva, `tentativas >= 0`, tokens `>= 0`, `volta >= 1`,
  `numero >= 1`;
- dependencia e tabela de ligacao (`tarefa_dependencias`), nao lista serializada;
- `tarefa_areas` guarda UM ARQUIVO por linha;
- `consumos` tem UMA LINHA POR VOLTA, com unico em `(despacho_id, volta)`.

**DECISAO: `papel` e `desfecho` ficaram TEXTO, nao enum.** A tarefa nomeia as colunas mas
nao o vocabulario delas, e esse vocabulario e definido na v0.3 (T-028 para os papeis dos
dois portoes, T-029 para os desfechos de reprovacao). Cunhar os valores agora seria
adivinhar, e enum errado obriga migracao — texto nao. `status` e `grau` sao enum porque a
tarefa lista os valores exatos.

**ACHADO SOBRE O CRITERIO 1, que nao virou mudanca.** O texto do criterio diz "as migracoes
sobem e DESCEM sem erro (round trip completo)", mas o comando dele, `mix ecto.reset`, faz
`ecto.drop` + `create` + `migrate` — ou seja, derruba o BANCO e nunca executa uma funcao
`down`. Rodei o comando como esta escrito (passou) e, alem dele, rodei o
`mix ecto.rollback --all` para provar o que o TEXTO pede. Nao reescrevi o criterio.

**UMA FALHA DE TESTE, e o teste e que estava errado.** Escrevi
`assert_raise Ecto.ConstraintError` para a dependencia reflexiva; o que acontece de verdade
e que o `check_constraint` traduz a violacao do banco em erro de changeset, entao `insert!`
levanta `InvalidChangesetError`. Perguntei primeiro se o codigo estava errado — nao estava,
a constraint dispara certo. O teste foi reescrito para afirmar o comportamento real, e de
forma mais util: confere que o changeset entra VALIDO (nada nele compara os dois campos) e
que quem recusa e o banco. Assim, se alguem apagar a constraint da migracao, o teste cai.

**Ambiente:** PostgreSQL 18.4 local; bancos `fabrica_dev` e `fabrica_test`.

## Verificacao

**Criterio 1 — as migracoes sobem e descem sem erro.** `verificar: mix ecto.reset` →
**exit 0**. As quatro migracoes rodaram na ordem, terminando em

    [info] == Migrated 20260828120004 in 0.0s

Como o `ecto.reset` nao exercita o `down` (ver Notas), a descida foi provada a parte:

    mix ecto.rollback --all   → exit 0
    tabelas restantes em public: schema_migrations   (so ela)
    mix ecto.migrate          → exit 0, as quatro de volta

**Criterio 2 — testes do esquema: insercao de projeto, tarefa com dependencia e area, e
leitura de volta.** `verificar: mix test test/fabrica/esquema_test.exs` → **exit 0**

    27 tests, 0 failures

O teste `insere com dependencia e area, e le tudo de volta` faz exatamente o pedido:
projeto, duas tarefas, uma aresta de dependencia e uma area, e le de volta com `preload`
conferindo `codigo`, `status`, `prioridade`, `tentativas`, a area e a tarefa da qual depende.

**Criterio 3 — inserir tarefa com status invalido e rejeitado pelo changeset.** Coberto no
mesmo arquivo, teste `status invalido e rejeitado pelo changeset`:
`status: :em_ferias` produz `%{status: ["is invalid"]}` e `changeset.valid?` falso. O teste
irmao percorre os oito status legitimos e confere que todos gravam e voltam.

**Criterio 4 — `mix verificar` continua passando.** → **exit 0**

    Checking 29 source files ...
    86 mods/funs, found no issues.
    32 tests, 0 failures

## Conformidade


## Revisao
