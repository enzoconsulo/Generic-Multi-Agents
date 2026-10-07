---
id: T-017
titulo: Teto de chamadas de ferramenta por papel
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-015]
areas: [lib/fabrica/agente/orcamento_ferramentas.ex, test/fabrica/agente/orcamento_ferramentas_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Um teto de chamadas de ferramenta por papel, medido e nao chutado, que MEDE o estouro e o
registra — sem cortar o despacho no meio.

## Contexto
A v1 tem isso (`despachante.ts`, `orcamentoDeFerramentas` e `limiarDeDebate`), medido sobre
135 etapas reais dos proprios logs, sem gastar um centavo de modelo. Porte os numeros
lendo `<fabrica-v1>/painel/servidor/src/pipeline/despachante.ts` — nao os invente.

**MEDE E NAO CORTA, DE PROPOSITO**, e isto esta em `DECISOES_FECHADAS.md` como caso que
PARECE defeito e nao e: cortar exigiria converter chamadas em voltas, e despacho
interrompido no meio custa igual sem entregar nada (US$ 4,11 medidos num corte por cota).
E a mesma doutrina do teto de orcamento: nunca cortar no meio, so nao COMECAR o que nao
cabe.

A lacuna real da v1, e que a v2 deve fechar: la a medicao nao alimentava decisao nenhuma.
Aqui ela alimenta duas — o diagnostico da v0.3 (um despacho que estourou o teto de
ferramentas e sinal de tarefa mal dimensionada) e a estimativa do proximo despacho.

Grave o estouro em `despachos`, com o teto e o realizado.

## Criterios de aceite
- [ ] O teto por papel vem dos numeros medidos da v1, com a fonte citada no cabecalho do arquivo (inspecionavel).
- [ ] Estourar o teto REGISTRA o estouro e NAO interrompe o despacho.
      `verificar: mix test test/fabrica/agente/orcamento_ferramentas_test.exs`
- [ ] O estouro fica legivel em `despachos` (teto e realizado), disponivel para o diagnostico da v0.3.
      `verificar: mix test test/fabrica/agente/orcamento_ferramentas_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao
Feito em 2026-08-28. Commit do projeto: `59a3120`. 2 arquivos, 20 testes.

**Os numeros foram PORTADOS, e nao inventados**, como a tarefa manda. Li
`painel/servidor/src/pipeline/despachante.ts` da v1 (que veio no clone) e trouxe
`orcamentoDeFerramentas` e `limiarDeDebate` com os valores e o raciocinio. A fonte, a amostra
(135 etapas reais) e o metodo (contar linhas `ferramenta` dos `log.jsonl`, sem gastar modelo)
estao citados no cabecalho — e ha teste conferindo que continuam citados, para a fonte nao se
perder numa refatoracao.

**Sao DOIS numeros, e a distincao e o miolo da tarefa:**

- **alvo** — o teto que o prompt diz ao agente. E exortacao. Alvo bom e apertado, e e
  saudavel que seja excedido as vezes. Escala com `areas` no construtor (30/45/60), porque
  ali ele e conselho de dimensionamento;
- **limiar de debate** — a partir de onde o agente deixou de trabalhar. E SENSOR. E o p90
  medido (65 / 37 / 28) e e **plano** para o construtor.

Usar o alvo como sensor foi o defeito que a v1 consertou: ele estourava em **52%** dos
despachos do verificador e 36% dos do construtor. Alarme que toca em metade das rodadas e
ruido, e ruido e o que impede o sinal de virar atuador — ligar politica de retrabalho a um
gatilho que dispara sempre equivale a "sempre o caro".

**A premissa que a medicao da v1 derrubou, e que eu poderia ter reintroduzido sem pensar:**
`areas` **nao prediz** o numero de chamadas (mediana de 21 com ate 2 areas contra 12 com 3;
p90 de 57 e 58). Por isso o limiar e plano enquanto o alvo escala — sao coisas diferentes, e
copiar a escada para os dois seria escalar o sensor numa variavel que nao correlaciona.

**MEDE E NAO CORTA**, e isso esta em `DECISOES_FECHADAS.md` como caso que PARECE defeito e
nao e. Ha teste conferindo que o balanco **nao tem** campo de parar nem de cortar — a lista de
chaves e afirmada exaustivamente, entao acrescentar um `:parar` no futuro quebra o teste.

**A lacuna da v1 que esta tarefa fecha:** la a medicao nao alimentava decisao nenhuma — era o
"sensor sem atuador" que o `CLAUDE.md` da fabrica cataloga. Aqui o estouro e GRAVADO em
`despachos`, com teto e realizado lado a lado, disponivel para o diagnostico da v0.3 e para a
estimativa do proximo despacho. Sem os dois numeros juntos, "estourou" nao diz por quanto.

**A INVARIANTE PEGOU UMA INCOERENCIA QUE EXISTE NA v1.** O teste
`limiar > maior alvo do papel` reprovou o `planejador`: na v1 o padrao de `alvo` e o de
`limiar` sao **ambos 60**, entao para qualquer papel nao listado o alarme fica calibrado
exatamente no proprio alvo — que e literalmente o defeito que a v1 gastou uma medicao para
consertar nos papeis listados e nao propagou para o padrao.

Elevei o limiar padrao para 65. **O numero nao e medido e nao finge ser**, e isso esta escrito
no comentario: e derivado da regra que a propria v1 enuncia (o limiar fica acima do maior alvo
do papel), com a mesma folga que o construtor recebeu quando o p90 de 57 foi elevado a 65 para
limpar o alvo de 60. Quando houver medicao para papel novo, este e o primeiro numero a sair.

## Verificacao

**Criterio 1 — o teto por papel vem dos numeros medidos da v1, com a fonte citada no cabecalho
do arquivo.** INSPECIONADO, e travado por dois testes: o cabecalho cita `despachante.ts`,
`135 etapas` e `p90`; e registra `MEDE E NAO CORTA` com o valor `4,11` do corte medido. Os
valores conferem com a v1: alvo 30/45/60 para o construtor, 25 para o verificador, 20 para o
revisor; limiar 65 / 37 / 28.

**Criterio 2 — estourar o teto REGISTRA o estouro e NAO interrompe o despacho.**
`verificar: mix test test/fabrica/agente/orcamento_ferramentas_test.exs` → **exit 0**

    20 tests, 0 failures

O caso que mais importa e `passar do alvo SEM passar do limiar nao e debate`: 32 chamadas
contra alvo 25 e limiar 37 marca `passou_do_alvo` e **nao** marca `debate`. Era exatamente
esse caso que a v1 acusava como anomalia, em metade dos despachos.

**Criterio 3 — o estouro fica legivel em `despachos` (teto e realizado), disponivel para o
diagnostico da v0.3.** Um teste grava um `Despacho` de verdade no banco com o desfecho vindo
de `para_despacho/1` e le de volta `"debate"`. Outro confere que os tres desfechos
(`dentro_do_alvo`, `acima_do_alvo`, `debate`) sao distinguiveis, e um terceiro que o balanco
carrega alvo, limiar e chamadas juntos.

**Criterio 4 — `mix verificar` continua passando.** → **exit 0**

    413 mods/funs, found no issues.
    357 tests, 0 failures

## Conformidade


## Revisao
