defmodule Fabrica.Agente.FerramentasTest do
  @moduledoc """
  O mapa de ferramentas REAIS montado para um agente — a peca que a T-070 deixou faltando
  (ver `Fabrica.Fila.Trabalho` @moduledoc). Cada teste aqui prova que a ferramenta chama o
  modulo de verdade, e nao um stub que "funciona" sem tocar o disco.

  `registrar_resultado` (T-074) mora aqui tambem: a prova de que a chamada NAO falha por
  `ciclo_id` inexistente, porque ela nunca precisa de um — cai no coletor em memoria de
  `Fabrica.Ferramentas.RegistrarResultado`.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Agente.Ferramentas
  alias Fabrica.Ferramentas.Catalogo
  alias Fabrica.Ferramentas.RegistrarResultado
  alias Fabrica.Tarefas.Area

  setup do
    raiz = Path.join(System.tmp_dir!(), "ferr-agente-#{System.unique_integer([:positive])}")
    File.mkdir_p!(Path.join(raiz, "lib"))
    {:ok, coletor} = RegistrarResultado.iniciar_coletor()
    on_exit(fn -> File.rm_rf(raiz) end)
    {:ok, raiz: raiz, coletor: coletor}
  end

  describe "montar/4 — papel conhecido" do
    test "para o construtor, devolve as sete ferramentas do catalogo (com registrar_resultado)",
         %{raiz: raiz, coletor: coletor} do
      assert {:ok, ferramentas} = Ferramentas.montar("construtor", raiz, [], coletor)

      {:ok, esperadas} = Catalogo.do_papel("construtor")

      assert Map.keys(ferramentas) |> Enum.sort() == Map.keys(esperadas) |> Enum.sort()
      assert map_size(esperadas) == 7
      assert Map.has_key?(ferramentas, "registrar_resultado")

      for {_nome, funcao} <- ferramentas do
        assert is_function(funcao, 2)
      end
    end

    test "cada ferramenta chama o modulo real — nao um stub", %{raiz: raiz, coletor: coletor} do
      File.write!(Path.join(raiz, "lib/x.ex"), "conteudo real")
      {:ok, ferramentas} = Ferramentas.montar("construtor", raiz, [], coletor)

      assert {:ok, "conteudo real"} = ferramentas["ler"].(%{"caminho" => "lib/x.ex"}, raiz)
      assert {:ok, arquivos} = ferramentas["listar"].(%{}, raiz)
      assert "lib/x.ex" in arquivos

      assert {:ok, achados} = ferramentas["buscar"].(%{"texto" => "real"}, raiz)
      assert [{"lib/x.ex", 1, "conteudo real"}] = achados

      assert {:erro, :arquivo_ausente} = ferramentas["ler"].(%{"caminho" => "nao/existe"}, raiz)

      # `rodar` tem de chamar o `Comando` REAL: um programa que exista no SO em que o teste
      # roda. No Windows segue `cmd /c echo oi`; fora dele `cmd` nao existe, e `echo` e
      # executavel de verdade (`/usr/bin/echo`).
      {programa, args} =
        if match?({:win32, _}, :os.type()),
          do: {"cmd", ["/c", "echo", "oi"]},
          else: {"echo", ["oi"]}

      assert {:ok, resultado} =
               ferramentas["rodar"].(%{"programa" => programa, "args" => args}, raiz)

      assert resultado.codigo == 0
      assert resultado.stdout =~ "oi"
    end

    test "papel que nao pode escrever (verificador) nao recebe escrever nem editar", %{
      raiz: raiz,
      coletor: coletor
    } do
      assert {:ok, ferramentas} = Ferramentas.montar("verificador", raiz, [], coletor)

      refute Map.has_key?(ferramentas, "escrever")
      refute Map.has_key?(ferramentas, "editar")
      assert Map.has_key?(ferramentas, "rodar")
      assert Map.has_key?(ferramentas, "registrar_resultado")
    end
  end

  describe "montar/4 — papel desconhecido" do
    test "propaga o erro do catalogo, nunca um mapa vazio", %{raiz: raiz, coletor: coletor} do
      assert {:erro, :papel_desconhecido} = Ferramentas.montar("inexistente", raiz, [], coletor)
    end
  end

  describe "registrar_resultado — chamavel NO MEIO do laco, sem ciclo_id (T-074)" do
    test "aceita o relato sem falhar, e sem exigir ciclo_id nenhum", %{
      raiz: raiz,
      coletor: coletor
    } do
      {:ok, ferramentas} = Ferramentas.montar("construtor", raiz, [], coletor)

      assert %{gravado: true, avisos: []} =
               ferramentas["registrar_resultado"].(
                 %{"resumo" => "criei o modulo", "arquivos" => ["lib/x.ex"]},
                 raiz
               )
    end

    test "varias chamadas na mesma volta caem no MESMO coletor, na ordem", %{
      raiz: raiz,
      coletor: coletor
    } do
      {:ok, ferramentas} = Ferramentas.montar("construtor", raiz, [], coletor)

      ferramentas["registrar_resultado"].(%{"resumo" => "parte 1"}, raiz)
      ferramentas["registrar_resultado"].(%{"resumo" => "parte 2"}, raiz)

      assert [%{resumo: "parte 1"}, %{resumo: "parte 2"}] = RegistrarResultado.relatos(coletor)
    end

    test "campo do sistema (status) e ignorado com aviso, como em registrar/2", %{
      raiz: raiz,
      coletor: coletor
    } do
      {:ok, ferramentas} = Ferramentas.montar("construtor", raiz, [], coletor)

      assert %{avisos: [aviso]} =
               ferramentas["registrar_resultado"].(
                 %{"resumo" => "fiz", "status" => "concluida"},
                 raiz
               )

      assert aviso =~ "status"
      assert [%{resumo: "fiz"}] = RegistrarResultado.relatos(coletor)
    end
  end

  describe "escrever — confinamento por areas (momento 2 da T-038)" do
    test "grava o conteudo no disco quando o caminho pertence as areas", %{
      raiz: raiz,
      coletor: coletor
    } do
      areas = [%Area{caminho: "lib/permitido.ex"}]
      {:ok, ferramentas} = Ferramentas.montar("construtor", raiz, areas, coletor)

      assert {:ok, _} =
               ferramentas["escrever"].(
                 %{"caminho" => "lib/permitido.ex", "conteudo" => "codigo novo"},
                 raiz
               )

      assert File.read!(Path.join(raiz, "lib/permitido.ex")) == "codigo novo"
    end

    test "recusa gravar em caminho fora das areas, e nao cria o arquivo", %{
      raiz: raiz,
      coletor: coletor
    } do
      areas = [%Area{caminho: "lib/permitido.ex"}]
      {:ok, ferramentas} = Ferramentas.montar("construtor", raiz, areas, coletor)

      assert {:erro, :fora_das_areas} =
               ferramentas["escrever"].(
                 %{"caminho" => "lib/fora.ex", "conteudo" => "nao deveria"},
                 raiz
               )

      refute File.exists?(Path.join(raiz, "lib/fora.ex"))
    end

    test "editar tambem respeita as areas", %{raiz: raiz, coletor: coletor} do
      File.write!(Path.join(raiz, "lib/fora.ex"), "velho")
      areas = [%Area{caminho: "lib/permitido.ex"}]
      {:ok, ferramentas} = Ferramentas.montar("construtor", raiz, areas, coletor)

      assert {:erro, :fora_das_areas} =
               ferramentas["editar"].(
                 %{"caminho" => "lib/fora.ex", "alvo" => "velho", "novo" => "novo"},
                 raiz
               )

      assert File.read!(Path.join(raiz, "lib/fora.ex")) == "velho"
    end
  end
end
