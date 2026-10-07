---
id: T-038a
titulo: "Limite de agentes em voo pelo perfil de maquina (8 GB por padrao)"
projeto: fabrica-v2
versao: v0.4
status: concluida
prioridade: media
dependencias: [T-037, T-038]
areas: [config/config.exs, lib/fabrica/tarefas/fila.ex, lib/fabrica/fila/exclusao.ex, test/fabrica/fila/exclusao_test.exs, test/fabrica/fila/trabalho_test.exs, test/fabrica/tarefas/fila_test.exs, test/fabrica/marco_v04_test.exs]
tentativas: 1
criada: 2026-09-13
atualizada: 2026-09-26T14:45:00Z
---

## Objetivo
Aplicar a decisao D-003: o padrao do codigo passa a ser o perfil alvo de 8 GB —
`construtor: 2, verificador: 1, revisor: 1` —, e a maquina forte sobe o limite por configuracao.

## Contexto
**O numero ja esta decidido, com medicao** (`_gestao/DECISOES.md`, D-003; tabelas em
`_gestao/PROGRESSO.md`, v0.4, "Retrospectiva da T-035"). O que custa memoria e o numero de
agentes em voo (~0,4 GB por processo `claude`), nao a fila de onde ele vem. Hoje:

- `config/config.exs`: `queues: [construtor: 3, verificador: 1, revisor: 3]` — ate 7 agentes;
- `Fabrica.Tarefas.Fila` e `Fabrica.Fila.Exclusao`: `@max_construtores 3`, cada um no seu arquivo.

Ate 7 agentes da ~4 GB so da fabrica, sem folga num computador de 8 GB.

**O que fazer:**
1. Padrao = perfil alvo: filas `construtor: 2, verificador: 1, revisor: 1`, e o maximo de
   construtores das duas funcoes puras igual a 2.
2. **Uma fonte so para o limite de construtores.** Hoje sao tres `3` escritos em tres lugares (a
   fila Oban e os dois `@max_construtores`). Um limite que diverge do outro e exatamente o defeito
   que esta tarefa existe para impedir: faca os tres lerem o mesmo valor.
3. A maquina forte sobe o limite por configuracao (uma chave em `config`, lida em runtime), sem
   editar codigo. Documente a chave no `config/config.exs`, com a razao ao lado e o apontamento
   para a D-003.
4. Nao mexa no `verificador: 1`: o portao do meio exige projeto quieto.
5. **O marco da v0.4 continua provando TRES em voo.** Ele prova que o mecanismo aguenta 3, nao
   qual e o padrao. Se `test/fabrica/marco_v04_test.exs` depender do padrao, faca-o configurar o
   limite em 3 explicitamente — nunca enfraqueca a afirmacao para caber no numero novo.

**Nao e escopo:** medir de novo, mexer no motor de despacho, ou rediscutir o numero.

## Criterios de aceite
- [ ] Sem configuracao, `Fabrica.Fila.Exclusao` limita a 2 construtores.
      `verificar: mix test test/fabrica/fila/exclusao_test.exs`
- [ ] Sem configuracao, as filas Oban sobem com `construtor: 2, verificador: 1, revisor: 1`.
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] Configurando 3 construtores, a fila Oban e os dois `max_construtores` passam a 3, lidos da mesma fonte.
      `verificar: mix test test/fabrica/fila/exclusao_test.exs`

## Notas de execucao
Criada pelo orquestrador em 2026-09-13, a partir da D-003 (retrospectiva da T-035). Comandos de
`verificar:` copiados das tarefas donas dos arquivos: T-038 (`exclusao_test.exs`) e T-037
(`trabalho_test.exs`). `fila_test.exs` e `marco_v04_test.exs` entram nas `areas` de proposito:
mudar o padrao pode quebrar asserções deles, e corrigi-las fora das `areas` cairia no laco de
confinamento que ja custou ciclos da T-040 e da T-045.

### Ciclo 1

**Fonte unica do numero.** `Fabrica.Tarefas.Fila` ganhou `max_construtores_padrao/0`, que le
`Application.get_env(:fabrica, :max_construtores, 2)` — os dois `@max_construtores` que existiam
(um em `Fila`, outro em `Fabrica.Fila.Exclusao`) foram REMOVIDOS. `Exclusao.lote/2` agora delega
`Fila.max_construtores_padrao()` como default de `:max_construtores`, em vez de ler o proprio
atributo — ha literalmente um so lugar no codigo onde o teto por padrao esta escrito.

`config/config.exs` define `max_construtores = 2` (variavel local) e usa a MESMA variavel em
`config :fabrica, :max_construtores` e em `queues: [construtor: max_construtores, ...]` do Oban —
os dois nascem do mesmo numero no mesmo arquivo. Comentario ao lado aponta para D-003 e diz
explicitamente: para subir o limite (maquina de 16 GB), mude so essa variavel, sem tocar em
`lib/fabrica/tarefas/fila.ex` nem `lib/fabrica/fila/exclusao.ex`.

`queues` do Oban passou de `[construtor: 3, verificador: 1, revisor: 3]` para
`[construtor: 2, verificador: 1, revisor: 1]` (D-003: perfil alvo, no maximo 4 agentes em voo).
`verificador: 1` nao foi tocado, como o item 4 do Contexto pede.

**Testes atualizados (nenhum enfraquecido para caber no numero novo — item 5 do Contexto):**
- `exclusao_test.exs`: o teste "ate 3 construtores..." passou a esperar 2 (criterio 1). Acrescentei
  o describe "o teto de construtores tem uma fonte so (D-003)": um teste read-only provando que
  `Fila.max_construtores_padrao()`, `Application.fetch_env!(:fabrica, :max_construtores)` e
  `queues[:construtor]` do Oban sao o MESMO numero por construcao; e um teste que muda
  `Application.put_env(:fabrica, :max_construtores, 3)` (restaurado em `on_exit`) e confere que
  `Fila` e `Exclusao` passam a usar 3 juntos (criterio 3). O arquivo virou `async: false`: essa
  mutacao e estado GLOBAL do VM, e um modulo `async: true` arriscaria outro teste ler o valor no
  meio da troca.
- `trabalho_test.exs`: o teste de config das filas (criterio 2) passou a esperar
  `construtor: 2, revisor: 1` (mantendo `verificador: 1`).
- `fila_test.exs`: os tres testes que dependiam do DEFAULT antigo (3) sem declarar isso — "ate 3
  construtores em paralelo", "prioridade manda" e "empate completo cai no codigo" — agora passam
  `max_construtores: 3` explicito, porque o que eles provam (mecanismo aguenta 3 / ordem da fila)
  e independente do padrao. Acrescentei um teste novo confirmando o padrao sem configuracao (2).
- `marco_v04_test.exs`: `Exclusao.lote([t_a, t_b, t_c])` passou a `Exclusao.lote([t_a, t_b, t_c],
  max_construtores: 3)` — o marco prova que o MECANISMO aguenta 3 em voo, nao qual e o padrao
  (item 5 do Contexto).

**Nao mexido:** motor de despacho, numero em si (so a fonte de onde ele vem), medicao.

**Reproduzir:**
`mix test test/fabrica/fila/exclusao_test.exs test/fabrica/fila/trabalho_test.exs test/fabrica/tarefas/fila_test.exs test/fabrica/marco_v04_test.exs`
(63 testes, todos passando; `mix credo --strict` e `mix compile --warnings-as-errors` limpos nos
arquivos tocados.)

**Commit:** `dad3717`

## Verificacao

### Ciclo 1 — Testador

- **[PASSOU] [executado] Critério 1: Sem configuração, `Fabrica.Fila.Exclusao` limita a 2 construtores.**
  Comando: `mix test test/fabrica/fila/exclusao_test.exs`
  Saída: 14 tests, 0 failures (33ms)

- **[PASSOU] [executado] Critério 2: Sem configuração, as filas Oban sobem com `construtor: 2, verificador: 1, revisor: 1`.**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs`
  Saída: 13 tests, 0 failures (17.2s)

- **[PASSOU] [executado] Critério 3: Configurando 3 construtores, fila Oban e `max_construtores` passam a 3, lidos da mesma fonte.**
  Comando: `mix test test/fabrica/fila/exclusao_test.exs` (describe "o teto de construtores tem uma fonte so (D-003)")
  Saída: 14 tests (mesmos), incluindo testes de Application.put_env(:fabrica, :max_construtores, 3) e validação de que Fila e Exclusao passam a usar 3 juntos

Suíte relacionada: 
- fila_test.exs: 34 tests ✓ (testes atualizados para passar `max_construtores: 3` explícito, sem enfraquecimento)
- marco_v04_test.exs: 2 tests ✓ (mantém `max_construtores: 3` explícito; prova que mecanismo aguenta 3, não o padrão)

Verifica: 
- `config/config.exs` define `max_construtores = 2` na linha 60
- Mesma variável em `config :fabrica, :max_construtores` e em `queues: [construtor: max_construtores, verificador: 1, revisor: 1]`
- Nenhum `@max_construtores` disperso em código
- `Fila.max_construtores_padrao/0` lê de `Application.get_env(:fabrica, :max_construtores, 2)` — fonte única
- Commit `dad3717` registra implementação completa

Graus de prova: 3 executados, 0 julgados (de 3)

## Conformidade

Conformidade: cumpre

- Padrão = perfil alvo (`construtor: 2, verificador: 1, revisor: 1`) → `config/config.exs:60-68`
  (`max_construtores = 2`, `queues: [construtor: max_construtores, verificador: 1, revisor: 1]`).
  `verificador: 1` não foi tocado (item 4 do Contexto).
- Fonte única para o limite de construtores → `lib/fabrica/tarefas/fila.ex:86-92`
  (`max_construtores_padrao/0`, lê `Application.get_env(:fabrica, :max_construtores, 2)`) e
  `lib/fabrica/fila/exclusao.ex:56` (`Keyword.get(opcoes, :max_construtores,
  Fila.max_construtores_padrao())`). Os dois `@max_construtores` antigos (um em cada módulo)
  foram removidos — confirmado por busca: nenhum `@max_construtores` resta no código
  (só ocorrências em prosa de `config/config.exs` e nas Notas). `config/config.exs` usa a MESMA
  variável local (`max_construtores`) para `config :fabrica, :max_construtores` e para a fila do
  Oban — os três nascem de um só literal.
- Máquina forte sobe o limite só por configuração, sem editar código → comentário em
  `config/config.exs:56-58` diz isso explicitamente e aponta para D-003; o teste
  "configurando :max_construtores para 3, Fila e Exclusao passam a usar 3 juntos"
  (`exclusao_test.exs`) prova que `Fila`/`Exclusao` seguem a config em runtime. A fila do Oban em
  si é fixada no boot (não dá para reescalar via `Application.put_env` em teste sem reiniciar o
  supervisor) — o teste "sem configuracao, o padrao de Fila e Exclusao e o mesmo que a fila Oban
  usa" prova a igualdade estrutural (mesma fonte, mesmo literal) em vez de uma mudança dinâmica.
  Dado que a fila Oban É estática por natureza do Oban, considero isto satisfaz "lidos da mesma
  fonte" no espírito do critério 3 — não é atalho, é o único jeito correto de provar essa
  invariante sem reiniciar o Oban dentro do teste.
- Marco da v0.4 continua provando 3 em voo, com `max_construtores: 3` explícito →
  `test/fabrica/marco_v04_test.exs:141` (item 5 do Contexto, cumprido à risca).
- Nenhum teste enfraquecido para caber no número novo → confirmado lendo `fila_test.exs` e
  `trabalho_test.exs`: os testes sobre MECANISMO (não sobre o padrão) passaram a declarar
  `max_construtores: 3` explícito; só os testes que já eram sobre o padrão passaram a esperar 2.
- Fora de escopo (medir de novo, motor de despacho, renumerar) → não tocado; confirmado pelo diff.
- `areas` respeitadas → diff toca só os 7 arquivos declarados em `areas` + `_gestao/MAPA.md`
  (gerado, não é código).
- Reexecutei os 4 arquivos de teste das `areas`: `mix test test/fabrica/fila/exclusao_test.exs
  test/fabrica/fila/trabalho_test.exs test/fabrica/tarefas/fila_test.exs
  test/fabrica/marco_v04_test.exs` → 63 tests, 0 failures (confirma o relato do executor e do
  testador, de forma independente).

## Revisao

Aprovado sem ressalvas.

Verifiquei, no diff do commit `dad3717`: `lib/fabrica/tarefas/fila.ex` (nova
`max_construtores_padrao/0` e os dois pontos de leitura em `proximos/2`),
`lib/fabrica/fila/exclusao.ex` (delegação em `lote/2`, sem estado próprio),
`config/config.exs` (variável única alimentando `config` e `queues`), e os quatro arquivos de
teste. Nenhum bug de correção, segurança ou integração encontrado:

- `Keyword.get(opcoes, :max_construtores, Fila.max_construtores_padrao())` chama
  `max_construtores_padrao/0` (uma leitura ETS via `Application.get_env/3`) mesmo quando
  `opcoes` já traz `:max_construtores` explícito, porque o Elixir avalia o argumento default do
  `Keyword.get/3` sempre — custo desprezível, não é bug.
- `async: false` em `exclusao_test.exs` é a escolha certa para a mutação de
  `Application.put_env(:fabrica, :max_construtores, ...)`: módulos `async: false` do ExUnit só
  rodam depois que todos os módulos `async: true` terminam (nunca em paralelo com eles), então
  não há risco de `fila_test.exs` (que lê o padrão sem configurar) ler o valor mutado.
- `config/test.exs` só acrescenta `testing: :manual` à chave `Oban` (merge, não substituição) —
  `queues` de `config/config.exs` chega intacto ao ambiente de teste; conferido lendo
  `config/test.exs`.

## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] Sem configuracao, `Fabrica.Fila.Exclusao` limita a 2 construtores. — `mix test test/fabrica/fila/exclusao_test.exs` → **PASSOU**
- [executado] Sem configuracao, as filas Oban sobem com `construtor: 2, verificador: 1, revisor: 1`. — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU**
- [executado] Configurando 3 construtores, a fila Oban e os dois `max_construtores` passam a 3, lidos da mesma fonte. — `mix test test/fabrica/fila/exclusao_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 4 executado(s), 0 para julgamento (de 4).
