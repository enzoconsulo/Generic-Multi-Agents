defmodule Fabrica.Tarefas.FilaTest do
  @moduledoc """
  Os casos da v1 traduzidos, mais os que a v2 acrescenta.

  **Nao usa `DataCase` de proposito, e isso E um teste.** `Fila` promete ser pura; um teste
  que precisasse de banco para exercita-la provaria o contrario. As tarefas aqui sao structs
  montadas a mao — e por isso o arquivo inteiro roda em milissegundos, o que e o que permite
  varrer combinacoes de ordenacao e paralelismo sem pensar no custo.

  A procedencia de cada bloco esta dita no `describe`: o que veio de
  `painel/servidor/testes/pipeline/maquina.test.ts` e o que e novo.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Dependencia
  alias Fabrica.Tarefas.Fila
  alias Fabrica.Tarefas.Fila.Passo
  alias Fabrica.Tarefas.Tarefa

  # O `id` sai do codigo: deixa os testes falarem em "T-001" e o grafo em inteiros, sem uma
  # tabela de conversao no meio. Sufixo de replanejamento vira digito — "T-001a" e 11,
  # "T-001b" e 12 —, e e por isso que os testes de linhagem apontam para 11.
  defp identificador("T-" <> resto) do
    {digitos, sufixo} = String.split_at(resto, 3)
    base = String.to_integer(digitos)

    case sufixo do
      "" -> base
      <<letra>> -> base * 10 + (letra - ?a + 1)
    end
  end

  defp tarefa(codigo, atributos \\ []) do
    %Tarefa{
      id: identificador(codigo),
      codigo: codigo,
      titulo: codigo,
      status: Keyword.get(atributos, :status, :backlog),
      prioridade: Keyword.get(atributos, :prioridade, :media),
      tentativas: Keyword.get(atributos, :tentativas, 0),
      replanejada_de_id: Keyword.get(atributos, :replanejada_de),
      dependencias:
        atributos
        |> Keyword.get(:depende_de, [])
        |> Enum.map(&%Dependencia{depende_de_id: &1}),
      areas:
        atributos
        |> Keyword.get(:areas, [])
        |> Enum.map(&%Area{caminho: &1})
    }
  end

  defp codigos(tarefas), do: Enum.map(tarefas, & &1.codigo)
  defp codigos_dos_passos(passos), do: Enum.map(passos, & &1.tarefa.codigo)

  describe "promover — os casos herdados da v1" do
    test "promove quando cada dependencia esta concluida" do
      tarefas = [
        tarefa("T-001", status: :concluida),
        tarefa("T-002", status: :concluida),
        tarefa("T-003", depende_de: [1, 2])
      ]

      assert {:ok, %{promover: promover, travadas: []}} = Fila.promover(tarefas)
      assert codigos(promover) == ["T-003"]
    end

    test "nao promove com dependencia pendente, e diz qual" do
      tarefas = [
        tarefa("T-001", status: :concluida),
        tarefa("T-002", status: :em_execucao),
        tarefa("T-003", depende_de: [1, 2])
      ]

      assert {:ok, %{promover: [], travadas: [travada]}} = Fila.promover(tarefas)
      assert travada.tarefa.codigo == "T-003"
      assert travada.faltando == [%{codigo: "T-002", status: :em_execucao}]
      assert travada.inexistentes == []
    end

    test "dependencia inexistente e separada de dependencia pendente" do
      tarefas = [
        tarefa("T-001", status: :em_teste),
        tarefa("T-003", depende_de: [1, 999])
      ]

      assert {:ok, %{travadas: [travada]}} = Fila.promover(tarefas)
      assert [%{codigo: "T-001"}] = travada.faltando
      assert travada.inexistentes == [999]
    end

    test "tarefa sem dependencia nenhuma e promovida" do
      assert {:ok, %{promover: promover}} = Fila.promover([tarefa("T-001")])
      assert codigos(promover) == ["T-001"]
    end

    test "so olha o que esta em backlog" do
      tarefas = [
        tarefa("T-001", status: :concluida),
        tarefa("T-002", status: :pronta, depende_de: [1]),
        tarefa("T-003", status: :em_revisao)
      ]

      assert {:ok, %{promover: [], travadas: []}} = Fila.promover(tarefas)
    end
  end

  describe "promover — a DIVERGENCIA da v1: dependencia cancelada" do
    test "cancelada COM substituta concluida satisfaz, e a v1 travava aqui" do
      # Este e o caminho da autocorrecao: T-001 esgotou os ciclos, foi replanejada em T-001a,
      # e a original virou `cancelada`. Na v1, T-002 ficava presa em backlog para sempre.
      tarefas = [
        tarefa("T-001", status: :cancelada),
        tarefa("T-001a", status: :concluida, replanejada_de: 1),
        tarefa("T-002", depende_de: [1])
      ]

      assert {:ok, %{promover: promover, travadas: []}} = Fila.promover(tarefas)
      assert codigos(promover) == ["T-002"]
    end

    test "cancelada SEM substituta nenhuma continua travando" do
      # Sem substituta nao houve replanejamento: houve descarte. Quem dependia nao tem o que
      # esperar, e promover seria entregar terreno que ninguem vai construir.
      tarefas = [
        tarefa("T-001", status: :cancelada),
        tarefa("T-002", depende_de: [1])
      ]

      assert {:ok, %{promover: [], travadas: [travada]}} = Fila.promover(tarefas)
      assert travada.faltando == [%{codigo: "T-001", status: :cancelada}]
    end

    test "TODAS as substitutas precisam concluir, nao apenas uma" do
      # A leitura frouxa do plano ("se houver substituta concluida") liberaria T-002 com um
      # terco do trabalho feito. Promover cedo poe construtor sobre terreno inacabado.
      tarefas = [
        tarefa("T-001", status: :cancelada),
        tarefa("T-001a", status: :concluida, replanejada_de: 1),
        tarefa("T-001b", status: :em_execucao, replanejada_de: 1),
        tarefa("T-002", depende_de: [1])
      ]

      assert {:ok, %{promover: [], travadas: [%{tarefa: %{codigo: "T-002"}}]}} =
               Fila.promover(tarefas)
    end

    test "a linhagem e recursiva: substituta replanejada resolve pela substituta dela" do
      tarefas = [
        tarefa("T-001", status: :cancelada),
        tarefa("T-001a", status: :cancelada, replanejada_de: 1),
        tarefa("T-001b", status: :concluida, replanejada_de: 11),
        tarefa("T-002", depende_de: [1])
      ]

      assert {:ok, %{promover: promover}} = Fila.promover(tarefas)
      assert codigos(promover) == ["T-002"]
    end

    test "linhagem de replanejamento que se fecha em circulo nao trava a analise" do
      # Patologico, mas barato de defender: sem o conjunto de vistas, a recursao nao termina.
      tarefas = [
        tarefa("T-001", status: :cancelada, replanejada_de: 11),
        tarefa("T-001a", status: :cancelada, replanejada_de: 1),
        tarefa("T-002", depende_de: [1])
      ]

      assert {:ok, %{promover: [], travadas: [_]}} = Fila.promover(tarefas)
    end
  end

  describe "promover — bloqueada nao satisfaz" do
    test "dependencia bloqueada trava, e o status aparece no relatorio" do
      tarefas = [
        tarefa("T-001", status: :bloqueada),
        tarefa("T-002", depende_de: [1])
      ]

      assert {:ok, %{promover: [], travadas: [travada]}} = Fila.promover(tarefas)
      assert travada.faltando == [%{codigo: "T-001", status: :bloqueada}]
    end

    test "bloqueada com substituta concluida TAMBEM trava: so cancelada tem essa saida" do
      # Bloqueio e trabalho parado a espera do usuario, e nao trabalho encerrado. Enquanto a
      # original nao for cancelada, o replanejamento nao terminou.
      tarefas = [
        tarefa("T-001", status: :bloqueada),
        tarefa("T-001a", status: :concluida, replanejada_de: 1),
        tarefa("T-002", depende_de: [1])
      ]

      assert {:ok, %{promover: []}} = Fila.promover(tarefas)
    end
  end

  describe "promover — ciclo de dependencias" do
    test "ciclo de duas e detectado e reportado com o caminho, sem travar" do
      tarefas = [
        tarefa("T-001", depende_de: [2]),
        tarefa("T-002", depende_de: [1])
      ]

      assert {:erro, {:ciclo, caminho}} = Fila.promover(tarefas)
      assert "T-001" in caminho
      assert "T-002" in caminho
      # O codigo repetido no fim e o que mostra ONDE o caminho se fecha.
      assert List.first(caminho) == List.last(caminho)
    end

    test "ciclo de tres tambem" do
      tarefas = [
        tarefa("T-001", depende_de: [2]),
        tarefa("T-002", depende_de: [3]),
        tarefa("T-003", depende_de: [1])
      ]

      assert {:erro, {:ciclo, caminho}} = Fila.promover(tarefas)
      assert length(caminho) == 4
    end

    test "grafo em diamante NAO e ciclo" do
      # O caso que uma deteccao ingenua (so "ja visitei") acusaria: T-004 e alcancada por
      # dois caminhos, e nenhum deles volta.
      tarefas = [
        tarefa("T-001", status: :concluida),
        tarefa("T-002", status: :concluida, depende_de: [1]),
        tarefa("T-003", status: :concluida, depende_de: [1]),
        tarefa("T-004", depende_de: [2, 3])
      ]

      assert {:ok, %{promover: promover}} = Fila.promover(tarefas)
      assert codigos(promover) == ["T-004"]
    end

    test "dependencia inexistente nao e confundida com ciclo" do
      tarefas = [tarefa("T-001", depende_de: [999])]

      assert {:ok, %{travadas: [%{inexistentes: [999]}]}} = Fila.promover(tarefas)
    end
  end

  describe "promover — o contrato de pureza" do
    test "associacao nao carregada devolve erro nomeado, e nao Protocol.UndefinedError" do
      crua = %Tarefa{id: 1, codigo: "T-001", status: :backlog}

      assert {:erro, {:nao_carregado, :dependencias}} = Fila.promover([crua])
    end

    test "areas nao carregadas tambem" do
      crua = %Tarefa{id: 1, codigo: "T-001", status: :backlog, dependencias: []}

      assert {:erro, {:nao_carregado, :areas}} = Fila.promover([crua])
    end

    test "o modulo nao referencia Repo nem Ecto.Query" do
      # A pureza e o contrato do modulo, entao ela e verificada e nao prometida. Sem isto,
      # bastaria alguem acrescentar uma consulta "so para conferir" e o modulo deixaria de
      # ser testavel sem banco — que e o que o torna barato.
      fonte = File.read!("lib/fabrica/tarefas/fila.ex")

      for proibido <- ["Repo", "Ecto.Query", "from("] do
        refute fonte =~ proibido, "Fila referencia #{proibido}: ela promete ser pura."
      end
    end
  end

  describe "proximos — as tres regras de paralelismo (herdadas da v1)" do
    test "mapeia cada status para o papel que o atende" do
      tarefas = [
        tarefa("T-001", status: :pronta),
        tarefa("T-002", status: :em_teste),
        tarefa("T-003", status: :em_revisao)
      ]

      papeis = tarefas |> Fila.proximos() |> Enum.map(& &1.papel) |> Enum.sort()
      assert papeis == [:revisor, :verificador]
    end

    test "verificador roda SOZINHO: nenhum construtor sai junto" do
      tarefas = [
        tarefa("T-001", status: :pronta, areas: ["a.ex"]),
        tarefa("T-002", status: :em_teste)
      ]

      assert [%Passo{papel: :verificador, tarefa: %{codigo: "T-002"}}] = Fila.proximos(tarefas)
    end

    test "um verificador por vez, mesmo com dois em em_teste" do
      tarefas = [
        tarefa("T-001", status: :em_teste),
        tarefa("T-002", status: :em_teste)
      ]

      assert [%Passo{papel: :verificador}] = Fila.proximos(tarefas)
    end

    test "revisor sai junto com o verificador: ele le o diff commitado" do
      tarefas = [
        tarefa("T-001", status: :em_revisao),
        tarefa("T-002", status: :em_teste)
      ]

      papeis = tarefas |> Fila.proximos() |> Enum.map(& &1.papel)
      assert papeis == [:revisor, :verificador]
    end

    test "ate 3 construtores em paralelo, com areas disjuntas, quando configurado" do
      # D-003: o padrao agora e 2 (proximo teste). Este continua provando que o mecanismo
      # aguenta 3 quando alguem PEDE 3 — nunca enfraquecido para caber no numero novo.
      tarefas = [
        tarefa("T-001", status: :pronta, areas: ["a.ex"]),
        tarefa("T-002", status: :pronta, areas: ["b.ex"]),
        tarefa("T-003", status: :pronta, areas: ["c.ex"]),
        tarefa("T-004", status: :pronta, areas: ["d.ex"])
      ]

      assert codigos_dos_passos(Fila.proximos(tarefas, max_construtores: 3)) ==
               ["T-001", "T-002", "T-003"]
    end

    test "sem configuracao, o padrao e 2 construtores (D-003)" do
      tarefas = [
        tarefa("T-001", status: :pronta, areas: ["a.ex"]),
        tarefa("T-002", status: :pronta, areas: ["b.ex"]),
        tarefa("T-003", status: :pronta, areas: ["c.ex"])
      ]

      assert codigos_dos_passos(Fila.proximos(tarefas)) == ["T-001", "T-002"]
    end

    test "areas em comum: o segundo fica de fora, e o terceiro entra" do
      tarefas = [
        tarefa("T-001", status: :pronta, areas: ["a.ex", "b.ex"]),
        tarefa("T-002", status: :pronta, areas: ["b.ex"]),
        tarefa("T-003", status: :pronta, areas: ["c.ex"])
      ]

      assert codigos_dos_passos(Fila.proximos(tarefas)) == ["T-001", "T-003"]
    end

    test "tarefa SEM areas declaradas roda sozinha entre construtores" do
      tarefas = [
        tarefa("T-001", status: :pronta),
        tarefa("T-002", status: :pronta, areas: ["b.ex"])
      ]

      assert codigos_dos_passos(Fila.proximos(tarefas)) == ["T-001"]
    end

    test "status terminais e backlog nao geram passo" do
      tarefas = [
        tarefa("T-001", status: :backlog),
        tarefa("T-002", status: :concluida),
        tarefa("T-003", status: :bloqueada),
        tarefa("T-004", status: :cancelada)
      ]

      assert Fila.proximos(tarefas) == []
    end

    test "o teto de construtores e ajustavel" do
      tarefas =
        for n <- 1..5, do: tarefa("T-00#{n}", status: :pronta, areas: ["#{n}.ex"])

      assert length(Fila.proximos(tarefas, max_construtores: 2)) == 2
    end
  end

  describe "proximos — a ordem da fila" do
    test "prioridade manda" do
      tarefas = [
        tarefa("T-001", status: :pronta, prioridade: :baixa, areas: ["a.ex"]),
        tarefa("T-002", status: :pronta, prioridade: :alta, areas: ["b.ex"]),
        tarefa("T-003", status: :pronta, prioridade: :media, areas: ["c.ex"])
      ]

      # max_construtores: 3 explicito — o teste e sobre ORDEM, nao sobre o teto (D-003 baixou
      # o padrao para 2, o que cortaria a terceira tarefa e esconderia o que este teste prova).
      assert codigos_dos_passos(Fila.proximos(tarefas, max_construtores: 3)) ==
               ["T-002", "T-003", "T-001"]
    end

    test "entre iguais, a que destrava mais tarefas vem primeiro — nao a de codigo menor" do
      tarefas = [
        tarefa("T-001", status: :pronta, areas: ["a.ex"]),
        tarefa("T-002", status: :pronta, areas: ["b.ex"]),
        tarefa("T-003", depende_de: [2]),
        tarefa("T-004", depende_de: [2])
      ]

      assert ["T-002", "T-001"] = codigos_dos_passos(Fila.proximos(tarefas))
    end

    test "prioridade ainda manda: alta sem dependentes vence media com muitos" do
      tarefas = [
        tarefa("T-001", status: :pronta, prioridade: :alta, areas: ["a.ex"]),
        tarefa("T-002", status: :pronta, prioridade: :media, areas: ["b.ex"]),
        tarefa("T-003", depende_de: [2]),
        tarefa("T-004", depende_de: [2])
      ]

      assert ["T-001", "T-002"] = codigos_dos_passos(Fila.proximos(tarefas))
    end

    test "dependente ja concluida nao conta como quem espera" do
      # Somar dependentes fechados faria uma tarefa antiga parecer urgente para sempre.
      tarefas = [
        tarefa("T-001", status: :pronta, areas: ["a.ex"]),
        tarefa("T-002", status: :pronta, areas: ["b.ex"]),
        tarefa("T-003", status: :concluida, depende_de: [2]),
        tarefa("T-004", status: :cancelada, depende_de: [2])
      ]

      assert ["T-001", "T-002"] = codigos_dos_passos(Fila.proximos(tarefas))
    end

    test "empate completo cai no codigo, e o resultado e deterministico" do
      tarefas = [
        tarefa("T-003", status: :pronta, areas: ["c.ex"]),
        tarefa("T-001", status: :pronta, areas: ["a.ex"]),
        tarefa("T-002", status: :pronta, areas: ["b.ex"])
      ]

      # max_construtores: 3 explicito, pela mesma razao de "prioridade manda" acima.
      opcoes = [max_construtores: 3]

      assert codigos_dos_passos(Fila.proximos(tarefas, opcoes)) == ["T-001", "T-002", "T-003"]
      assert Fila.proximos(tarefas, opcoes) == Fila.proximos(Enum.reverse(tarefas), opcoes)
    end
  end
end
