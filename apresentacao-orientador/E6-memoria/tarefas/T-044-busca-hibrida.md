---
id: T-044
titulo: Busca hibrida com fusao reciproca de postos
projeto: fabrica-v2
versao: v0.5
status: concluida
prioridade: alta
dependencias: [T-043]
areas: [lib/fabrica/memoria/busca.ex, test/fabrica/memoria/busca_test.exs]
tentativas: 1
criada: 2026-08-28
atualizada: 2026-09-10
---

## Objetivo
Responder "isto ja foi resolvido aqui, e o que foi decidido na epoca?" com duas buscas ao
mesmo tempo — vetor e termo exato — fundidas por posto reciproco.

## Contexto
POR QUE DUAS BUSCAS: o vetor perde nome proprio (se a pergunta menciona uma opcao chamada
`--exigir`, ele nao tem como saber o que e aquilo) e a busca textual perde sinonimo. Uma
cobre o buraco da outra.

A consulta ja esta escrita na secao 9 do `-3-completo` e **ja foi provada rodando** nesta
maquina (ver `_sistema/AMBIENTE_V2.md`, secao 4) — copie de la, nao reescreva:

    WITH semantico AS (
      SELECT id, RANK() OVER (ORDER BY embedding <=> $1) AS pos
        FROM trechos WHERE projeto_id = $2 ORDER BY embedding <=> $1 LIMIT 40),
         textual AS (
      SELECT id, RANK() OVER (ORDER BY ts_rank_cd(busca, $3) DESC) AS pos
        FROM trechos WHERE projeto_id = $2 AND busca @@ $3 LIMIT 40)
    SELECT id FROM semantico FULL OUTER JOIN textual USING (id)
     ORDER BY COALESCE(1.0/(60 + semantico.pos), 0)
             + COALESCE(1.0/(60 + textual.pos), 0) DESC
     LIMIT 8;

A fusao por posto reciproco (k=60) dispensa calibrar pesos entre duas escalas que nao sao
comparaveis — e a razao de nao inventar uma media ponderada aqui.

SEMPRE filtre por `projeto_id`. Trecho de um projeto vazando para outro e defeito grave, e
o teste precisa travar isso explicitamente.

## Criterios de aceite
- [ ] A busca hibrida devolve, em primeiro, o trecho achado pelas DUAS buscas.
      `verificar: mix test test/fabrica/memoria/busca_test.exs`
- [ ] Um termo exato que o vetor nao acha (nome de flag) e recuperado pela metade textual.
      `verificar: mix test test/fabrica/memoria/busca_test.exs`
- [ ] Trecho de outro projeto NUNCA aparece no resultado.
      `verificar: mix test test/fabrica/memoria/busca_test.exs`
- [ ] A consulta roda numa transacao so, no mesmo banco das tarefas.
      `verificar: mix test test/fabrica/memoria/busca_test.exs`

## Notas de execucao

### Ciclo 1

Criado `Fabrica.Memoria.Busca.buscar/3`: uma UNICA instrucao SQL (`WITH semantico ... , textual
... , fundido ...  SELECT t.* FROM fundido JOIN trechos ...`) que faz as duas buscas, funde por
posto reciproco (k=60) e ja devolve os `Trecho` inteiros — nao so os `id`. Isso difere levemente
da consulta colada no Contexto (que so seleciona `id`): aqui o `SELECT` final junta de volta com
`trechos` dentro da MESMA instrucao, porque e essa unica ida ao banco que faz o criterio "roda
numa transacao so" valer por construcao (nao ha uma segunda consulta para hidratar os campos).
`plainto_tsquery('portuguese', $2)` entra como chamada dentro do SQL, com o termo cru como
parametro — o Postgrex nao tem extensao para `tsquery`, mesma razao pela qual o vetor entra
colado como literal (`Ingestao.definir_embedding/2` ja fazia isso para escrita; aqui e para
leitura).

`opts[:embedder]` segue a mesma convencao de `Ingestao.processar/3`. `@limite_candidatos` (40),
`@k_rrf` (60) e `@limite_resultado` (8) ficam fixos, batendo com a consulta provada no Contexto.

Teste (`busca_test.exs`) cobre os 4 criterios:
  - trecho com o MESMO vetor da consulta E o termo no corpo fica em 1o lugar, contra um decoy
    so-semantico (mesmo vetor, sem o termo) e um so-textual (tem o termo, vetor sem relacao);
  - termo exato "fora do vetor": 40 trechos com vetor bem proximo da consulta (cada um com um
    epsilon distinto, para nao empatar no RANK()) enchem sozinhos o LIMIT 40 semantico; o alvo
    tem vetor sem nenhuma relacao (fica fora do top 40) mas o termo exato no corpo, entao so a
    metade textual o acha — e o teste prova que ele aparece no resultado final mesmo assim;
  - isolamento por projeto: dois projetos com o MESMO corpo e o MESMO vetor (o cenario onde a
    falta do filtro mais doeria), so o trecho do projeto certo aparece;
  - uma unica ida ao banco: conta eventos de telemetry `[:fabrica, :repo, :query]` durante
    `Busca.buscar/3` e trava em exatamente 1.

`inserir_trecho!/4` (helper do teste) escreve o trecho com vetor CONTROLADO direto por SQL, sem
passar pelo embedder — os testes 1 e 2 precisam do vetor exato (distancia zero ou proxima
propositalmente), nao de um vetor deterministico-por-hash-de-texto do `Embedder.Falso`.

**Reproduzir:** `mix test test/fabrica/memoria/busca_test.exs` (4 testes, 0 falhas; rodado 4x
com seeds diferentes, sem flakiness).

Rodado tambem `mix format --check-formatted` e `mix credo --strict` nos dois arquivos tocados —
sem apontamentos. `mix compile --warnings-as-errors` limpo.

Deps novas: nenhuma.

**Commit:** `a51e97d`

## Verificacao

### Ciclo 2 (Testador)

- **[PASSOU] [executado] Critério 1: A busca hibrida devolve, em primeiro, o trecho achado pelas DUAS buscas.**
  Comando: `mix test test/fabrica/memoria/busca_test.exs`
  Saída: 4 tests, 0 failures

- **[PASSOU] [executado] Critério 2: Um termo exato que o vetor nao acha (nome de flag) e recuperado pela metade textual.**
  Comando: `mix test test/fabrica/memoria/busca_test.exs` (mesmo comando acima)
  Saída: 4 tests, 0 failures (critério coberto pelo teste "um termo exato que o vetor nao acha")

- **[PASSOU] [executado] Critério 3: Trecho de outro projeto NUNCA aparece no resultado.**
  Comando: `mix test test/fabrica/memoria/busca_test.exs` (mesmo comando acima)
  Saída: 4 tests, 0 failures (critério coberto pelo teste "isolamento por projeto")

- **[PASSOU] [executado] Critério 4: A consulta roda numa transacao so, no mesmo banco das tarefas.**
  Comando: `mix test test/fabrica/memoria/busca_test.exs` (mesmo comando acima)
  Saída: 4 tests, 0 failures (critério coberto pelo teste "uma unica ida ao banco")

Suíte completa: 955 tests, 0 failures — `mix test`
Mutação: Quebrei `FULL OUTER JOIN` → `INNER JOIN` → teste falhou no critério 2 (esperado)
Graus de prova: 4 executados, 0 inspecionados, 0 julgados

## Conformidade

Conformidade: cumpre

- A busca hibrida devolve, em primeiro, o trecho achado pelas DUAS buscas →
  `lib/fabrica/memoria/busca.ex:70-88` (CTE `fundido`, soma dos dois termos RRF) +
  `test/fabrica/memoria/busca_test.exs:38-70` (teste "fica em 1o lugar").
- Termo exato fora do vetor recuperado pela metade textual → CTE `textual`
  (`busca.ex:64-68`) + `busca_test.exs:72-104` (40 decoys enchem o LIMIT semantico
  sem o termo; alvo só aparece via `plainto_tsquery`).
- Isolamento por projeto → `WHERE projeto_id = $1` presente nas DUAS CTEs
  (`busca.ex:61,66`, filtra os candidatos na origem, não só no resultado final) +
  `busca_test.exs:108-132` (mesmo corpo/vetor em dois projetos, só o do projeto
  certo aparece).
- Consulta roda numa transação só → `SQL.query!/3` única (`busca.ex:56-90`, um
  `WITH` encadeado até o `SELECT` final, incluindo a hidratação de `trechos`) +
  `busca_test.exs:159-208` (conta eventos `[:fabrica, :repo, :query]`, trava em 1).
  Confirmei que `[:fabrica, :repo, :query]` é o nome padrão do evento de telemetry
  do Ecto para `Fabrica.Repo` (prefixo derivado automaticamente do nome do repo) —
  não é eventoinventado pelo teste.

A consulta colada no Contexto só seleciona `id`; o executor hidrata o `Trecho`
inteiro dentro da MESMA instrução SQL (`JOIN trechos t` no `SELECT` final). Isso é
uma mudança de forma, não de espírito: é exatamente essa junção dentro da mesma
instrução que faz o critério 4 valer por construção, sem uma segunda consulta.
Registrado e justificado nas Notas — aprovado.

Nenhuma sobra de escopo: só os dois arquivos de `areas` mais a regeneração de
`MAPA.md` (prática documentada do projeto para mudança estrutural) e o próprio
arquivo da tarefa.

## Revisao

Aprovado sem ressalvas. Verifiquei:
- Vetor colado como literal (`literal = "[" <> Enum.map_join(vetor, ",", &Float.to_string/1) <> "]"`)
  é seguro porque só contém floats gerados pelo próprio embedder — mesma técnica já
  em produção em `Ingestao.definir_embedding/2`; nenhuma entrada de usuário entra
  nesse literal.
- `termo` (entrada de usuário) entra SEMPRE como parâmetro `$2`, nunca concatenado —
  sem risco de injeção SQL pela busca textual.
- `RANK() OVER (...)` roda sobre a relação inteira filtrada por `projeto_id` antes do
  `LIMIT 40`, dando `pos` 1..40 consistente com a fórmula de RRF documentada no
  Contexto — bate com a consulta provada.
- `FULL OUTER JOIN ... USING (id)` funde as duas metades sem ambiguidade de coluna;
  mutação documentada pelo testador (trocar por `INNER JOIN`) confirma que o teste
  do critério 2 depende disso.
- Nota menor: `Busca.buscar/3` devolve `%Trecho{}` só com `id, projeto_id, fonte,
  corpo, hash` — sem `inserted_at`/`updated_at`. Não há caller ainda no repositório
  (módulo isolado, a integração é de tarefa futura), então não é defeito hoje; só
  vale a pena checar se um consumidor futuro espera o struct completo.
- Nota menor: `Keyword.get(opts, :embedder, Fabrica.Embedder.configurado())` chama
  `configurado()` sempre, mesmo quando `opts[:embedder]` é passado — mesmo padrão
  já usado em `Ingestao.processar/3`, não é regressão desta tarefa.
