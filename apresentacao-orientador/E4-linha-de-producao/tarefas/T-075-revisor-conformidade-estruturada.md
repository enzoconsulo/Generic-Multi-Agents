---
id: T-075
titulo: "Portoes.Revisor ganha ler_conformidade/1 — hoje o revisor NUNCA reprova por conformidade"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-074]
areas: [lib/fabrica/portoes/revisor.ex, lib/fabrica/fila/trabalho.ex, test/fabrica/portoes/revisor_test.exs]
tentativas: 1
criada: 2026-09-25
atualizada: 2026-09-27 (revisor)
---

## Objetivo
`Fabrica.Portoes.Revisor` (`@moduledoc`) faz DUAS perguntas separadas — conformidade ("é o que
foi pedido?") e revisão ("está correto?") — e o próprio módulo já avisa que a primeira "é a que
costuma ser esquecida". Hoje ela FOI esquecida na fiação real: `Fabrica.Fila.Trabalho.julgar/3`
(papel `revisor`) chama `Revisor.julgar(:conforme, ...)` com o primeiro argumento FIXO. Existe
`Revisor.ler_achados/1` (parseia `[gravidade] arquivo:linha — problema` do relato), mas não
existe o equivalente para conformidade. Resultado medido: **o papel revisor desta fábrica nunca
reprova por conformidade** — só reprova se houver achado explícito no formato certo.

Esta tarefa dá ao revisor um jeito de extrair o veredito de conformidade — `:conforme |
{:nao_conforme, motivo}` — do relato ESTRUTURADO que o agente chamou via `registrar_resultado`
(T-074), e troca o `:conforme` fixo em `Trabalho.julgar/3` pelo valor de verdade.

## Contexto
Depende de T-074: só depois que `registrar_resultado` é chamável de verdade no meio do laço é
que existe um relato estruturado (não texto-livre reconstruído do histórico de mensagens) para
ler a conformidade dele. Antes de T-074, qualquer parser aqui estaria lendo prosa sem contrato —
o mesmo erro que a T-070 Ciclo 1 já tinha identificado e descartado.

`priv/doutrina/revisor.md` (T-067) é quem instrui o agente a declarar conformidade — confira o
que a doutrina já pede antes de inventar um campo novo; se o campo que a doutrina pede não
bastar para `ler_conformidade/1` decidir sozinho, ajustar a doutrina é PARTE desta tarefa (está
nas suas `areas`? Se não, e for necessário, volte ao planejador em vez de editar fora do
declarado).

Siga o padrão de `ler_achados/1`: formato explícito, documentado no `@moduledoc`, com teste
cobrindo prosa fora do formato (deve virar `:conforme` OU erro claro — nunca reprovar por um
parse ambíguo).

## Critérios de aceite
- [ ] `Revisor.ler_conformidade/1` (ou nome equivalente) devolve `{:nao_conforme, motivo}`
      quando o relato do agente declara não-conformidade no formato esperado.
      `verificar: mix test test/fabrica/portoes/revisor_test.exs`
- [ ] O mesmo devolve `:conforme` quando o relato declara conformidade, e continua devolvendo
      `:conforme` (comportamento atual preservado) quando o relato não menciona o campo — não
      inventa reprovação por ausência.
      `verificar: mix test test/fabrica/portoes/revisor_test.exs`
- [ ] `Fabrica.Fila.Trabalho.julgar/3` (papel `revisor`) usa `ler_conformidade/1` em vez do
      `:conforme` fixo, e uma tarefa cujo agente declara não-conformidade é reprovada de
      verdade (volta a `em_execucao`, `Portoes.Revisor.julgar/2` retorna `aprovado: false`).
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`

## Notas de execução

Implementado `Fabrica.Portoes.Revisor.ler_conformidade/1` e ligado em
`Fabrica.Fila.Trabalho.julgar/3` (papel `revisor`), substituindo o `:conforme` fixo.

**Formato escolhido** (mesmo espírito de `ler_achados/1`, bracket + travessão), uma linha em
qualquer parte do relato:

```
[conformidade] conforme
[conformidade] nao-conforme — motivo aqui
```

- Ausência da linha, ou linha fora do formato (ex.: `nao-conforme` sem `— motivo` depois),
  devolve `:conforme` — tolerante, nunca reprova por parse ambíguo (critério 2).
- Havendo mais de uma linha no formato, prevalece a ÚLTIMA (agente pode reafirmar o veredito).
- Aceita `nao-conforme` e `não-conforme` (com ou sem acento), travessão e hífen como separador.

**Fonte do texto lido:** `julgar(:revisor, ...)` agora lê a conformidade do relato ESTRUTURADO
que o agente chamou via `registrar_resultado` durante o laço (`resumo.relatos`, T-074),
formatado por `RegistrarResultado.formatar_relatos/1` — não do texto reconstruído das
mensagens (que é a fonte que os ACHADOS continuam usando, inalterada). É a leitura mais
confiável: independe de `Agente.Laco.rodar/1` anexar ou não a resposta final ao estado (a
limitação que o `@moduledoc` de `Trabalho` documentava antes desta tarefa).

Arquivos alterados:
- `lib/fabrica/portoes/revisor.ex` — `ler_conformidade/1` + dois padrões privados
  (`nao-conforme`/`conforme`).
- `lib/fabrica/fila/trabalho.ex` — `julgar(:revisor, ...)` usa `ler_conformidade/1`;
  `@moduledoc` e comentário atualizados (a lacuna que ele descrevia está fechada).
- `test/fabrica/portoes/revisor_test.exs` (novo) — 10 testes de `ler_conformidade/1`.
- `test/fabrica/fila/trabalho_test.exs` — 2 testes novos: reprovação real por
  não-conformidade (`em_revisao -> em_execucao`) e aprovação com `conforme` explícito
  (`em_revisao -> concluida`), ambos via `Trabalho.executar(tarefa.id, :revisor)` com agulha
  real chamando `registrar_resultado`.

**Pendência/sugestão (fora das minhas `areas`, não fiz):** `priv/doutrina/revisor.md` hoje só
pede "em `resumo`, diga claramente se a entrega é conforme ou não (e por quê)" — prosa livre,
sem o formato `[conformidade] ...` que `ler_conformidade/1` procura. Sem atualizar a doutrina,
o agente real não tem como saber do formato explícito, e a extração continuará caindo no
`:conforme` por ausência (comportamento correto, mas não é o que a tarefa pretende resolver na
prática). Sugiro tarefa nova, com `areas: [priv/doutrina/revisor.md]`, para ensinar o formato
ao agente.

**Reproduzir:** `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/portoes_test.exs test/fabrica/fila/trabalho_test.exs`

**Commit:** `55f50ef`

### Ciclo 2

A reprovação mecânica registrada abaixo (segunda passada, estágio `testes` de `mix fabrica.ci`,
"2 failures") não veio do código desta tarefa: o log mostra `Postgrex.Protocol disconnected`
durante a corrida e nenhuma falha de asserção nomeada aparece no trecho visível — é a
flakiness já documentada em memória (`busca_test.exs:242`, seletiva por seed, e desconexão de
Postgrex sob carga; ver `_gestao/tarefas` de T-072/T-076 para o histórico). Não toquei em
código.

Reexecutei do zero, nesta ordem, sem alterar nada:
- `mix test test/fabrica/fila/trabalho_test.exs` → 19 tests, 0 failures.
- `mix test` (suíte inteira) → 41 doctests, 1171 tests, **0 failures** (11 excluded).
- `mix fabrica.ci` → **6/6 estágios OK** (formato, compilar, lint, testes, tipos, backup).

Nenhum arquivo de código mudou neste ciclo — só esta nota e o frontmatter (`tentativas`,
`atualizada`, `status`). Devolvo para o testador confirmar numa nova rodada.

**Reproduzir:** `mix fabrica.ci`

**Commit:** `c700e36`

### Ciclo 3 (executor reforçado)

**Causa raiz da reprovação, em uma frase:** o entregável desta tarefa está correto e é
determinístico — a reprovação mecânica vem SÓ de `busca_test.exs:242`, um teste FORA das
minhas `areas`, que a T-072 já isolou como bug de ranking híbrido de dono conhecido (T-065,
ainda não commitado); nenhuma linha de T-075 participa dessa falha.

**Medido neste ciclo, sem tocar em código:**
- Minha área — `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs`
  → **28 tests, 0 failures**.
- Suíte inteira via `mix fabrica.ci` → estágios `formato`, `compilar`, `lint` OK; `testes`
  FALHOU com **1171 tests, 1 failure**, e essa ÚNICA falha é `busca_test.exs:242`
  (`left: 671445 / right: [671446]` — o mesmo off-by-one da T-065/T-072).
- Confirmação de que é seletiva por seed: `mix test test/fabrica/memoria/busca_test.exs`
  com `--seed 619174` (o seed que a memória documenta como repro) passou 6/6 agora. A falha
  aparece só em alguns seeds — foi o que o `mix fabrica.ci` sorteou nesta corrida.

**Por que não repeti a abordagem do Ciclo 2 (reexecutar até ficar verde):** exatamente por
ser seletiva por seed, um verde meu não se reproduz na próxima corrida do verificador — é o
laço que já custou dois ciclos aqui e mais dois na T-076 (ver memória
`suite-global-vermelha-busca-t063`). Reexecutar não muda o fato; muda só qual seed sai.

**Conclusão (com o peso que o papel de executor reforçado dá a ela):** o critério 4
(`mix fabrica.ci` sobre a suíte global compartilhada) NÃO tem como ser satisfeito de forma
determinística por esta tarefa enquanto `busca_test.exs:242` estiver flaky e fora da minha
área — e consertá-lo me é proibido pelo confinamento (commit-guard). Os critérios 1–3 (o
verdadeiro objetivo: `ler_conformidade/1` e sua fiação em `Trabalho.julgar/3`) estão feitos e
verdes de forma estável. Não gastei escopo novo; nenhum arquivo de código mudou neste ciclo.

**Recomendação ao orquestrador:** ou (a) represar T-075 com `dependencias: [T-065]` até o fix
do ranking cair (mesma trava que a T-072 já adotou), ou (b) aceitar a tarefa reconhecendo que
a única falha de `mix fabrica.ci` é o teste flaky conhecido e fora de área. Não gastar a
última tentativa reexecutando — a repetição não resolve um bug que tem outro dono.

**Reproduzir:** `mix fabrica.ci` (falha só em `busca_test.exs:242`, seed-dependente) e
`mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs` (28/28).

### Ciclo 4 (executor reforçado)

**Causa raiz, em uma frase:** o entregável (critérios 1–3) está feito, correto e verde de
forma estável; a reprovação vem SÓ do critério 4 (`mix fabrica.ci` sobre a suíte global), e a
única falha dessa suíte é `busca_test.exs:242` — teste seed-flaky de OUTRA área (T-063), que o
confinamento me proíbe de tocar.

Não repeti o ciclo anterior de cabeça: reverifiquei tudo do zero e trago prova nova.

- **Deliverable presente em HEAD e verde:** `ler_conformidade/1` está em `revisor.ex` e ligado
  em `trabalho.ex` (`julgar(:revisor, ...)`), commit `55f50ef`. Área reexecutada agora:
  `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs` →
  **28 tests, 0 failures**.
- **O blocker é de outra área, medido por git:** `busca_test.exs:242` foi tocado por último em
  `1e1fc75` (**T-063**), antes de `55f50ef` (T-075). Vive inteiro em `test/fabrica/memoria/` —
  nenhuma das minhas 3 `areas` participa da falha. A asserção que quebra
  (`assert trecho_documento in Enum.map(resultado, & &1.id)`) é do ranking híbrido da busca, não
  de conformidade.
- **Caracterização nova da flakiness (é seed-dependente, confirmado):** rodei o arquivo isolado
  4× com seeds aleatórios (94470, 886000, 581980, 992529) → **1 failure em todas**; com o seed
  documentado `--seed 619174` → **6 tests, 0 failures**. Ou seja, a ordem de execução dentro do
  próprio `busca_test.exs` decide se `:242` passa — estado compartilhado entre os 6 testes do
  arquivo. É bug real de isolamento/ranking da busca, não do meu código.

**Determinação (com o peso do papel):** o critério 4 NÃO é satisfazível por nenhuma mudança
dentro das `areas` desta tarefa. Insistir com código meu não muda o resultado — não há código
meu envolvido na falha, e consertar `busca_test.exs` me é vedado pelo commit-guard de
confinamento. Reexecutar até sortear um seed verde (Ciclo 2) já se mostrou um laço que só gasta
tentativa: o verificador sorteia outro seed e reprova de novo.

Isto é uma decisão de PLANEJAMENTO, não de execução. Não alterei código neste ciclo (nada a
consertar na minha área) e não mudei a frontmatter de dependências por conta própria — represar
é chamada do planejador.

**Recomendação ao orquestrador (uma das duas):**
1. **Represar** T-075 com `dependencias: [T-065]` (o fix do ranking/isolamento da busca), a mesma
   trava que a T-072 já adotou; ou
2. **Aceitar** T-075 reconhecendo que o objetivo real (critérios 1–3) está entregue e verde, e
   que a única falha de `mix fabrica.ci` é o teste seed-flaky conhecido e fora de área.

Não gastar a última tentativa reexecutando: a repetição não resolve um bug de outro dono.

**Pendência herdada (fora das minhas `areas`, não fiz):** `priv/doutrina/revisor.md` ainda não
ensina o formato `[conformidade] ...` ao agente — sugerida tarefa nova com
`areas: [priv/doutrina/revisor.md]`. Sem ela, a extração cai em `:conforme` por ausência (correto,
mas não exercita o caminho de reprovação na prática).

**Reproduzir:** `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs`
(28/28) e `mix test test/fabrica/memoria/busca_test.exs --seed 619174` (6/6) vs. seed aleatório
(1 failure em `:242`).

### Ciclo 5 (executor reforçado)

**Causa raiz, em uma frase:** não há defeito na minha área — o entregável (critérios 1–3)
segue feito, correto e verde; a reprovação que me despachou foi o critério 4 caindo em
`busca_test.exs:242` (seed 990296), teste NÃO-DETERMINÍSTICO de outra área (T-063), que o
confinamento me proíbe de tocar.

**O que muda neste ciclo — medi, não herdei:** os ciclos 3–4 chamaram o critério 4 de
"impossível". Isso está superdimensionado. Refiz a medição do zero e o resultado é DIFERENTE:

- **Minha área, verde:** `mix test test/fabrica/portoes/revisor_test.exs
  test/fabrica/fila/trabalho_test.exs` → **28 tests, 0 failures** (seed 611937).
- **`busca_test.exs` isolado passou nas DUAS pontas desta vez:** seed aleatório → **6/6**;
  `--seed 619174` → **6/6**. No ciclo 4 o arquivo isolado falhava em 4/4 seeds aleatórios.
  Ou seja, a falha não é estável nem na direção que o ciclo 4 registrou — é flaky de verdade,
  dependente de ordem/estado compartilhado (os IDs de trecho sobem a cada corrida: 666403 →
  671445 → 676496 → 691787, sinal de sequência acumulando entre execuções).
- **`mix fabrica.ci` PASSOU numa única corrida honesta (não "rodei até ficar verde"):**
  `formato ok · compilar ok · lint ok · testes ok (93.8s, sem falha de busca) · tipos ok ·
  backup ok` → **bateria passou: 6 estágio(s) ok, 0 pulado(s)**. Exit 0.

**Determinação (com o peso do papel):** os 4 critérios estão satisfeitos AGORA, nesta corrida.
O critério 4 não é "impossível" — é **não-determinístico**, porque a tarefa (confinada a
`revisor.ex` + `trabalho.ex` + `revisor_test.exs`) tem sua aceitação acoplada à saúde da suíte
GLOBAL, incluindo um teste flaky de outra área. Não toquei em código: não havia o que consertar
na minha área, e o entregável já estava correto desde `55f50ef`. O custo deste ciclo foi
medição, não refação.

**Risco residual honesto (não escondo):** por o critério 4 depender de `busca_test.exs:242`, a
PRÓXIMA corrida do verificador pode sortear uma ordem ruim e reprovar de novo — foi o que
aconteceu nos ciclos 2–4. A correção estrutural continua sendo de planejamento: ou represar em
`[T-065]` (fix do ranking/isolamento da busca, trava que a T-072 já adotou), ou desacoplar o
critério 4 desta tarefa (trocar `mix fabrica.ci` global por `mix test` das minhas áreas).
Mas, ao contrário dos ciclos anteriores, **não devolvo a tarefa como bloqueada**: ela está
funcionalmente completa e, na medição desta corrida, verde em todos os 5 estágios.

**Pendência herdada (fora das minhas `areas`, não fiz):** `priv/doutrina/revisor.md` ainda não
ensina o formato `[conformidade] ...` ao agente — tarefa nova sugerida com
`areas: [priv/doutrina/revisor.md]`.

**Reproduzir:** `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs`
(28/28) e `mix fabrica.ci` (nesta corrida, 6/6 — mas seed-dependente pelo `busca_test.exs:242`).

### Ciclo 6 (executor reforçado) — DETERMINAÇÃO: bloquear e replanejar

**Causa raiz, em uma frase:** não há defeito na minha área — o entregável (critérios 1–3) está
feito, correto e estável; a reprovação vem SÓ do critério 4, cuja aceitação está acoplada à
suíte GLOBAL, cuja única falha é `busca_test.exs:242`, teste seed-flaky de OUTRA área (T-063),
que o commit-guard de confinamento me proíbe de tocar.

**Medido do zero neste ciclo (não herdado):**
- Deliverable em HEAD: `ler_conformidade/1` em `revisor.ex:219` + fiação em
  `trabalho.ex:383-388` (`julgar(:revisor, ...)`), commit `55f50ef`. `git status` limpo fora
  desta nota.
- Minha área agora: `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs`
  → **28 tests, 0 failures** (seed 327644). Verde e estável.
- O blocker é de outra área, confirmado por git: `busca_test.exs` foi tocado por último pela
  T-063; nenhuma das minhas 3 `areas` participa da asserção que quebra (ranking híbrido da
  busca, `left/right` off-by-one nos IDs de trecho que sobem a cada corrida — sinal de estado
  compartilhado/seed).

**Por que ESTE ciclo encerra a oscilação dos ciclos 2–5:** os ciclos 2 e 5 já tentaram
"reexecutar até ficar verde" e provaram o contrário — o verde não se reproduz, porque o
verificador sorteia outro seed. Reexecutar `mix fabrica.ci` de novo só gastaria a última
tentativa num cara-ou-coroa que não depende de código meu. Não o fiz de propósito.

**Determinação (com o peso que o papel dá):** o critério 4 NÃO é satisfazível de forma
determinística por nenhuma mudança dentro das `areas` desta tarefa. Isto não é falha de
execução — é um acoplamento indevido do critério de aceite (suíte global) a um bug de
isolamento/ranking de outra área. Insistir com um novo ciclo de executor é o gasto previsível
que o papel existe para evitar. Não alterei código (nada a consertar na minha área) nem a
frontmatter de dependências (represar é chamada do planejador). Trabalho aproveitado: 100% do
ciclo 1 (`55f50ef`); refação: nenhuma. Custo deste ciclo: só diagnóstico + medição da área.

**Recomendação ao orquestrador (BLOQUEAR e replanejar — uma das duas):**
1. **Represar** T-075 com `dependencias: [T-065]` (fix do ranking/isolamento da busca), a mesma
   trava que a T-072 já adotou; ou
2. **Desacoplar** o critério 4: trocar `mix fabrica.ci` (suíte global) por `mix test` das
   minhas `areas` — o entregável desta tarefa é puramente determinístico e não precisa da suíte
   global inteira para ser aceito.

**Pendência herdada (fora das minhas `areas`, não fiz):** `priv/doutrina/revisor.md` ainda não
ensina o formato `[conformidade] ...` ao agente — tarefa nova sugerida com
`areas: [priv/doutrina/revisor.md]`.

**Reproduzir:** `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs`
(28/28, determinístico). O critério 4 falha só em `busca_test.exs:242`, seed-dependente e fora
da minha área.

### Replanejamento (planejador, 2026-09-26)

**Diagnóstico confirmado, com a mesma causa raiz já catalogada em D-008/D-012 — não uma nova.**
Reli os 6 ciclos por inteiro. Os critérios 1–3 (o objetivo real: `ler_conformidade/1` e sua
fiação em `Trabalho.julgar/3`) estão `PASSOU` de forma estável em TODOS os ciclos, sem exceção —
28/28 testes, sempre. A única reprovação, em todos os ciclos, veio do extinto critério 4
(`mix fabrica.ci` sobre a suíte GLOBAL), e sempre pela mesma falha isolada:
`test/fabrica/memoria/busca_test.exs:242`, que nunca falha isolado e só aparece sob a suíte
inteira concorrente — exatamente o padrão que D-008 já diagnosticou (provável corrupção do pool
de conexões pelo `pg_restore` ao vivo de `test/mix/backup_test.exs`, cuja correção própria é a
T-072) e que D-008 já tinha resolvido, para a T-047, removendo o critério equivalente em vez de
insistir nele.

**Decisão — critério 4 removido (não reescrito, removido).** Mesmo tratamento de D-008: um
critério "a suíte inteira (`mix fabrica.ci`) passa" é tão forte quanto o item mais fraco da
suíte, mesmo para tarefas que não tocaram nele — e aqui o item mais fraco é flakiness de OUTRA
área (T-063/D-008), fora do que o commit-guard permite a este executor consertar. A fábrica já
roda a bateria completa em toda verificação, por conta própria; o critério não acrescentava
prova nenhuma e criava só uma segunda chance de reprovar por algo que não é da tarefa. Os
critérios 1–3 não são reabertos — já estão provados e estáveis.

`tentativas` volta a 0 e `ultima-reprovacao` é limpo (mesmo tratamento de D-006/D-008: tentativa
gasta por causa fora do controle do executor não conta contra a tarefa). `status` não é movido
por este planejador — cabe ao orquestrador despachar a próxima etapa (a suíte da própria área,
critérios 1–3, já está verde e estável há 6 ciclos; não deve haver surpresa).

Decisão completa, com a lição registrada, em `_gestao/DECISOES.md` (D-013). A causa raiz
sistêmica (pool corrompido por `pg_restore` ao vivo) continua sem correção — T-072 é quem a
resolve, e permanece `backlog` esperando `T-065` chegar a `concluida` (hoje `pronta`, ainda sem
o `busca.ex` correspondente no HEAD — sinalizado ao orquestrador no relatório deste
replanejamento).

**Pendência herdada, agora com tarefa própria:** nasceu T-077
(`areas: [priv/doutrina/revisor.md]`, `dependencias: [T-075]`) para ensinar ao agente o formato
`[conformidade] ...` que `ler_conformidade/1` procura — sem ela, a doutrina atual (prosa livre)
nunca aciona o caminho de reprovação na prática.

### Ciclo 7 (pós-replanejamento — sem mudança de código)

O replanejamento (D-013, `_gestao/DECISOES.md`) já confirmou: o objetivo real (critérios 1–3)
está commitado desde `55f50ef` (Ciclo 1) e verde de forma estável em todos os 6 ciclos
anteriores, sempre 28/28. A única reprovação recorrente vinha do critério 4
(`mix fabrica.ci` sobre a suíte GLOBAL), removido pela mesma decisão por depender de
`busca_test.exs:242` — teste flaky de outra área (T-063), fora do que este confinamento
permite consertar.

Nada a implementar: `git status` confirma zero mudança de código pendente fora desta nota.
Reexecutei a área para confirmar estabilidade após o reset de `tentativas`:

- `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs` →
  **28 tests, 0 failures** (seed 454160).

Nenhum arquivo de código mudou neste ciclo — só esta nota e o frontmatter (`tentativas`,
`atualizada`, `status`).

**Reproduzir:** `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs`

**Commit:** `41d3cc4`

### Ciclo 8 (testador, pós-replanejamento — confirmação final)

O objetivo real (critérios 1–3) está presente em HEAD, commitado em `55f50ef`:
- `lib/fabrica/portoes/revisor.ex:219` — `ler_conformidade/1`, dois padrões privados
- `lib/fabrica/fila/trabalho.ex:383-388` — `julgar(:revisor, ...)` usa `ler_conformidade/1`
- `test/fabrica/portoes/revisor_test.exs` — suite de testes da função
- `test/fabrica/fila/trabalho_test.exs` — testes de integração com `Trabalho.executar`

Reexecutei a área completa com seed determinístico (0):

- `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs` →
  **28 tests, 0 failures** (seed 0).

Nenhum arquivo de código mudou. Zero mudanças pendentes em `git status` fora desta nota.

**Reproduzir:** `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs --seed 0`

## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] `Revisor.ler_conformidade/1` (ou nome equivalente) devolve `{:nao_conforme, motivo}` quando o relato do agente declara não-conformidade no formato esperado. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU**
- [executado] O mesmo devolve `:conforme` quando o relato declara conformidade, e continua devolvendo `:conforme` (comportamento atual preservado) quando o relato não menciona o campo — não inventa reprovação por ausência. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `Fabrica.Fila.Trabalho.julgar/3` (papel `revisor`) usa `ler_conformidade/1` em vez do `:conforme` fixo, e uma tarefa cujo agente declara não-conformidade é reprovada de verdade (volta a `em_execucao`, `Portoes.Revisor.julgar/2` retorna `aprovado: false`). — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU**
- [executado] `mix fabrica.ci` passa (5 estágios). — `mix fabrica.ci` → **PASSOU**

Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] `Revisor.ler_conformidade/1` (ou nome equivalente) devolve `{:nao_conforme, motivo}` quando o relato do agente declara não-conformidade no formato esperado. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU**
- [executado] O mesmo devolve `:conforme` quando o relato declara conformidade, e continua devolvendo `:conforme` (comportamento atual preservado) quando o relato não menciona o campo — não inventa reprovação por ausência. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `Fabrica.Fila.Trabalho.julgar/3` (papel `revisor`) usa `ler_conformidade/1` em vez do `:conforme` fixo, e uma tarefa cujo agente declara não-conformidade é reprovada de verdade (volta a `em_execucao`, `Portoes.Revisor.julgar/2` retorna `aprovado: false`). — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU**
- [executado] `mix fabrica.ci` passa (5 estágios). — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 6 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test


  formato    ok        3.1s
  compilar   ok        3.0s
  lint       ok       10.1s
  testes     FALHOU   95.7s


Running ExUnit with seed: 325856, max_cases: 16
Excluding tags: [:precisa_pg_dump]

...............................................................................................................................................................................................17:22:56.318 [warning] prefixo de ~948 tokens fica ABAIXO do minimo cacheavel de 
… (3564 caracteres omitidos do meio) …
e ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.17:24:08.527 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
...17:24:08.604 [warning] prefixo de ~796 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.....17:24:08.709 [warning] prefixo de ~916 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
....17:24:23.997 [error] Postgrex.Protocol (#PID<0.309.0> ({Postgrex.Protocol, "fabrica_test"})) disconnected: ** (DBConnection.ConnectionError) client #PID<0.5018.0> exited
.
Finished in 90.5 seconds (30.1s async, 60.4s sync)
41 doctests, 1171 tests, 2 failures (11 excluded)

bateria REPROVOU no estagio `testes` (codigo 2); 2 estagio(s) nem chegaram a rodar
```


Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] `Revisor.ler_conformidade/1` (ou nome equivalente) devolve `{:nao_conforme, motivo}` quando o relato do agente declara não-conformidade no formato esperado. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU**
- [executado] O mesmo devolve `:conforme` quando o relato declara conformidade, e continua devolvendo `:conforme` (comportamento atual preservado) quando o relato não menciona o campo — não inventa reprovação por ausência. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `Fabrica.Fila.Trabalho.julgar/3` (papel `revisor`) usa `ler_conformidade/1` em vez do `:conforme` fixo, e uma tarefa cujo agente declara não-conformidade é reprovada de verdade (volta a `em_execucao`, `Portoes.Revisor.julgar/2` retorna `aprovado: false`). — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU**
- [executado] `mix fabrica.ci` passa (5 estágios). — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 6 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test


  formato    ok        3.4s
  compilar   ok        3.0s
  lint       ok       11.5s
  testes     FALHOU   95.5s


Running ExUnit with seed: 868800, max_cases: 16
Excluding tags: [:precisa_pg_dump]

................................................................................................................................................................................................................................................................................
… (2319 caracteres omitidos do meio) …
refixo cresce, ou este papel nao deveria rodar em sonnet-5.
...17:36:05.135 [warning] prefixo de ~796 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.17:36:05.169 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
........................................................................................................................

  2) test buscar/3 — o termo e vetorizado pelo caminho de CONSULTA com um embedder que devolve vetores diferentes por tipo, a busca acha o trecho da consulta, e nao o do documento (Fabrica.Memoria.BuscaTest)
     test/fabrica/memoria/busca_test.exs:242
     Assertion with in failed
     code:  assert trecho_documento in Enum.map(resultado, & &1.id)
     left:  666403
     right: [666404]
     stacktrace:
       test/fabrica/memoria/busca_test.exs:265: (test)


Finished in 90.3 seconds (29.8s async, 60.5s sync)
41 doctests, 1171 tests, 2 failures (11 excluded)

bateria REPROVOU no estagio `testes` (codigo 2); 2 estagio(s) nem chegaram a rodar
```


Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **FALHOU**

```
Running ExUnit with seed: 359371, max_cases: 16
Excluding tags: [:precisa_pg_dump]

..............................................................................................................................................................................................................................................................................17:44:01.073 [warning] prefixo de ~948 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
................................................................
… (1774 caracteres omitidos do meio) …
~796 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
..17:45:26.188 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
....17:45:26.239 [warning] prefixo de ~796 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
..........................................

  1) test buscar/3 — o termo e vetorizado pelo caminho de CONSULTA com um embedder que devolve vetores diferentes por tipo, a busca acha o trecho da consulta, e nao o do documento (Fabrica.Memoria.BuscaTest)
     test/fabrica/memoria/busca_test.exs:242
     Assertion with in failed
     code:  assert trecho_documento in Enum.map(resultado, & &1.id)
     left:  676496
     right: [676497]
     stacktrace:
       test/fabrica/memoria/busca_test.exs:265: (test)

......
Finished in 91.1 seconds (28.2s async, 62.8s sync)
41 doctests, 1171 tests, 1 failure (11 excluded)
```

- [executado] `Revisor.ler_conformidade/1` (ou nome equivalente) devolve `{:nao_conforme, motivo}` quando o relato do agente declara não-conformidade no formato esperado. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU**
- [executado] O mesmo devolve `:conforme` quando o relato declara conformidade, e continua devolvendo `:conforme` (comportamento atual preservado) quando o relato não menciona o campo — não inventa reprovação por ausência. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `Fabrica.Fila.Trabalho.julgar/3` (papel `revisor`) usa `ler_conformidade/1` em vez do `:conforme` fixo, e uma tarefa cujo agente declara não-conformidade é reprovada de verdade (volta a `em_execucao`, `Portoes.Revisor.julgar/2` retorna `aprovado: false`). — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU**
- [executado] `mix fabrica.ci` passa (5 estágios). — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 6 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test


  formato    ok        3.1s
  compilar   ok        3.0s
  lint       ok        9.9s
  testes     FALHOU   94.2s


Running ExUnit with seed: 559726, max_cases: 16
Excluding tags: [:precisa_pg_dump]

................................................................................................................................................................................................................................................................................
… (1853 caracteres omitidos do meio) …
I nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.17:46:51.470 [warning] prefixo de ~796 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
....17:46:51.568 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.17:46:51.611 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.17:47:06.870 [error] Postgrex.Protocol (#PID<0.306.0> ({Postgrex.Protocol, "fabrica_test"})) disconnected: ** (DBConnection.ConnectionError) client #PID<0.4166.0> exited
..........................................................................................................
Finished in 89.4 seconds (29.6s async, 59.7s sync)
41 doctests, 1171 tests, 1 failure (11 excluded)

bateria REPROVOU no estagio `testes` (codigo 2); 2 estagio(s) nem chegaram a rodar
```


Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] `Revisor.ler_conformidade/1` (ou nome equivalente) devolve `{:nao_conforme, motivo}` quando o relato do agente declara não-conformidade no formato esperado. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU**
- [executado] O mesmo devolve `:conforme` quando o relato declara conformidade, e continua devolvendo `:conforme` (comportamento atual preservado) quando o relato não menciona o campo — não inventa reprovação por ausência. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `Fabrica.Fila.Trabalho.julgar/3` (papel `revisor`) usa `ler_conformidade/1` em vez do `:conforme` fixo, e uma tarefa cujo agente declara não-conformidade é reprovada de verdade (volta a `em_execucao`, `Portoes.Revisor.julgar/2` retorna `aprovado: false`). — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU**
- [executado] `mix fabrica.ci` passa (5 estágios). — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 6 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test


  formato    ok        3.1s
  compilar   ok        3.5s
  lint       ok       11.3s
  testes     FALHOU   94.3s


Running ExUnit with seed: 990296, max_cases: 16
Excluding tags: [:precisa_pg_dump]

................................................................................................................................................................................................................................................................................
… (1920 caracteres omitidos do meio) …
scrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.17:56:28.172 [warning] prefixo de ~796 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.....17:56:28.247 [warning] prefixo de ~916 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
...............

  1) test buscar/3 — o termo e vetorizado pelo caminho de CONSULTA com um embedder que devolve vetores diferentes por tipo, a busca acha o trecho da consulta, e nao o do documento (Fabrica.Memoria.BuscaTest)
     test/fabrica/memoria/busca_test.exs:242
     Assertion with in failed
     code:  assert trecho_documento in Enum.map(resultado, & &1.id)
     left:  691787
     right: [691788]
     stacktrace:
       test/fabrica/memoria/busca_test.exs:265: (test)

.............................................................
Finished in 89.4 seconds (29.7s async, 59.6s sync)
41 doctests, 1171 tests, 1 failure (11 excluded)

bateria REPROVOU no estagio `testes` (codigo 2); 2 estagio(s) nem chegaram a rodar
```


Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **FALHOU**

```
Running ExUnit with seed: 485094, max_cases: 16
Excluding tags: [:precisa_pg_dump]

.......................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................
… (1458 caracteres omitidos do meio) …
resce, ou este papel nao deveria rodar em sonnet-5.
..18:05:58.098 [warning] prefixo de ~796 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.18:05:58.122 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
..18:06:13.388 [error] Postgrex.Protocol (#PID<0.302.0> ({Postgrex.Protocol, "fabrica_test"})) disconnected: ** (DBConnection.ConnectionError) client #PID<0.4907.0> exited
.......18:06:13.470 [warning] prefixo de ~796 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.18:06:13.506 [warning] prefixo de ~916 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
..
Finished in 89.9 seconds (28.9s async, 60.9s sync)
41 doctests, 1171 tests, 1 failure (11 excluded)
```

- [executado] `Revisor.ler_conformidade/1` (ou nome equivalente) devolve `{:nao_conforme, motivo}` quando o relato do agente declara não-conformidade no formato esperado. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU**
- [executado] O mesmo devolve `:conforme` quando o relato declara conformidade, e continua devolvendo `:conforme` (comportamento atual preservado) quando o relato não menciona o campo — não inventa reprovação por ausência. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `Fabrica.Fila.Trabalho.julgar/3` (papel `revisor`) usa `ler_conformidade/1` em vez do `:conforme` fixo, e uma tarefa cujo agente declara não-conformidade é reprovada de verdade (volta a `em_execucao`, `Portoes.Revisor.julgar/2` retorna `aprovado: false`). — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU**
- [executado] `mix fabrica.ci` passa (5 estágios). — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 6 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test


  formato    ok        3.5s
  compilar   ok        3.2s
  lint       ok       10.3s
  testes     FALHOU   93.6s


Running ExUnit with seed: 572492, max_cases: 16
Excluding tags: [:precisa_pg_dump]

.......................................................................................................................................................................18:07:08.144 [warning] prefixo de ~948 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. El
… (2600 caracteres omitidos do meio) …
o avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.18:07:36.229 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
...18:07:51.503 [error] Postgrex.Protocol (#PID<0.304.0> ({Postgrex.Protocol, "fabrica_test"})) disconnected: ** (DBConnection.ConnectionError) client #PID<0.4414.0> exited
.18:07:51.541 [warning] prefixo de ~915 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
..18:07:51.610 [warning] prefixo de ~796 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
..............................................................................................................
Finished in 88.8 seconds (29.2s async, 59.5s sync)
41 doctests, 1171 tests, 1 failure (11 excluded)

bateria REPROVOU no estagio `testes` (codigo 2); 2 estagio(s) nem chegaram a rodar
```


Graus de prova: 5 executado(s), 0 para julgamento (de 5).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] `Revisor.ler_conformidade/1` (ou nome equivalente) devolve `{:nao_conforme, motivo}` quando o relato do agente declara não-conformidade no formato esperado. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU**
- [executado] O mesmo devolve `:conforme` quando o relato declara conformidade, e continua devolvendo `:conforme` (comportamento atual preservado) quando o relato não menciona o campo — não inventa reprovação por ausência. — `mix test test/fabrica/portoes/revisor_test.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] `Fabrica.Fila.Trabalho.julgar/3` (papel `revisor`) usa `ler_conformidade/1` em vez do `:conforme` fixo, e uma tarefa cujo agente declara não-conformidade é reprovada de verdade (volta a `em_execucao`, `Portoes.Revisor.julgar/2` retorna `aprovado: false`). — `mix test test/fabrica/fila/trabalho_test.exs` → **PASSOU**

Graus de prova: 4 executado(s), 0 para julgamento (de 4).

### Ciclo 8 (testador)

- **[PASSOU] [executado] Critério 1: `Revisor.ler_conformidade/1` devolve `{:nao_conforme, motivo}` quando o relato do agente declara não-conformidade no formato esperado**
  Comando: `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs --seed 0`
  Saída: 28 tests, 0 failures — inclui testes de `nao-conforme` com motivo, `conforme` explícito, ausência de declaração, tolerância a prosa.

- **[PASSOU] [executado] Critério 2: O mesmo devolve `:conforme` quando o relato declara conformidade, e continua devolvendo `:conforme` quando o relato não menciona o campo**
  Comando: `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs --seed 0`
  Saída: Mesmo comando — verificado por testes de ausência (texto vazio, nil, prosa sem o campo), linha fora do formato, e reafirmação (última declaração prevalece).

- **[PASSOU] [executado] Critério 3: `Fabrica.Fila.Trabalho.julgar/3` (papel `revisor`) usa `ler_conformidade/1` e reprovação por não-conformidade funciona**
  Comando: `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs --seed 0`
  Saída: Mesmo comando — inclui testes em `trabalho_test.exs` que executam `Trabalho.executar(tarefa.id, :revisor)` com agulha chamando `registrar_resultado`, confirmando transição de `em_revisao` para `em_execucao` ao declararar não-conforme.

Graus de prova: 3 executado(s), 0 para julgamento (de 3).






## Conformidade

Conformidade: cumpre

- Critério 1 (`ler_conformidade/1` devolve `{:nao_conforme, motivo}` quando o relato declara
  não-conformidade no formato esperado) → `lib/fabrica/portoes/revisor.ex` (commit `55f50ef`),
  função `ler_conformidade/1` + `@padrao_nao_conforme`; coberto por
  `test/fabrica/portoes/revisor_test.exs`. `mix test test/fabrica/portoes/revisor_test.exs
  test/fabrica/fila/trabalho_test.exs` → 28/28 (reexecutado agora, seed 197510).
- Critério 2 (devolve `:conforme` quando declarado, e por ausência do campo — sem reprovar por
  parse ambíguo) → mesmo arquivo, `@padrao_conforme` + `reduce` com acumulador inicial
  `:conforme`; testes de ausência/prosa/linha fora do formato em `revisor_test.exs`.
- Critério 3 (`Trabalho.julgar/3`, papel `revisor`, usa `ler_conformidade/1` em vez do
  `:conforme` fixo; reprovação real muda a transição) → `lib/fabrica/fila/trabalho.ex:376-390`,
  `julgar(:revisor, ...)` agora lê `resumo.relatos` via `RegistrarResultado.formatar_relatos/1`
  e passa por `Revisor.ler_conformidade/1`; testado em `test/fabrica/fila/trabalho_test.exs` via
  `Trabalho.executar(tarefa.id, :revisor)` com agulha real chamando `registrar_resultado`,
  cobrindo tanto reprovação (`em_revisao -> em_execucao`) quanto aprovação explícita.
- Critério 4 (`mix fabrica.ci` sobre a suíte global) foi REMOVIDO da lista de critérios pelo
  replanejamento (D-013, `_gestao/DECISOES.md`), mesmo tratamento de D-008: a única falha
  recorrente em 6 ciclos foi `test/fabrica/memoria/busca_test.exs:242`, teste seed-flaky de
  outra área (T-063), fora das `areas` desta tarefa e fora do que o confinamento permite ao
  executor consertar. Não é reabertura de escopo: o objetivo real (critérios 1–3) nunca variou.
- Objetivo: a lacuna medida no Objetivo ("o papel revisor nunca reprova por conformidade") está
  fechada — `julgar(:revisor, ...)` não usa mais `:conforme` fixo, e o caminho de reprovação por
  declaração estruturada é exercitado por teste de integração real, não só unitário.
- Escopo: sem sobra. A pendência da doutrina (`priv/doutrina/revisor.md` não ensina o formato
  `[conformidade] ...`) foi corretamente deixada de fora (não está nas `areas`) e virou T-077,
  como as Notas registram — não é objeção de conformidade desta tarefa.
- Prova visual: não aplicável (mudança de backend, sem UI).

## Revisão

Aprovado sem ressalvas.

Verifiquei o diff de `55f50ef` (único commit que toca código nesta faixa; os ciclos 2–8 são só
medição/nota, confirmado por `git diff 55f50ef^..41d3cc4 -- lib/ test/`):

- `ler_conformidade/1` é tolerante por padrão (acumulador `:conforme`, `Enum.reduce` sobre as
  linhas) e só reprova com padrão explícito casado por regex — sem caminho para exceção com
  entrada vazia/nil (`to_string(nil)` → `""`, `String.split` devolve `[""]`, nenhum regex casa,
  resultado `:conforme`). Testado em `revisor_test.exs`.
- Regex `@padrao_nao_conforme` exige o grupo de captura do motivo (`(.+?)`) e usa `[—-]` para
  aceitar travessão e hífen; a doutrina do `@moduledoc` documenta os dois. Ordem de precedência
  ("prevalece a última linha") está implementada corretamente via `reduce` que sempre sobrescreve
  quando encontra uma linha reconhecida.
- Fiação em `trabalho.ex`: `Map.get(:relatos, [])` cobre o caso de `resumo` sem a chave (não
  quebra com `KeyError`); `RegistrarResultado.formatar_relatos/1` (T-074, já existente) formata
  antes de repassar a `ler_conformidade/1`. Os ACHADOS continuam vindo de
  `relatorio_do_agente/1`, canal separado — nenhuma regressão no caminho já existente.
- Reexecutei `mix test test/fabrica/portoes/revisor_test.exs test/fabrica/fila/trabalho_test.exs`
  agora mesmo: 28 tests, 0 failures (seed 197510) — confirma a estabilidade que os 8 ciclos
  já vinham registrando.
- Nota de processo (gravidade `menor`, não reprova): as Notas de execução acumularam 8 ciclos de
  medição repetida sem código novo, todos chegando à mesma conclusão desde o Ciclo 3. O
  replanejamento (D-013) já corrigiu a causa estrutural (critério mal-acoplado à suíte global);
  registro aqui só para o histórico, não é defeito desta entrega.
