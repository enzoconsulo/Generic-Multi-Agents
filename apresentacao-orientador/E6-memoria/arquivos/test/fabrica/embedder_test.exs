defmodule Fabrica.EmbedderTest do
  @moduledoc """
  Trava a fachada `Fabrica.Embedder.vetorizar_consulta/1,2` (T-063): usa o callback OPCIONAL
  `vetorizar_consulta/1` do adaptador quando ele o exporta, e cai em `vetorizar/1` quando nao —
  provado com um adaptador de cada tipo. `async: false` porque um dos testes muda
  `Application.put_env(:fabrica, :embedder, ...)` global.
  """

  use ExUnit.Case, async: false

  alias Fabrica.Embedder

  # Exporta o callback opcional: vetores diferentes por funcao provam qual foi chamada.
  defmodule ComPrefixoPorTipo do
    @moduledoc false
    @behaviour Fabrica.Embedder

    @impl true
    def dimensoes, do: 4

    @impl true
    def vetorizar(textos), do: {:ok, Enum.map(textos, fn _ -> [1.0, 0.0, 0.0, 0.0] end)}

    @impl true
    def vetorizar_consulta(textos), do: {:ok, Enum.map(textos, fn _ -> [0.0, 1.0, 0.0, 0.0] end)}
  end

  # Nao exporta o callback opcional: so tem vetorizar/1, como Falso/Servico/Local.
  defmodule SemPrefixoPorTipo do
    @moduledoc false
    @behaviour Fabrica.Embedder

    @impl true
    def dimensoes, do: 4

    @impl true
    def vetorizar(textos), do: {:ok, Enum.map(textos, fn _ -> [0.0, 0.0, 1.0, 0.0] end)}
  end

  defp configurar_embedder(modulo) do
    anterior = Application.get_env(:fabrica, :embedder)
    Application.put_env(:fabrica, :embedder, modulo)

    on_exit(fn ->
      if anterior do
        Application.put_env(:fabrica, :embedder, anterior)
      else
        Application.delete_env(:fabrica, :embedder)
      end
    end)
  end

  describe "vetorizar_consulta/2 — callback opcional por adaptador" do
    test "usa vetorizar_consulta/1 do adaptador quando ele o exporta" do
      {:ok, vetores} = Embedder.vetorizar_consulta(["termo"], ComPrefixoPorTipo)
      assert vetores == [[0.0, 1.0, 0.0, 0.0]]
    end

    test "cai em vetorizar/1 quando o adaptador nao exporta vetorizar_consulta/1" do
      {:ok, vetores} = Embedder.vetorizar_consulta(["termo"], SemPrefixoPorTipo)
      assert vetores == [[0.0, 0.0, 1.0, 0.0]]
    end
  end

  describe "vetorizar_consulta/1 — usa o embedder configurado" do
    test "delega para configurado/0 quando o adaptador tem o callback" do
      configurar_embedder(ComPrefixoPorTipo)

      {:ok, vetores} = Embedder.vetorizar_consulta(["termo"])
      assert vetores == [[0.0, 1.0, 0.0, 0.0]]
    end

    test "delega para configurado/0 e cai em vetorizar/1 quando nao tem o callback" do
      configurar_embedder(SemPrefixoPorTipo)

      {:ok, vetores} = Embedder.vetorizar_consulta(["termo"])
      assert vetores == [[0.0, 0.0, 1.0, 0.0]]
    end
  end
end
