defmodule Fabrica.Embedder.FalsoTest do
  @moduledoc """
  Trava as duas propriedades das quais toda a v0.5 depende para ser testavel sem modelo:
  determinismo e distincao.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Embedder
  alias Fabrica.Embedder.Falso

  describe "determinismo" do
    test "o mesmo texto produz sempre o mesmo vetor" do
      assert Falso.vetor("allowlist de binarios") == Falso.vetor("allowlist de binarios")
    end

    test "o determinismo vale entre chamadas em lote e chamadas avulsas" do
      {:ok, [em_lote]} = Falso.vetorizar(["o banco e a verdade"])
      assert em_lote == Falso.vetor("o banco e a verdade")
    end

    test "o mesmo lote, vetorizado duas vezes, da exatamente os mesmos vetores" do
      textos = ["um", "dois", "tres"]

      {:ok, primeira} = Falso.vetorizar(textos)
      {:ok, segunda} = Falso.vetorizar(textos)

      assert primeira == segunda
    end
  end

  describe "distincao" do
    test "textos diferentes produzem vetores diferentes" do
      refute Falso.vetor("um texto") == Falso.vetor("outro texto")
    end

    test "textos parecidos ainda assim produzem vetores diferentes" do
      refute Falso.vetor("tarefa concluida") == Falso.vetor("tarefa concluidas")
    end

    test "cem textos distintos dao cem vetores distintos" do
      textos = Enum.map(1..100, &"trecho numero #{&1}")

      {:ok, vetores} = Falso.vetorizar(textos)

      assert length(Enum.uniq(vetores)) == 100
    end

    test "o vetor nao e constante dentro de si: as posicoes variam" do
      # Um vetor de 384 posicoes iguais satisfaria "deterministico" e seria inutil para
      # qualquer ordenacao — e o modo mais facil de este adaptador estar errado sem falhar.
      vetor = Falso.vetor("qualquer coisa")
      assert length(Enum.uniq(vetor)) > 100
    end
  end

  describe "formato" do
    test "dimensoes devolve 384" do
      assert Falso.dimensoes() == 384
    end

    test "todo vetor gerado tem exatamente 384 posicoes" do
      {:ok, vetores} = Falso.vetorizar(["a", "", String.duplicate("longo ", 500)])

      assert length(vetores) == 3
      assert Enum.all?(vetores, &(length(&1) == 384))
    end

    test "todas as posicoes sao float" do
      assert Enum.all?(Falso.vetor("x"), &is_float/1)
    end

    test "o vetor e normalizado: norma 1" do
      vetor = Falso.vetor("um trecho da historia do projeto")
      norma = :math.sqrt(Enum.reduce(vetor, 0.0, fn v, s -> s + v * v end))

      assert_in_delta norma, 1.0, 1.0e-9
    end

    test "texto vazio tem vetor, e ele e valido" do
      {:ok, [vetor]} = Falso.vetorizar([""])

      assert length(vetor) == 384
      assert Enum.all?(vetor, &is_float/1)
    end
  end

  describe "lote" do
    test "a ordem da saida acompanha a da entrada" do
      textos = ["primeiro", "segundo", "terceiro"]
      {:ok, vetores} = Falso.vetorizar(textos)

      esperado = Enum.map(textos, &Falso.vetor/1)
      assert vetores == esperado
    end

    test "lote vazio devolve lista vazia, sem erro" do
      assert {:ok, []} = Falso.vetorizar([])
    end

    test "lote com algo que nao e string devolve erro nomeado" do
      assert {:erro, :texto_nao_e_string} = Falso.vetorizar(["ok", 42])
    end

    test "argumento que nao e lista devolve erro nomeado" do
      assert {:erro, :esperava_lista} = Falso.vetorizar("nao sou lista")
    end
  end

  describe "o contrato" do
    test "Falso implementa o behaviour Fabrica.Embedder" do
      comportamentos =
        Falso.module_info(:attributes)
        |> Keyword.get_values(:behaviour)
        |> List.flatten()

      assert Fabrica.Embedder in comportamentos
    end

    test "o behaviour declara vetorizar/1 em lote e dimensoes/0" do
      callbacks = Fabrica.Embedder.behaviour_info(:callbacks)

      assert {:vetorizar, 1} in callbacks
      assert {:dimensoes, 0} in callbacks
    end

    test "o embedder configurado na suite e o Falso" do
      assert Embedder.configurado() == Falso
      assert Embedder.dimensoes() == 384
    end
  end

  describe "sem modelo e sem rede" do
    test "o codigo do Falso nao carrega modelo nem toca a rede" do
      fonte = File.read!("lib/fabrica/embedder/falso.ex")

      for proibido <- ~w[Bumblebee Nx EXLA Axon Req Finch HTTPoison System.get_env] do
        padrao = ~r/(?<![A-Za-z0-9_.])#{Regex.escape(proibido)}(?![A-Za-z0-9_])/

        refute Regex.match?(padrao, fonte),
               "Embedder.Falso referencia #{proibido}. Nenhuma versao anterior a v0.5 " <>
                 "pode carregar modelo — o perfil alvo e 8 GB de RAM."
      end
    end
  end
end
