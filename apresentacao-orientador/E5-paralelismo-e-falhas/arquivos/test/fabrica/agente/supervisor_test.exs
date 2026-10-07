defmodule Fabrica.Agente.SupervisorTest do
  @moduledoc """
  Os tres criterios da T-036: isolamento entre agentes, motivo registrado na morte (sem
  reiniciar a conversa) e listagem via `Registry`.

  Roda contra o `Fabrica.Agente.Supervisor` unico da aplicacao (subido pelo
  `Fabrica.Application`) — por isso cada teste usa um `tarefa_id` proprio
  (`System.unique_integer/1`), para não colidir com os outros testes rodando `async: true`.
  """

  use ExUnit.Case, async: true

  @moduletag :capture_log

  alias Fabrica.Agente.Supervisor

  defp tarefa_id, do: System.unique_integer([:positive])

  # Sobe um agente que so termina quando alguem manda `:termine_normal` para ele — serve para
  # manter o processo vivo o bastante para ser observado ou morto de fora.
  defp esperar_por_ordem do
    fn ->
      receive do
        :termine_normal -> :ok
      end
    end
  end

  describe "isolamento entre agentes" do
    test "matar um agente nao afeta os outros dois" do
      [t1, t2, t3] = [tarefa_id(), tarefa_id(), tarefa_id()]

      {:ok, p1} = Supervisor.iniciar(t1, :construtor, esperar_por_ordem())
      {:ok, p2} = Supervisor.iniciar(t2, :construtor, esperar_por_ordem())
      {:ok, p3} = Supervisor.iniciar(t3, :construtor, esperar_por_ordem())

      Supervisor.encerrar(t1)

      # A morte de p1 e assincrona (DOWN); espera-se o suficiente para o Registry ja ter
      # removido a entrada dele antes de conferir os outros dois.
      Process.sleep(50)

      assert Process.alive?(p2)
      assert Process.alive?(p3)
      refute Process.alive?(p1)

      papeis = Supervisor.listar() |> Enum.map(& &1.tarefa_id) |> MapSet.new()
      assert MapSet.new([t2, t3]) |> MapSet.subset?(papeis)
      refute t1 in papeis

      send(p2, :termine_normal)
      send(p3, :termine_normal)
    end
  end

  describe "morte devolve a tarefa a fila, com motivo, sem reiniciar" do
    test "o callback ao_morrer recebe a tarefa e o motivo quando o agente cai" do
      tarefa = tarefa_id()
      dono = self()

      {:ok, pid} =
        Supervisor.iniciar(
          tarefa,
          :construtor,
          fn -> raise "estourei de proposito" end,
          ao_morrer: fn tarefa_id, motivo -> send(dono, {:devolvida, tarefa_id, motivo}) end
        )

      assert_receive {:devolvida, ^tarefa, motivo}, 1000
      assert motivo != nil

      # Ninguem reiniciou: o pid antigo esta morto, e o Registry nao tem um NOVO processo
      # registrado para a mesma tarefa.
      refute Process.alive?(pid)
      refute tarefa in (Supervisor.listar() |> Enum.map(& &1.tarefa_id))
    end

    test "matado com Process.exit(:kill) tambem dispara o callback" do
      tarefa = tarefa_id()
      dono = self()

      {:ok, pid} =
        Supervisor.iniciar(
          tarefa,
          :construtor,
          esperar_por_ordem(),
          ao_morrer: fn tarefa_id, motivo -> send(dono, {:devolvida, tarefa_id, motivo}) end
        )

      Process.exit(pid, :kill)

      assert_receive {:devolvida, ^tarefa, :killed}, 1000
    end

    test "terminar normalmente NAO aciona ao_morrer" do
      tarefa = tarefa_id()
      dono = self()

      {:ok, _pid} =
        Supervisor.iniciar(
          tarefa,
          :construtor,
          fn -> :ok end,
          ao_morrer: fn tarefa_id, motivo -> send(dono, {:devolvida, tarefa_id, motivo}) end
        )

      refute_receive {:devolvida, ^tarefa, _motivo}, 200
    end
  end

  describe "listar/0 consulta o Registry" do
    test "devolve tarefa e papel de cada agente em voo" do
      t1 = tarefa_id()
      t2 = tarefa_id()

      {:ok, _} = Supervisor.iniciar(t1, :construtor, esperar_por_ordem())
      {:ok, _} = Supervisor.iniciar(t2, :verificador, esperar_por_ordem())

      encontrados =
        Supervisor.listar()
        |> Enum.filter(&(&1.tarefa_id in [t1, t2]))
        |> Map.new(&{&1.tarefa_id, &1.papel})

      assert encontrados[t1] == :construtor
      assert encontrados[t2] == :verificador

      Supervisor.encerrar(t1)
      Supervisor.encerrar(t2)
    end

    test "agente que ja terminou nao aparece mais na listagem" do
      tarefa = tarefa_id()

      {:ok, _pid} = Supervisor.iniciar(tarefa, :construtor, fn -> :ok end)

      # `handle_continue` roda a funcao logo apos o `init`; da tempo do :DOWN chegar e do
      # Registry ja ter removido a entrada (a remocao e sincrona com a morte do processo).
      Process.sleep(50)

      refute tarefa in (Supervisor.listar() |> Enum.map(& &1.tarefa_id))
    end
  end

  describe "encerrar/1" do
    test "devolve erro quando nao ha agente para a tarefa" do
      assert {:error, :nao_encontrado} = Supervisor.encerrar(tarefa_id())
    end
  end
end
