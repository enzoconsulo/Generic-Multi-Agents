defmodule Fabrica.Memoria.IngestaoTest do
  @moduledoc """
  Trava os quatro criterios da T-043: corte por estrutura, ingestao incremental por hash de
  trecho (so novo/alterado e vetorizado e escrito), os indices HNSW e GIN existem e sao
  usados, e o lote inteiro de uma passada vira UMA chamada ao embedder.

  Trava tambem os criterios da T-061: a coluna nasce alinhada ao embedder configurado (a
  migracao nova), a guarda de dimensao recusa o desencontro ANTES de chamar o embedder, e a
  pilha inteira (ingestao + indices + busca hibrida) roda fora de 384.
  """

  use Fabrica.DataCase, async: false

  alias Ecto.Adapters.SQL
  alias Fabrica.Embedder.Falso
  alias Fabrica.Memoria.Busca
  alias Fabrica.Memoria.Dimensao
  alias Fabrica.Memoria.Ingestao
  alias Fabrica.Memoria.Trecho
  alias Fabrica.Projetos.Projeto

  # Conta quantas vezes `vetorizar/1` foi chamado, sem mexer em config de aplicacao global —
  # a mesma razao pela qual `Ingestao.processar/3` aceita `embedder:` como opcao.
  defmodule EmbedderContador do
    @behaviour Fabrica.Embedder

    @impl true
    def dimensoes, do: Falso.dimensoes()

    @impl true
    def vetorizar(textos) do
      Agent.update(__MODULE__, &(&1 + 1))
      Falso.vetorizar(textos)
    end

    def iniciar, do: Agent.start_link(fn -> 0 end, name: __MODULE__)
    def chamadas, do: Agent.get(__MODULE__, & &1)
  end

  # DECLARA 384 (bate com a coluna, entao a guarda de dimensao da T-061 deixa passar) mas
  # DEVOLVE um vetor de 1 posicao mesmo assim: a guarda so pode conferir o que `dimensoes/0`
  # afirma ANTES de chamar `vetorizar/1` ("sem chamar o embedder" e o proprio criterio dela) —
  # ela nao tem como inspecionar o vetor de verdade sem primeiro faze-la. Por isso este
  # embedder MENTINDO sobre o proprio retorno e exatamente o caminho de falha que a guarda NAO
  # barra: o `UPDATE ... ::vector` da coluna `vector(384)` estoura no banco, provando o cenario
  # do achado de revisao que motivou a transacao em `gravar/3` (T-043) mesmo com a guarda no ar.
  defmodule EmbedderDimensaoErrada do
    @behaviour Fabrica.Embedder

    @impl true
    def dimensoes, do: 384

    @impl true
    def vetorizar(textos), do: {:ok, Enum.map(textos, fn _ -> [1.0] end)}
  end

  # Declara uma dimensao que NAO bate com a coluna (384) — o cenario que a guarda da T-061
  # precisa recusar ANTES de chamar `vetorizar/1`. Conta chamadas pela mesma razao do
  # `EmbedderContador`: provar que o contador fica em ZERO.
  defmodule EmbedderOutraDimensao do
    @behaviour Fabrica.Embedder

    @impl true
    def dimensoes, do: 8

    @impl true
    def vetorizar(textos) do
      Agent.update(__MODULE__, &(&1 + 1))
      {:ok, Enum.map(textos, fn _ -> List.duplicate(0.0, 8) end)}
    end

    def iniciar, do: Agent.start_link(fn -> 0 end, name: __MODULE__)
    def chamadas, do: Agent.get(__MODULE__, & &1)
  end

  defp projeto! do
    %Projeto{}
    |> Projeto.changeset(%{
      nome: "projeto-memoria-#{System.unique_integer([:positive])}",
      caminho: "C:/tmp/memoria"
    })
    |> Repo.insert!()
  end

  setup do
    {:ok, _} = EmbedderContador.iniciar()
    %{projeto: projeto!()}
  end

  @markdown """
  Texto antes de qualquer cabecalho, o preambulo do arquivo.

  ## Decisao 6.2

  O banco e a verdade, o markdown e artefato gerado.

  ```elixir
  # isto parece um cabecalho mas esta DENTRO de um bloco de codigo
  def exemplo, do: :ok
  ```

  Depois do bloco de codigo, a secao continua.

  ## Decisao 6.3

  Outra decisao, com outro motivo.
  """

  describe "cortar/1" do
    test "corta por cabecalho de markdown, nunca no meio de um bloco de codigo cercado" do
      trechos = Ingestao.cortar(@markdown)

      assert [
               {"(preambulo)", "Texto antes de qualquer cabecalho, o preambulo do arquivo."},
               {"Decisao 6.2", secao_6_2},
               {"Decisao 6.3", "## Decisao 6.3\n\nOutra decisao, com outro motivo."}
             ] = trechos

      # a cerca de codigo continua inteira dentro do trecho "Decisao 6.2" — a linha que
      # parece cabecalho, LA DENTRO, nao abriu um trecho novo.
      assert secao_6_2 =~ "```elixir"
      assert secao_6_2 =~ "# isto parece um cabecalho"
      assert secao_6_2 =~ "Depois do bloco de codigo, a secao continua."
      refute secao_6_2 =~ "## Decisao 6.3"
    end

    test "titulo repetido no mesmo arquivo ganha sufixo, para a fonte continuar unica" do
      markdown = "## Notas\ncorpo um\n\n## Notas\ncorpo dois\n"

      assert [{"Notas", _}, {"Notas#1", _}] = Ingestao.cortar(markdown)
    end

    test "sem cabecalho nenhum, o arquivo inteiro vira um unico trecho preambulo" do
      assert [{"(preambulo)", "so um paragrafo, sem cabecalho."}] =
               Ingestao.cortar("so um paragrafo, sem cabecalho.")
    end
  end

  describe "processar/3 — incremental por hash de trecho" do
    test "primeira passada indexa tudo como novo, numa unica chamada ao embedder", %{
      projeto: projeto
    } do
      fontes = [%{caminho: "_gestao/DECISOES.md", conteudo: @markdown}]

      resultado = Ingestao.processar(projeto.id, fontes, embedder: EmbedderContador)

      assert resultado == %{
               inseridos: 3,
               atualizados: 0,
               inalterados: 0,
               chamadas_embedder: 1
             }

      assert EmbedderContador.chamadas() == 1
      assert Repo.aggregate(Trecho, :count) == 3

      trechos = Repo.all(Trecho)
      assert Enum.all?(trechos, &(&1.projeto_id == projeto.id))
      assert Enum.all?(trechos, &String.starts_with?(&1.fonte, "_gestao/DECISOES.md#"))
    end

    test "segunda passada com o MESMO conteudo nao reindexa nada, e nao chama o embedder", %{
      projeto: projeto
    } do
      fontes = [%{caminho: "_gestao/DECISOES.md", conteudo: @markdown}]

      Ingestao.processar(projeto.id, fontes, embedder: EmbedderContador)
      atualizados_em_antes = Repo.all(from t in Trecho, select: {t.fonte, t.updated_at})

      resultado = Ingestao.processar(projeto.id, fontes, embedder: EmbedderContador)

      assert resultado == %{
               inseridos: 0,
               atualizados: 0,
               inalterados: 3,
               chamadas_embedder: 0
             }

      # nao chamou o embedder de novo, e nenhum trecho foi RETOCADO — mesmo `updated_at`.
      assert EmbedderContador.chamadas() == 1
      atualizados_em_depois = Repo.all(from t in Trecho, select: {t.fonte, t.updated_at})
      assert Enum.sort(atualizados_em_antes) == Enum.sort(atualizados_em_depois)
    end

    test "so o trecho com o corpo alterado e reindexado; os outros dois ficam intocados", %{
      projeto: projeto
    } do
      fontes = [%{caminho: "_gestao/DECISOES.md", conteudo: @markdown}]
      Ingestao.processar(projeto.id, fontes, embedder: EmbedderContador)

      markdown_alterado =
        String.replace(@markdown, "Outra decisao, com outro motivo.", "Motivo novo, revisado.")

      resultado =
        Ingestao.processar(
          projeto.id,
          [%{caminho: "_gestao/DECISOES.md", conteudo: markdown_alterado}],
          embedder: EmbedderContador
        )

      assert resultado == %{
               inseridos: 0,
               atualizados: 1,
               inalterados: 2,
               chamadas_embedder: 1
             }

      alterado =
        Repo.get_by!(Trecho, projeto_id: projeto.id, fonte: "_gestao/DECISOES.md#Decisao 6.3")

      assert alterado.corpo =~ "Motivo novo, revisado."
    end

    test "arquivo novo adicionado numa passada seguinte so soma trechos novos", %{
      projeto: projeto
    } do
      fontes = [%{caminho: "_gestao/DECISOES.md", conteudo: @markdown}]
      Ingestao.processar(projeto.id, fontes, embedder: EmbedderContador)

      resultado =
        Ingestao.processar(
          projeto.id,
          fontes ++ [%{caminho: "_gestao/PROGRESSO.md", conteudo: "## Marco\ntexto"}],
          embedder: EmbedderContador
        )

      assert resultado == %{
               inseridos: 1,
               atualizados: 0,
               inalterados: 3,
               chamadas_embedder: 1
             }
    end

    test "falha ao gravar o embedding nao deixa o trecho com hash gravado (transacao atomica)",
         %{projeto: projeto} do
      fontes = [%{caminho: "_gestao/DECISOES.md", conteudo: "so um paragrafo, sem cabecalho."}]

      # A escrita do embedding estoura (vetor de dimensao errada). O trecho NAO pode ficar
      # com `hash` gravado: se ficasse, a proxima passada o daria por inalterado e ele nunca
      # mais seria vetorizado, com `embedding` NULL para sempre.
      assert_raise Postgrex.Error, fn ->
        Ingestao.processar(projeto.id, fontes, embedder: EmbedderDimensaoErrada)
      end

      assert Repo.aggregate(Trecho, :count) == 0

      # e uma passada seguinte, com um embedder saudavel, ainda enxerga o trecho como NOVO.
      resultado = Ingestao.processar(projeto.id, fontes, embedder: EmbedderContador)
      assert resultado.inseridos == 1
    end
  end

  describe "os indices HNSW e GIN existem e sao usados" do
    setup %{projeto: projeto} do
      fontes = [%{caminho: "_gestao/DECISOES.md", conteudo: @markdown}]
      Ingestao.processar(projeto.id, fontes, embedder: EmbedderContador)
      :ok
    end

    test "busca por vizinhanca (embedding) usa o indice HNSW", %{projeto: _projeto} do
      # `enable_seqscan = off` forca o planejador a preferir um indice quando ha um — e assim
      # que o teste prova que o indice EXISTE e FUNCIONA, nao so que ele foi declarado no SQL
      # da migracao. `SET LOCAL` vale so para a transacao do sandbox deste teste. Sem filtro
      # por `projeto_id`: com so 3 linhas na tabela, o planejador prefere o indice UNICO
      # (btree) de `projeto_id` a QUALQUER outro quando os dois competem — o teste teria que
      # crescer a tabela artificialmente para provar o HNSW nesse cenario. Consultar so pela
      # ordenacao por vizinhanca isola exatamente o indice que este teste prova.
      SQL.query!(Repo, "SET LOCAL enable_seqscan = off", [])

      vetor = Falso.vetor("uma consulta qualquer")
      literal = "[" <> Enum.map_join(vetor, ",", &Float.to_string/1) <> "]"

      %{rows: linhas} =
        SQL.query!(
          Repo,
          "EXPLAIN SELECT id FROM trechos ORDER BY embedding <=> '#{literal}'::vector LIMIT 5",
          []
        )

      plano = linhas |> List.flatten() |> Enum.join("\n")
      assert plano =~ "trechos_embedding_hnsw_index"
    end

    test "busca textual (busca) usa o indice GIN", %{projeto: _projeto} do
      SQL.query!(Repo, "SET LOCAL enable_seqscan = off", [])

      %{rows: linhas} =
        SQL.query!(
          Repo,
          "EXPLAIN SELECT id FROM trechos WHERE busca @@ plainto_tsquery('portuguese', $1)",
          ["decisao"]
        )

      plano = linhas |> List.flatten() |> Enum.join("\n")
      assert plano =~ "trechos_busca_gin_index"
    end
  end

  describe "guarda de dimensao (T-061)" do
    test "no banco de teste, a coluna nasce alinhada ao embedder configurado (migracao nova)" do
      # Le a coluna do catalogo e compara com o embedder configurado — sem afirmar 384 literal,
      # porque o numero certo e o que `Fabrica.Embedder.dimensoes/0` disser, nao uma constante.
      assert Dimensao.atual() == Fabrica.Embedder.dimensoes()
      assert Dimensao.conferir() == :ok
    end

    test "embedder de dimensao divergente da coluna e recusado antes de montar o lote, sem chamar o embedder",
         %{projeto: projeto} do
      {:ok, _} = EmbedderOutraDimensao.iniciar()
      fontes = [%{caminho: "_gestao/DECISOES.md", conteudo: @markdown}]

      assert Ingestao.processar(projeto.id, fontes, embedder: EmbedderOutraDimensao) ==
               {:erro, {:dimensao_divergente, 384, 8}}

      assert EmbedderOutraDimensao.chamadas() == 0
      assert Repo.aggregate(Trecho, :count) == 0
    end
  end

  describe "a pilha roda fora de 384 (T-061)" do
    test "com Embedder.Falso configurado em 768, ingestao grava, reindexa, e a busca hibrida encontra o trecho certo",
         %{projeto: projeto} do
      anterior = Application.get_env(:fabrica, Falso)
      Application.put_env(:fabrica, Falso, dimensoes: 768)

      on_exit(fn ->
        if anterior do
          Application.put_env(:fabrica, Falso, anterior)
        else
          Application.delete_env(:fabrica, Falso)
        end
      end)

      assert :ok = Dimensao.alinhar!()
      assert Dimensao.atual() == 768

      fontes = [%{caminho: "_gestao/DECISOES.md", conteudo: @markdown}]
      resultado = Ingestao.processar(projeto.id, fontes)

      assert resultado == %{
               inseridos: 3,
               atualizados: 0,
               inalterados: 0,
               chamadas_embedder: 1
             }

      [primeiro | _] = Busca.buscar(projeto.id, "Decisao 6.3")
      assert primeiro.fonte == "_gestao/DECISOES.md#Decisao 6.3"
    end
  end
end
