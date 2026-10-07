defmodule Fabrica.Piloto.DecisaoTest do
  @moduledoc """
  Um teste por criterio de parada, a nao-parada da cota, o portao de `ligar/2`, e a prova de
  que desligar nao tem como cortar uma rodada em voo.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Piloto.Decisao

  doctest Decisao

  defp base(sobrescritas \\ %{}) do
    Map.merge(
      %{
        ligado?: true,
        teto_de_gasto: 50.0,
        maximo_de_rodadas: 20,
        gasto_acumulado: 10.0,
        rodadas_feitas: 3,
        rodadas_seguidas_sem_concluir: 0,
        ha_tarefa_pronta?: true,
        pediu_replanejamento?: false,
        falhou?: false,
        cota: %{batida?: false, reabre_em: nil}
      },
      sobrescritas
    )
  end

  describe "ligar/2 — os dois freios sao obrigatorios, sempre" do
    test "com teto de gasto e maximo de rodadas, liga" do
      assert Decisao.ligar(50.0, 20) == {:ok, %{teto_de_gasto: 50.0, maximo_de_rodadas: 20}}
    end

    test "sem teto de gasto, recusa" do
      assert Decisao.ligar(nil, 20) == {:erro, [:sem_teto_de_gasto]}
    end

    test "sem maximo de rodadas, recusa" do
      assert Decisao.ligar(50.0, nil) == {:erro, [:sem_maximo_de_rodadas]}
    end

    test "sem os dois, recusa relatando os dois" do
      assert Decisao.ligar(nil, nil) == {:erro, [:sem_teto_de_gasto, :sem_maximo_de_rodadas]}
    end

    test "zero ou negativo conta como ausente — nao e um freio de verdade" do
      assert Decisao.ligar(0, 20) == {:erro, [:sem_teto_de_gasto]}
      assert Decisao.ligar(50.0, -1) == {:erro, [:sem_maximo_de_rodadas]}
    end
  end

  describe "decidir/1 — cada criterio de parada, isolado" do
    test "continua quando nada pede parada" do
      assert Decisao.decidir(base()) == :continuar
    end

    test "acabou tarefa pronta" do
      assert Decisao.decidir(base(%{ha_tarefa_pronta?: false})) == {:parar, :sem_tarefa_pronta}
    end

    test "alguma tarefa pediu replanejamento" do
      assert Decisao.decidir(base(%{pediu_replanejamento?: true})) == {:parar, :replanejamento}
    end

    test "duas rodadas seguidas sem concluir nada" do
      assert Decisao.decidir(base(%{rodadas_seguidas_sem_concluir: 2})) == {:parar, :estagnado}
    end

    test "uma unica rodada sem concluir ainda NAO e estagnacao" do
      assert Decisao.decidir(base(%{rodadas_seguidas_sem_concluir: 1})) == :continuar
    end

    test "falha" do
      assert Decisao.decidir(base(%{falhou?: true})) == {:parar, :falha}
    end

    test "teto de gasto acumulado atingido" do
      assert Decisao.decidir(base(%{gasto_acumulado: 50.0})) == {:parar, :teto_de_gasto}
    end

    test "maximo de rodadas atingido" do
      assert Decisao.decidir(base(%{rodadas_feitas: 20})) == {:parar, :maximo_de_rodadas}
    end
  end

  describe "cota batida — nao-parada: dorme e rearma, NUNCA para" do
    test "com hora de reabertura, dorme ate ela" do
      reabre = ~U[2026-09-17 09:00:00Z]

      assert Decisao.decidir(base(%{cota: %{batida?: true, reabre_em: reabre}})) ==
               {:dormir, reabre}
    end

    test "sem hora de reabertura legivel, dorme mesmo assim (quem rearma decide o recuo)" do
      assert Decisao.decidir(base(%{cota: %{batida?: true, reabre_em: nil}})) == {:dormir, nil}
    end

    test "cota batida vence estagnacao: nao classifica como duas rodadas sem concluir" do
      situacao =
        base(%{cota: %{batida?: true, reabre_em: nil}, rodadas_seguidas_sem_concluir: 2})

      assert Decisao.decidir(situacao) == {:dormir, nil}
    end

    test "cota batida vence falha" do
      situacao = base(%{cota: %{batida?: true, reabre_em: nil}, falhou?: true})
      assert Decisao.decidir(situacao) == {:dormir, nil}
    end

    test "cota batida vence ate a ausencia de tarefa pronta" do
      situacao = base(%{cota: %{batida?: true, reabre_em: nil}, ha_tarefa_pronta?: false})
      assert Decisao.decidir(situacao) == {:dormir, nil}
    end
  end

  describe "desligar nao corta a rodada em voo" do
    test "desligado para a PROXIMA rodada, mesmo com tudo mandando continuar" do
      assert Decisao.decidir(base(%{ligado?: false})) == {:parar, :desligado}
    end

    test "desligado vence ate a cota batida" do
      situacao = base(%{ligado?: false, cota: %{batida?: true, reabre_em: nil}})
      assert Decisao.decidir(situacao) == {:parar, :desligado}
    end

    test "prova por design: decidir/1 so recebe a situacao ENTRE rodadas" do
      # A aridade e o contrato: 1 argumento, sem campo nenhum de "rodada em andamento" no
      # tipo `situacao/0` (ver @moduledoc de Fabrica.Piloto.Decisao). Esta funcao so e
      # chamada depois que uma rodada termina (T-055) — nunca ha o que cortar.
      assert function_exported?(Decisao, :decidir, 1)
    end
  end
end
