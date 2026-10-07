defmodule Fabrica.Memoria.BuscaTest do
  @moduledoc """
  Trava os quatro criterios da T-044 (o trecho achado pelas DUAS buscas vem primeiro, um
  termo exato que o vetor nao acha e recuperado pela metade textual, trecho de outro projeto
  nunca aparece, e a consulta e uma unica ida ao banco) mais os dois da T-063: o termo e
  vetorizado pelo caminho de CONSULTA (nao de documento), e um embedder que devolve
  `{:erro, _}` vira erro nomeado em vez de `MatchError`.
  """

  use Fabrica.DataCase, async: false

  alias Ecto.Adapters.SQL
  alias Fabrica.Embedder.Falso
  alias Fabrica.Memoria.Busca
  alias Fabrica.Memoria.Trecho
  alias Fabrica.Projetos.Projeto

  # Devolve um vetor FIXO por funcao (ignora o texto de entrada) — o objetivo e provar QUAL
  # funcao a busca chama, nao o conteudo vetorizado. `Falso` nao serve aqui porque teria o
  # mesmo vetor para os dois caminhos.
  defmodule EmbedderPorTipo do
    @moduledoc false
    @behaviour Fabrica.Embedder

    @impl true
    def dimensoes, do: 384

    @impl true
    def vetorizar(textos),
      do: {:ok, Enum.map(textos, fn _ -> Falso.vetor("vetor-de-documento") end)}

    @impl true
    def vetorizar_consulta(textos),
      do: {:ok, Enum.map(textos, fn _ -> Falso.vetor("vetor-de-consulta") end)}
  end

  defmodule EmbedderComErro do
    @moduledoc false
    @behaviour Fabrica.Embedder

    @impl true
    def dimensoes, do: 384

    @impl true
    def vetorizar(_textos), do: {:erro, :timeout}
  end

  defp projeto! do
    %Projeto{}
    |> Projeto.changeset(%{
      nome: "projeto-busca-#{System.unique_integer([:positive])}",
      caminho: "C:/tmp/busca"
    })
    |> Repo.insert!()
  end

  # Insere um trecho com embedding CONTROLADO diretamente por SQL — o mesmo caminho que
  # `Fabrica.Memoria.Ingestao.definir_embedding/2` usa para escrever, sem passar pelo
  # embedder (aqui o teste PRECISA do vetor exato, nao de um vetor deterministico por hash de
  # texto). `busca` fica de fora do INSERT porque e GERADA pelo proprio Postgres.
  defp inserir_trecho!(projeto_id, fonte, corpo, vetor) do
    literal = "[" <> Enum.map_join(vetor, ",", &Float.to_string/1) <> "]"
    hash = Trecho.hash(corpo)

    %{rows: [[id]]} =
      SQL.query!(
        Repo,
        """
        INSERT INTO trechos (projeto_id, fonte, corpo, hash, embedding, inserted_at, updated_at)
        VALUES ($1, $2, $3, $4, '#{literal}'::vector, NOW(), NOW())
        RETURNING id
        """,
        [projeto_id, fonte, corpo, hash]
      )

    id
  end

  # Desloca uma unica coordenada do vetor base e renormaliza — da um vetor bem PROXIMO do
  # original (distancia por cosseno minuscula), com `epsilon` controlando o quao proximo.
  # Epsilons distintos dao distancias distintas, sem empate no RANK() da metade semantica.
  defp vetor_proximo(vetor_base, epsilon) do
    [primeiro | resto] = vetor_base
    normalizar([primeiro + epsilon | resto])
  end

  defp normalizar(vetor) do
    norma = :math.sqrt(Enum.reduce(vetor, 0.0, fn valor, soma -> soma + valor * valor end))
    Enum.map(vetor, &(&1 / norma))
  end

  setup do
    %{projeto: projeto!()}
  end

  describe "buscar/3 — fusao por posto reciproco" do
    test "o trecho achado pelas DUAS buscas (mesmo vetor e mesmo termo) fica em 1o lugar", %{
      projeto: projeto
    } do
      termo = "confinamento de ferramentas"
      vetor_da_consulta = Falso.vetor(termo)

      alvo =
        inserir_trecho!(
          projeto.id,
          "alvo",
          "explica o confinamento de ferramentas usado nesta fabrica.",
          vetor_da_consulta
        )

      # achado so pelo vetor: mesmo vetor da consulta, mas o corpo nao tem o termo.
      _so_semantico =
        inserir_trecho!(
          projeto.id,
          "so-semantico",
          "um texto qualquer, sem nenhuma relacao textual com a busca.",
          vetor_da_consulta
        )

      # achado so pela busca textual: contem o termo, mas o vetor e outro qualquer.
      _so_textual =
        inserir_trecho!(
          projeto.id,
          "so-textual",
          "aqui tambem se fala de confinamento de ferramentas, por outro angulo.",
          Falso.vetor("um vetor sem nenhuma relacao com a consulta")
        )

      resultado = Busca.buscar(projeto.id, termo, modo: :hibrido)

      assert [%Trecho{id: ^alvo} | _resto] = resultado
    end

    test "um termo exato que o vetor nao acha (fora do top 40 semantico) e recuperado pela metade textual",
         %{projeto: projeto} do
      termo = "flagexigir"
      vetor_da_consulta = Falso.vetor(termo)

      # 40 trechos com vetor bem PROXIMO da consulta (distancia minuscula, cada um com um
      # epsilon distinto) — enchem sozinhos o LIMIT 40 da metade semantica, e nenhum deles
      # contem o termo procurado.
      decoys =
        for indice <- 1..40 do
          vetor = vetor_proximo(vetor_da_consulta, 0.0001 * indice)

          inserir_trecho!(
            projeto.id,
            "decoy##{indice}",
            "texto de enchimento numero #{indice}, sem relacao com a busca.",
            vetor
          )
        end

      # o alvo tem um vetor SEM relacao com a consulta (distancia bem maior que a de
      # qualquer decoy) — fica de fora do top 40 semantico — mas o corpo contem o termo
      # exato, entao so a metade textual o acha.
      alvo =
        inserir_trecho!(
          projeto.id,
          "alvo",
          "o nome da flag e flagexigir, e ela trava o comando.",
          Falso.vetor("outro texto qualquer, bem distante do anterior")
        )

      resultado = Busca.buscar(projeto.id, termo, modo: :hibrido)
      ids = Enum.map(resultado, & &1.id)

      refute alvo in decoys
      assert alvo in ids
    end
  end

  describe "buscar/3 — isolamento por projeto" do
    test "trecho de outro projeto nunca aparece no resultado", %{projeto: projeto} do
      outro_projeto = projeto!()
      termo = "decisao registrada"
      vetor_da_consulta = Falso.vetor(termo)

      do_projeto =
        inserir_trecho!(
          projeto.id,
          "fonte",
          "decisao registrada neste projeto.",
          vetor_da_consulta
        )

      do_outro_projeto =
        inserir_trecho!(
          outro_projeto.id,
          "fonte",
          "decisao registrada neste projeto.",
          vetor_da_consulta
        )

      resultado = Busca.buscar(projeto.id, termo, modo: :hibrido)
      ids = Enum.map(resultado, & &1.id)

      assert do_projeto in ids
      refute do_outro_projeto in ids
      assert Enum.all?(resultado, &(&1.projeto_id == projeto.id))
    end
  end

  describe "buscar/3 — uma unica ida ao banco" do
    test "a busca inteira (as duas metades, a fusao e a leitura dos trechos) e UMA UNICA consulta SQL",
         %{projeto: projeto} do
      termo = "consulta unica"
      vetor_da_consulta = Falso.vetor(termo)

      inserir_trecho!(projeto.id, "fonte", "prova de consulta unica.", vetor_da_consulta)

      teste = self()
      handler_id = {:busca_teste_contagem, make_ref()}

      :telemetry.attach(
        handler_id,
        [:fabrica, :repo, :query],
        fn _evento, _medidas, _metadados, _config -> send(teste, :consulta_executada) end,
        nil
      )

      Busca.buscar(projeto.id, termo, modo: :hibrido)

      :telemetry.detach(handler_id)

      contagem =
        Stream.repeatedly(fn ->
          receive do
            :consulta_executada -> :recebida
          after
            0 -> nil
          end
        end)
        |> Enum.take_while(&(&1 == :recebida))
        |> length()

      assert contagem == 1
    end
  end

  describe "buscar/3 — o termo e vetorizado pelo caminho de CONSULTA" do
    test "com um embedder que devolve vetores diferentes por tipo, a busca acha o trecho da consulta, e nao o do documento",
         %{projeto: projeto} do
      termo = "termo qualquer"

      trecho_documento =
        inserir_trecho!(
          projeto.id,
          "documento",
          "texto sem relacao textual com o termo.",
          Falso.vetor("vetor-de-documento")
        )

      trecho_consulta =
        inserir_trecho!(
          projeto.id,
          "consulta",
          "outro texto sem relacao textual com o termo.",
          Falso.vetor("vetor-de-consulta")
        )

      resultado = Busca.buscar(projeto.id, termo, embedder: EmbedderPorTipo, modo: :hibrido)

      assert [%Trecho{id: ^trecho_consulta} | _resto] = resultado
      assert trecho_documento in Enum.map(resultado, & &1.id)
    end
  end

  describe "buscar/3 — embedder que falha" do
    test "um embedder que devolve {:erro, _} vira erro nomeado, nao MatchError", %{
      projeto: projeto
    } do
      assert {:erro, {:vetorizacao_da_consulta, :timeout}} =
               Busca.buscar(projeto.id, "termo qualquer",
                 embedder: EmbedderComErro,
                 modo: :hibrido
               )
    end
  end

  describe "buscar/3 — modo :vetor (so semantica)" do
    test "acha o trecho proximo por vetor e NAO roda a metade textual", %{projeto: projeto} do
      termo = "confinamento de ferramentas"
      vetor_da_consulta = Falso.vetor(termo)

      so_semantico =
        inserir_trecho!(
          projeto.id,
          "so-semantico",
          "um texto qualquer, sem nenhuma relacao textual com a busca.",
          vetor_da_consulta
        )

      # 7 trechos com vetor bem PROXIMO da consulta (epsilon distinto por trecho) — junto com
      # `so_semantico` enchem os 8 lugares do LIMIT do modo :vetor, empurrando `so_textual`
      # (cujo vetor NAO tem relacao com a consulta) para fora do topo 8. Sem estes decoys, o
      # projeto isolado do teste teria so 2 trechos no total e ambos caberiam no LIMIT 8 por
      # falta de concorrencia — nao por o modo :vetor estar errado (mesma tecnica ja usada no
      # teste de fusao hibrida acima, com 40 decoys para o LIMIT de 40 candidatos).
      for indice <- 1..7 do
        inserir_trecho!(
          projeto.id,
          "decoy-vetor##{indice}",
          "texto de enchimento numero #{indice}, sem relacao com a busca.",
          vetor_proximo(vetor_da_consulta, 0.0001 * indice)
        )
      end

      # contem o termo exato, mas o vetor e outro: so a metade TEXTUAL o acharia.
      so_textual =
        inserir_trecho!(
          projeto.id,
          "so-textual",
          "aqui se fala de confinamento de ferramentas, por outro angulo.",
          Falso.vetor("um vetor sem nenhuma relacao com a consulta")
        )

      ids = projeto.id |> Busca.buscar(termo, modo: :vetor) |> Enum.map(& &1.id)

      assert so_semantico in ids
      refute so_textual in ids
    end
  end

  describe "buscar/3 — modo :textual (so palavra)" do
    test "acha o trecho pelo termo e NAO roda a metade semantica", %{projeto: projeto} do
      termo = "confinamento de ferramentas"
      vetor_da_consulta = Falso.vetor(termo)

      # vetor identico ao da consulta, mas sem o termo: so a metade SEMANTICA o acharia.
      so_semantico =
        inserir_trecho!(
          projeto.id,
          "so-semantico",
          "um texto qualquer, sem nenhuma relacao textual com a busca.",
          vetor_da_consulta
        )

      so_textual =
        inserir_trecho!(
          projeto.id,
          "so-textual",
          "aqui se fala de confinamento de ferramentas, por outro angulo.",
          Falso.vetor("um vetor sem nenhuma relacao com a consulta")
        )

      ids = projeto.id |> Busca.buscar(termo, modo: :textual) |> Enum.map(& &1.id)

      assert so_textual in ids
      refute so_semantico in ids
    end

    test "nao vetoriza a consulta — um embedder que so falha nao e nem chamado", %{
      projeto: projeto
    } do
      termo = "confinamento de ferramentas"

      alvo =
        inserir_trecho!(
          projeto.id,
          "alvo",
          "texto sobre confinamento de ferramentas nesta fabrica.",
          Falso.vetor("qualquer")
        )

      # `EmbedderComErro` so implementa `vetorizar/1` (que devolve {:erro, _}). Se o modo textual
      # o chamasse, o retorno seria {:erro, _}; como nao chama, vem a lista normal.
      resultado = Busca.buscar(projeto.id, termo, modo: :textual, embedder: EmbedderComErro)

      assert is_list(resultado)
      assert alvo in Enum.map(resultado, & &1.id)
    end
  end

  describe "buscar/3 — cada modo faz UMA unica ida ao banco" do
    for modo <- [:hibrido, :vetor, :textual] do
      test "modo #{modo} executa exatamente uma consulta SQL", %{projeto: projeto} do
        modo = unquote(modo)
        termo = "consulta unica por modo"
        inserir_trecho!(projeto.id, "fonte", "prova de consulta unica.", Falso.vetor(termo))

        teste = self()
        handler_id = {:busca_teste_modo, make_ref()}

        :telemetry.attach(
          handler_id,
          [:fabrica, :repo, :query],
          fn _e, _m, _md, _c -> send(teste, :consulta_executada) end,
          nil
        )

        Busca.buscar(projeto.id, termo, modo: modo)
        :telemetry.detach(handler_id)

        contagem =
          Stream.repeatedly(fn ->
            receive do
              :consulta_executada -> :recebida
            after
              0 -> nil
            end
          end)
          |> Enum.take_while(&(&1 == :recebida))
          |> length()

        assert contagem == 1
      end
    end
  end

  describe "buscar/3 — isolamento por projeto em TODO modo" do
    for modo <- [:hibrido, :vetor, :textual] do
      test "modo #{modo}: trecho de outro projeto nunca aparece", %{projeto: projeto} do
        modo = unquote(modo)
        outro = projeto!()
        termo = "decisao registrada"
        vetor = Falso.vetor(termo)

        do_projeto = inserir_trecho!(projeto.id, "fonte", "decisao registrada aqui.", vetor)
        do_outro = inserir_trecho!(outro.id, "fonte", "decisao registrada aqui.", vetor)

        resultado = Busca.buscar(projeto.id, termo, modo: modo)
        ids = Enum.map(resultado, & &1.id)

        assert do_projeto in ids
        refute do_outro in ids
        assert Enum.all?(resultado, &(&1.projeto_id == projeto.id))
      end
    end
  end

  describe "buscar/3 — :k e aceito no modo hibrido" do
    test "um :k explicito e aceito e devolve resultado valido", %{projeto: projeto} do
      termo = "fusao com k customizado"
      vetor = Falso.vetor(termo)
      alvo = inserir_trecho!(projeto.id, "alvo", "texto sobre fusao com k customizado.", vetor)

      ids = projeto.id |> Busca.buscar(termo, modo: :hibrido, k: 1) |> Enum.map(& &1.id)

      assert alvo in ids
    end
  end
end
