---
id: T-020b
titulo: O probe do marco 1 roda verde de ponta a ponta, com prompt de tarefa real
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-018d, T-018e, T-012a, T-017a, T-017b]
areas: [priv/probes/marco_v02_agente.exs, _gestao/PROGRESSO.md, _gestao/GUIA.md]
tentativas: 2
criada: 2026-09-01
atualizada: 2026-09-26 06:15
---

## Objetivo
Ajustar o probe do marco 1 ao desenho das duas familias de operario, roda-lo verde contra o
`claude` real com um prompt de tarefa REAL, e registrar o desenho novo no `PROGRESSO.md` e no
`GUIA.md`.

## Contexto

**Esforco estimado: 45 a 60 min.** E a tarefa de fechamento do replanejamento: ela deixa o marco
pronto para ser REVERIFICADO. **O veredito do marco continua sendo da T-020**, que segue aberta
— esta tarefa nao a fecha e nao mexe no status dela.

**O que o probe faz hoje** (`priv/probes/marco_v02_agente.exs`, escrito no ciclo 3 do marco):
cria um projeto de mentira em diretorio temporario com README.md + a.txt + b.txt, roda
`Agente.Laco.rodar/1` com `raiz:` apontando para la e `Operario.ClaudeCLI` configurado via
`Application.put_env/3`, pede um `resultado.txt` com uma senha unica, e persiste despacho e
consumos por `Tarefas.Transicao.aplicar/3`. Ele afirma tres coisas, independentes:

1. a tarefa foi resolvida de verdade (o arquivo existe no disco com a senha);
2. ha uma linha em `consumos`, no BANCO, por volta do laco;
3. a soma das linhas gravadas bate com o total acumulado no estado do laco.

Na medicao de 01/09 as afirmacoes **2 e 3 passaram** (1 volta, 95558 = 95558) e a **1 falhou** —
o arquivo nunca foi criado, porque toda escrita era negada por falta de flag de permissao.

**Duas coisas precisam mudar no probe:**

1. **O prompt de uma linha era contorno, e sai.** O comentario dele diz isso: linha unica de
   proposito, porque multi-linha quebrava o `.bat`. A T-018d consertou a causa. O probe passa a
   usar um pedido de tarefa REAL — varias linhas, com aspas duplas e algum `&` —, porque e isso
   que o marco enuncia (*"um agente resolve uma tarefa real"*) e porque um probe que so aguenta
   uma linha esconde de novo o defeito que acabou de ser consertado.
2. **A afirmacao 2 mudou de significado, e o probe tem de dizer isso na cara.** Sob a familia
   `:agente_completo`, uma volta do laco e uma SESSAO inteira do CLI: "uma linha por volta" e
   verdade com N=1. Imprima o numero de voltas do laco AO LADO do numero de turnos internos que
   a sessao teve (contavel pelos blocos e pelos eventos do stream), para que quem le o relatorio
   veja a diferenca em vez de deduzi-la. **Nao mude a afirmacao** — a redacao do marco e
   proposta ao Enzo no `PLANO_V2.md` e a decisao e dele.

**O que registrar, e nao e opcional:**

- **`_gestao/PROGRESSO.md`**, secao da v0.2: as tres causas raiz, o desenho das duas familias, o
  que a governanca do CLI ganhou (permissao, vocabulario por papel, teto, auditoria de caminho)
  e **a lacuna do comando de shell** que a T-012a levantou. Um ajuste sem justificativa
  registrada e indistinguivel de um desvio do plano;
- **`_gestao/GUIA.md`**: a receita *"para acrescentar um adaptador"* precisa passar a mencionar a
  declaracao de familia; a tabela *"ja existe — nao reinvente"* ganha as linhas de
  `Operario.familia/1`, da auditoria de confinamento do stream e da opcao `entrada:` do
  `Comando`. E o unico mecanismo do projeto contra a segunda copia de um helper, e tres helpers
  novos entraram neste lote.

**Nao mexa em `lib/`.** Se o probe falhar por defeito de producao, o conserto e da tarefa dona
do arquivo: anote nas Notas com a evidencia e declare `Impedimento:` se a tarefa dona ja estiver
concluida.

**Consome cota da assinatura; nao gera fatura.** O marco 2 (`MessagesAPI`, cache) nao faz parte
desta tarefa e continua bloqueado por ausencia de chave — nao o tente.

## Criterios de aceite
- [ ] O probe roda de ponta a ponta e imprime `PROBE OK`, com as tres afirmacoes marcadas `ok`.
      `verificar: mix run priv/probes/marco_v02_agente.exs`
- [ ] A afirmacao 1 passa com um prompt MULTI-LINHA, com aspas duplas e `&` — e o conteudo do arquivo e conferido por `File.read`, nao pela resposta do modelo.
      `verificar: mix run priv/probes/marco_v02_agente.exs`
- [ ] O relatorio impresso mostra, lado a lado, as voltas do laco e os turnos internos da sessao do CLI, para que "uma linha por volta" nao seja lido como mais forte do que e.
      `verificar: mix run priv/probes/marco_v02_agente.exs`
- [ ] O probe termina com codigo de saida diferente de zero quando qualquer afirmacao falha (o `System.halt(1)` atual continua valendo apos as mudancas).
      `verificar: mix run priv/probes/marco_v02_agente.exs`
- [ ] `_gestao/PROGRESSO.md` registra as tres causas, o desenho das duas familias e a lacuna do comando de shell.
- [ ] `_gestao/GUIA.md` registra a declaracao de familia na receita de adaptador e as tres entradas novas em "ja existe — nao reinvente".
- [ ] Nenhum arquivo de `lib/` foi alterado (saida vazia).
      `verificar: git diff --stat HEAD~1 -- lib`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao

### Ciclo 1

Ao assumir a tarefa, `priv/probes/marco_v02_agente.exs` ja estava com as mudancas do probe
prontas na arvore (nao commitadas) — parte do trabalho de um ciclo anterior interrompido antes
do commit. Conferi cada mudanca contra os criterios e completei o que faltava (registro em
`PROGRESSO.md`/`GUIA.md`, a rodada real, a bateria completa).

**O que o probe faz agora, diferente do ciclo 3 do marco:**
- `raiz` sai de `System.user_home!()` (forma longa do caminho), nao de `System.tmp_dir!()`
  (forma curta 8.3 nesta maquina) — o CLI recusa Write/Bash sob a forma curta com
  `decision_reason_type: "safetyCheck"`, mesmo com `acceptEdits`. Achado novo deste ciclo,
  medido contra o `claude` real e registrado no `@moduledoc` do probe e no GUIA (Armadilhas).
- O prompt e MULTI-LINHA, com aspas duplas e `&` — a tarefa REAL que o marco pede, sem o
  contorno de uma linha unica que escondia o defeito ja corrigido pela T-018d (`entrada:
  {:arquivo, ...}` em `Comando.rodar_separado/3`).
- O relatorio imprime `voltas do Agente.Laco` ao lado de `chamadas_de_ferramenta` (T-017b) —
  os dois numeros lado a lado, para nao deixar "uma linha por volta" parecer mais forte do que
  e sob a familia `:agente_completo`.
- `teto_de_voltas` subiu de 6 para 10 (a sessao inteira do CLI conta como 1 volta do Laco; o
  teto antigo era pensado para o modelo antigo de dispatch por ferramenta).

**Rodei o probe de verdade** (consome cota, nao gera fatura): `PROBE OK`, as tres afirmacoes
`[ok]`, exit code 0. Numeros da rodada: 1 volta do Laco, 1 chamada de ferramenta da sessao
(Write), 27134 tokens somados no estado batendo com o banco. Detalhe em `Reproduzir:` abaixo.

**Registrei em `_gestao/PROGRESSO.md`** (secao v0.2, subsecao nova antes de "Tres armadilhas do
Windows..."): as tres causas independentes do Criterio 1 (permissao headless ausente;
incompatibilidade estrutural do modelo de ferramentas do `Laco` com `claude --print`;
`motivo_parada` lido do stream inteiro em vez do ultimo turno), o desenho da familia de
adaptador (`Operario.familia/1`, T-003a) que resolveu a causa 2 por estrutura (e fez a causa 3
deixar de fazer sentido), a tabela do que a governanca do CLI ganhou (permissao, vocabulario
por `--tools`, teto de turnos, auditoria de confinamento) e a lacuna do comando de shell
(3 saidas possiveis, decisao do Enzo, ainda em aberto).

**Registrei em `_gestao/GUIA.md`:** a receita "para acrescentar um adaptador" ganhou o passo de
declarar `familia/0` num `Operario`, com a regra do padrao seguro; a tabela "ja existe — nao
reinvente" ganhou tres linhas: `Operario.familia/1`, a auditoria de confinamento do stream em
`ClaudeCLI.interpretar/2`, e a opcao `entrada: {:arquivo, caminho}` de `Comando.rodar_separado/3`.

**Nao mexi em `lib/`** — confirmado (`git diff --stat -- lib` vazio).

**Achado de suite, NAO deste probe:** `mix fabrica.ci` reprovou duas vezes seguidas por testes
DIFERENTES a cada rodada (`Fabrica.Prompt.PrefixoTest` na 1a, `Fabrica.CriteriosTest` na 2a),
os dois em `test/`, fora das minhas `areas`, e ambos passam isolados (`mix test
test/fabrica/prompt/prefixo_test.exs` → 24/24; suite completa isolada → 0 falhas na 3a rodada).
E flakiness de suite (poluicao entre testes assincronos), nao regressao desta tarefa — mesma
familia do que a memoria do projeto ja registra para `busca_test.exs`. Na 3a rodada completa a
bateria passou verde nos 6 estagios (formato, compilar, lint, testes, tipos, backup).

**Reproduzir:**
```
mix run priv/probes/marco_v02_agente.exs   # consome cota, nao gera fatura
mix fabrica.ci                             # bateria completa; se `testes` falhar num teste fora
                                            # das areas desta tarefa, rode de novo (flaky, ver acima)
```

**Commit:** `1676635`

### Ciclo 2

Reprovação mecânica do ciclo 1 foi só no estágio `testes` de `mix fabrica.ci`
(`Fabrica.Memoria.BuscaTest`, `busca_test.exs:242`) — o mesmo flaky de confinamento entre
testes assíncronos que o ciclo 1 já tinha registrado acontecendo com testes DIFERENTES a
cada rodada (`PrefixoTest`, depois `CriteriosTest`, agora `BuscaTest`), e que a memória do
projeto já cataloga (`suite-global-vermelha-busca-t063`). Nada nesta tarefa toca
`lib/fabrica/memoria/` nem `test/fabrica/memoria/` — as `areas` são só o probe e dois
arquivos de `_gestao/`.

Não mudei código. Reexecutei para confirmar que é flakiness e não regressão:
- `mix test` isolado → **0 falhas** (41 doctests, 1139 tests).
- `mix fabrica.ci` completo → **passou nos 6 estágios** (formato, compilar, lint, testes,
  tipos, backup).

Nenhuma das Notas do Ciclo 1 mudou de validade: o probe continua `PROBE OK`, `PROGRESSO.md`
e `GUIA.md` continuam com os registros feitos, `lib/` continua intocado.

**Reproduzir:**
```
mix fabrica.ci   # bateria completa; se `testes` cair num teste fora das areas desta tarefa
                 # (ex.: busca_test.exs), e flaky conhecido — rode de novo
```

**Commit:** `5af814a`

## Verificacao


## Conformidade

### Ciclo 2

Conformidade: cumpre

O trabalho de fundo desta tarefa está no commit `1676635` (Ciclo 1); o commit `5af814a`
(Ciclo 2) só confirma flakiness de suite não relacionada e não muda `priv/probes/`,
`PROGRESSO.md` nem `GUIA.md`. Revisei a faixa `1676635^..5af814a` inteira.

- "O probe roda de ponta a ponta e imprime `PROBE OK`, com as tres afirmacoes marcadas
  `ok`" → `priv/probes/marco_v02_agente.exs:150-273` (as 3 afirmações e o bloco final que
  imprime `PROBE OK`); confirmado rodando pelo testador no Ciclo 3.
- "A afirmacao 1 passa com um prompt MULTI-LINHA, com aspas duplas e `&` ... conferido por
  `File.read`" → prompt heredoc em `priv/probes/marco_v02_agente.exs:70-84` (tem `"`, `&` e
  múltiplas linhas); `afirmacao_1` (linha ~150) lê o arquivo do disco, não a resposta do
  modelo.
- "O relatorio impresso mostra, lado a lado, as voltas do laco e os turnos internos" →
  `priv/probes/marco_v02_agente.exs:114-127` imprime `voltas do Agente.Laco` e
  `chamadas_de_ferramenta da sessao` um ao lado do outro, com o comentário explicando a
  diferença. `chamadas_de_ferramenta` é campo real de `Fabrica.Agente.Estado` (T-017b),
  não inventado para o probe.
- "termina com codigo de saida diferente de zero quando qualquer afirmacao falha" →
  `System.halt(1)` presente nas duas saídas de falha (`marco_v02_agente.exs:273,279`),
  herdado sem alteração.
- "`_gestao/PROGRESSO.md` registra as tres causas, o desenho das duas familias e a lacuna
  do comando de shell" → `_gestao/PROGRESSO.md` (diff de `1676635`), seção nova antes de
  "Tres armadilhas do Windows...": as 3 causas independentes, a tabela de governança do
  CLI e o parágrafo da lacuna do shell com as 3 saídas possíveis.
- "`_gestao/GUIA.md` registra a declaracao de familia ... e as tres entradas novas" →
  `_gestao/GUIA.md` (diff de `1676635`): passo 2 da receita de adaptador ganhou a menção a
  `familia/0`, e a tabela "já existe — não reinvente" ganhou as 3 linhas
  (`Operario.familia/1`, auditoria de confinamento, `entrada: {:arquivo, ...}`).
- "Nenhum arquivo de `lib/` foi alterado" → `git diff --stat 1676635^..5af814a -- lib`
  vazio.
- "A bateria completa passa nos [seis] estagios, `tipos` incluido" → reprovação mecânica
  do Ciclo 1 foi só em `testes`, por `busca_test.exs:242` (flaky já catalogado pela
  memória `suite-global-vermelha-busca-t063`, fora das `areas` desta tarefa); o Ciclo 2
  reconfirmou sem mexer em código, e o testador (Ciclo 3) rodou `mix fabrica.ci` de novo
  com os 6 estágios `ok`.

Sem escopo além do pedido: `lib/` intocado, nenhum arquivo fora das `areas` foi editado
pelo trabalho desta tarefa (o achado de flaky é só diagnosticado nas Notas, não corrigido
aqui — correto, já que é de outra tarefa/área).

## Revisao

### Ciclo 2

Aprovado sem ressalvas.

- Conferi `priv/probes/marco_v02_agente.exs` inteiro (diff de `1676635`): a troca de
  `System.tmp_dir!()` por `System.user_home!()` evita a forma curta 8.3 do Windows — motivo
  documentado no comentário e coerente com o restante do arquivo; o prompt heredoc é
  interpolado com `#{senha}` sem quebrar a sintaxe do Elixir; `teto_de_voltas: 10` é
  compatível com "1 volta = 1 sessão inteira" sob `:agente_completo`.
- `resumo.chamadas_de_ferramenta` é campo real de `Fabrica.Agente.Estado`
  (`lib/fabrica/agente/estado.ex:35`), não um valor forjado só para o relatório do probe.
- Nada em `lib/`, `test/` ou fora das `areas` foi tocado pelos commits `1676635`/`5af814a`.
- O diagnóstico de flakiness do Ciclo 2 é coerente com a memória do projeto
  (`suite-global-vermelha-busca-t063`): teste falho é `Fabrica.Memoria.BuscaTest`, fora de
  `lib/fabrica/memoria/`/`test/fabrica/memoria/`, que não fazem parte das `areas` desta
  tarefa — reprovação mecânica correta de diagnosticar como flaky, não como regressão a
  consertar aqui.
- Nota `menor`, sem efeito no veredito: os commits `f0cdffa` e `9b0879a` ("hash da
  revisao") mostram que a linha `**Commit:** \`hash\`` ficou faltando por dois ciclos
  antes de ser adicionada — sem impacto desta vez porque as Notas ainda apontavam para o
  hash certo em texto livre, mas vale o hábito de já commitar com a linha presente.


## Verificação

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] O probe roda de ponta a ponta e imprime `PROBE OK`, com as tres afirmacoes marcadas `ok`. — `mix run priv/probes/marco_v02_agente.exs` → **PASSOU**
- [executado] A afirmacao 1 passa com um prompt MULTI-LINHA, com aspas duplas e `&` — e o conteudo do arquivo e conferido por `File.read`, nao pela resposta do modelo. — `mix run priv/probes/marco_v02_agente.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] O relatorio impresso mostra, lado a lado, as voltas do laco e os turnos internos da sessao do CLI, para que "uma linha por volta" nao seja lido como mais forte do que e. — `mix run priv/probes/marco_v02_agente.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] O probe termina com codigo de saida diferente de zero quando qualquer afirmacao falha (o `System.halt(1)` atual continua valendo apos as mudancas). — `mix run priv/probes/marco_v02_agente.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [julgado] `_gestao/PROGRESSO.md` registra as tres causas, o desenho das duas familias e a lacuna do comando de shell. — sem comando declarado; fica para o verificador.
- [julgado] `_gestao/GUIA.md` registra a declaracao de familia na receita de adaptador e as tres entradas novas em "ja existe — nao reinvente". — sem comando declarado; fica para o verificador.
- [executado] Nenhum arquivo de `lib/` foi alterado (saida vazia). — `git diff --stat HEAD~1 -- lib` → **PASSOU**
- [executado] A bateria completa passa nos cinco estagios, `tipos` incluido. — `mix fabrica.ci` → **FALHOU**

```
bateria de verificacao — 6 estagios declarados

  ... formato: mix format --check-formatted
  ... compilar: mix compile --warnings-as-errors
  ... lint: mix credo --strict
  ... testes: mix test


  formato    ok        3.2s
  compilar   ok        3.0s
  lint       ok       10.1s
  testes     FALHOU   94.8s


Running ExUnit with seed: 109660, max_cases: 16
Excluding tags: [:precisa_pg_dump]

................................................................................................................................................................................................................................................................................
… (1141 caracteres omitidos do meio) …
imo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
..02:01:26.788 [warning] prefixo de ~917 tokens fica ABAIXO do minimo cacheavel de sonnet-5, que e 1024. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em sonnet-5.
.....02:01:42.137 [error] Postgrex.Protocol (#PID<0.315.0> ({Postgrex.Protocol, "fabrica_test"})) disconnected: ** (DBConnection.ConnectionError) client #PID<0.4428.0> exited
.......

  1) test buscar/3 — o termo e vetorizado pelo caminho de CONSULTA com um embedder que devolve vetores diferentes por tipo, a busca acha o trecho da consulta, e nao o do documento (Fabrica.Memoria.BuscaTest)
     test/fabrica/memoria/busca_test.exs:242
     Assertion with in failed
     code:  assert trecho_documento in Enum.map(resultado, & &1.id)
     left:  354347
     right: [354348]
     stacktrace:
       test/fabrica/memoria/busca_test.exs:265: (test)

.................................................................
Finished in 90.0 seconds (28.3s async, 61.6s sync)
41 doctests, 1139 tests, 1 failure (11 excluded)

bateria REPROVOU no estagio `testes` (codigo 2); 2 estagio(s) nem chegaram a rodar
```


Graus de prova: 7 executado(s), 2 para julgamento (de 9).

### Passada mecânica (sem modelo)

- [executado] A suíte do projeto continua passando (não quebrou o que já existia) — `mix test` → **PASSOU**
- [executado] O probe roda de ponta a ponta e imprime `PROBE OK`, com as tres afirmacoes marcadas `ok`. — `mix run priv/probes/marco_v02_agente.exs` → **PASSOU**
- [executado] A afirmacao 1 passa com um prompt MULTI-LINHA, com aspas duplas e `&` — e o conteudo do arquivo e conferido por `File.read`, nao pela resposta do modelo. — `mix run priv/probes/marco_v02_agente.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] O relatorio impresso mostra, lado a lado, as voltas do laco e os turnos internos da sessao do CLI, para que "uma linha por volta" nao seja lido como mais forte do que e. — `mix run priv/probes/marco_v02_agente.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [executado] O probe termina com codigo de saida diferente de zero quando qualquer afirmacao falha (o `System.halt(1)` atual continua valendo apos as mudancas). — `mix run priv/probes/marco_v02_agente.exs` → **PASSOU** (mesmo comando já executado acima; veredito reaproveitado)
- [julgado] `_gestao/PROGRESSO.md` registra as tres causas, o desenho das duas familias e a lacuna do comando de shell. — sem comando declarado; fica para o verificador.
- [julgado] `_gestao/GUIA.md` registra a declaracao de familia na receita de adaptador e as tres entradas novas em "ja existe — nao reinvente". — sem comando declarado; fica para o verificador.
- [executado] Nenhum arquivo de `lib/` foi alterado (saida vazia). — `git diff --stat HEAD~1 -- lib` → **PASSOU**
- [executado] A bateria completa passa nos cinco estagios, `tipos` incluido. — `mix fabrica.ci` → **PASSOU**

Graus de prova: 7 executado(s), 2 para julgamento (de 9).

### Ciclo 3 (verificação — 2026-09-26)

- [executado] A suíte do projeto continua passando — `mix test` → **PASSOU** (41 doctests, 1139 tests, 0 failures)
- [executado] O probe roda de ponta a ponta e imprime `PROBE OK`, com as tres afirmacoes marcadas `ok`. — `mix run priv/probes/marco_v02_agente.exs` → **PASSOU** (afirmação 1: arquivo criado com senha, afirmação 2: 1 linha por volta, afirmação 3: soma tokens = 27254)
- [executado] A afirmacao 1 passa com um prompt MULTI-LINHA, com aspas duplas e `&` — e o conteudo do arquivo e conferido por `File.read`, nao pela resposta do modelo. — `mix run priv/probes/marco_v02_agente.exs` → **PASSOU** (mesmo comando acima)
- [executado] O relatorio impresso mostra, lado a lado, as voltas do laco e os turnos internos da sessao do CLI. — `mix run priv/probes/marco_v02_agente.exs` → **PASSOU** (imprime voltas=1, chamadas_de_ferramenta=1)
- [executado] O probe termina com codigo de saida diferente de zero quando qualquer afirmacao falha. — `mix run priv/probes/marco_v02_agente.exs` → **PASSOU** (exit 0 com sucesso, System.halt(1) está no código)
- [julgado] `_gestao/PROGRESSO.md` registra as tres causas, o desenho das duas familias e a lacuna do comando de shell. — CONFIRMADO em linhas 262-303
- [julgado] `_gestao/GUIA.md` registra a declaracao de familia na receita de adaptador e as tres entradas novas. — CONFIRMADO em linhas 115-161
- [executado] Nenhum arquivo de `lib/` foi alterado. — `git diff --stat HEAD~1 -- lib` → **PASSOU** (saida vazia)
- [executado] A bateria completa passa nos seis estagios, `tipos` incluido. — `mix fabrica.ci` → **PASSOU** (formato ok 3.1s, compilar ok 2.9s, lint ok 10.4s, testes ok 92.5s, tipos ok 18.5s, backup ok 19.9s)

Graus de prova: 8 executado(s), 2 para julgamento (de 9).

