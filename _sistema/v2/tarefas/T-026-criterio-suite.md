---
id: T-026
titulo: O criterio implicito da suite e a deteccao de ecossistema
projeto: fabrica-v2
versao: v0.3
status: backlog
prioridade: alta
dependencias: [T-024]
areas: [lib/fabrica/criterios/suite.ex, lib/fabrica/ecossistemas.ex, test/fabrica/criterios/suite_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Rodar a suite do projeto em TODA verificacao, sem que ela esteja escrita em tarefa nenhuma —
e descobrir sozinho qual e o comando, pelo ecossistema do projeto.

## Contexto
Da v1, e a razao de o template de tarefa dizer em maiusculas "NAO escreva 'a suite continua
passando' como criterio": a fabrica ja roda a suite sozinha, e escreve-la a mao so cria uma
segunda chance de errar o comando.

Deteccao por arquivo-marcador, na ordem de prioridade: `mix.exs` -> Elixir; `package.json`
-> Node; `pyproject.toml` -> Python; `Cargo.toml` -> Rust; `go.mod` -> Go; `*.csproj` ->
.NET. Se houver `_gestao/ci.json`, ELE VENCE — a deteccao e o palpite, o arquivo e a
declaracao.

O comando da suite entra na lista de criterios como `[executado]`, marcado como implicito,
para aparecer no relatorio sem ter sido escrito por ninguem.

## Criterios de aceite
- [ ] O ecossistema e detectado pelo arquivo-marcador, na ordem de prioridade (um teste por ecossistema).
      `verificar: mix test test/fabrica/criterios/suite_test.exs`
- [ ] `_gestao/ci.json` presente VENCE a deteccao automatica.
      `verificar: mix test test/fabrica/criterios/suite_test.exs`
- [ ] O criterio implicito aparece no relatorio marcado como implicito.
      `verificar: mix test test/fabrica/criterios/suite_test.exs`
- [ ] Projeto sem ecossistema reconhecido nao quebra: reporta e segue sem criterio implicito.
      `verificar: mix test test/fabrica/criterios/suite_test.exs`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

