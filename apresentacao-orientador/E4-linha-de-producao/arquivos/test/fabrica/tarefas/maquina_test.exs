defmodule Fabrica.Tarefas.MaquinaTest do
  @moduledoc """
  Varre as 64 combinacoes de estado, uma por teste.

  A lista `@legais` abaixo NAO foi copiada do modulo: ela foi transcrita do plano (T-022,
  secao Contexto), que e a fonte. A diferenca importa — teste que le a tabela da producao
  so prova que dois arquivos concordam entre si, e concordariam igualmente se ambos
  estivessem errados. Aqui as 18 legais estao escritas a mao e as 46 ilegais sao o
  complemento calculado, entao esquecer uma aresta na producao reprova, e inventar uma
  aresta na producao reprova tambem.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Tarefas.Maquina

  doctest Fabrica.Tarefas.Maquina

  @estados_conhecidos [
    :backlog,
    :pronta,
    :em_execucao,
    :em_teste,
    :em_revisao,
    :concluida,
    :bloqueada,
    :cancelada
  ]

  # Transcritas do plano. As quatro primeiras linhas sao o caminho feliz; as duas seguintes,
  # as reprovacoes; o bloco final, as saidas de "qualquer" estado vivo — com `concluida`
  # fora (nao se desfaz o que passou pelos dois portoes) e `bloqueada -> cancelada` dentro
  # (e por ela que o replanejamento fecha a original).
  @legais [
    {:backlog, :pronta},
    {:pronta, :em_execucao},
    {:em_execucao, :em_teste},
    {:em_teste, :em_revisao},
    {:em_revisao, :concluida},
    {:em_teste, :em_execucao},
    {:em_revisao, :em_execucao},
    {:backlog, :bloqueada},
    {:pronta, :bloqueada},
    {:em_execucao, :bloqueada},
    {:em_teste, :bloqueada},
    {:em_revisao, :bloqueada},
    {:backlog, :cancelada},
    {:pronta, :cancelada},
    {:em_execucao, :cancelada},
    {:em_teste, :cancelada},
    {:em_revisao, :cancelada},
    {:bloqueada, :cancelada}
  ]

  @ilegais for de <- @estados_conhecidos,
               para <- @estados_conhecidos,
               {de, para} not in @legais,
               do: {de, para}

  describe "as 18 transicoes legais" do
    for {de, para} <- @legais do
      test "#{de} -> #{para} e aceita" do
        assert Maquina.pode?(unquote(de), unquote(para))
        assert Maquina.conferir(unquote(de), unquote(para)) == :ok
      end
    end
  end

  describe "as 46 transicoes ilegais" do
    for {de, para} <- @ilegais do
      test "#{de} -> #{para} e recusada com erro nomeado" do
        refute Maquina.pode?(unquote(de), unquote(para))

        assert Maquina.conferir(unquote(de), unquote(para)) ==
                 {:erro, {:transicao_invalida, unquote(de), unquote(para)}}
      end
    end
  end

  describe "a varredura nao passa por vazio" do
    test "as duas listas cobrem exatamente as 64 combinacoes" do
      assert length(@legais) == 18
      assert length(@ilegais) == 46
      assert length(@legais) + length(@ilegais) == 8 * 8
    end

    test "nenhuma combinacao aparece nas duas listas" do
      assert MapSet.disjoint?(MapSet.new(@legais), MapSet.new(@ilegais))
    end

    test "os estados da maquina sao os do esquema, sem sobra nem falta" do
      assert Enum.sort(Maquina.estados()) == Enum.sort(@estados_conhecidos)
    end
  end

  describe "propriedades do mapa" do
    test "nenhum estado transiciona para si mesmo" do
      for estado <- @estados_conhecidos do
        refute Maquina.pode?(estado, estado), "#{estado} -> #{estado} deveria ser recusada"
      end
    end

    test "concluida e cancelada nao levam a lugar nenhum" do
      assert Maquina.terminal?(:concluida)
      assert Maquina.terminal?(:cancelada)
    end

    test "bloqueada NAO e terminal: e dela que o replanejamento cancela a original" do
      refute Maquina.terminal?(:bloqueada)
      assert Maquina.destinos(:bloqueada) == [:cancelada]
    end

    test "estado desconhecido nao leva a lugar nenhum, em vez de estourar" do
      assert Maquina.destinos(:inventado) == []
      refute Maquina.pode?(:inventado, :pronta)

      assert {:erro, {:transicao_invalida, :inventado, :pronta}} =
               Maquina.conferir(:inventado, :pronta)
    end

    test "so `em_execucao` gasta uma tentativa" do
      gastam = Enum.filter(@estados_conhecidos, &Maquina.entrega_ao_construtor?/1)
      assert gastam == [:em_execucao]
    end

    test "cada um dos tres caminhos ate em_execucao entrega a tarefa a um construtor" do
      # A primeira execucao e as duas reprovacoes chegam ao mesmo lugar, e por isso o
      # incremento pode olhar so o destino.
      for de <- [:pronta, :em_teste, :em_revisao] do
        assert Maquina.pode?(de, :em_execucao)
        assert Maquina.entrega_ao_construtor?(:em_execucao)
      end
    end
  end
end
