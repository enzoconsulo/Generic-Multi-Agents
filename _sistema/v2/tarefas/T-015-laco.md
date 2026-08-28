---
id: T-015
titulo: O laco de tool use como processo supervisionado
projeto: fabrica-v2
versao: v0.2
status: concluida
prioridade: alta
dependencias: [T-003, T-011, T-012, T-013, T-014]
areas: [lib/fabrica/agente/laco.ex, lib/fabrica/agente/estado.ex, test/fabrica/agente/laco_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
O nucleo do sistema: um `GenServer` que monta a requisicao, chama o operario, executa as
ferramentas pedidas e repete ate o modelo dizer que terminou — ou ate bater num teto
imposto de fora.

## Contexto
E a figura 3 dos documentos, virando codigo. A forma esta no `-3-completo`, secao 7:

    def handle_info(:trabalhar, estado) do
      case Operario.conversar(estado.requisicao) do
        {:ok, %{motivo_parada: :uso_de_ferramenta} = r} ->
          resultados =
            r.conteudo
            |> Enum.filter(&(&1.tipo == :uso_de_ferramenta))
            |> Task.async_stream(&Ferramentas.executar(&1, estado.confinamento),
                 max_concurrency: 4, timeout: :timer.minutes(2), on_timeout: :kill_task)
            |> Enum.map(&resultado_ou_erro/1)

          estado
          |> anexar_turno(r.conteudo, resultados)   # TODOS os resultados num turno so
          |> contabilizar(r.consumo)                # custo e tokens gravados por volta
          |> continuar_ou_parar()                   # teto de voltas e de gasto

        {:ok, %{motivo_parada: :fim_do_turno} = r} ->
          {:stop, :normal, finalizar(estado, r)}
      end
    end

Quatro regras que o codigo tem de garantir, e cada uma tem motivo:

1. **TODOS os resultados de ferramenta voltam num turno so.** Dividi-los em varias
   mensagens ensina o modelo a parar de pedir ferramentas em paralelo — e o paralelismo
   local e de graca.
2. **Teto de voltas e de gasto NAO vao no prompt.** Sao estado do processo e
   responsabilidade do supervisor. O agente nao tem como ignora-los.
3. **Ferramenta que falha devolve resultado com `erro: true`**, nunca some. Resultado
   ausente deixa o modelo cego sobre o que aconteceu.
4. **Cada volta grava uma linha em `consumos`** antes de seguir. Um laco cortado no meio
   precisa ter deixado registro do que ja gastou — foi exatamente o que a v1 perdia nos
   jobs mais caros.

Teste com `Operario.Falso`: roteiro de tres voltas (duas com ferramenta, uma com fim de
turno) e confira que o historico tem a forma certa, que ha tres linhas de consumo, e que o
teto de voltas interrompe quando estourado.

## Criterios de aceite
- [ ] Um roteiro de 3 voltas resolve e o laco encerra com `:fim_do_turno`, gravando 3 linhas de consumo.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] Multiplas ferramentas pedidas na mesma volta voltam em UM unico turno de resultados.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] Ferramenta que falha devolve resultado marcado como erro; o laco continua em vez de morrer.
      `verificar: mix test test/fabrica/agente/laco_test.exs`
- [ ] O teto de voltas interrompe o laco e registra o desfecho como `:teto_de_voltas`.
      `verificar: mix test test/fabrica/agente/laco_test.exs`

## Notas de execucao
Feito em 2026-08-28. Commit do projeto: `fafda3b`. 3 arquivos, 20 testes.

**O que foi feito.** `lib/fabrica/agente/estado.ex` (o estado do laco, onde moram os tetos) e
`lib/fabrica/agente/laco.ex` (o `GenServer`), com 20 testes que exercitam o nucleo inteiro
usando o `Operario.Falso` — sem rede e sem cota.

**As quatro regras, e onde cada uma esta travada.** As tres primeiras sao sobre o que
acontece quando algo da errado, e e ai que elas valem:

1. **Resultados num turno so.** Teste confere que tres ferramentas viram UMA mensagem de
   usuario com tres resultados dentro, e nao tres mensagens. Dividi-los ensina o modelo a
   parar de pedir ferramentas em paralelo, e o paralelismo local e de graca.
2. **Tetos no estado, nao no prompt.** O teste inspeciona o que o operario REALMENTE recebeu
   (`Falso.vistas/1`) e confere que a palavra "teto" nao aparece nas mensagens — ele viaja
   como CAMPO da requisicao. E a diferenca entre "o prompt pede que voce pare em 30 voltas" e
   "a volta 31 nao acontece".
3. **Ferramenta que falha vira resultado de erro.** Quatro testes: excecao, ferramenta
   desconhecida, o laco continuando depois da falha, e — o mais util — uma ferramenta que
   falha **nao impedindo as outras da mesma volta**.
4. **Consumo gravado antes de decidir continuar.** O teste corta por teto de voltas e confere
   que os consumos das voltas ja dadas sobreviveram. Foi exatamente isso que a v1 perdia nos
   jobs mais caros, que sao justamente os cortados.

**`GenServer` e nao funcao recursiva**, e o motivo e concreto: o laco precisa ser matavel de
fora sem deixar sujeira (T-053) e supervisionavel (T-036). Uma funcao recursiva faria a mesma
conta e nao teria endereco — ninguem consegue parar o que nao tem PID.

**Decisao: modelo sem preco NAO interrompe o laco.** A contabilidade em dolar e estimativa
(`DECISOES_FECHADAS.md`: a fabrica consome cota, nao paga por token), e derrubar a entrega
porque a tabela nao conhece um modelo seria trocar um numero por um trabalho. O gasto fica
zero e o laco segue; ha teste.

**O `timeout` do `GenServer.call` e `:infinity` de proposito.** Quem impoe limite sao os
tetos do estado, nao o relogio de quem chamou. Um timeout curto ali mataria o laco sem que
nada tivesse estourado — e perderia o registro do que ja foi gasto, violando a regra 4 pelo
lado de fora.

**ARMADILHA DE IDIOMA, e ela vai reaparecer.** O `credo --strict` reprovou com *"Found a TODO
tag in a comment"* numa frase que comecava com a palavra **TODOS**. O detector procura o
prefixo `TODO`, e nao sabe portugues. Como este projeto escreve **tudo** em portugues, a
colisao e estrutural. Reescrevi a frase e registrei a armadilha no `_gestao/GUIA.md`, com a
orientacao explicita de reescrever em vez de desligar o check — o check e util, e a colisao e
do idioma, nao dele.

## Verificacao

**Criterio 1 — um roteiro de 3 voltas resolve e o laco encerra com `:fim_do_turno`, gravando
3 linhas de consumo.** `verificar: mix test test/fabrica/agente/laco_test.exs` → **exit 0**

    20 tests, 0 failures

O teste monta o roteiro exato que a tarefa descreve (duas voltas com ferramenta, uma com fim
de turno) e afirma `desfecho == :fim_do_turno`, `voltas == 3` e `length(consumos) == 3`.

**Criterio 2 — multiplas ferramentas pedidas na mesma volta voltam em UM unico turno de
resultados.** Quatro testes no bloco `REGRA 1`: um turno de usuario com tres resultados; os
conteudos de cada ferramenta presentes; cada resultado carregando o `id` do pedido que o
originou (sem ele o modelo nao casa resultado com pedido quando ha varios); e blocos de texto
na mesma volta nao virando resultado de ferramenta.

**Criterio 3 — ferramenta que falha devolve resultado marcado como erro; o laco continua em
vez de morrer.** Bloco `REGRA 3`, quatro testes. O que mais prova a regra e
`uma ferramenta que falha NAO impede as outras da mesma volta`: tres pedidos, um deles
explode, e o resultado tem os tres — com exatamente um marcado `erro: true`.

**Criterio 4 — o teto de voltas interrompe o laco e registra o desfecho como
`:teto_de_voltas`.** Bloco `REGRA 2`: um roteiro de 20 pedidos com teto de 3 encerra em
`:teto_de_voltas` com `voltas == 3`. Ha o irmao para o teto de GASTO
(`:teto_de_gasto`), e o teste de que os consumos sobrevivem ao corte.

**Extra — `mix verificar` continua passando** → **exit 0**

    375 mods/funs, found no issues.
    316 tests, 0 failures

## Conformidade


## Revisao
