defmodule Fabrica.Portoes.RevisorTest do
  @moduledoc """
  `ler_conformidade/1` (T-075): antes desta tarefa, o papel revisor NUNCA reprovava por
  conformidade — `Fabrica.Fila.Trabalho.julgar/3` chamava `Revisor.julgar(:conforme, ...)` com
  o primeiro argumento fixo. Estes testes travam a leitura do veredito a partir do relato
  estruturado do agente, no mesmo espirito de `ler_achados/1` (ver `test/fabrica/portoes_test.exs`).
  """

  use ExUnit.Case, async: true

  alias Fabrica.Portoes.Revisor

  describe "formato explicito: [conformidade] conforme | nao-conforme — motivo" do
    test "declara nao-conforme com motivo" do
      assert {:nao_conforme, motivo} =
               Revisor.ler_conformidade("[conformidade] nao-conforme — implementou outra coisa")

      assert motivo == "implementou outra coisa"
    end

    test "declara conforme explicitamente" do
      assert Revisor.ler_conformidade("[conformidade] conforme") == :conforme
    end

    test "aceita travessao e hifen como separador, como ler_achados/1" do
      assert {:nao_conforme, "com travessao"} =
               Revisor.ler_conformidade("[conformidade] nao-conforme — com travessao")

      assert {:nao_conforme, "com hifen"} =
               Revisor.ler_conformidade("[conformidade] nao-conforme - com hifen")
    end

    test "aceita 'não-conforme' acentuado" do
      assert {:nao_conforme, "motivo"} =
               Revisor.ler_conformidade("[conformidade] não-conforme — motivo")
    end
  end

  describe "ausencia de declaracao NUNCA reprova por si so" do
    test "texto que nao menciona o campo devolve :conforme" do
      assert Revisor.ler_conformidade("apenas um resumo do que foi feito, sem o campo") ==
               :conforme
    end

    test "texto vazio ou nulo devolve :conforme" do
      assert Revisor.ler_conformidade("") == :conforme
      assert Revisor.ler_conformidade(nil) == :conforme
    end

    test "linha fora do formato (sem o motivo apos o travessao) e ignorada, nao reprova por parse ambiguo" do
      assert Revisor.ler_conformidade("[conformidade] nao-conforme") == :conforme
    end

    test "a leitura ignora a prosa em volta, sem derrubar" do
      texto = """
      ## resumo

      Implementei o modulo pedido, revisei os criterios um a um.

      [conformidade] conforme
      """

      assert Revisor.ler_conformidade(texto) == :conforme
    end
  end

  describe "mais de uma linha no formato: prevalece a ULTIMA" do
    test "o agente pode reafirmar o veredito mais adiante no mesmo relato" do
      texto = """
      [conformidade] conforme

      Pensando melhor, na verdade faltou um pedaco do pedido.

      [conformidade] nao-conforme — faltou o pedaco X
      """

      assert {:nao_conforme, "faltou o pedaco X"} = Revisor.ler_conformidade(texto)
    end
  end
end
