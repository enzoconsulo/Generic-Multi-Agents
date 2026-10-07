defmodule Fabrica.Fila.ExclusaoTest do
  @moduledoc """
  A prova, em teste, de que `areas` e o mutex do paralelismo nos DOIS momentos da T-038 — e
  nao a promessa de que ele e.

  **Nao usa `DataCase` de proposito**, pela mesma razao de `fila_test.exs`: as structs sao
  montadas a mao, sem banco, entao a suite roda em milissegundos.

  **`async: false`**: o bloco "fonte so" (D-003) muda `Application.put_env(:fabrica,
  :max_construtores, ...)`, que e estado GLOBAL do VM — mutar isso num modulo `async: true`
  arriscaria outro teste (deste ou de outro arquivo) ler o valor no meio da troca.
  """

  use ExUnit.Case, async: false

  alias Fabrica.Fila.Exclusao
  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Fila
  alias Fabrica.Tarefas.Tarefa

  defp tarefa(codigo, status, areas) do
    %Tarefa{
      id: :erlang.phash2(codigo),
      codigo: codigo,
      titulo: codigo,
      status: status,
      prioridade: :media,
      tentativas: 0,
      replanejada_de_id: nil,
      dependencias: [],
      areas: Enum.map(areas, &%Area{caminho: &1})
    }
  end

  defp codigos_dos_passos(passos), do: Enum.map(passos, & &1.tarefa.codigo)

  describe "lote/2 — momento 1: antes de despachar" do
    test "duas tarefas com areas que se cruzam nunca sao despachadas juntas" do
      tarefas = [
        tarefa("T-001", :pronta, ["lib/a.ex"]),
        tarefa("T-002", :pronta, ["lib/a.ex"]),
        tarefa("T-003", :pronta, ["lib/c.ex"])
      ]

      passos = Exclusao.lote(tarefas)

      # T-002 fica de fora: compartilha "lib/a.ex" com T-001, que veio antes na ordenacao.
      assert codigos_dos_passos(passos) == ["T-001", "T-003"]
    end

    test "verificador nao e despachado enquanto ha construtor ativo no mesmo projeto" do
      tarefas = [
        tarefa("T-001", :em_execucao, ["lib/a.ex"]),
        tarefa("T-002", :em_teste, ["lib/b.ex"])
      ]

      passos = Exclusao.lote(tarefas)

      # O lote inteiro vira so o verificador (mais revisores, aqui nenhum) — nenhum
      # construtor sai junto, nem mesmo o que ja estava em_execucao.
      assert [%{papel: :verificador, tarefa: %{codigo: "T-002"}}] = passos
    end

    test "sem configuracao, ate 2 construtores rodam juntos quando as areas sao disjuntas, nunca mais (D-003)" do
      tarefas =
        for n <- 1..5, do: tarefa("T-00#{n}", :pronta, ["lib/#{n}.ex"])

      passos = Exclusao.lote(tarefas)

      assert length(passos) == 2
      assert Enum.all?(passos, &(&1.papel == :construtor))
    end

    test "o teto de construtores continua ajustavel por opcao" do
      tarefas =
        for n <- 1..5, do: tarefa("T-00#{n}", :pronta, ["lib/#{n}.ex"])

      assert length(Exclusao.lote(tarefas, max_construtores: 1)) == 1
    end
  end

  describe "o teto de construtores tem uma fonte so (D-003)" do
    test "sem configuracao, o padrao de Fila e Exclusao e o mesmo que a fila Oban usa" do
      queues = Application.fetch_env!(:fabrica, Oban)[:queues]

      assert Fila.max_construtores_padrao() == 2
      assert Fila.max_construtores_padrao() == Application.fetch_env!(:fabrica, :max_construtores)
      assert queues[:construtor] == Application.fetch_env!(:fabrica, :max_construtores)
    end

    test "configurando :max_construtores para 3, Fila e Exclusao passam a usar 3 juntos" do
      anterior = Application.get_env(:fabrica, :max_construtores)
      on_exit(fn -> Application.put_env(:fabrica, :max_construtores, anterior) end)

      Application.put_env(:fabrica, :max_construtores, 3)

      assert Fila.max_construtores_padrao() == 3

      tarefas = for n <- 1..5, do: tarefa("T-00#{n}", :pronta, ["lib/#{n}.ex"])
      assert length(Exclusao.lote(tarefas)) == 3
    end
  end

  describe "todas_disjuntas?/1 — a invariante que o guard de lote/2 protege" do
    test "conjuntos IDENTICOS nao sao disjuntos — o furo da comparacao por valor" do
      # Regressao: com a comparacao antiga (`a != b`), dois conjuntos iguais geravam zero
      # pares e `Enum.all?([]) == true` — a invariante nao acusava o caso mais obvio de mutex
      # quebrado (duas tarefas cuja unica area e a MESMA).
      a = MapSet.new(["lib/a.ex"])

      refute Exclusao.todas_disjuntas?([a, a])
    end

    test "sobreposicao parcial tambem nao e disjunta" do
      refute Exclusao.todas_disjuntas?([
               MapSet.new(["lib/a.ex", "lib/b.ex"]),
               MapSet.new(["lib/b.ex"])
             ])
    end

    test "conjuntos realmente disjuntos passam" do
      assert Exclusao.todas_disjuntas?([MapSet.new(["lib/a.ex"]), MapSet.new(["lib/b.ex"])])
    end

    test "um conjunto so, ou nenhum, e vacuamente disjunto" do
      assert Exclusao.todas_disjuntas?([MapSet.new(["lib/a.ex"])])
      assert Exclusao.todas_disjuntas?([])
    end
  end

  describe "permitir?/2 — momento 2: na ferramenta de escrita" do
    test "caminho declarado nas areas da tarefa e permitido" do
      areas = [%Area{caminho: "lib/fabrica/fila/exclusao.ex"}]

      assert Exclusao.permitir?(areas, "lib/fabrica/fila/exclusao.ex") == :ok
    end

    test "caminho fora das areas da tarefa e recusado com erro nomeado" do
      areas = [%Area{caminho: "lib/fabrica/fila/exclusao.ex"}]

      assert Exclusao.permitir?(areas, "lib/fabrica/tarefas/fila.ex") ==
               {:erro, :fora_das_areas}
    end

    test "tarefa sem areas declaradas permite qualquer caminho" do
      assert Exclusao.permitir?([], "lib/qualquer/coisa.ex") == :ok
    end

    test "a comparacao ignora barra invertida, e caixa so no Windows — como o confinamento" do
      areas = [%Area{caminho: "lib/fabrica/fila/exclusao.ex"}]

      # Barra invertida e separador nas DUAS plataformas (D-014).
      assert Exclusao.permitir?(areas, "lib\\fabrica\\fila\\exclusao.ex") == :ok

      if match?({:win32, _}, :os.type()) do
        assert Exclusao.permitir?(areas, "lib\\FABRICA\\fila\\Exclusao.ex") == :ok
      else
        # No Linux `FABRICA` e `fabrica` sao diretorios diferentes: a mesma area em outra
        # caixa e OUTRO arquivo, e escrever nele e sair das areas.
        assert Exclusao.permitir?(areas, "lib\\FABRICA\\fila\\Exclusao.ex") ==
                 {:erro, :fora_das_areas}

        assert Exclusao.permitir?(areas, "lib/fabrica/fila/Exclusao.ex") ==
                 {:erro, :fora_das_areas}
      end
    end
  end
end
