defmodule Fabrica.CotaTest do
  @moduledoc """
  Trava as quatro promessas da T-039.

  1. Bater a parede pausa as filas do Oban SEM cancelar o que ja esta enfileirado — provado
     contra o Oban de verdade: um job inserido continua `available` depois de `parede/2`.
  2. `horario_de_reabertura/1` interpreta epoch, ISO 8601 e (o caso novo) o formato humano
     ("5:30pm (America/Sao_Paulo)", "17:30 (UTC)"), em varias grafias.
  3. Horario ilegivel nao trava: cai em recuo exponencial com teto, e a tentativa seguinte
     dobra o atraso ate bater no teto.
  4. `estado/1` responde se a parede esta batida e ate quando — inclusive depois de rearmar.
  """

  # async: false: o primeiro describe pausa/retoma o Oban REAL (a mesma doutrina de
  # `Fabrica.Fila.TrabalhoTest`) para provar, contra a coisa de verdade, que o job
  # enfileirado nao e tocado — nao so que a funcao certa foi chamada.
  use Fabrica.DataCase, async: false

  alias Fabrica.Cota
  alias Fabrica.Eventos
  alias Fabrica.Fila.Trabalho
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Tarefas.Tarefa
  alias Fabrica.Tarefas.Transicao

  defp projeto! do
    %Projeto{}
    |> Projeto.changeset(%{
      nome: "projeto-#{System.unique_integer([:positive])}",
      caminho: "C:/tmp/p"
    })
    |> Repo.insert!()
  end

  defp tarefa_pronta!(projeto) do
    tarefa =
      %Tarefa{}
      |> Tarefa.changeset(%{
        projeto_id: projeto.id,
        codigo: "T-#{100 + System.unique_integer([:positive])}",
        titulo: "uma tarefa"
      })
      |> Repo.insert!()

    {:ok, tarefa} = Transicao.aplicar(tarefa, :pronta)
    tarefa
  end

  defp nome_unico, do: :"cota_teste_#{System.unique_integer([:positive])}"

  describe "parede/2 — pausa as filas sem cancelar o trabalho enfileirado" do
    test "um job ja enfileirado continua available depois da parede bater" do
      projeto = projeto!()
      tarefa = tarefa_pronta!(projeto)
      {:ok, job} = Oban.insert(Trabalho.novo(tarefa.id, :construtor))

      nome = nome_unico()
      start_supervised!({Cota, name: nome})

      :ok = Cota.parede(nome, {:erro, {:cota, DateTime.add(DateTime.utc_now(), 3600, :second)}})

      assert Cota.batida?(nome)
      assert Repo.get!(Oban.Job, job.id).state == "available"
    end

    test "emite [:fabrica, :cota, :parede] so na transicao para batida, nunca de novo" do
      :ok = Eventos.assinar()
      nome = nome_unico()
      start_supervised!({Cota, name: nome})

      reabre_em = DateTime.add(DateTime.utc_now(), 3600, :second)
      :ok = Cota.parede(nome, {:cota, reabre_em})
      :ok = Cota.parede(nome, {:cota, reabre_em})

      assert_received {:fabrica, [:fabrica, :cota, :parede], %{}, %{reabre_em: ^reabre_em}}
      refute_received {:fabrica, [:fabrica, :cota, :parede], _, _}
    end

    test "pausar so e chamado uma vez; retomar, ao rearmar" do
      teste = self()
      nome = nome_unico()

      start_supervised!(
        {Cota,
         name: nome,
         pausar: fn -> send(teste, :pausou) end,
         retomar: fn -> send(teste, :retomou) end}
      )

      :ok = Cota.parede(nome, {:cota, DateTime.add(DateTime.utc_now(), 3600, :second)})
      :ok = Cota.parede(nome, {:cota, DateTime.add(DateTime.utc_now(), 3600, :second)})
      assert_received :pausou
      refute_received :pausou

      :ok = Cota.rearmar(nome)
      assert_received :retomou
      refute Cota.batida?(nome)
    end
  end

  describe "horario_de_reabertura/1 — varios formatos, com tolerancia" do
    test "DateTime passa direto" do
      quando = DateTime.utc_now()
      assert Cota.horario_de_reabertura(quando) == quando
    end

    test "nil continua nil" do
      assert Cota.horario_de_reabertura(nil) == nil
    end

    test "epoch Unix (inteiro)" do
      assert Cota.horario_de_reabertura(1_788_236_400) == DateTime.from_unix!(1_788_236_400)
    end

    test "ISO 8601" do
      assert Cota.horario_de_reabertura("2026-09-08T17:30:00Z") == ~U[2026-09-08 17:30:00Z]
    end

    test "formato humano com meridiano e fuso — 5:30pm (America/Sao_Paulo) vira 20:30 UTC" do
      quando = Cota.horario_de_reabertura("5:30pm (America/Sao_Paulo)")

      assert %DateTime{} = quando
      assert quando.hour == 20
      assert quando.minute == 30
    end

    test "formato humano em 24h, com espaco antes do meridiano — 5:30 PM (UTC)" do
      quando = Cota.horario_de_reabertura("5:30 PM (UTC)")

      assert %DateTime{} = quando
      assert quando.hour == 17
      assert quando.minute == 30
    end

    test "formato humano sem meridiano — 17:30 (UTC)" do
      quando = Cota.horario_de_reabertura("17:30 (UTC)")

      assert %DateTime{} = quando
      assert quando.hour == 17
      assert quando.minute == 30
    end

    test "fuso desconhecido cai em UTC, em vez de travar" do
      quando = Cota.horario_de_reabertura("10:00 (Marte/Base_Um)")

      assert %DateTime{} = quando
      assert quando.hour == 10
    end

    test "sem hora legivel no texto, devolve nil" do
      assert Cota.horario_de_reabertura("a cota esgotou, tente mais tarde") == nil
    end
  end

  describe "horario_de_reabertura/1 — hora cheia, sem minutos (T-039a)" do
    test "resets 9am (America/Sao_Paulo) — hora cheia, sem minutos" do
      quando = Cota.horario_de_reabertura("resets 9am (America/Sao_Paulo)")

      assert %DateTime{} = quando
      assert quando.hour == 12
      assert quando.minute == 0
    end

    test "resets 12pm (America/Sao_Paulo) — hora cheia, meio-dia" do
      quando = Cota.horario_de_reabertura("resets 12pm (America/Sao_Paulo)")

      assert %DateTime{} = quando
      assert quando.hour == 15
      assert quando.minute == 0
    end

    test "regressao — resets 2:20am (America/Sao_Paulo) continua dando o mesmo horario" do
      quando = Cota.horario_de_reabertura("resets 2:20am (America/Sao_Paulo)")

      assert %DateTime{} = quando
      assert quando.hour == 5
      assert quando.minute == 20
    end

    test "regressao — resets 9:00am (America/Sao_Paulo) continua dando o mesmo horario" do
      quando = Cota.horario_de_reabertura("resets 9:00am (America/Sao_Paulo)")

      assert %DateTime{} = quando
      assert quando.hour == 12
      assert quando.minute == 0
    end
  end

  describe "recuo exponencial — nunca trava por causa de uma string" do
    test "recuo_exponencial/3 dobra a cada tentativa, ate o teto" do
      assert Cota.recuo_exponencial(0, 1_000, 60_000) == 1_000
      assert Cota.recuo_exponencial(1, 1_000, 60_000) == 2_000
      assert Cota.recuo_exponencial(2, 1_000, 60_000) == 4_000
      assert Cota.recuo_exponencial(10, 1_000, 60_000) == 60_000
    end

    test "horario ilegivel agenda recuo em vez de travar, e a tentativa seguinte dobra" do
      nome = nome_unico()

      start_supervised!(
        {Cota, name: nome, pausar: fn -> :ok end, recuo_inicial: 1_000, teto_de_recuo: 60_000}
      )

      :ok = Cota.parede(nome, {:cota, "isto nao e um horario"})
      assert %{proxima_tentativa_em: 1_000} = Cota.estado(nome)

      :ok = Cota.parede(nome, {:cota, "ainda nao e um horario"})
      assert %{proxima_tentativa_em: 2_000} = Cota.estado(nome)
    end
  end

  describe "estado/1 — a pergunta que a tela precisa responder" do
    test "sem parede batida, batida? e falso e reabre_em e nil" do
      nome = nome_unico()
      start_supervised!({Cota, name: nome})

      assert Cota.estado(nome) == %{batida?: false, reabre_em: nil, proxima_tentativa_em: nil}
    end

    test "com a parede batida, diz ate quando" do
      nome = nome_unico()
      start_supervised!({Cota, name: nome, pausar: fn -> :ok end})

      reabre_em = DateTime.add(DateTime.utc_now(), 3600, :second)
      :ok = Cota.parede(nome, {:cota, reabre_em})

      assert %{batida?: true, reabre_em: ^reabre_em} = Cota.estado(nome)
    end

    test "rearma sozinho quando o timer estoura, sem esperar chamada nenhuma" do
      teste = self()
      nome = nome_unico()

      start_supervised!(
        {Cota,
         name: nome,
         pausar: fn -> :ok end,
         retomar: fn -> send(teste, :rearmou_sozinho) end,
         folga: 0}
      )

      :ok = Cota.parede(nome, {:cota, DateTime.add(DateTime.utc_now(), 0, :millisecond)})

      assert_receive :rearmou_sozinho, 500
      refute Cota.batida?(nome)
    end
  end
end
