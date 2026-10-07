---
id: T-097
titulo: "Busca filtrada por projeto não perde trecho para tuplas mortas do índice HNSW (busca_test.exs:242)"
projeto: fabrica-v2
versao: v1.0
status: pronta
prioridade: alta
dependencias: [T-099]
areas: [lib/fabrica/memoria/busca.ex, test/fabrica/memoria/busca_test.exs]
tentativas: 0
criada: 2026-10-02
atualizada: 2026-10-07
---

## Objetivo
`Busca.buscar/3` devolve todos os candidatos que cabem no limite, mesmo com o índice HNSW de `trechos`
cheio de entradas de outros projetos ou de linhas mortas — e o teste `busca_test.exs:242` deixa de
falhar intermitentemente.

## Contexto
`test/fabrica/memoria/busca_test.exs:242` ("o termo e vetorizado pelo caminho de CONSULTA … acha o
trecho da consulta, e nao o do documento") é a intermitente mais antiga da suíte (D-012). Fatos medidos:

- T-072 (ciclo 2, 26/09): determinística por seed (`--seed 619174`), mesmo isolada e sem `pg_restore`:
  a busca devolveu SÓ um dos dois trechos, com `@limite_resultado = 8` sobrando.
- Orquestrador (02/10): caiu em 3 de 5 corridas seguidas de `mix test`.
- Executor da T-090 (02/10): falha em TODA corrida até o autovacuum do banco de teste; depois do
  autovacuum, passa. Hipótese dele: tuplas mortas no índice HNSW de `trechos` (deixadas pelos rollbacks
  do sandbox, com vetores idênticos) ocupam as vagas da varredura aproximada e escondem o trecho.

Hipótese do orquestrador, a confirmar: é o comportamento conhecido do pgvector com HNSW + `WHERE` — a
varredura do índice traz até `hnsw.ef_search` (padrão 40) vizinhos e SÓ DEPOIS aplica o filtro; com
muitas entradas de outros projetos (ou mortas) perto do vetor, o filtro sobra com menos que o limite.
Se for isso, não é só teste: em produção, com muitos projetos na mesma tabela, a memória de um projeto
"esquece" trechos. Saídas conhecidas: `hnsw.iterative_scan` (pgvector ≥ 0.8), `hnsw.ef_search` maior
na transação da busca, ou busca exata quando o filtro é seletivo. Confira a versão do pgvector
instalada (aqui e a de casa, registrada no projeto) antes de escolher.

Não é desta tarefa mexer no esquema/migração do índice; se a única saída for essa, pare e registre.

## Critérios de aceite
- [ ] Teste que reproduz o defeito de forma DETERMINÍSTICA (ex.: muitos trechos de OUTRO projeto, ou
      linhas apagadas, perto do vetor da consulta) e falha antes do conserto: a busca do projeto acha
      os dois trechos dele.
      `verificar: mix test test/fabrica/memoria/busca_test.exs`
- [ ] `busca_test.exs` passa em 5 corridas seguidas da suíte inteira sem `VACUUM` entre elas.
      `verificar: mix test` (5 corridas seguidas; conta-se a falha em `busca_test.exs`)
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução
- 2026-10-07 (orquestrador): prioridade media → alta. `busca_test.exs:242` custou um ciclo inteiro à T-099 e à T-094 hoje (reprovação mecânica por falha fora da área delas); consertá-la primeiro barateia todas as outras.
- 2026-10-07 (orquestrador): passa a depender da T-099 — no Windows a suíte cai em 2 testes de link do confinamento, e toda verificação desta tarefa reprovaria por isso (reprovação falsa). Volta a `pronta` sozinha quando a T-099 concluir.
- 2026-10-07 (planejador, replanejamento da T-094): prioridade sobe de `media` para `alta`. Custo
  medido subindo desde a criação desta tarefa (02/10): `busca_test.exs:242` já derrubou
  mecanicamente T-070, T-075, T-076 (histórico, antes desta tarefa existir) e agora 4 ciclos
  inteiros da T-094 (02–07/10), sempre fora da área de quem foi reprovado. T-094 já teve o
  critério acoplado à suíte global removido (não vai mais disparar por esta flakiness), mas
  qualquer outra tarefa que toque `mix test`/`mix fabrica.ci` continua exposta até esta fechar.
  Dependência (T-099) já concluída — nada bloqueia o despacho.


## Verificação


## Conformidade


## Revisão


