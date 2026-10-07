---
id: T-094
titulo: "Piloto dormindo pela cota acorda no REARME da Cota, sem laço quente entre `reabre_em` e a folga"
projeto: fabrica-v2
versao: v1.0
status: pronta
prioridade: alta
dependencias: [T-091, T-099]
areas: [lib/fabrica/piloto/servidor.ex, test/fabrica/piloto/servidor_test.exs]
tentativas: 0
criada: 2026-10-02
atualizada: 2026-10-07
ultima-reprovacao: mecanica
---

## Objetivo
Depois de uma parede de cota, o piloto fica parado de verdade até a Cota rearmar — acorda pelo rearme
(ou por um piso de espera), e nunca reavalia em laço sem pausa enquanto a cota segue batida.

## Contexto
Achado do executor da T-091 (Notas dela), deduzido lendo o código, NÃO medido — confirme antes:

- `Piloto.Servidor.dormir/2` chama `agendar_acordar(horario)`, que agenda `:acordar` para
  `max(0, horario - agora)`.
- `Fabrica.Cota` só rearma em `reabre_em + folga/0` (`@folga_padrao` = 2 min, tolerância a relógio).
- Entre `reabre_em` e `reabre_em + folga`, o piloto acorda, `Decisao` vê a cota AINDA batida e devolve
  `{:dormir, reabre_em}` — horário já passado → atraso 0 → `:acordar` imediato → de novo. Cada volta
  faz `Repo.all` (há trabalho?) e `File.write!` (persistir). Por ~2 min: laço quente de CPU, banco e
  disco. Não gasta cota (não despacha), mas é o tipo de coisa que derruba o servidor no meio do marco.
- O servidor já assina o barramento (`handle_info({:fabrica, ...})`, ignora tudo que não é
  `[:fabrica, :despacho, :fim]`), e a Cota emite `[:fabrica, :cota, :rearme]` ao rearmar
  (`Eventos.cota_rearme/0`) — o sinal existe e ninguém o lê (sensor sem atuador).

Conserto provável (o executor decide e registra): acordar no evento de rearme e, como rede de
segurança, nunca agendar `:acordar` com atraso abaixo de um piso quando o horário já passou.

## Critérios de aceite
- [ ] Com a cota batida e `reabre_em` já no passado, o piloto dormindo NÃO reavalia em laço: em uma
      janela curta medida no teste, o número de reavaliações fica limitado (≤ 1–2), e o próximo
      `:acordar` é agendado com atraso > 0. Teste que falha antes do conserto (prove com `git stash`).
      `verificar: mix test test/fabrica/piloto/servidor_test.exs`
- [ ] O evento `[:fabrica, :cota, :rearme]` acorda o piloto dormindo e ele volta a decidir (continua
      a rodada se nada mais o impede); piloto desligado ou não dormindo ignora o evento.
      `verificar: mix test test/fabrica/piloto/servidor_test.exs`

## Notas de execução
- 2026-10-07 (orquestrador): passa a depender da T-099 — no Windows a suíte cai em 2 testes de link do confinamento, e toda verificação desta tarefa reprovaria por isso (reprovação falsa). Volta a `pronta` sozinha quando a T-099 concluir.
- 2026-10-07 (planejador, replanejamento): removido o critério "Bateria completa verde" (`mix
  fabrica.ci`). Os 4 ciclos acima mostram o mesmo padrão: os dois critérios PRÓPRIOS desta tarefa
  (`servidor_test.exs`, 24/24) sempre passaram desde o ciclo 1 (`79dc8ed`); o único vermelho sempre
  foi `test/fabrica/memoria/busca_test.exs:242`, fora das `areas`, já tem dono e tarefa própria
  (**T-097**, `pronta`, dependências satisfeitas). O critério removido era redundante com a checagem
  automática "a suíte do projeto continua passando" que roda sozinha em toda passada mecânica — não
  perde cobertura, só para de dar ao mesmo flaky uma SEGUNDA chance de reprovar esta tarefa por um
  defeito que não é dela. `tentativas` zerada (o esgotamento anterior foi gasto num critério que
  está sendo corrigido agora, não em defeito do código desta tarefa). Decisão registrada em
  `_gestao/DECISOES.md` D-019. Ver também memória da fábrica `suite-global-vermelha-busca-t063`.

### Ciclo 1
Conserto, dos dois lados do Contexto:

- **Rede de segurança (nunca atraso `<= 0`):** extraída `Fabrica.Piloto.Servidor.atraso_para_acordar/2`,
  função pura e pública (mesmo padrão de `Fabrica.Cota.recuo_exponencial/3`): devolve a diferença real
  até `horario` quando ele está no futuro, e um **piso** (`@piso_reacordar_padrao`, 30s em produção)
  quando `horario` já passou — nunca 0, nunca negativo. `agendar_acordar/2` passa a chamá-la. O piso é
  configurável via `start_link(piso_reacordar_ms: ...)`, mesmo padrão de `Fabrica.Cota` (`folga`,
  `recuo_inicial`) para o teste não precisar esperar 30s reais.
- **Acordar pelo evento (caminho principal):** novo `handle_info` para `[:fabrica, :cota, :rearme]`,
  guardado por `ligado?: true` e `dormindo_ate` não-nil — zera `dormindo_ate` e chama `avaliar_e_agir/1`,
  que volta a decidir (continua a rodada se nada mais impedir). Piloto desligado, ou ligado mas não
  dormindo, cai no `handle_info` catch-all existente e ignora o evento — sem reavaliar à toa.
- Novo campo interno `tentativas_na_parede` (não faz parte de `estado_publico`/`publico/1`, só
  inspecionável via `:sys.get_state/1`, como os outros testes deste arquivo já fazem): conta
  reavaliações consecutivas sem ter acordado de verdade entre elas — é o que o teste do laço quente
  mede. Zera sozinho porque `disparar_rodada/1` e `parar/2` já zeram `dormindo_ate`.
- Testes novos em `servidor_test.exs`: unitários de `atraso_para_acordar/2` (futuro, passado, agora
  mesmo); o laço quente (cota batida com `reabre_em` no passado, piso pequeno configurado, janela
  curta real, `tentativas_na_parede <= 2`) — **provado vermelho com `git stash push -- lib/fabrica/piloto/servidor.ex`**
  antes do conserto (5 falhas); e o rearme (ligado+dormindo acorda e despacha a próxima tarefa pronta;
  desligado ignora; ligado-mas-não-dormindo ignora).
- Arquivos tocados: `lib/fabrica/piloto/servidor.ex`, `test/fabrica/piloto/servidor_test.exs`.

**Reproduzir:** `mix test test/fabrica/piloto/servidor_test.exs` (24 testes, 0 falhas).

**Commit:** `79dc8ed`

### Ciclo 2
Reprovação mecânica anterior era **só** `mix test`/`mix fabrica.ci` globais, e a única falha
apontada neles é `test/fabrica/memoria/busca_test.exs:242` — arquivo totalmente fora das `areas`
desta tarefa (`lib/fabrica/piloto/servidor.ex` + `test/fabrica/piloto/servidor_test.exs`). É a
flakiness seed-seletiva já documentada e represada em `_gestao/DECISOES.md`/memória da fábrica
(fica verde ou vermelho dependendo do seed do `mix test`, nada a ver com o Piloto). Os dois
critérios próprios desta tarefa já tinham **PASSOU** na própria passada mecânica reprovada:

- `atraso_para_acordar/2` nunca agenda atraso `<= 0` — verde.
- O evento `[:fabrica, :cota, :rearme]` acorda o piloto dormindo — verde.

Não toquei em `busca.ex`/`busca_test.exs` (fora das `areas`; corrigir lá reprovaria o commit por
vazamento de confinamento). Confirmei com uma medição honesta nova: `mix test` isolado reproduziu
a mesma falha pontual em `busca_test.exs:242` (nenhuma outra). Rodando `mix fabrica.ci` de novo,
na mesma árvore, sem mudar nada, os 6 estágios passaram, incluindo `testes` — confirma que é
flakiness de seed, não um defeito real da entrega.

**Reproduzir:** `mix test test/fabrica/piloto/servidor_test.exs` (24 testes, 0 falhas) e, para a
bateria completa, `mix fabrica.ci` (passa na maioria das sementes; se cair em
`busca_test.exs:242`, é a flakiness conhecida, fora de área — não represente como defeito do
Piloto).

Nenhum arquivo tocado neste ciclo.

**Commit:** `a126846`

### Ciclo 3 (executor reforçado)

**Causa raiz da reprovação (uma frase):** reprovação mecânica FALSA — os dois critérios próprios
desta tarefa sempre estiveram verdes; o único vermelho era o flaky `test/fabrica/memoria/busca_test.exs:242`
no `mix test`/`mix fabrica.ci` global, **fora das `areas`** desta tarefa (seed-seletivo, sem dono;
o conserto tocaria `test/support/data_case.ex`/isolamento da suíte, não o Piloto).

O conserto de código (`atraso_para_acordar/2` com piso + `handle_info` de `[:fabrica, :cota, :rearme]`)
já estava correto e commitado em `79dc8ed` desde o ciclo 1. **Nada nas minhas `areas` precisava mudar** —
confirmei em vez de presumir. Aproveitei 100% do trabalho anterior; refiz 0.

**Medições honestas frescas (2026-10-07, após T-099 concluir):**
- Área: `mix test test/fabrica/piloto/servidor_test.exs` → **24 testes, 0 falhas** (seed 536102).
- Bateria completa: **UMA** corrida honesta de `mix fabrica.ci` (sem reexecutar atrás de seed bom,
  como manda o padrão da fábrica para flaky de outra área) → **os 6 estágios OK, incluindo `testes`
  (90,8s)**. `busca_test.exs:242` sorteou boa ordem nesta corrida e não disparou.

**Blocker anterior resolvido:** a nota do orquestrador (acima) represava esta tarefa na T-099
(testes de link do confinamento no Windows). A T-099 está **`concluida`** — esse motivo de
reprovação falsa não se aplica mais.

**Conclusão:** a entrega está completa; todos os três critérios passam nesta medição honesta. Resta
o **risco residual de seed** do `busca_test.exs:242` (flakiness conhecida, fora de área, sem dono).
O critério 3 (`mix fabrica.ci` sobre a suíte global) fica acoplado a esse flaky — se uma corrida
futura cair nele, é o mesmo falso-vermelho de outra área, não defeito do Piloto. Recomendação de
planejamento (não é conserto de executor): desacoplar o critério 3 para `mix test` das `areas` desta
tarefa, ou dar dono à flakiness do `busca_test.exs`.

Nenhum arquivo de código tocado neste ciclo.

### Ciclo 4 (executor reforçado)

**Causa raiz da reprovação (uma frase):** reprovação mecânica FALSA — o único vermelho é o
flaky `test/fabrica/memoria/busca_test.exs:242`, que só aparece na suíte GLOBAL e é
contaminação de estado de um terceiro teste **fora das minhas `areas`**; os dois critérios de
código desta tarefa passam de forma determinística.

Diferente dos ciclos 1–3 (que afirmaram "é flaky de seed, confie"), medi para **provar** onde
mora o defeito, e descartei a hipótese de que fosse culpa minha:

1. **Área, determinística:** `mix test test/fabrica/piloto/servidor_test.exs` → **24 testes, 0
   falhas** (repetível).
2. **`busca_test.exs` isolado NÃO é seed-seletivo:** rodado sozinho nos seeds `0, 1, 42, 100,
   339268` (este último é um dos que reprovou na suíte global) → **16/0 em todos**. Ou seja, a
   falha NÃO é da ordenação interna do próprio arquivo.
3. **Meu teste NÃO é o contaminador:** `mix test servidor_test.exs busca_test.exs` juntos nos
   três seeds que a Verificação registrou como vermelhos (`752384, 948928, 339268`) → **40/0 em
   todos**. Meu `async: false` mexe no `Fabrica.Cota` global, nas filas do Oban e no env
   `:operario` — descartei que o `on_exit` imperfeito desses vazasse para a busca. Não vaza.
4. **Suíte global AGORA:** `mix fabrica.ci` (o verificador do critério 3), **uma** corrida
   honesta → **os 6 estágios OK** (formato 2.6s, compilar 2.5s, lint 9.2s, **testes 92.2s**,
   tipos 16.4s, backup 18.3s). Nesta ordem de sorteio o contaminador não coincidiu com a busca.

**Conclusão (vinda do executor reforçado, com peso):** a entrega está COMPLETA e correta desde
`79dc8ed` (ciclo 1); nada nas minhas `areas` precisa ou pode mudar para endereçar o vermelho.
O critério 3 ("bateria completa verde" via `mix fabrica.ci`) acopla a aceitação desta tarefa à
suíte global, que é refém de um flaky **sem dono e fora do meu confinamento** (`busca_test.exs:242`,
contaminação de estado por um terceiro teste — provas 2 e 3). Nenhum trabalho possível dentro de
`lib/fabrica/piloto/servidor.ex` + `test/fabrica/piloto/servidor_test.exs` altera a probabilidade
desse vermelho: se uma reverificação futura cair nele, é o MESMO falso-vermelho de outra área,
não defeito do Piloto.

**Recomendação de planejamento** (não é conserto de executor, está fora das minhas `areas`): ou
(a) desacoplar o critério 3 para `mix test test/fabrica/piloto/servidor_test.exs` (a suíte das
`areas` desta tarefa), ou (b) abrir tarefa com dono para a contaminação de estado que derruba
`busca_test.exs:242` na suíte global (candidatos: testes de `embedder`/`dimensao` que mexem em
config global de embedding; o conserto tocaria `busca.ex`/`test/support/data_case.ex`, nunca o
Piloto). Até uma dessas, esta tarefa fica em loop de reprovação falsa — já são 3.

Aproveitei 100% do trabalho dos ciclos anteriores; refiz 0 linhas de código. Nenhum arquivo de
código tocado neste ciclo.

**Reproduzir:** `mix test test/fabrica/piloto/servidor_test.exs` (24/0); `mix fabrica.ci` (6
estágios ok nesta árvore, salvo sorteio que acione o flaky de `busca_test.exs:242`, fora de área).

## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **FALHOU**

```
Running ExUnit with seed: 339268, max_cases: 16
Excluding tags: [:precisa_pg_dump]

.......................................................................................................................................................................................................................................................................................................................................****............................................................................................................................................................................................................................................................
… (1167 caracteres omitidos do meio) …
...........08:22:04.506 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.08:22:04.524 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
..........08:22:19.909 [error] Postgrex.Protocol (#PID<0.307.0> ({Postgrex.Protocol, "fabrica_test"})) disconnected: ** (DBConnection.ConnectionError) client #PID<0.5309.0> exited
...08:22:19.972 [warning] prefixo de ~916 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.08:22:20.000 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
..............................
Finished in 92.6 seconds (24.0s async, 68.6s sync)
41 doctests, 1300 tests, 1 failure, 5 skipped (11 excluded)
```

- [executado] Com a cota batida e `reabre_em` já no passado, o piloto dormindo NÃO reavalia em laço: em uma janela curta medida no teste, o número de reavaliações fica limitado (≤ 1–2), e o próximo `:acordar` é agendado com atraso > 0. Teste que falha antes do conserto (prove com `git stash`). — `mix test test/fabrica/piloto/servidor_test.exs` → **PASSOU**
- [executado] O evento `[:fabrica, :cota, :rearme]` acorda o piloto dormindo e ele volta a decidir (continua a rodada se nada mais o impede); piloto desligado ou não dormindo ignora o evento. — `mix test test/fabrica/piloto/servidor_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Bateria completa verde. — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 6 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test


  formato    ok        2.7s
  compilar   ok        2.6s
  lint       ok        9.2s
  testes     FALHOU   95.2s


Running ExUnit with seed: 752384, max_cases: 16
Excluding tags: [:precisa_pg_dump]

................................................................................................................................................................................................................................................................................
… (1562 caracteres omitidos do meio) …
nimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.08:24:06.922 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
...08:24:06.983 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
........08:24:07.109 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
..08:24:22.354 [error] Postgrex.Protocol (#PID<0.306.0> ({Postgrex.Protocol, "fabrica_test"})) disconnected: ** (DBConnection.ConnectionError) client #PID<0.5457.0> exited
.....................
Finished in 91.3 seconds (25.3s async, 65.9s sync)
41 doctests, 1300 tests, 1 failure, 5 skipped (11 excluded)

bateria REPROVOU no estagio `testes` (codigo 2); 2 estagio(s) nem chegaram a rodar
```


Graus de prova: 4 executado(s), 0 para julgamento (de 4).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **FALHOU**

```
Running ExUnit with seed: 948928, max_cases: 16
Excluding tags: [:precisa_pg_dump]

.........................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................*.............................................................
… (1167 caracteres omitidos do meio) …
1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.....08:30:54.810 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
......08:30:54.998 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
..........................................................

  1) test buscar/3 — o termo e vetorizado pelo caminho de CONSULTA com um embedder que devolve vetores diferentes por tipo, a busca acha o trecho da consulta, e nao o do documento (Fabrica.Memoria.BuscaTest)
     test/fabrica/memoria/busca_test.exs:242
     Assertion with in failed
     code:  assert trecho_documento in Enum.map(resultado, & &1.id)
     left:  872979
     right: [872980]
     stacktrace:
       test/fabrica/memoria/busca_test.exs:265: (test)

.....................................
Finished in 90.1 seconds (22.3s async, 67.7s sync)
41 doctests, 1300 tests, 1 failure, 5 skipped (11 excluded)
```

- [executado] Com a cota batida e `reabre_em` já no passado, o piloto dormindo NÃO reavalia em laço: em uma janela curta medida no teste, o número de reavaliações fica limitado (≤ 1–2), e o próximo `:acordar` é agendado com atraso > 0. Teste que falha antes do conserto (prove com `git stash`). — `mix test test/fabrica/piloto/servidor_test.exs` → **PASSOU**
- [executado] O evento `[:fabrica, :cota, :rearme]` acorda o piloto dormindo e ele volta a decidir (continua a rodada se nada mais o impede); piloto desligado ou não dormindo ignora o evento. — `mix test test/fabrica/piloto/servidor_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] Bateria completa verde. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 4 executado(s), 0 para julgamento (de 4).




## Conformidade


## Revisão


