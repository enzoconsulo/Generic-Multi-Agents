---
id: T-018a
titulo: O ClaudeCLI nunca foi exercitado contra o CLI real
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-018]
areas: [lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs, lib/fabrica/ferramentas/comando.ex, priv/probes/cli_real.exs, _gestao/GUIA.md]
tentativas: 0
criada: 2026-08-31
atualizada: 2026-08-31
---

## Objetivo
Fazer o `Operario.ClaudeCLI` funcionar contra o `claude` de verdade, e corrigir as quatro
divergencias entre o que ele espera e o que o CLI realmente emite.

## Contexto

**Como foi descoberto.** Ao comecar o marco da v0.2 (T-020), o primeiro probe contra o CLI
real devolveu `{:erro, :saida_ininteligivel}`. A causa apareceu no `stderr`:

    Error: When using --print, --output-format=stream-json requires --verbose

**O adaptador monta uma linha de comando que o CLI REJEITA.** Ele tem 26 testes, todos
verdes, e nenhum deles chega perto disso: todos alimentam `interpretar/1` com fluxos de
eventos fabricados a mao. A traducao estava certa; o que nunca foi exercitado foi o
**disparo**.

E a segunda vez nesta linhagem — a T-026 descobriu, do mesmo jeito, que a lista de sinais de
"comando quebrado" portada da v1 nao reconhecia o texto que o `git` real emite. **A licao do
CLAUDE.md e literal: tente usar o mecanismo pelo caminho REAL antes de dar por pronto.**

Causa raiz unica: o adaptador foi construido a partir da documentacao do formato, e nunca
rodou.

### Os quatro defeitos, medidos no probe

**1. Falta `--verbose` — BLOQUEANTE.**

    claude --print --output-format stream-json --model haiku "..."   -> exit 1, stdout vazio
    claude --print --verbose --output-format stream-json ...          -> exit 0, 7448 bytes

**2. `stdin` nao e redirecionado.** Toda chamada perde 3 segundos e emite no `stderr`:

    Warning: no stdin data received in 3s, proceeding without it.

O CLI espera dados em `stdin` e desiste depois do tempo. Num pipeline com ~21 despachos por
rodada sao ~63 s de espera por nada, e um `stderr` sujo em todo despacho — o que atrapalha a
classificacao de falha da T-026, que le `stderr`.

**3. A deteccao da PAREDE DE COTA nao casa com o evento real, e este e o defeito mais grave.**
O evento que o CLI emite e:

    {"type":"rate_limit_event",
     "rate_limit_info":{"status":"allowed","rateLimitType":"five_hour",
                        "resetsAt":1788236400,
                        "unifiedWindows":{"five_hour":{"utilization":0.67},
                                          "seven_day":{"utilization":0.6}}}}

O `cota/2` procura `evento["subtype"] in ["usage_limit","rate_limit"]` ou
`evento["type"] == "usage_limit"`. **Nenhum dos dois casa** — o evento real nao tem `subtype`,
e o `type` e `rate_limit_event`. O ramo estruturado nunca dispara, e sobra so o fallback por
texto.

A parede de cota e, segundo o proprio `prompt_inicial.txt`, *estruturalmente necessaria sob
assinatura e ausente de toda a documentacao do TCC*. Nao reconhece-la e nao ter o mecanismo.

**4. Bloco `thinking` vira `:desconhecido`.** Toda resposta com raciocinio estendido — que e o
caso comum — traz um bloco `{"type":"thinking",...}` que o adaptador nao sabe nomear. Nao
quebra nada, mas enche o historico de blocos opacos e a assinatura criptografica do
`thinking` vai junto para o proximo prefixo.

### Dado util colhido no probe

`unifiedWindows` traz a utilizacao das duas janelas: **five_hour em 0,67 e seven_day em 0,60**
no momento do teste. E informacao que o `piloto automatico` da v1.0 vai querer, e ela chega de
graca em toda resposta.

## Criterios de aceite
- [x] Uma chamada real ao `claude` devolve `{:ok, %Resposta{}}` com consumo preenchido.
      `verificar: mix run priv/probes/cli_real.exs`
- [x] O `stderr` de uma chamada real fica vazio (sem o aviso de `stdin`).
      `verificar: mix run priv/probes/cli_real.exs`
- [x] `rate_limit_event` com `status` diferente de `allowed` vira `{:erro, {:cota, quando}}`, e com `allowed` NAO vira.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [x] Bloco `thinking` e traduzido com tipo proprio, e nao como `:desconhecido`.
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [x] `mix fabrica.ci` continua passando nos cinco estagios.
      `verificar: mix fabrica.ci`

## Notas de execucao

**Os quatro consertos, e o que cada um custava.**

**1. `--verbose` (bloqueante).** A linha passou a ser
`claude --print --verbose --output-format stream-json --model <m> "<prompt>"`. Sem ele: exit 1,
stdout vazio, e o adaptador devolvendo `{:erro, :saida_ininteligivel}` — que e um erro
honesto sobre um sintoma e mudo sobre a causa.

**2. `stdin` do vazio, e o conserto NAO ficou no adaptador.** Foi para
`Comando.escrever_script/4`: `< nul` no `.bat`, `< /dev/null` no `.sh`. A afirmacao vale para
**todo** comando que a fabrica roda — ela nao e interativa, e um processo que espera entrada de
um pipeline sem terminal esperaria em vao de qualquer jeito. Consertar so no `ClaudeCLI`
deixaria o proximo adaptador reencontrar o mesmo 3 s.

**3. A parede de cota, e este era o mais grave.** O evento real e:

    {"type":"rate_limit_event",
     "rate_limit_info":{"status":"allowed","rateLimitType":"five_hour",
                        "resetsAt":1788236400,
                        "unifiedWindows":{"five_hour":{"utilization":0.67},
                                          "seven_day":{"utilization":0.6}}}}

O `cota/2` procurava `subtype in ["usage_limit","rate_limit"]` ou `type == "usage_limit"`.
O evento **nao tem `subtype`** e o `type` e `rate_limit_event` — o ramo estruturado nunca
disparava, e sobrava so o fallback por texto.

A regra nova compara contra o status **BOM**: `status != "allowed"` e parede. Listar os status
ruins seria adivinhar quais existem, que e exatamente o erro da versao anterior. E o horario
sai de dentro do `rate_limit_info`, e nao da raiz do evento.

**Um efeito colateral util:** o `unifiedWindows` traz a utilizacao das duas janelas em toda
resposta, de graca. Virou `janelas_de_cota/1` — e o numero que o piloto automatico da v1.0 vai
querer para decidir se comeca mais uma rodada. Devolve `nil` (e nao `%{}`) quando o evento nao
veio, porque *"o CLI nao informou"* e diferente de *"informou que nao ha janela"*.

**4. Bloco `thinking` virou `:raciocinio`.** Ele aparece em praticamente toda resposta;
deixa-lo em `:desconhecido` encheria o historico de blocos opacos e faria `:desconhecido` parar
de significar *"algo que eu nao esperava"*. A `signature` vem junto de proposito: e ela que
permite devolver o bloco de raciocinio ao modelo numa volta seguinte, e descarta-la tornaria o
historico irreaproveitavel. Ha o par negativo em teste — tipo realmente desconhecido continua
caindo em `:desconhecido`.

**O probe virou artefato versionado.** `priv/probes/cli_real.exs` nao pode ser teste da suite:
a suite roda sem rede e sem cota, e isso e o marco da v0.1. Entao ele e um script que se roda a
mao, e o registro de que ele PRECISA ser rodado esta na receita nova do GUIA — *"para mexer no
ClaudeCLI, rode o probe real"*, com a razao medida ao lado.

Na suite ficou o que da para travar sem rede: um teste que confere que a linha tem `--verbose`.
Ele nao substitui o probe (nao prova que o CLI aceita), mas impede a regressao silenciosa da
linha.

**A licao, e e a segunda vez nesta sessao.** A T-026 descobriu, do mesmo jeito, que a lista de
sinais portada da v1 nao reconhecia o texto que o `git` real emite. Agora o `ClaudeCLI`. As
duas tem a mesma forma: **codigo construido a partir da documentacao do formato, testado contra
o formato documentado, e nunca exercitado contra a coisa real.** Testes verdes provaram a
coerencia interna e nada sobre o mundo.

E ambas foram achadas pelo mesmo movimento — tentar USAR o mecanismo pelo caminho real. E o
que o CLAUDE.md ja manda fazer: *"ao terminar um mecanismo, tente USA-LO pelo caminho real
antes de dar por pronto"*.

## Verificacao

**Criterio 1 — uma chamada real devolve `{:ok, %Resposta{}}` com consumo preenchido.**
`verificar: mix run priv/probes/cli_real.exs` -> **PROBE OK**

      blocos ........ [:raciocinio, :texto]
      parada ........ fim_do_turno
      entrada ....... 10
      cache leitura . 16265
      cache escrita . 18953
      saida ......... 48
      duracao ....... 3442 ms
      texto ......... "pong"

**Criterio 2 — o `stderr` de uma chamada real fica vazio.**
`verificar: mix run priv/probes/cli_real.exs` -> **exit 0**

O aviso `no stdin data received in 3s` sumiu, e com ele os ~3 s por chamada. Numa rodada de
~21 despachos sao ~63 s de espera por nada.

**Criterio 3 — `rate_limit_event` com status diferente de `allowed` vira cota; com `allowed`
nao vira.** `verificar: mix test test/fabrica/operario/claude_cli_test.exs` -> **exit 0**

Seis testes com o formato REAL: `allowed` nao e parede (ele vem em toda resposta saudavel, e
trata-lo como parede pararia a fabrica a cada volta); quatro status diferentes sao; o horario
sai de dentro do `rate_limit_info`; e as janelas de utilizacao ficam disponiveis, com `nil`
distinguindo "nao informou" de "nao ha".

**Criterio 4 — bloco `thinking` e traduzido com tipo proprio.**
`verificar: mix test test/fabrica/operario/claude_cli_test.exs` -> **exit 0**

Tres testes, incluindo o par negativo.

**Criterio 5 — `mix fabrica.ci` continua passando nos cinco estagios.**
`verificar: mix fabrica.ci` -> **exit 0**

      formato    ok        2.8s
      compilar   ok        2.7s
      lint       ok        6.2s
      testes     ok       22.4s
      tipos      ok       15.9s

    17 doctests, 767 tests, 0 failures

Eram 758 antes; a T-018a acrescentou 9 testes.

## Conformidade

Os cinco criterios estao cumpridos, e os quatro defeitos que o probe encontrou estao
consertados — cada um na camada certa: `--verbose` e os blocos no adaptador, o `stdin` no
`Comando` (porque vale para todo comando), e a cota no `cota/2`.

**O que esta tarefa NAO conserta, e nao deveria:** ela nao prova que a deteccao de parede
funciona **na parede de verdade**. O status `blocked` foi inferido do formato do evento, e nao
observado — observar exigiria esgotar a cota de proposito. O que se sabe com certeza e qual e o
status BOM (`allowed`, visto duas vezes), e a regra foi escrita a partir dessa certeza em vez
da adivinhacao complementar.

**Ampliei as `areas`** para incluir `priv/probes/cli_real.exs` e o `GUIA.md`.

## Revisao

Revisao do proprio diff. Achados, todos tratados:

- **Um comentario duplicado** sobrou no `cota/2` ao substituir o bloco antigo. Removido.
- **A regex de fallback por texto ficou mais estreita**: `rate limit` virou
  `rate.?limit exceeded`. O motivo: a saida do CLI contem `rate_limit_event` e
  `rateLimitType` em **toda** resposta saudavel, e um padrao frouxo ali transformaria cada
  chamada bem-sucedida numa parede de cota falsa. Nao chegou a acontecer porque o padrao
  antigo exigia o espaco, mas a margem era de um caractere.
- **`janelas_de_cota/1` devolve `nil` e nao `%{}`**, e ha teste para a diferenca.

Um ponto registrado sem conserto: **`Laco` nao repassa `estado.raiz` ao operario**. O
`ClaudeCLI` cai no padrao `"."`, que e o diretorio de quem chamou e nao o do projeto. Nao
afeta o probe (que passa `raiz:` explicitamente), mas afeta o marco da T-020, que precisa do
agente rodando DENTRO do projeto de teste. Fica anotado ali, porque e la que vai doer.
