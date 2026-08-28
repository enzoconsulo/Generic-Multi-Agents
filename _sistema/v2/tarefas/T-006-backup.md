---
id: T-006
titulo: Backup e restauracao do banco
projeto: fabrica-v2
versao: v0.1
status: backlog
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


## Verificacao


## Conformidade


## Revisao

