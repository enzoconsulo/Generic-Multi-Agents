defmodule Fabrica.Embedder.ServicoTest do
  @moduledoc """
  Prova o adaptador HTTP sem gastar um centavo: a parte que fala rede usa `Req.Test`, do
  mesmo jeito que `Fabrica.Operario.MessagesAPI` prova as armadilhas de cache.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Embedder
  alias Fabrica.Embedder.Servico

  @url "https://exemplo.test/vetorizar"

  defp vetor(valor), do: List.duplicate(valor, 384)

  describe "lote, com stub de HTTP" do
    test "vetoriza um lote e devolve os vetores na mesma ordem" do
      vetores = [vetor(0.1), vetor(0.2)]
      stub = fn conn -> Req.Test.json(conn, %{"vetores" => vetores}) end

      assert {:ok, ^vetores} = Servico.vetorizar(["um", "dois"], url: @url, plug: stub)
    end

    test "lote vazio devolve lista vazia sem chamar a rede" do
      assert {:ok, []} = Servico.vetorizar([], url: @url)
    end

    test "dimensao errada falha com erro nomeado, em vez de gravar vetor de tamanho errado" do
      stub = fn conn -> Req.Test.json(conn, %{"vetores" => [List.duplicate(0.1, 10)]}) end

      assert {:erro, {:dimensao_invalida, 384, [10]}} =
               Servico.vetorizar(["um"], url: @url, plug: stub)
    end

    test "resposta sem 'vetores' falha com erro nomeado" do
      stub = fn conn -> Req.Test.json(conn, %{"algo" => "errado"}) end

      assert {:erro, :resposta_invalida} = Servico.vetorizar(["um"], url: @url, plug: stub)
    end

    test "erro HTTP volta nomeado, com o status" do
      stub = fn conn -> conn |> Plug.Conn.put_status(500) |> Req.Test.json(%{"erro" => "x"}) end

      assert {:erro, {:http, 500, _}} = Servico.vetorizar(["um"], url: @url, plug: stub)
    end

    test "sem url configurada devolve erro nomeado, sem tentar a rede" do
      assert {:erro, :url_nao_configurada} = Servico.vetorizar(["um"], [])
    end

    test "lote com algo que nao e string devolve erro nomeado" do
      assert {:erro, :texto_nao_e_string} = Servico.vetorizar(["ok", 42], url: @url)
    end

    test "argumento que nao e lista devolve erro nomeado" do
      assert {:erro, :esperava_lista} = Servico.vetorizar("nao sou lista", [])
    end
  end

  describe "credencial" do
    test "quando ha chave configurada, ela vai no cabecalho Authorization" do
      stub = fn conn ->
        assert ["Bearer segredo"] = Plug.Conn.get_req_header(conn, "authorization")
        Req.Test.json(conn, %{"vetores" => [vetor(0.3)]})
      end

      assert {:ok, [_]} = Servico.vetorizar(["um"], url: @url, chave: "segredo", plug: stub)
    end

    test "sem chave configurada, nao ha cabecalho Authorization" do
      stub = fn conn ->
        assert Plug.Conn.get_req_header(conn, "authorization") == []
        Req.Test.json(conn, %{"vetores" => [vetor(0.3)]})
      end

      assert {:ok, [_]} = Servico.vetorizar(["um"], url: @url, plug: stub)
    end
  end

  describe "o contrato" do
    test "dimensoes devolve 384" do
      assert Servico.dimensoes() == 384
    end

    test "Servico implementa o behaviour Fabrica.Embedder" do
      comportamentos =
        Servico.module_info(:attributes)
        |> Keyword.get_values(:behaviour)
        |> List.flatten()

      assert Fabrica.Embedder in comportamentos
    end

    test "o callback vetorizar/1 delega para vetorizar/2 com opcoes vazias" do
      # Sem url configurada na aplicacao, o callback de aridade 1 tambem falha nomeado —
      # e nao levanta e nao tenta a rede.
      assert Embedder.configurado() == Fabrica.Embedder.Falso
      assert {:erro, :url_nao_configurada} = Servico.vetorizar(["um"])
    end
  end
end
