defmodule Fabrica.EventosTest do
  @moduledoc """
  O barramento inteiro, do lado de quem assina: cada teste emite exatamente como um
  chamador real chamaria (`Fabrica.Agente.Laco` numa volta, `Fabrica.Tarefas.Transicao`
  numa mudanca de estado, a futura `Fabrica.Cota` numa parede) e confere o que chega do
  outro lado do `Phoenix.PubSub`.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Eventos

  describe "cada volta emite evento com a reparticao de cache" do
    test "despacho_volta/2 leva a reparticao de cache nas medidas, e a identidade nos metadados" do
      :ok = Eventos.assinar()

      Eventos.despacho_volta(
        %{
          tokens_entrada: 120,
          tokens_cache_escrita: 4_000,
          tokens_cache_leitura: 56_000,
          tokens_saida: 300,
          custo_usd: 0.0123
        },
        %{tarefa_id: 42, volta: 1}
      )

      assert_receive {:fabrica, [:fabrica, :despacho, :volta], medidas, metadados}

      # A reparticao, e nao um total: e o numero que decide o desenho da v2.
      assert medidas.tokens_cache_escrita == 4_000
      assert medidas.tokens_cache_leitura == 56_000
      assert medidas.tokens_entrada == 120
      assert medidas.tokens_saida == 300
      assert medidas.custo_usd == 0.0123

      assert metadados.tarefa_id == 42
      assert metadados.volta == 1
    end

    test "um despacho cortado deixa o registro do que ja gastou: as voltas chegam mesmo sem o evento de fim" do
      :ok = Eventos.assinar()

      Eventos.despacho_inicio(%{tarefa_id: 7, papel: "construtor", modelo: "haiku-4.5"})

      Eventos.despacho_volta(
        %{
          tokens_entrada: 10,
          tokens_cache_escrita: 500,
          tokens_cache_leitura: 0,
          tokens_saida: 5,
          custo_usd: 0.002
        },
        %{tarefa_id: 7, volta: 1}
      )

      Eventos.despacho_volta(
        %{
          tokens_entrada: 10,
          tokens_cache_escrita: 0,
          tokens_cache_leitura: 500,
          tokens_saida: 5,
          custo_usd: 0.0004
        },
        %{tarefa_id: 7, volta: 2}
      )

      # O processo "morre" aqui, sem nunca chamar despacho_fim/1 — exatamente a ARMADILHA
      # da v1: um job cortado no meio nunca emitia o evento final.

      assert_receive {:fabrica, [:fabrica, :despacho, :inicio], _medidas, %{tarefa_id: 7}}

      assert_receive {:fabrica, [:fabrica, :despacho, :volta], _medidas1,
                      %{tarefa_id: 7, volta: 1}}

      assert_receive {:fabrica, [:fabrica, :despacho, :volta], _medidas2,
                      %{tarefa_id: 7, volta: 2}}

      refute_receive {:fabrica, [:fabrica, :despacho, :fim], _, _}, 50
    end
  end

  describe "transicao de tarefa e parede de cota emitem eventos proprios" do
    test "tarefa_transicao/1 emite [:fabrica, :tarefa, :transicao]" do
      :ok = Eventos.assinar()

      Eventos.tarefa_transicao(%{tarefa_id: 9, de: :pronta, para: :em_execucao})

      assert_receive {:fabrica, [:fabrica, :tarefa, :transicao], _medidas,
                      %{tarefa_id: 9, de: :pronta, para: :em_execucao}}
    end

    test "cota_parede/1 e cota_rearme/0 sao eventos DIFERENTES, nao o mesmo nome" do
      :ok = Eventos.assinar()

      Eventos.cota_parede(%{reabre_em: ~U[2026-09-05 20:30:00Z]})
      Eventos.cota_rearme()

      assert_receive {:fabrica, [:fabrica, :cota, :parede], _medidas, %{reabre_em: %DateTime{}}}
      assert_receive {:fabrica, [:fabrica, :cota, :rearme], _medidas, _metadados}
      refute_receive {:fabrica, [:fabrica, :cota, :parede], _, _}
    end
  end

  describe "um assinante recebe os eventos na ordem em que foram emitidos" do
    test "cinco eventos de familias diferentes chegam na mesma ordem em que foram emitidos" do
      :ok = Eventos.assinar()

      Eventos.despacho_inicio(%{tarefa_id: 1, papel: "construtor", modelo: "haiku-4.5"})

      Eventos.despacho_volta(
        %{
          tokens_entrada: 1,
          tokens_cache_escrita: 0,
          tokens_cache_leitura: 0,
          tokens_saida: 1,
          custo_usd: 0.0
        },
        %{tarefa_id: 1, volta: 1}
      )

      Eventos.tarefa_transicao(%{tarefa_id: 1, de: :em_execucao, para: :em_teste})

      Eventos.despacho_volta(
        %{
          tokens_entrada: 1,
          tokens_cache_escrita: 0,
          tokens_cache_leitura: 300,
          tokens_saida: 1,
          custo_usd: 0.0
        },
        %{tarefa_id: 1, volta: 2}
      )

      Eventos.despacho_fim(%{tarefa_id: 1, desfecho: :fim_do_turno, voltas: 2, gasto_usd: 0.0022})

      esperado = [
        [:fabrica, :despacho, :inicio],
        [:fabrica, :despacho, :volta],
        [:fabrica, :tarefa, :transicao],
        [:fabrica, :despacho, :volta],
        [:fabrica, :despacho, :fim]
      ]

      recebido =
        for _evento <- esperado do
          assert_receive {:fabrica, nome, _medidas, _metadados}, 500
          nome
        end

      assert recebido == esperado
    end
  end

  describe "assinar/0" do
    test "so quem assinou recebe — a mensagem nao chega a quem nao pediu" do
      Eventos.despacho_inicio(%{tarefa_id: 999, papel: "construtor", modelo: "haiku-4.5"})
      refute_receive {:fabrica, _nome, _medidas, _metadados}, 50
    end
  end
end
