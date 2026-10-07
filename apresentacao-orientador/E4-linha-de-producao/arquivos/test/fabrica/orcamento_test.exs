defmodule Fabrica.OrcamentoTest do
  @moduledoc """
  Os dois tetos, e a garantia de que nenhum dos dois interrompe nada em voo.

  Este modulo e PURO (sem banco, sem processo): toda funcao aqui recebe numeros e devolve
  uma decisao. Nao ha parametro nenhum que descreva "agente em execucao agora" — e assim
  que o codigo prova a doutrina "o teto impede comecar, nunca interrompe": nao ha ONDE
  cortar, porque a funcao nunca enxerga um despacho em andamento.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Orcamento

  doctest Fabrica.Orcamento

  describe "teto da rodada — impede COMECAR a proxima tarefa" do
    test "cabe: gasto ate agora + estimativa nao passa do teto" do
      assert Orcamento.avaliar_rodada(60.0, 100.0, [10.0, 10.0]) == :ok
    end

    test "no limite exato ainda cabe (nao e preciso sobrar folga)" do
      assert Orcamento.avaliar_rodada(90.0, 100.0, [10.0]) == :ok
    end

    test "nao cabe: gasto ate agora + estimativa passaria do teto, e reporta :orcamento" do
      assert Orcamento.avaliar_rodada(95.0, 100.0, [10.0]) == {:parar, :orcamento}
    end

    test "a decisao so olha para ANTES do despacho: nao ha parametro de agente em voo" do
      # Prova por design: a aridade nao deixa espaco para "corte no meio". Se este teste
      # nao compila com outra aridade, a garantia quebrou.
      assert function_exported?(Orcamento, :avaliar_rodada, 3)
    end
  end

  describe "teto por tarefa — corta despachos da MESMA tarefa mesmo com rodada sobrando" do
    test "teto_por_tarefa e uma fracao do teto da rodada" do
      assert Orcamento.teto_por_tarefa(100.0) == 100.0 * Orcamento.fracao_padrao_por_tarefa()
    end

    test "aceita fracao explicita" do
      assert Orcamento.teto_por_tarefa(100.0, 0.5) == 50.0
    end

    test "tarefa dentro do proprio teto: :ok" do
      assert Orcamento.avaliar_tarefa(20.0, 30.0) == :ok
    end

    test "tarefa que ja estourou o proprio teto para, MESMO com rodada cheia de folga" do
      teto_rodada = 1000.0
      teto_tarefa = Orcamento.teto_por_tarefa(teto_rodada)

      gasto_da_tarefa = teto_tarefa + 1

      # a rodada mal comecou a gastar — sobra orcamento de sobra
      assert Orcamento.avaliar_rodada(5.0, teto_rodada, []) == :ok

      # mas a tarefa, sozinha, ja passou do proprio teto
      assert Orcamento.avaliar_tarefa(gasto_da_tarefa, teto_tarefa) == {:parar, :orcamento_tarefa}
    end
  end

  describe "a estimativa usa custo por TAREFA CONCLUIDA medido neste job, nao por etapa" do
    test "com tarefas concluidas medidas, a estimativa e a MEDIA dos totais por tarefa" do
      # cada numero aqui e o CUSTO TOTAL de uma tarefa inteira (a soma de todas as etapas
      # dela), nao o custo de uma etapa isolada — e essa a diferenca que a v1 errou.
      assert Orcamento.estimar_proxima_tarefa([4.0, 6.0]) == 5.0
      assert Orcamento.estimar_proxima_tarefa([9.0]) == 9.0
    end

    test "uma unica tarefa muito mais cara que etapas tipicas nao e descartada como ruido" do
      # Se a funcao estivesse (por engano) usando custo de ETAPA, um numero deste tamanho
      # pareceria um outlier de rodada inteira. Por TAREFA, e so mais um dado.
      assert Orcamento.estimar_proxima_tarefa([31.28]) == 31.28
    end
  end

  describe "sem medicao propria, a estimativa cai no padrao declarado" do
    test "lista vazia de tarefas concluidas devolve o padrao travado pelo teste" do
      # US$ 7,8241 por tarefa concluida, medido sobre 47 tarefas concluidas da v1
      # (priv/linha-de-base/LINHA_DE_BASE.md, secao 2). Nao e fatura: e estimativa contabil.
      assert Orcamento.estimar_proxima_tarefa([]) == 7.8241
    end

    test "estimativa_padrao/0 expoe a mesma constante" do
      assert Orcamento.estimativa_padrao() == 7.8241
    end
  end
end
