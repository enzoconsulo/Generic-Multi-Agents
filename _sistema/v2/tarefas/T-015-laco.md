---
id: T-015
titulo: O laco de tool use como processo supervisionado
projeto: fabrica-v2
versao: v0.2
status: backlog
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


## Verificacao


## Conformidade


## Revisao

