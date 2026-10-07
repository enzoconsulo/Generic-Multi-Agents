defmodule Fabrica.Memoria.DimensaoTest do
  @moduledoc """
  Trava os quatro criterios da T-059: `atual/0` le do catalogo (nao de constante), `conferir/0`
  distingue batendo/divergindo, `alinhar!/0` troca o tipo da coluna e apaga os trechos (e vira
  no-op quando ja bate), e dimensao fora de `1..2000` e recusada antes de montar SQL.

  Roda com `async: false` de proposito: `alinhar!/0` faz `ALTER TABLE` + `CREATE INDEX` em
  `trechos`, que toma lock exclusivo — um teste concorrente que toque a mesma tabela travaria
  ate o lock sair. O sandbox do Ecto desfaz DDL no rollback do fim de cada teste, entao a coluna
  volta a `vector(384)` mesmo depois de um `alinhar!/0` bem-sucedido.
  """

  use Fabrica.DataCase, async: false

  alias Ecto.Adapters.SQL
  alias Fabrica.Memoria.Dimensao
  alias Fabrica.Memoria.Trecho
  alias Fabrica.Projetos.Projeto

  # Um embedder de outra dimensao, so para este teste — nao mexe no `Embedder.Falso` (area da
  # T-060).
  defmodule EmbedderOutraDimensao do
    @behaviour Fabrica.Embedder

    @impl true
    def dimensoes, do: 8

    @impl true
    def vetorizar(textos), do: {:ok, Enum.map(textos, fn _ -> List.duplicate(0.0, 8) end)}
  end

  defmodule EmbedderForaDaFaixa do
    @behaviour Fabrica.Embedder

    @impl true
    def dimensoes, do: 2001

    @impl true
    def vetorizar(textos), do: {:ok, Enum.map(textos, fn _ -> List.duplicate(0.0, 2001) end)}
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

  defp criar_trecho_com_embedding!(projeto_id, vetor) do
    {:ok, %{id: id}} =
      %Trecho{}
      |> Trecho.changeset(%{
        projeto_id: projeto_id,
        fonte: "arquivo.md#secao",
        corpo: "corpo",
        hash: Trecho.hash("corpo")
      })
      |> Repo.insert()

    literal = "[" <> Enum.map_join(vetor, ",", &Float.to_string/1) <> "]"

    SQL.query!(Repo, "UPDATE trechos SET embedding = '#{literal}'::vector WHERE id = $1", [id])

    id
  end

  setup do
    {:ok, projeto} =
      %Projeto{}
      |> Projeto.changeset(%{
        nome: "Dimensao-#{System.unique_integer([:positive])}",
        caminho: "/tmp/dimensao"
      })
      |> Repo.insert()

    {:ok, projeto: projeto}
  end

  describe "atual/0" do
    test "le a dimensao REAL da coluna no catalogo do Postgres, nao uma constante" do
      assert Dimensao.atual() == 384

      configurar_embedder(EmbedderOutraDimensao)
      assert :ok = Dimensao.alinhar!()

      assert Dimensao.atual() == 8
    end
  end

  describe "conferir/0" do
    test "devolve :ok quando a coluna e o embedder configurado batem" do
      assert Dimensao.conferir() == :ok
    end

    test "devolve o erro nomeado quando divergem" do
      configurar_embedder(EmbedderOutraDimensao)

      assert Dimensao.conferir() == {:erro, {:dimensao_divergente, 384, 8}}
    end
  end

  describe "alinhar!/0" do
    test "troca o tipo da coluna, recria o indice HNSW e apaga os trechos", %{
      projeto: projeto
    } do
      criar_trecho_com_embedding!(projeto.id, List.duplicate(0.1, 384))
      assert Repo.aggregate(Trecho, :count) == 1

      configurar_embedder(EmbedderOutraDimensao)

      assert :ok = Dimensao.alinhar!()

      assert Dimensao.atual() == 8
      assert Repo.aggregate(Trecho, :count) == 0

      %{rows: [[indexdef]]} =
        SQL.query!(Repo, "SELECT indexdef FROM pg_indexes WHERE indexname = $1", [
          "trechos_embedding_hnsw_index"
        ])

      assert indexdef =~ "hnsw"
    end

    test "quando coluna e embedder ja batem, e no-op e nao apaga nada", %{projeto: projeto} do
      criar_trecho_com_embedding!(projeto.id, List.duplicate(0.1, 384))

      assert :ok = Dimensao.alinhar!()

      assert Dimensao.atual() == 384
      assert Repo.aggregate(Trecho, :count) == 1
    end
  end

  describe "faixa aceita" do
    test "dimensao fora de 1..2000 e erro nomeado, recusado antes de montar SQL" do
      configurar_embedder(EmbedderForaDaFaixa)

      assert_raise Fabrica.Memoria.Dimensao.ForaDaFaixa, fn ->
        Dimensao.alinhar!()
      end

      # Nada mudou: a recusa aconteceu antes de tocar no catalogo.
      assert Dimensao.atual() == 384
    end
  end
end
