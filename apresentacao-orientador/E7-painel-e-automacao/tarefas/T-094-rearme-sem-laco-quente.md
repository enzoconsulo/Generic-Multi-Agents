---
id: T-094
titulo: "Piloto dormindo pela cota acorda no REARME da Cota, sem laço quente entre `reabre_em` e a folga"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-091, T-099, T-095]
areas: [lib/fabrica/piloto/servidor.ex, test/fabrica/piloto/servidor_test.exs]
tentativas: 1
criada: 2026-10-02
atualizada: 2026-10-07
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
- 2026-10-07 (planejador, replanejamento pós-Ciclo 6): **passa a depender também da T-095.**
  Ciclo 6 declarou `Impedimento:` (canal do protocolo, regra 0) por compilação quebrada —
  conferi antes de aceitar: `git status`/`git diff` confirmam, agora, modificações NÃO
  commitadas em `lib/fabrica/agente/estado.ex`, `lib/fabrica/agente/laco.ex` e
  `lib/fabrica/fila/trabalho.ex` (WIP de T-095, pelo `@moduledoc` "Parede não é julgamento"),
  chamando `parede?/1` e `segurar/3` que não existem em lugar nenhum — `mix compile` falha, e
  isso derruba QUALQUER suíte, não um defeito de T-094. Os dois critérios próprios desta
  tarefa seguem verdes desde o ciclo 1 (`79dc8ed`); nada nas `areas` dela precisa mudar.
  Impedimento aceito como real e externo (verificável, regra 0): T-095 está `pronta` (não
  `concluida`) mas já tem trabalho parcial incompleto solto na árvore compartilhada — sem uma
  dependência declarada, o motor pode despachar T-094 de novo antes de T-095 fechar, repetindo
  o mesmo impedimento. `dependencias` ganha T-095; `tentativas` zerada (mesma régua da D-019:
  o esgotamento foi gasto em bloqueio de outra área, não em defeito do código desta tarefa).
  Decisão registrada em D-020. Volta a `pronta`/despachável quando T-095 concluir (código
  commitado, árvore compilável) — não antes.
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

### Ciclo 5 (pós-D-019: critério acoplado à suíte global removido, `tentativas` zerada)

Despacho novo após o replanejamento (`_gestao/DECISOES.md` D-019): removido o critério "Bateria
completa verde", que era o único vermelho nos 4 ciclos anteriores — e era de outra área
(`busca_test.exs:242`, dono T-097). Os dois critérios próprios desta tarefa já eram verdes desde
o ciclo 1 (`79dc8ed`). Confirmei de novo em vez de presumir: nada nas minhas `areas` mudou.

**Achado no caminho (fora das minhas `areas`, não mexi):** a árvore tinha mudanças NÃO commitadas
em `lib/fabrica/agente/estado.ex`, `lib/fabrica/agente/laco.ex` e `lib/fabrica/fila/trabalho.ex`
(trabalho de outra tarefa, aparenta ser T-095 — "parede não é julgamento"), e esse trabalho estava
**incompleto**: `Fabrica.Fila.Trabalho.executar/2` chama `parede?/1` e `segurar/3`, que não existem
em lugar nenhum do módulo — a árvore não compilava. Para conseguir rodar os testes da minha área
sem tocar nesses arquivos, guardei-os com `git stash push -- <os 3 arquivos>`, rodei a suíte, e
devolvi com `git stash pop` logo em seguida — nenhum conteúdo deles foi alterado por mim. Registro
aqui porque quem pegar T-095 (ou o orquestrador) precisa saber que esse trabalho está em progresso,
não commitado, e quebrado no estado em que estava.

Medição honesta fresca, só da área, com a árvore compilável (mudanças de T-095 fora):
`mix test test/fabrica/piloto/servidor_test.exs` → **24 testes, 0 falhas** (seed 203976).

Nenhum arquivo de código tocado neste ciclo (área já estava correta). Arquivos tocados por mim:
`_gestao/tarefas/T-094-rearme-sem-laco-quente.md`, `_gestao/MAPA.md`.

**Reproduzir:** `mix test test/fabrica/piloto/servidor_test.exs` (24/0). Se a árvore não compilar
por causa de T-095 incompleta, isso é esperado até aquela tarefa ser concluída ou revertida — não
é defeito desta tarefa.

**Commit:** `0a41866`

### Ciclo 6 (executor reforçado)

**Causa raiz da reprovação (uma frase):** a última passada mecânica (fim da seção Verificação)
reprova por erro de **compilação** em `lib/fabrica/fila/trabalho.ex` (`parede?/1` e `segurar/3`
indefinidas) — não por teste; e esses dois nomes nem existem em `areas` desta tarefa.

Confirmei de novo em vez de presumir: a árvore tem, não commitado, o MESMO trabalho incompleto
de outra tarefa (aparenta T-095, pelo `@moduledoc` que ela já escreveu em `trabalho.ex`:
"Parede não é julgamento") que o Ciclo 5 já tinha encontrado e registrado — em
`lib/fabrica/agente/estado.ex`, `lib/fabrica/agente/laco.ex` e `lib/fabrica/fila/trabalho.ex`,
nenhum deles nas minhas `areas` (`lib/fabrica/piloto/servidor.ex` +
`test/fabrica/piloto/servidor_test.exs`). `trabalho.ex` chama `parede?(resumo)` e
`segurar(tarefa, papel, resumo)` sem defini-las — a árvore não compila, e isso derruba
QUALQUER suíte (`mix test`, com ou sem filtro de arquivo), não um defeito do Piloto.

Para medir minha área sem tocar nos 3 arquivos: `git stash push -- lib/fabrica/agente/estado.ex
lib/fabrica/agente/laco.ex lib/fabrica/fila/trabalho.ex`, rodei a suíte, `git stash pop` logo
depois — devolvido byte a byte, nada meu alterado neles.

**Medição honesta fresca (2026-10-07), árvore compilável:**
`mix test test/fabrica/piloto/servidor_test.exs` → **24 testes, 0 falhas**.

**Conclusão:** nada nas minhas `areas` precisa mudar. Os dois critérios próprios desta tarefa
seguem verdes desde `79dc8ed` (ciclo 1). O bloqueio atual não é o flaky de `busca_test.exs`
(D-019 já desacoplou aquele) — é um segundo problema de outra área: trabalho de T-095 commitado
parcialmente/deixado incompleto na árvore compartilhada. Não é meu papel completar ou revert
T-095 (fora de `areas`, e reverter destruiria trabalho de outro agente em voo).

Impedimento (resolvido 07/10): a suíte global não compila por causa de trabalho não commitado e incompleto de
outra tarefa (aparenta T-095: faltam `parede?/1` e `segurar/3` em `lib/fabrica/fila/trabalho.ex`,
fora das `areas` desta tarefa) — nenhuma passada mecânica vai ficar verde até esse trabalho ser
concluído ou revertido por quem é dono dele.

Nenhum arquivo de código tocado neste ciclo. Arquivos tocados por mim: este arquivo de tarefa.

**Reproduzir (só a área, sem depender de T-095 estar completa):**
`git stash push -- lib/fabrica/agente/estado.ex lib/fabrica/agente/laco.ex lib/fabrica/fila/trabalho.ex && mix test test/fabrica/piloto/servidor_test.exs && git stash pop`

**Commit:** `a053e9d`

### Ciclo 7 (executor reforçado)

**Causa raiz da reprovação (uma frase):** reprovação mecânica FALSA, família nova — a última
passada mecânica (fim da seção Verificação, commit `c42116d`) reprova por
`test/fabrica_web/live/console_live_test.exs:138` ("parede de cota aparece com o horario de
reabertura... e some ao rearmar"), um teste de LiveView fora das `areas` desta tarefa
(`lib/fabrica/piloto/servidor.ex` + `test/fabrica/piloto/servidor_test.exs`).

Confirmei antes de aceitar, em vez de presumir:

1. **O flake já tem dono e tarefa própria.** `_gestao/tarefas/T-102-console-live-cota-isolada.md`
   (criada 2026-10-07, `pronta`, área `test/fabrica_web/live/console_live_test.exs`) — o Contexto
   dela cita explicitamente esta derrubada: "Em 07/10 ele derrubou a passada mecânica (`mix test`)
   da T-094 uma vez e da T-095 duas vezes [...] falha de isolamento, não de entrega". Mesma família
   de `busca_test.exs:242` (T-097, já concluída) que reprovou os ciclos 2–4 desta tarefa.
2. **A árvore compila limpa agora** (`mix compile --warnings-as-errors` → exit 0, sem diffs
   pendentes em `lib/`/`test/`) — o impedimento de compilação do Ciclo 6 (T-095 incompleta) está
   resolvido; `git log` confirma `lib/fabrica/fila/trabalho.ex` com `parede?/1`/`segurar/3`
   definidas desde o commit `86bac63`.
3. **Nada nas minhas `areas` mudou desde o Ciclo 1:** `git diff 79dc8ed -- lib/fabrica/piloto/servidor.ex`
   → vazio. O único diff em `test/fabrica/piloto/servidor_test.exs` desde então é da própria T-095
   (ajuste do `perform_job` para `{:snooze, segundos}`, já commitado em `86bac63`), não meu.

**Medição honesta fresca (2026-10-07), só a área:**
`mix test test/fabrica/piloto/servidor_test.exs` → **24 testes, 0 falhas** (seed 531595).

**Conclusão:** a entrega está completa e correta desde `79dc8ed` (ciclo 1); nada nas minhas
`areas` precisa mudar. A reprovação é, de novo, de outra área — agora com dono explícito (T-102).
Nenhum arquivo de código tocado neste ciclo. Arquivo tocado por mim: este arquivo de tarefa.

**Reproduzir:** `mix test test/fabrica/piloto/servidor_test.exs` (24/0).

**Commit:** `069dfc9`

## Notas do orquestrador
- 2026-10-07 15:45 UTC (orquestrador): → `em-teste` direto, sem novo ciclo de construção. As reprovações desta rodada foram falsas: a passada mecânica rodou sobre árvore suja (trabalho incompleto da T-095, cortado pela parede de cota, quebrava a compilação) e a flake de `busca_test.exs:242`. Com o projeto quieto e a árvore limpa, `mix fabrica.ci` no HEAD `99d7838`: **6/6 verde** (testes 94,5 s). O entregável está commitado; o verificador decide. Mesmo precedente da T-065 e T-072 (01/10). Linha `Impedimento:` anterior (se houver) está resolvida: a compilação voltou.

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

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **FALHOU**

```
Compiling 3 files (.ex)

     error: undefined function segurar/3 (expected Fabrica.Fila.Trabalho to define such a function or for it to be imported, but none are available)
     │
 237 │           segurar(tarefa, papel, resumo)
     │           ^^^^^^^
     │
     └─ lib/fabrica/fila/trabalho.ex:237:11: Fabrica.Fila.Trabalho.executar/2

     error: undefined function parede?/1 (expected Fabrica.Fila.Trabalho to define such a function or for it to be imported, but none are available)
     │
 236 │         if parede?(resumo) do
     │            ^^^^^^^
     │
     └─ lib/fabrica/fila/trabalho.ex:236:12: Fabrica.Fila.Trabalho.executar/2


== Compilation error in file lib/fabrica/fila/trabalho.ex ==
** (CompileError) lib/fabrica/fila/trabalho.ex: cannot compile module Fabrica.Fila.Trabalho (errors have been logged)
```

- [executado] Com a cota batida e `reabre_em` já no passado, o piloto dormindo NÃO reavalia em laço: em uma janela curta medida no teste, o número de reavaliações fica limitado (≤ 1–2), e o próximo `:acordar` é agendado com atraso > 0. Teste que falha antes do conserto (prove com `git stash`). — `mix test test/fabrica/piloto/servidor_test.exs` → **FALHOU**

```
Compiling 3 files (.ex)

     error: undefined function segurar/3 (expected Fabrica.Fila.Trabalho to define such a function or for it to be imported, but none are available)
     │
 237 │           segurar(tarefa, papel, resumo)
     │           ^^^^^^^
     │
     └─ lib/fabrica/fila/trabalho.ex:237:11: Fabrica.Fila.Trabalho.executar/2

     error: undefined function parede?/1 (expected Fabrica.Fila.Trabalho to define such a function or for it to be imported, but none are available)
     │
 236 │         if parede?(resumo) do
     │            ^^^^^^^
     │
     └─ lib/fabrica/fila/trabalho.ex:236:12: Fabrica.Fila.Trabalho.executar/2


== Compilation error in file lib/fabrica/fila/trabalho.ex ==
** (CompileError) lib/fabrica/fila/trabalho.ex: cannot compile module Fabrica.Fila.Trabalho (errors have been logged)
```

- [executado] O evento `[:fabrica, :cota, :rearme]` acorda o piloto dormindo e ele volta a decidir (continua a rodada se nada mais o impede); piloto desligado ou não dormindo ignora o evento. — `mix test test/fabrica/piloto/servidor_test.exs` → **FALHOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 3 executado(s), 0 para julgamento (de 3).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **FALHOU**

```
Running ExUnit with seed: 354483, max_cases: 16
Excluding tags: [:precisa_pg_dump]

................................................................................................................................................................................................................................................................................................................................****...................................................................................................................................................................................................................................................................
… (3669 caracteres omitidos do meio) …
ede ({:cota, nil}); devolvida a fila sem julgamento
....12:44:44.548 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.....12:44:44.629 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
......

  1) test parede de cota aparece com o horario de reabertura quando ativa, e some ao rearmar (FabricaWeb.ConsoleLiveTest)
     test/fabrica_web/live/console_live_test.exs:138
     Expected false or nil, got true
     code: refute has_element?(view, "#cota-parede")
     arguments:

         # 1
         #Phoenix.LiveViewTest.View<
           id: "phx-GNxJyj7pQgB69jDi",
           module: FabricaWeb.ConsoleLive,
           pid: #PID<0.5655.0>,
           endpoint: FabricaWeb.Endpoint,
           ...
         >

         # 2
         "#cota-parede"

     stacktrace:
       test/fabrica_web/live/console_live_test.exs:141: (test)

.....................
Finished in 93.3 seconds (23.9s async, 69.3s sync)
41 doctests, 1308 tests, 1 failure, 5 skipped (11 excluded)
```

- [executado] Com a cota batida e `reabre_em` já no passado, o piloto dormindo NÃO reavalia em laço: em uma janela curta medida no teste, o número de reavaliações fica limitado (≤ 1–2), e o próximo `:acordar` é agendado com atraso > 0. Teste que falha antes do conserto (prove com `git stash`). — `mix test test/fabrica/piloto/servidor_test.exs` → **PASSOU**
- [executado] O evento `[:fabrica, :cota, :rearme]` acorda o piloto dormindo e ele volta a decidir (continua a rodada se nada mais o impede); piloto desligado ou não dormindo ignora o evento. — `mix test test/fabrica/piloto/servidor_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 3 executado(s), 0 para julgamento (de 3).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] Com a cota batida e `reabre_em` já no passado, o piloto dormindo NÃO reavalia em laço: em uma janela curta medida no teste, o número de reavaliações fica limitado (≤ 1–2), e o próximo `:acordar` é agendado com atraso > 0. Teste que falha antes do conserto (prove com `git stash`). — `mix test test/fabrica/piloto/servidor_test.exs` → **PASSOU**
- [executado] O evento `[:fabrica, :cota, :rearme]` acorda o piloto dormindo e ele volta a decidir (continua a rodada se nada mais o impede); piloto desligado ou não dormindo ignora o evento. — `mix test test/fabrica/piloto/servidor_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)

Graus de prova: 3 executado(s), 0 para julgamento (de 3).

### Ciclo 8 (testador)

**Situação:** Retrabalho — T-095 (dependência) concluída (`parede?/1` e `segurar/3` definidas, `mix compile` verde); T-099 (confinamento no Windows) concluída. Árvore compilável. Impedimento anterior resolvido.

- **[PASSOU] [executado] Com cota batida e `reabre_em` já no passado, o piloto dormindo NÃO reavalia em laço**
  Comando: `mix test test/fabrica/piloto/servidor_test.exs`
  Saída: `24 tests, 0 failures` (seed 413222)

- **[PASSOU] [executado] O evento `[:fabrica, :cota, :rearme]` acorda o piloto dormindo e volta a decidir**
  Comando: `mix test test/fabrica/piloto/servidor_test.exs` (mesmo comando, veredito reaproveitado)
  Saída: `24 tests, 0 failures` (seed 413222)

Compilação verde: `mix compile --warnings-as-errors` → exit 0

Graus de prova: 2 executado(s), 0 para julgamento (de 2).





## Conformidade

### Ciclo 1

Conformidade: cumpre

- Critério 1 ("piloto dormindo NÃO reavalia em laço... atraso > 0") → `Fabrica.Piloto.Servidor.atraso_para_acordar/2` em `lib/fabrica/piloto/servidor.ex`, commit `79dc8ed` (ciclo 1), testado em `test/fabrica/piloto/servidor_test.exs`. PASSOU no testador (Ciclo 8) e reconfirmado por mim: `mix test test/fabrica/piloto/servidor_test.exs` → 24 testes, 0 falhas.
- Critério 2 ("evento `[:fabrica, :cota, :rearme]` acorda o piloto dormindo") → `handle_info` novo em `servidor.ex`, mesmo commit `79dc8ed`, mesmo arquivo de teste. PASSOU no testador (Ciclo 8), mesma reconfirmação acima.
- Escopo: este ciclo (commit `069dfc9`) não toca código — só a tarefa e o `MAPA.md` (regeneração do índice, rotina). Confirmei `git diff 79dc8ed HEAD -- lib/fabrica/piloto/servidor.ex` → vazio: nada nas `areas` mudou desde a entrega original.
- Contrato com o plano: a reprovação mecânica que motivou este ciclo era de `test/fabrica_web/live/console_live_test.exs:138`, fora das `areas` desta tarefa. O executor não tocou esse arquivo (confinamento correto) e apontou corretamente o dono (`T-102`, que existe, está `pronta`, área = aquele mesmo arquivo). `mix compile --warnings-as-errors` → exit 0 nesta árvore, confirmando que o impedimento de compilação do Ciclo 6 está mesmo resolvido.
- Sem interface nova nesta tarefa; não se aplica prova visual.

## Revisão

### Ciclo 1

Aprovado sem ressalvas. Verifiquei de forma independente (não apenas aceitei o relato):
`git diff 79dc8ed HEAD -- lib/fabrica/piloto/servidor.ex` vazio, `mix compile --warnings-as-errors`
exit 0, e `mix test test/fabrica/piloto/servidor_test.exs` → 24 testes, 0 falhas. O diff deste
ciclo é só documentação (tarefa + `MAPA.md`); não há código para revisar quanto a bugs.

[menor] `_gestao/tarefas/T-094-rearme-sem-laco-quente.md` — o commit `069dfc9` (revisado aqui) foi
gravado sem a linha `**Commit:** \`hash\`` ao fim do Ciclo 7, violando o protocolo (regra que esta
própria seção de Revisão deveria cobrar). Já foi corrigido no commit seguinte (`9b50521`, "hash da
revisão"), fora do diff que me foi despachado — registro para constar, não bloqueia a entrega.

