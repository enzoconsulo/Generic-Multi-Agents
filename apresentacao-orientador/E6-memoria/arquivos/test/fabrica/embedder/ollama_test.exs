defmodule Fabrica.Embedder.OllamaTest do
  @moduledoc """
  Prova o adaptador do Ollama sem tocar `127.0.0.1:11434`: a parte que fala rede usa
  `Req.Test`, do mesmo jeito que `Fabrica.Embedder.ServicoTest`.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Embedder.Ollama

  @url "https://exemplo.test"

  defp vetor(valor), do: List.duplicate(valor, 768)

  describe "lote, com stub de HTTP" do
    test "faz UM POST em /api/embed com o lote inteiro, model, truncate e keep_alive" do
      vetores = [vetor(0.1), vetor(0.2)]

      stub = fn conn ->
        assert conn.method == "POST"
        assert conn.request_path == "/api/embed"

        {:ok, corpo, conn} = Plug.Conn.read_body(conn)
        decodificado = Jason.decode!(corpo)

        assert decodificado["model"] == "embeddinggemma"
        assert decodificado["truncate"] == true
        assert decodificado["keep_alive"] == "10m"

        assert decodificado["input"] == [
                 "title: none | text: um",
                 "title: none | text: dois"
               ]

        Req.Test.json(conn, %{"embeddings" => vetores})
      end

      assert {:ok, ^vetores} = Ollama.vetorizar(["um", "dois"], url: @url, plug: stub)
    end

    test "lote vazio devolve lista vazia sem chamar a rede" do
      assert {:ok, []} = Ollama.vetorizar([], url: @url)
    end
  end

  describe "prefixo por tipo de texto" do
    test "vetorizar/2 manda o prefixo de documento" do
      stub = fn conn ->
        {:ok, corpo, conn} = Plug.Conn.read_body(conn)
        assert Jason.decode!(corpo)["input"] == ["title: none | text: ola"]
        Req.Test.json(conn, %{"embeddings" => [vetor(0.1)]})
      end

      assert {:ok, [_]} = Ollama.vetorizar(["ola"], url: @url, plug: stub)
    end

    test "vetorizar_consulta/2 manda o prefixo de consulta" do
      stub = fn conn ->
        {:ok, corpo, conn} = Plug.Conn.read_body(conn)
        assert Jason.decode!(corpo)["input"] == ["task: search result | query: ola"]
        Req.Test.json(conn, %{"embeddings" => [vetor(0.1)]})
      end

      assert {:ok, [_]} = Ollama.vetorizar_consulta(["ola"], url: @url, plug: stub)
    end

    test "prefixos sao configuraveis por opcao" do
      stub = fn conn ->
        {:ok, corpo, conn} = Plug.Conn.read_body(conn)
        assert Jason.decode!(corpo)["input"] == ["outro: ola"]
        Req.Test.json(conn, %{"embeddings" => [vetor(0.1)]})
      end

      assert {:ok, [_]} =
               Ollama.vetorizar(["ola"], url: @url, prefixo_documento: "outro: ", plug: stub)
    end
  end

  describe "dimensao" do
    test "dimensao errada falha com erro nomeado, em vez de gravar vetor de tamanho errado" do
      stub = fn conn -> Req.Test.json(conn, %{"embeddings" => [List.duplicate(0.1, 10)]}) end

      assert {:erro, {:dimensao_invalida, 768, [10]}} =
               Ollama.vetorizar(["um"], url: @url, plug: stub)
    end

    test "dimensao configurada por opcao muda o esperado" do
      stub = fn conn -> Req.Test.json(conn, %{"embeddings" => [List.duplicate(0.1, 10)]}) end

      assert {:ok, [_]} = Ollama.vetorizar(["um"], url: @url, dimensoes: 10, plug: stub)
    end
  end

  describe "configuracao e padroes" do
    test "sem configuracao nenhuma, dimensoes/0 e 768" do
      assert Ollama.dimensoes() == 768
    end

    test "sem opcao de url, usa o padrao http://127.0.0.1:11434 (erro de transporte esperado)" do
      # Nenhum plug: cai no duble global Fabrica.SemRede, que LEVANTA — prova que o adaptador
      # tentaria falar com o Ollama local de verdade, sem custom nenhum.
      assert_raise RuntimeError, ~r/127\.0\.0\.1.*\/api\/embed/, fn ->
        Ollama.vetorizar(["um"], [])
      end
    end

    test "modelo padrao e embeddinggemma" do
      stub = fn conn ->
        {:ok, corpo, conn} = Plug.Conn.read_body(conn)
        assert Jason.decode!(corpo)["model"] == "embeddinggemma"
        Req.Test.json(conn, %{"embeddings" => [vetor(0.1)]})
      end

      assert {:ok, [_]} = Ollama.vetorizar(["um"], url: @url, plug: stub)
    end

    test "opcao sobrepoe modelo, url e dimensoes" do
      stub = fn conn ->
        {:ok, corpo, conn} = Plug.Conn.read_body(conn)
        assert Jason.decode!(corpo)["model"] == "outro-modelo"
        Req.Test.json(conn, %{"embeddings" => [vetor(0.5)]})
      end

      assert {:ok, [v]} =
               Ollama.vetorizar(["um"],
                 url: @url,
                 modelo: "outro-modelo",
                 dimensoes: 768,
                 plug: stub
               )

      assert length(v) == 768
    end
  end

  describe "erros" do
    test "resposta sem 'embeddings' falha com erro nomeado" do
      stub = fn conn -> Req.Test.json(conn, %{"algo" => "errado"}) end

      assert {:erro, :resposta_invalida} = Ollama.vetorizar(["um"], url: @url, plug: stub)
    end

    test "erro HTTP volta nomeado, com o status" do
      stub = fn conn -> conn |> Plug.Conn.put_status(500) |> Req.Test.json(%{"erro" => "x"}) end

      assert {:erro, {:http, 500, _}} = Ollama.vetorizar(["um"], url: @url, plug: stub)
    end

    test "erro de transporte volta nomeado" do
      stub = fn conn -> Req.Test.transport_error(conn, :econnrefused) end

      assert {:erro, %Req.TransportError{reason: :econnrefused}} =
               Ollama.vetorizar(["um"], url: @url, plug: stub)
    end

    test "lote com algo que nao e string devolve erro nomeado" do
      assert {:erro, :texto_nao_e_string} = Ollama.vetorizar(["ok", 42], url: @url)
    end

    test "argumento que nao e lista devolve erro nomeado" do
      assert {:erro, :esperava_lista} = Ollama.vetorizar("nao sou lista", [])
    end
  end

  describe "o contrato" do
    test "Ollama implementa o behaviour Fabrica.Embedder" do
      comportamentos =
        Ollama.module_info(:attributes)
        |> Keyword.get_values(:behaviour)
        |> List.flatten()

      assert Fabrica.Embedder in comportamentos
    end

    test "o callback vetorizar/1 delega para vetorizar/2 com opcoes vazias" do
      assert_raise RuntimeError, ~r/tentou SAIR durante a suite/, fn ->
        Ollama.vetorizar(["um"])
      end
    end
  end
end
