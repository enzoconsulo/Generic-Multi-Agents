---
id: T-006
titulo: Backup e restauracao do banco
projeto: fabrica-v2
versao: v0.1
status: concluida
prioridade: alta
dependencias: [T-002]
areas: [lib/mix/tasks/fabrica.backup.ex, lib/mix/tasks/fabrica.restaurar.ex, test/mix/backup_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Duas tarefas mix — `mix fabrica.backup` e `mix fabrica.restaurar` — que gravam e leem um
dump do banco, com teste que prova o ciclo completo.

## Contexto
POR QUE ISTO E DA v0.1 e nao "depois": na v1 o git do projeto cobria a durabilidade de
graca, porque o estado vivia em markdown commitado. Com o estado no banco, "nao perder
trabalho" passa a exigir dump — e e o tipo de coisa que so se descobre faltando depois de
perder. Ver `MIGRACAO_V2.md`, 6.2.

`mix fabrica.backup` chama `pg_dump` com `--format=custom` para um arquivo em
`priv/backups/AAAA-MM-DD-HHMMSS.dump` (o diretorio entra no `.gitignore` — dump nao
se versiona). `mix fabrica.restaurar <arquivo>` chama `pg_restore --clean --if-exists`.

Resolva o caminho do `pg_dump` por configuracao (`config :fabrica, :pg_bin`), com o
default apontando para a instalacao documentada em `_sistema/AMBIENTE_V2.md`. Nao dependa
do PATH: no Windows o `psql` do instalador quebrado pode estar na frente.

O teste faz o ciclo de verdade contra o banco de teste: insere um projeto e uma tarefa,
faz backup, apaga tudo, restaura, e confere que a tarefa voltou com o mesmo codigo. Se o
`pg_dump` nao estiver disponivel, o teste deve ser PULADO com mensagem clara
(`@tag :precisa_pg_dump` + `ExUnit.configure(exclude: ...)`), nunca falhar em silencio nem
passar sem testar nada.

## Criterios de aceite
- [ ] `mix fabrica.backup` grava um arquivo de dump e imprime o caminho.
      `verificar: mix test test/mix/backup_test.exs`
- [ ] O ciclo backup -> apagar -> restaurar devolve os mesmos dados (teste de round trip).
      `verificar: mix test test/mix/backup_test.exs`
- [ ] Sem `pg_dump` disponivel, o teste e PULADO com mensagem clara, nunca falha em silencio.
      `verificar: mix test test/mix/backup_test.exs`
- [ ] `priv/backups/` esta no `.gitignore` (inspecionavel).

## Notas de execucao
Feito em 2026-08-28. Commit do projeto: `3c31ae6`. 7 arquivos, 11 testes.

**O que foi feito.** `lib/fabrica/backup.ex`, as duas tarefas mix, `config :fabrica, :pg_bin`,
a entrada no `.gitignore` e a deteccao de `pg_dump` no `test_helper.exs`.

**O caminho do `pg_dump` vem de configuracao, nunca do PATH.** Nao e preciosismo: esta
maquina teve uma instalacao de PostgreSQL INCOMPLETA cujos binarios de cliente respondiam
normalmente a `psql --version` (`AMBIENTE_V2.md`, secao 3). Um `pg_dump` errado no PATH produz
um dump aparentemente valido contra o servidor errado — ou estoura por versao no pior momento
possivel, o da restauracao.

**ACHADO QUE SO APARECE NO CAMINHO REAL, e e o que esta tarefa mais entregou.**
`pg_restore --clean` APAGA os tipos antes de recria-los, e tipo recriado ganha **oid novo**. O
Postgrex descobre os oids uma vez, ao conectar, e os guarda. Depois de uma restauracao, toda
conexao viva ainda carrega os antigos, e a primeira consulta que tocar um tipo customizado —
aqui, o `citext` do codigo da tarefa — morre com `cache lookup failed for type 18091`, uma
mensagem que nao diz nada sobre backup. **Restaurar sem tratar isso deixa a aplicacao de pe e
QUEBRADA, que e pior do que deixa-la fora do ar.** A restauracao agora derruba as conexoes
para forcar a releitura dos oids. Descoberto porque o teste roda contra o banco de verdade;
um teste que so olhasse o codigo de saida do `pg_restore` teria passado.

**Como o teste consegue provar o round trip.** Duas escolhas que parecem detalhe e nao sao:

- `async: false`, porque `--clean` DERRUBA as tabelas do banco de teste — rodar isso em
  paralelo seria destruir a arvore embaixo dos outros testes;
- as escritas usam `Sandbox.unboxed_run`, porque o sandbox mantem tudo numa transacao nao
  commitada e o `pg_dump` e outro processo: ele nao veria nada, e o teste passaria
  restaurando um banco vazio sobre outro vazio. Round trip que nao prova nada e pior que
  round trip nenhum. Ha uma assercao explicita de que a tarefa SUMIU antes de restaurar.

**LIMITACAO DE AMBIENTE, tratada e nao escondida.** O pool do sandbox
(`DBConnection.Ownership.Manager`) nao atende `disconnect_all`: a chamada derruba o proprio
gerenciador com `FunctionClauseError`. Minha primeira versao capturava o `exit` — e o teste
passava, mas o log enchia de crash a cada restauracao. Trocado por uma checagem ANTES,
olhando o pool configurado. Capturar a saida esconderia o crash sem evita-lo, que e a
diferenca entre nao fazer e fazer errado calado. Sob sandbox, quem restaura reinicia o Repo;
o teste faz isso explicitamente, com o porque escrito ao lado.

**Um defeito meu, achado pelo proprio teste.** O bloco de listagem restaurava a configuracao
com `put_env(chave, nil)`, o que deixa a chave PRESENTE valendo `nil` — e ai o default do
`get_env/3` nao vale mais, e `Path.join(nil, ...)` estourava em outro teste. Corrigido nos
dois lados: o teste usa `delete_env` quando nao havia chave, e `Backup.diretorio/0` usa
`|| padrao` em vez de confiar no terceiro argumento.

**Sobre `mix test` sem PostgreSQL.** O `test_helper.exs` detecta o `pg_dump` UMA vez e, se ele
faltar, exclui `:precisa_pg_dump` imprimindo que o ciclo NAO foi exercitado. Teste que falha
por ambiente ensina quem le a ignorar teste vermelho — e a partir dai o vermelho de verdade
tambem passa despercebido.

## Verificacao

**Criterio 1 — `mix fabrica.backup` grava um arquivo de dump e imprime o caminho.**
`verificar: mix test test/mix/backup_test.exs` → **exit 0** (11 tests, 0 failures), e
tambem rodado pelo CAMINHO REAL:

    mix fabrica.backup
    dump gravado: priv/backups/20260828-184802.dump (33765 bytes)

Tres testes cobrem: o caminho devolvido, a criacao do diretorio quando ele nao existe, e o
carimbo de data e hora no nome — que e o que impede um backup de sobrescrever o anterior.

**Criterio 2 — o ciclo backup -> apagar -> restaurar devolve os mesmos dados.** Mesmo
arquivo, teste `devolve os mesmos dados`: semeia projeto + tarefa (`status: :em_teste`,
`tentativas: 2`), grava o dump, apaga tudo, **confere que a tarefa sumiu**, restaura, e
confere codigo, titulo, status e tentativas de volta. Ha um segundo teste que restaura duas
vezes seguidas, provando o par `--clean --if-exists`. Pelo caminho real:

    mix fabrica.restaurar --ultimo
    banco restaurado a partir de priv/backups/20260828-184802.dump

**Criterio 3 — sem `pg_dump` disponivel, o teste e PULADO com mensagem clara, nunca falha em
silencio.** `@moduletag :precisa_pg_dump` no arquivo, e o `test_helper.exs` so exclui essa
tag quando `Fabrica.Backup.disponivel?()` e falso, imprimindo o caminho procurado e o aviso
de que o ciclo nao foi exercitado. **Nesta maquina o `pg_dump` existe, entao os 11 testes
RODARAM de verdade** — a exclusao nao esta mascarando nada. O caminho oposto tem teste
proprio: `executavel ausente devolve erro nomeado`, que aponta o `pg_bin` para um diretorio
inexistente e confere `{:erro, {:executavel_ausente, ...}}` e `disponivel?() == false`.

**Criterio 4 — `priv/backups/` esta no `.gitignore`.** INSPECIONADO e conferido pelo git:

    git check-ignore -v priv/backups/teste.dump
    .gitignore:41:/priv/backups/	priv/backups/teste.dump

**Extra — `mix verificar` continua passando** → **exit 0**

    217 mods/funs, found no issues.
    138 tests, 0 failures

## Conformidade


## Revisao
