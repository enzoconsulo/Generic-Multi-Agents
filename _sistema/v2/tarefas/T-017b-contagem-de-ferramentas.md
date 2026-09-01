---
id: T-017b
titulo: O orcamento de ferramentas conta as chamadas que o agente completo fez
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: media
dependencias: [T-003a]
areas: [lib/fabrica/agente/estado.ex, lib/fabrica/agente/laco.ex, test/fabrica/agente/laco_test.exs]
tentativas: 0
criada: 2026-09-01
atualizada: 2026-09-01
---

## Objetivo
Fazer o laco contar as chamadas de ferramenta das DUAS familias de operario — as que ele mesmo
executa e as que o CLI executou sozinho — e expor o total no resumo, para que o
`OrcamentoFerramentas` continue tendo o que medir.

## Contexto

**Esforco estimado: 30 a 45 min.** Terceira e ultima peca de governanca da troca de familia
(confinamento na T-012a, teto na T-017a).

**A regra que esta em risco.** A T-017 portou da v1, medido sobre 135 etapas reais, o teto de
chamadas de ferramenta por papel — com dois numeros distintos: o **alvo** (exortacao, escala com
`areas`) e o **limiar de debate** (sensor, o p90, plano). Ele **MEDE E NAO CORTA**, de proposito,
e isso esta em `DECISOES_FECHADAS.md` como caso que parece defeito e nao e. A lacuna da v1 que a
v2 fechou foi outra: la a medicao nao alimentava decisao nenhuma; aqui o estouro vai para
`despachos`, com teto e realizado lado a lado, e alimenta o diagnostico da v0.3.

Sob a familia `:agente_completo`, o `Laco` deixa de executar ferramenta — e, se ninguem contar,
o balanco passa a receber zero para todo despacho do CLI. **Sensor que nunca dispara e
indistinguivel de sensor quebrado**, e este projeto ja catalogou essa familia de defeito.

**O conserto e barato porque o dado ja esta na mao.** O adaptador do CLI traduz e devolve, em
`Resposta.blocos`, os blocos `:uso_de_ferramenta` da sessao inteira — a T-018e mantem isso de
proposito, e diz por que. Entao a contagem e a MESMA linha nas duas familias: contar os blocos
`:uso_de_ferramenta` de cada resposta. O que difere e so o que se faz com eles — executar
(endpoint) ou nao executar (agente completo).

**O desenho:**

- `Estado` ganha `chamadas_de_ferramenta` (`non_neg_integer`, comeca em 0), somado **na mesma
  hora em que o consumo e contabilizado** — antes de decidir continuar, pela regra 4 do `Laco`
  (um laco cortado no meio precisa ter deixado registro do que ja gastou; vale igual para o que
  ja pediu);
- `Estado.resumo/1` passa a expor o numero;
- o `Laco` conta nas duas familias, sem ramo novo: a contagem acontece antes da ramificacao.

**Nao acrescente campo a `Resposta`** e nao mexa em `orcamento_ferramentas.ex`: o modulo ja
recebe papel e numero de chamadas e devolve o balanco com alvo, limiar e realizado. O que
faltava era alguem lhe dar o numero certo. Se voce achar que o modulo precisa mudar, ANOTE nas
Notas antes de mexer — ele tem 20 testes e uma invariante que ja pegou uma incoerencia da v1.

**Fora de escopo:** gravar o balanco em `despachos` a partir do laco (quem persiste e a
transicao, e no motor isso e v0.3), cortar por estouro (o modulo MEDE E NAO CORTA, e ha teste
afirmando exaustivamente que o balanco nao tem campo de parar) e distinguir chamada bem-sucedida
de negada.

## Criterios de aceite
- [ ] Com um operario `:endpoint_de_modelo` que pede 3 ferramentas em duas voltas, `Estado.resumo/1` traz `chamadas_de_ferramenta: 3`.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] Com um operario `:agente_completo` que devolve 4 blocos `:uso_de_ferramenta` numa unica resposta, o resumo traz `chamadas_de_ferramenta: 4` — mesmo sem o laco ter executado nenhuma.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] O numero do resumo alimenta `OrcamentoFerramentas` e produz o mesmo balanco que o modulo produz quando chamado direto com aquele numero (alvo, limiar e realizado iguais).
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] A contagem sobrevive a um laco encerrado por teto: um laco que para no teto de voltas ainda reporta as chamadas ja feitas.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] A bateria completa passa nos cinco estagios, `tipos` incluido.
      `verificar: mix fabrica.ci`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao
