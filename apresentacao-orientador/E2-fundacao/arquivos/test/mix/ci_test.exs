defmodule Fabrica.CITest do
  @moduledoc """
  Trava a regra da bateria: a ORDEM, a interrupcao no primeiro erro, e o pulo do `tipos`.

  Nenhum destes testes roda um estagio de verdade. A funcao que executa e injetada, e e
  justamente por isso que a regra pode ser testada sem esperar minutos pela PLT do Dialyzer
  — ou pior, sem depender de um comando que falhe de verdade para provar a interrupcao.
  """

  use ExUnit.Case, async: true

  alias Fabrica.CI

  defp estagio(nome, opcoes \\ []) do
    %{
      nome: nome,
      comando: "mix #{nome}",
      rapido: Keyword.get(opcoes, :rapido, true),
      descricao: ""
    }
  end

  # Roda tudo com sucesso e anota quem foi chamado, na ordem.
  defp gravador(dono) do
    fn estagio ->
      send(dono, {:rodou, estagio.nome})
      {:ok, 0, ""}
    end
  end

  defp chamados do
    Stream.repeatedly(fn ->
      receive do
        {:rodou, nome} -> nome
      after
        0 -> :fim
      end
    end)
    |> Enum.take_while(&(&1 != :fim))
  end

  describe "ordem e sucesso" do
    test "roda os estagios na ordem declarada e devolve :ok" do
      estagios = [estagio("formato"), estagio("compilar"), estagio("lint")]

      {desfecho, resultados} = CI.executar(estagios, rodar: gravador(self()))

      assert desfecho == :ok
      assert chamados() == ["formato", "compilar", "lint"]
      assert Enum.map(resultados, & &1.desfecho) == [:ok, :ok, :ok]
      assert Enum.all?(resultados, &is_integer(&1.duracao_ms))
    end

    test "lista vazia passa sem drama" do
      assert {:ok, []} = CI.executar([], rodar: gravador(self()))
    end
  end

  describe "um estagio que falha interrompe os seguintes" do
    test "para no primeiro erro e devolve :erro" do
      estagios = [
        estagio("formato"),
        estagio("compilar"),
        estagio("lint"),
        estagio("testes")
      ]

      dono = self()

      rodar = fn estagio ->
        send(dono, {:rodou, estagio.nome})
        if estagio.nome == "compilar", do: {:erro, 1, "quebrou"}, else: {:ok, 0, ""}
      end

      {desfecho, resultados} = CI.executar(estagios, rodar: rodar)

      assert desfecho == :erro

      # os DOIS seguintes nem foram chamados — e esta e a regra que importa
      assert chamados() == ["formato", "compilar"]

      assert Enum.map(resultados, & &1.desfecho) == [:ok, :erro]
      assert length(resultados) == 2, "estagio nao alcancado nao deve aparecer no relatorio"
    end

    test "o resultado guarda o codigo de saida de quem quebrou" do
      rodar = fn _ -> {:erro, 42, "saida"} end

      {:erro, [resultado]} = CI.executar([estagio("formato")], rodar: rodar)

      assert resultado.codigo == 42
      assert resultado.estagio.nome == "formato"
    end

    test "falhar no ULTIMO estagio tambem devolve :erro" do
      rodar = fn estagio ->
        if estagio.nome == "testes", do: {:erro, 1, ""}, else: {:ok, 0, ""}
      end

      {desfecho, resultados} = CI.executar([estagio("lint"), estagio("testes")], rodar: rodar)

      assert desfecho == :erro
      assert Enum.map(resultados, & &1.desfecho) == [:ok, :erro]
    end
  end

  describe "modo rapido" do
    test "pula o estagio nao-rapido e roda os outros" do
      estagios = [
        estagio("formato"),
        estagio("compilar"),
        estagio("lint"),
        estagio("testes"),
        estagio("tipos", rapido: false)
      ]

      {desfecho, _resultados} = CI.executar(estagios, rapido: true, rodar: gravador(self()))

      # UMA leitura so: `chamados/0` drena a caixa de mensagens, entao uma segunda chamada
      # devolveria `[]` e qualquer `refute ... in chamados()` passaria por vazio, sem poder
      # falhar nunca.
      rodados = chamados()

      assert desfecho == :ok
      assert rodados == ["formato", "compilar", "lint", "testes"]
      refute "tipos" in rodados
    end

    test "o estagio pulado APARECE no relatorio, marcado" do
      estagios = [estagio("testes"), estagio("tipos", rapido: false)]

      {:ok, resultados} = CI.executar(estagios, rapido: true, rodar: gravador(self()))

      # Nao some da saida de proposito: estagio que desaparece e estagio que ninguem
      # percebe que parou de rodar.
      assert Enum.map(resultados, & &1.desfecho) == [:ok, :pulado]
      assert Enum.map(resultados, & &1.estagio.nome) == ["testes", "tipos"]
    end

    test "sem --rapido, o estagio nao-rapido roda" do
      estagios = [estagio("tipos", rapido: false)]

      {:ok, resultados} = CI.executar(estagios, rodar: gravador(self()))

      assert chamados() == ["tipos"]
      assert Enum.map(resultados, & &1.desfecho) == [:ok]
    end
  end

  describe "_gestao/ci.json" do
    test "e lido e declara os cinco estagios, na ordem, com os comandos reais" do
      {:ok, estagios} = CI.estagios()

      assert Enum.map(estagios, & &1.nome) == ~w[formato compilar lint testes tipos]

      assert Enum.map(estagios, & &1.comando) == [
               "mix format --check-formatted",
               "mix compile --warnings-as-errors",
               "mix credo --strict",
               "mix test",
               "mix dialyzer"
             ]
    end

    test "so o estagio `tipos` fica de fora do modo rapido" do
      {:ok, estagios} = CI.estagios()

      assert Enum.filter(estagios, &(not &1.rapido)) |> Enum.map(& &1.nome) == ["tipos"]
    end

    test "todo estagio declara uma descricao nao vazia" do
      {:ok, estagios} = CI.estagios()
      assert Enum.all?(estagios, &(String.trim(&1.descricao) != ""))
    end

    test "arquivo ausente devolve erro nomeado, nao excecao" do
      assert {:erro, {:ci_json_ausente, "nao/existe.json"}} =
               CI.estagios(caminho: "nao/existe.json")
    end

    test "o comando do estagio `testes` e o mesmo que a fabrica roda em toda verificacao" do
      # Esta e a razao de o arquivo existir: e daqui que uma tarefa nova COPIA o comando
      # para a linha `verificar:`, em vez de redigi-lo de cabeca.
      {:ok, estagios} = CI.estagios()
      testes = Enum.find(estagios, &(&1.nome == "testes"))

      assert testes.comando == "mix test"
    end
  end
end
