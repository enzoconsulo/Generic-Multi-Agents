defmodule Fabrica.TrilhasTest do
  @moduledoc """
  Cobre `Fabrica.Trilhas` (roteamento pelo `dominio`) e `Fabrica.Criterios.Grau` (o rotulo
  obrigatorio da escada de prova) — os dois nascem juntos porque a T-056 e uma so ideia:
  o pipeline muda de trilha, e o grau de prova deixa de ser opcional em qualquer trilha.

  Ambos sao PUROS: nenhum teste aqui toca banco, e o arquivo inteiro roda em milissegundos.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Criterios.Grau
  alias Fabrica.Trilhas

  doctest Fabrica.Trilhas
  doctest Fabrica.Criterios.Grau

  describe "Trilhas.de/1 — dominio ausente ou software vai para a trilha de software" do
    test "dominio ausente (nil) roteia para :software" do
      assert Trilhas.de(nil) == :software
    end

    test "dominio \"software\" roteia para :software" do
      assert Trilhas.de("software") == :software
    end

    test "qualquer outro dominio roteia para :generica" do
      for dominio <- ~w[apresentacao documento dados midia generico outra-coisa] do
        assert Trilhas.de(dominio) == :generica
      end
    end
  end

  describe "Trilhas.agente/2 — quem atende cada papel muda com a trilha" do
    test "na trilha de software: executor, testador, revisor" do
      assert Trilhas.agente(:software, :construtor) == "executor"
      assert Trilhas.agente(:software, :verificador) == "testador"
      assert Trilhas.agente(:software, :revisor) == "revisor"
    end

    test "na trilha generica: construtor, conferente, revisor-generico" do
      assert Trilhas.agente(:generica, :construtor) == "construtor"
      assert Trilhas.agente(:generica, :verificador) == "conferente"
      assert Trilhas.agente(:generica, :revisor) == "revisor-generico"
    end
  end

  describe "Grau.fechar/2 — o verificador nao fecha sem rotular TODOS os criterios" do
    test "todos rotulados com um grau da escada: fecha" do
      avaliacoes = [%{texto: "a", grau: :executado}, %{texto: "b", grau: :inspecionado}]
      assert {:ok, ^avaliacoes} = Grau.fechar(avaliacoes, "")
    end

    test "rotulo ausente (grau nil) e erro, e nomeia o criterio sem rotulo" do
      avaliacoes = [%{texto: "a", grau: :executado}, %{texto: "b", grau: nil}]
      assert {:erro, {:rotulo_ausente, ["b"]}} = Grau.fechar(avaliacoes, "")
    end

    test "todos sem rotulo: todos aparecem na lista de erro, na ordem" do
      avaliacoes = [%{texto: "a", grau: nil}, %{texto: "b", grau: nil}]
      assert {:erro, {:rotulo_ausente, ["a", "b"]}} = Grau.fechar(avaliacoes, "")
    end

    test "grau fora da escada tambem conta como rotulo ausente" do
      avaliacoes = [%{texto: "a", grau: :inventado}]
      assert {:erro, {:rotulo_ausente, ["a"]}} = Grau.fechar(avaliacoes, "")
    end

    test "lista vazia de avaliacoes fecha (nada para rotular)" do
      assert {:ok, []} = Grau.fechar([], "")
    end
  end

  describe "Grau.fechar/2 — julgado exige a secao de rubrica com itens binarios" do
    @tarefa_com_rubrica """
    ## Objetivo
    Um objetivo qualquer.

    ## Rubrica
    - cada secao abre com uma frase-tese
    - nenhum slide tem mais de 6 linhas

    ## Verificacao
    """

    test "julgado com secao de rubrica presente e com itens: fecha" do
      avaliacoes = [%{texto: "gosto visual", grau: :julgado}]
      assert {:ok, ^avaliacoes} = Grau.fechar(avaliacoes, @tarefa_com_rubrica)
    end

    test "julgado sem secao de rubrica nenhuma na tarefa: erro" do
      avaliacoes = [%{texto: "gosto visual", grau: :julgado}]
      texto = "## Objetivo\nSem rubrica nenhuma aqui.\n"
      assert {:erro, {:rubrica_ausente, ["gosto visual"]}} = Grau.fechar(avaliacoes, texto)
    end

    test "julgado com secao de rubrica vazia (sem nenhum item): erro" do
      avaliacoes = [%{texto: "x", grau: :julgado}]
      texto = "## Rubrica\n\n## Outra secao\nnada aqui\n"
      assert {:erro, {:rubrica_ausente, ["x"]}} = Grau.fechar(avaliacoes, texto)
    end

    test "criterio executado nao precisa de rubrica, mesmo sem a secao existir" do
      avaliacoes = [%{texto: "a", grau: :executado}]
      assert {:ok, ^avaliacoes} = Grau.fechar(avaliacoes, "## Objetivo\nsem rubrica\n")
    end

    test "so o(s) julgado(s) sem prova entram no erro, quando ha outros rotulados" do
      avaliacoes = [
        %{texto: "executado ok", grau: :executado},
        %{texto: "julgado sem rubrica", grau: :julgado}
      ]

      assert {:erro, {:rubrica_ausente, ["julgado sem rubrica"]}} =
               Grau.fechar(avaliacoes, "## Objetivo\nsem rubrica\n")
    end
  end

  describe "Grau.rubrica/1 — le a secao ## Rubrica" do
    test "sem a secao: lista vazia" do
      assert Grau.rubrica("## Objetivo\nnada\n") == []
    end

    test "com itens: devolve as linhas de item" do
      texto = "## Rubrica\n- primeiro item\n- segundo item\n## Depois\nresto\n"
      assert Grau.rubrica(texto) == ["- primeiro item", "- segundo item"]
    end
  end

  describe "Grau.proporcao_julgados/1 — a proporcao e consultavel" do
    test "projeto (ou tarefa) sem criterio nenhum: 0.0" do
      assert Grau.proporcao_julgados([]) == 0.0
    end

    test "nenhum julgado: 0.0" do
      criterios = [%{grau: :executado}, %{grau: :inspecionado}]
      assert Grau.proporcao_julgados(criterios) == 0.0
    end

    test "metade julgados: 0.5" do
      criterios = [%{grau: :julgado}, %{grau: :executado}]
      assert Grau.proporcao_julgados(criterios) == 0.5
    end

    test "todos julgados: 1.0" do
      criterios = [%{grau: :julgado}, %{grau: :julgado}]
      assert Grau.proporcao_julgados(criterios) == 1.0
    end
  end
end
