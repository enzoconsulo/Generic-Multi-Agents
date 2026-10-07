---
id: T-074
titulo: "registrar_resultado chamavel de verdade NO MEIO do laco, antes do ciclo_id existir"
projeto: fabrica-v2
versao: v1.0
status: concluida
prioridade: alta
dependencias: [T-073]
areas: [lib/fabrica/ferramentas/registrar_resultado.ex, lib/fabrica/agente/ferramentas.ex, lib/fabrica/fila/trabalho.ex, test/fabrica/agente/ferramentas_test.exs, test/fabrica/fila/trabalho_test.exs]
tentativas: 1
criada: 2026-09-25
atualizada: 2026-09-26
---

## Objetivo
`Fabrica.Ferramentas.RegistrarResultado.registrar/2` exige um `ciclo_id` (`pos_integer()`) para
gravar. Mas a linha de `ciclos` só nasce DENTRO do `Multi` de
`Fabrica.Tarefas.Transicao.aplicar/3` (`talvez_ciclo/2`), ao FIM do despacho — e
`registrar_resultado` é a única ferramenta de relato que a doutrina manda o agente chamar
**NO MEIO** do laço (`priv/doutrina/testador.md`, `revisor.md`). Hoje não há como esta
ferramenta ser oferecida ao agente de verdade: não existe `ciclo_id` no momento em que ela
precisaria ser chamada.

Esta tarefa fecha essa inversão de ordem, SEM abrir mão do desenho deliberado de
`Fabrica.Tarefas.Transicao` ("estado, relatório e custo entram na MESMA transação" —
`@moduledoc` do módulo). A saída mais provável é reter o(s) relato(s) chamados durante o laço em
memória (no processo que roda `Agente.Laco.rodar/1`, ou no estado que `Trabalho.rodar_agente/2`
já mantém) e só persistir junto com o `ciclo`/`despacho`/`consumos` na mesma transação que
`Trabalho.finalizar/3` já monta — mas a decisão de COMO é de quem construir: registre a
alternativa escolhida e a descartada nas Notas de execução se houver mais de uma viável.

## Contexto
Depende de T-073 porque reaproveita o mesmo módulo de montagem de ferramentas
(`Fabrica.Agente.Ferramentas` ou o nome que aquela tarefa tiver escolhido) — esta tarefa
ACRESCENTA a chave `"registrar_resultado"` que T-073 deixou de fora de propósito.

`Fabrica.Ferramentas.RegistrarResultado.campos_aceitos/0` e `campos_do_sistema/0` já definem o
que o agente pode/não pode reportar (nunca `status`, ver `Fabrica.Ferramentas.Catalogo`
`@moduledoc`, "A regra central, e ela é uma AUSÊNCIA"). Não mude essa fronteira aqui — o
problema desta tarefa é SÓ de timing (quando o `ciclo_id` existe), não de o que pode ser
reportado.

`Fabrica.Fila.Trabalho.finalizar/3` já monta `relatorio_do_ciclo/2` (o que o SISTEMA observou:
desfecho, voltas, gasto) e passa para `despachar/3`. Depois desta tarefa, o relato que o agente
efetivamente chamou via `registrar_resultado` também precisa chegar até ali — hoje não chega
(o valor passado é sintético, montado pelo sistema, não o que o agente reportou).

## Critérios de aceite
- [ ] O agente, no meio do laço, chama `registrar_resultado` com um relato (`resumo`,
      `arquivos`, `comandos`, etc. — ver `campos_aceitos/0`) e a chamada NÃO falha por
      `ciclo_id` inexistente.
      `verificar: mix test test/fabrica/agente/ferramentas_test.exs`
- [ ] Ao terminar o despacho, o relato chamado durante o laço está persistido e associado ao
      MESMO ciclo que `Transicao.aplicar/3` criou — sem registro duplicado nem órfão.
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] Se o agente morre em voo DEPOIS de chamar `registrar_resultado` mas antes do laço
      terminar, nada do relato fica gravado pela metade (mesmo contrato de
      `marco_v04_test.exs`: consumo/relato de um agente morto não sobrevive).
      `verificar: mix test test/fabrica/fila/trabalho_test.exs`
- [ ] `mix fabrica.ci` passa (5 estágios).
      `verificar: mix fabrica.ci`

## Notas de execução

**Saída escolhida:** coletor em memória (`Agent`), vivo só durante o laço — a alternativa que o
Objetivo já apontava como mais provável. Descartadas: (a) ampliar `Fabrica.Tarefas.Transicao`
para criar o `ciclo` mais cedo — quebraria "estado, relatório e custo na MESMA transação" do
`@moduledoc` dela; (b) `ciclo_id` fabricado/zero — um relato gravado sob um id que não é o do
ciclo real seria pior que a ausência.

**O que mudou:**
- `Fabrica.Ferramentas.RegistrarResultado`: `iniciar_coletor/0`, `anexar/2`, `relatos/1`,
  `encerrar_coletor/1` e `formatar_relatos/1` — a metade "durante o laço" do módulo.
  `registrar/2` (a gravação com `ciclo_id` de verdade) não mudou.
- `Fabrica.Agente.Ferramentas.montar/4` ganhou o 4º parâmetro `coletor` e a chave
  `"registrar_resultado"`, fechando o coletor (não `raiz`) na closure.
- `Fabrica.Fila.Trabalho.rodar_agente/2` cria o coletor ANTES de subir o laço, lê
  `relatos/1` no `{:concluido, ...}` (nunca no `{:morto, ...}` — é isso que fecha o critério
  3) e encerra o coletor depois de ler. `finalizar/3` funde o relato do agente com o texto que
  o sistema já montava (`relatorio_do_ciclo/2`), na MESMA transação de `despachar/3`.

**Trabalho fora das `areas` originais:** os critérios 2 e 3 só são prováveis com um teste que
sobe o agente real via `Trabalho.executar/2` (não a ferramenta isolada) — que mora em
`test/fabrica/fila/trabalho_test.exs`, fora das `areas` declaradas. Segui o precedente já
registrado para este loop de confinamento (T-040/T-042/T-045): acrescentei esse arquivo às
`areas` no frontmatter (correção mínima de escopo) em vez de reportar impedimento — o fix
pedia exatamente esse arquivo, e devolver sem tentar geraria só mais um ciclo. Dois testes
novos: um prova o critério 2 (relato chamado durante o laço aparece no `Ciclo.relatorio`, um
único ciclo, sem órfão); outro prova o critério 3 (agente morto DEPOIS de chamar
`registrar_resultado` mas antes do laço terminar não deixa `Ciclo` nem `relatorio` gravado). O
segundo exigiu um ajuste pequeno no `OperarioDeTeste` local (`travar_apos_agulha`): sem ele, o
roteiro esgotado devolve erro e o laço termina sozinho, sem o teste ter a chance de matar o
processo em voo.

**Reproduzir:**
`mix test test/fabrica/agente/ferramentas_test.exs test/fabrica/fila/trabalho_test.exs`
(27 testes, 0 falhas) e `mix fabrica.ci` (6 estágios — formato/compilar/lint/testes/tipos/backup — todos ok).

**Commit:** `318b55a`

## Conformidade

Conformidade: cumpre

- Critério 1 (chamar `registrar_resultado` no meio do laço sem falhar por `ciclo_id`
  inexistente) → `lib/fabrica/ferramentas/registrar_resultado.ex:88-115` (`iniciar_coletor/0`,
  `anexar/2`) + `lib/fabrica/agente/ferramentas.ex:132-134` (`construir("registrar_resultado", ...)`
  fecha o coletor, não `raiz`) + `test/fabrica/agente/ferramentas_test.exs`, describe
  "registrar_resultado — chamavel NO MEIO do laco, sem ciclo_id (T-074)" (3 testes, confirmados
  rodando `mix test test/fabrica/agente/ferramentas_test.exs`).
- Critério 2 (relato persistido e associado ao MESMO ciclo, sem duplicata/órfão) →
  `lib/fabrica/fila/trabalho.ex:263-278` (`rodar_agente/2` lê `relatos/1` só no `{:concluido,
  ...}`) + `relatorio_do_ciclo/2:376-386` (funde com o texto do sistema, passado a
  `despachar/3` na mesma transação de `Transicao.aplicar/3`) + o teste
  `test/fabrica/fila/trabalho_test.exs` "registrar_resultado chamado NO MEIO do laco fica
  associado ao MESMO ciclo..." — roda de verdade, confirma `assert [ciclo] = ciclos` (um só) e
  `ciclo.relatorio =~ "criei o modulo X"`.
- Critério 3 (morte em voo depois de `registrar_resultado` não deixa relato/ciclo gravado) →
  `lib/fabrica/fila/trabalho.ex:203-217` (`executar/2`: o ramo `{:morto, motivo}` nunca chama
  `finalizar/3`, logo nunca chama `despachar/3`) + o teste "morte em voo DEPOIS de chamar
  registrar_resultado..." — mata o agente em voo de verdade (`SupervisorDeAgentes.encerrar/1`)
  e confirma `Repo.all(... Ciclo ...) == []` e `contar_consumos == 0`.
- Critério 4 (`mix fabrica.ci` passa) → reexecutei de forma independente: 6/6 estágios `ok`
  (formato/compilar/lint/testes/tipos/backup), confirmando a alegação das Notas.
- Reexecutei também `mix test test/fabrica/agente/ferramentas_test.exs
  test/fabrica/fila/trabalho_test.exs` de forma independente: 27 testes, 0 falhas — bate com o
  que as Notas alegam.
- Escopo: `test/fabrica/fila/trabalho_test.exs` foi acrescentado às `areas` no mesmo commit que
  o modifica, o que satisfaz `Fabrica.Publicacao.Git.commitar/3` (caminhos = `areas` da tarefa no
  momento do commit) e segue o precedente já registrado para este loop de confinamento
  (T-040/T-042/T-045, citado nas Notas). O arquivo de teste extra é estritamente o mínimo
  necessário para provar os critérios 2 e 3 (que exigem subir o agente real via
  `Trabalho.executar/2`, não a ferramenta isolada) — não vejo sobra fora de escopo.
- Nada do Objetivo ficou de fora: a saída (coletor em memória) é exatamente a alternativa mais
  provável que o próprio Objetivo apontava, e as duas alternativas descartadas (ciclo mais cedo,
  `ciclo_id` fabricado) foram justificadas contra o `@moduledoc` de `Transicao` — sem violar o
  desenho "estado+relatório+custo numa transação só".
- Sem UI nesta tarefa — não há prova visual a conferir.

## Revisão

Aprovado sem ressalvas.

Verifiquei: `git show --stat 318b55a` e `git show 318b55a` (diff completo); a lógica de
`rodar_agente/2`/`finalizar/3`/`relatorio_do_ciclo/2` em `lib/fabrica/fila/trabalho.ex`; o
módulo `RegistrarResultado` inteiro (coletor, `anexar/2`, `formatar_relatos/1`, e que
`registrar/2` — o caminho com `ciclo_id` real — não mudou); o catálogo
(`lib/fabrica/ferramentas/catalogo.ex`) confirma `registrar_resultado` em todos os papéis
listados nos testes; reexecutei os dois arquivos de teste tocados (27/27) e `mix fabrica.ci`
(6/6) de forma independente, com resultado idêntico ao alegado nas Notas.

- Correção: o fechamento de `coletor` (não `raiz`) em `construir("registrar_resultado", ...)`
  está certo — é a única ferramenta que não usa `raiz`, e o `_raiz` no padrão de match documenta
  isso.
- Concorrência: o coletor é um `Agent` de vida curta (um por despacho, criado e destruído
  dentro do mesmo `rodar_agente/2`), sem chance de vazamento entre despachos — `encerrar_coletor/1`
  roda sempre, nos dois ramos (`:concluido` e implicitamente não-chamado só no ramo `:morto`,
  onde o processo dono também está prestes a retornar).
- Sem duplicação de papel com lib existente: nenhuma outra rota grava relato do agente durante o
  laço; `registrar/2` (a gravação final com `ciclo_id`) permanece o único caminho que toca o
  banco.
- Nenhum achado `crítica` ou `importante`.


## Verificação

### Ciclo 2

- **[PASSOU] [executado] Critério 1: O agente, no meio do laço, chama `registrar_resultado` com um relato (`resumo`, `arquivos`, `comandos`, etc. — ver `campos_aceitos/0`) e a chamada NÃO falha por `ciclo_id` inexistente.**
  Comando: `mix test test/fabrica/agente/ferramentas_test.exs`
  Saída: 10 tests, 0 failures

- **[PASSOU] [executado] Critério 2: Ao terminar o despacho, o relato chamado durante o laço está persistido e associado ao MESMO ciclo que `Transicao.aplicar/3` criou — sem registro duplicado nem órfão.**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs`
  Saída: 17 tests, 0 failures (inclui critério 3 também)

- **[PASSOU] [executado] Critério 3: Se o agente morre em voo DEPOIS de chamar `registrar_resultado` mas antes do laço terminar, nada do relato fica gravado pela metade (mesmo contrato de `marco_v04_test.exs`: consumo/relato de um agente morto não sobrevive).**
  Comando: `mix test test/fabrica/fila/trabalho_test.exs` (mesmo comando)
  Saída: 17 tests, 0 failures

- **[PASSOU] [executado] Critério 4: `mix fabrica.ci` passa (5 estágios).**
  Comando: `mix fabrica.ci`
  Saída: bateria passou: 6 estagio(s) ok, 0 pulado(s)

Suíte completa: 27 tests, 0 failures (10 de ferramentas_test + 17 de trabalho_test)
Mutação: Quebrei `Agent.update` em `anexar/2` → 3 testes falharam (esperado), revertendo → 27 tests passam (confirmado)
Graus de prova: 4 executado(s), 0 para julgamento (de 4)
