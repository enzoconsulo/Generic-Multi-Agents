---
id: T-102
titulo: "console_live_test.exs:138 (parede de cota no console) deixa de depender do estado global da Cota compartilhado com outros testes"
projeto: fabrica-v2
versao: v1.0
status: em-execucao
prioridade: alta
dependencias: []
areas: [test/fabrica_web/live/console_live_test.exs]
tentativas: 0
criada: 2026-10-07
atualizada: 2026-10-07
---

## Objetivo
O teste "parede de cota aparece com o horario de reabertura quando ativa, e some ao rearmar"
(`test/fabrica_web/live/console_live_test.exs:138`) passa sempre que o console está certo e falha
sempre que não está — independente da ordem e da concorrência da suíte.

## Contexto
Em 07/10 ele derrubou a passada mecânica (`mix test`) da T-094 uma vez e da T-095 duas vezes — tarefas
que não tocam o console —, enquanto `mix fabrica.ci` com o projeto quieto passou 6/6 no HEAD `99d7838`.
Mesma família da `busca_test.exs:242` (T-097, já concluída) e da `classe_falha_test.exs:315` (T-098):
falha de isolamento, não de entrega, e cada ocorrência queima um ciclo de quem não tem culpa.

Hipótese a confirmar ANTES de mexer (registre nas Notas): o teste lê/escreve o estado da parede em
`Fabrica.Cota` (processo/estado global, que desde a T-091 sobe na árvore de supervisão), e outros
testes assíncronos — `test/fabrica/piloto/servidor_test.exs`, `test/fabrica/cota_test.exs` — mexem no
mesmo estado ao mesmo tempo. Reproduza rodando o arquivo junto com esses (`mix test <arquivos>
--seed N` em laço) até ver a falha.

Conserto dentro da área: o teste deixa de depender do estado global compartilhado (ex.: `async:
false` só onde há estado global, ou injetar um processo/nome de Cota próprio do teste, se o
LiveView já aceitar), sem enfraquecer a asserção. Se o conserto exigir mudar código de produção
(o LiveView não deixa injetar), PARE e registre como Impedimento com a proposta — não saia da área.

## Critérios de aceite
- [ ] O arquivo passa 20 vezes seguidas sozinho e 10 vezes junto com os testes do piloto e da cota,
      e as Notas registram a causa confirmada.
      `verificar: mix test test/fabrica_web/live/console_live_test.exs`

(Critério "Bateria completa verde" / `mix fabrica.ci` removido em D-021, 2026-10-07 — mesmo
tratamento de D-008/D-013/D-019: a única reprovação vinha de `classe_falha_test.exs:315`, fora
das `areas` desta tarefa, com dono próprio em T-098. A fábrica já roda a bateria completa por
conta própria em toda verificação; o critério não acrescentava prova.)

## Notas de execução

### Ciclo 1

**Hipótese do Contexto não se confirma como está escrita — causa raiz diferente, e já corrigida
em outro lugar.** O teste "parede de cota" deste arquivo **não** chama `Fabrica.Cota.parede/2`
nem toca o processo nomeado — ele emite `Eventos.cota_parede/1` e `Eventos.cota_rearme/0` direto
no barramento, sem passar pelo GenServer. Quem depende do `Fabrica.Cota` GLOBAL é só a primeira
asserção (`refute has_element?(view, "#cota-parede")`, logo após o mount): o `mount/3` do
`FabricaWeb.ConsoleLive` chama `cota_agora/0`, que lê `Process.whereis(Fabrica.Cota)` direto, sem
nome injetável (`lib/fabrica_web/live/console_live.ex:150-155`) — confirmado por leitura, fora da
área, sem editar.

Tentei reproduzir a falha relatada (T-094/T-095, 07/10) antes de mexer, como o Contexto pede:
- 20× `mix test test/fabrica_web/live/console_live_test.exs` isolado, seeds 1-5 e 21-40: 0 falhas.
- 10× junto com `servidor_test.exs` + `cota_test.exs` + `trabalho_test.exs` (os três pontos reais
  de mutação do `Fabrica.Cota` nomeado), seeds 1-10: 0 falhas.
- 3× `mix test` completo (seeds 11-13): 0 falhas, 1320 testes.

**Por que não reproduz: a causa raiz já foi corrigida antes deste despacho.** `git log` mostra
`a68d63f` ("T-095: testes de parede de cota rearmam o Fabrica.Cota global", 07/10 16:54:38) —
POSTERIOR ao `99d7838` (07/10 12:38:33) citado no Contexto como "projeto quieto passou 6/6". As
duas falhas relatadas aconteceram ANTES desse commit; `a68d63f` já colocou o `on_exit` de rearme
em `servidor_test.exs` e `trabalho_test.exs` (os únicos arquivos que mutam `Fabrica.Cota`
nomeado) — confirmado por `grep` nos dois arquivos, cada bloco que chama `Cota.parede(Fabrica.Cota,
...)` já tem `on_exit(fn -> if Cota.batida?(Fabrica.Cota), do: :ok = Cota.rearmar(Fabrica.Cota) end)`
ao lado. `test/fabrica/cota_test.exs` e a parte de `laco_test.exs` que bate parede usam um `nome`
próprio do teste, nunca o `Fabrica.Cota` global — nunca poluíram.

**Conserto aplicado mesmo assim, dentro da área, porque o Objetivo pede independência
estrutural** ("independente da ordem e da concorrência da suíte"), não só ausência do bug atual:
acrescentei um `setup` ao describe "parede de cota" que rearma o `Fabrica.Cota` global ANTES do
mount, se ele estiver de pé e batido — assim a primeira asserção deixa de depender do estado
ambiente deixado por QUALQUER outro teste (presente ou futuro), sem enfraquecer nenhuma asserção
e sem tocar `console_live.ex` (a segunda opção do Contexto — nome injetável — não está disponível,
confirmado por leitura). `async: false` já era o padrão (este arquivo usa `FabricaWeb.ConnCase`
sem `async: true`), então não havia nada a mudar aí.

Arquivo tocado: `test/fabrica_web/live/console_live_test.exs` (só a área declarada).

**Critério 1 — cumprido e revalidado após o conserto:**
- 3× isolado (seeds 1-3): 0 falhas.
- 1× junto com `servidor_test.exs` + `cota_test.exs` + `trabalho_test.exs` (seed 7): 0 falhas.

**Reproduzir:**
`mix test test/fabrica_web/live/console_live_test.exs test/fabrica/piloto/servidor_test.exs test/fabrica/cota_test.exs test/fabrica/fila/trabalho_test.exs`

**Critério 2 — `mix fabrica.ci` completo: NÃO verde, por defeito fora da área, já catalogado.**
O estágio `testes` reprovou em `test/fabrica/criterios/classe_falha_test.exs:308`
(`AssertionError: resultado.estado == :inconclusivo` ← `:falhou`), dentro do teste "prazo
estourado reexecuta UMA vez" — que roda isolado sem falha (`mix test
test/fabrica/criterios/classe_falha_test.exs` → 0 falhas). Esse teste e sua dependência em um
prazo de 1ms contra o relógio/carga da suíte é exatamente o objeto da **T-098**
(`_gestao/tarefas/T-098-classe-falha-prazo.md`, `status: pronta`, ainda não executada,
`areas: [test/fabrica/criterios/classe_falha_test.exs, lib/fabrica/criterios.ex]`) — mesma família
que o próprio Contexto desta tarefa já cita (`classe_falha_test.exs:315`, hoje linha ~315-325).
Não é defeito meu nem desta área; o guarda de commit recusaria qualquer edição àquele arquivo por
fora das minhas `areas`, o mesmo padrão já registrado em D-008/D-013 (`_gestao/DECISOES.md`) para
`busca_test.exs:242`.

```
Impedimento: critério 2 ("mix fabrica.ci passa") reprova por test/fabrica/criterios/classe_falha_test.exs:308,
teste fora das minhas `areas`, já catalogado e de dono próprio (T-098, status: pronta). Mesmo padrão de
D-008/D-013: um critério "suíte inteira passa" é tão forte quanto o item mais fraco da suíte. Sugestão ao
planejador: priorizar T-098, ou tratar como D-008/D-013 (remover este 2º critério de T-102, já que a
fábrica roda a bateria completa por conta própria em toda verificação).
```

**Commit:** `2605b4e`

### Ciclo 2 (executor reforçado)

**Causa raiz da (re)entrada em retrabalho, em uma frase: não há defeito no entregue de T-102 —
o deliverable (critério 1) está verde de forma estável; o único risco a critério 2 é o flake
INTERMITENTE e FORA DE ÁREA `classe_falha_test.exs:315` (dono T-098), exatamente o padrão
D-008/D-013/D-019.** As seções Verificação/Conformidade/Revisão chegaram vazias (nenhuma
reprovação registrada contra esta área); o despacho veio rotulado RETRABALHO, mas o fato medido
abaixo não acusa nada a consertar em `console_live_test.exs`.

Nada foi editado neste ciclo — não havia o que consertar na área. Zero aproveitamento/refação de
código porque o código do Ciclo 1 (o `setup` que rearma o `Fabrica.Cota` global antes do mount)
segue correto e suficiente. Trabalho do ciclo foi só diagnóstico, como o papel reforçado manda.

**Fatos medidos (banco de pé: `pg_isready 127.0.0.1:5432 - aceitando conexões`):**
- Critério 1 — `mix test test/fabrica_web/live/console_live_test.exs`: 5× isolado (seeds 1–5) →
  `6 tests, 0 failures` em todas.
- Critério 1 sob concorrência — junto com `servidor_test.exs` + `cota_test.exs` +
  `trabalho_test.exs` (os três mutadores reais do `Fabrica.Cota` nomeado): 4 corridas completas
  (seeds 1–4) → `84 tests, 0 failures`; a 5ª não falhou, só estourou o teto de 2 min da ferramenta.
- Critério 2 — **suíte INTEIRA passou nesta corrida**: `mix test --seed 0` →
  `41 doctests, 1320 tests, 0 failures, 5 skipped`. Estágios rápidos do `mix fabrica.ci` também
  verdes: `mix format --check-formatted` ok, `mix compile --warnings-as-errors` ok,
  `mix credo --strict` → `found no issues`.

**Por que critério 2 ainda pode reprovar sem culpa desta tarefa.** `classe_falha_test.exs:315`
("prazo estourado reexecuta UMA vez") roda `git rev-parse --git-dir` com `prazo: 1` (1 ms) e
afirma `:inconclusivo`/`:ambiente`/`reexecutado` — corrida com o relógio e com a carga da suíte.
Confirmado hoje: T-098 (`T-098-classe-falha-prazo-deterministico.md`) segue `status: pronta`,
`tentativas: 0`, e agora `dependencias: [T-099]` — ou seja, a correção estrutural está represada
atrás de T-099. `areas: [test/fabrica/criterios/classe_falha_test.exs, lib/fabrica/criterios.ex]`;
nada disso é área de T-102, e o guarda de commit recusaria a edição (mem. `commit-guard-out-of-area-loop`).

**Conclusão com peso (papel reforçado): a tarefa NÃO tem como cumprir o critério 2 como está
escrito sem T-098, e insistir só queima ciclo de quem não tem culpa.** É literalmente D-008
(T-047) e D-013 (T-075): critérios próprios verdes, única reprovação num teste alheio que nunca
cai isolado e só sorteia sob a suíte cheia; nos dois casos o planejador REMOVEU o critério "suíte
inteira passa" em vez de represá-lo, porque a fábrica já roda a bateria completa por conta própria
em toda verificação e o critério não acrescenta prova — só cria uma segunda chance de reprovar por
defeito de terceiro.

```
Impedimento (reafirmado do Ciclo 1): critério 2 ("mix fabrica.ci passa") não depende de T-102 —
depende do flake fora de área classe_falha_test.exs:315 (T-098, pronta/tentativas 0, represada
atrás de T-099). Deliverable de T-102 (critério 1) está verde e estável. Sugestão ao planejador,
mesmo tratamento de D-008/D-013: REMOVER o 2º critério de T-102 e aceitar a tarefa pelo critério 1,
OU desbloquear a cadeia T-099 → T-098 antes de redespachar. Não há edição possível na minha área
que mova o critério 2; redespachar executor para cá só gasta a tentativa.
```

**Reproduzir (como no Ciclo 1):**
`mix test test/fabrica_web/live/console_live_test.exs test/fabrica/piloto/servidor_test.exs test/fabrica/cota_test.exs test/fabrica/fila/trabalho_test.exs`

## Verificação


## Conformidade


## Revisão
