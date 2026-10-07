defmodule Fabrica.Repo.Migrations.CriarExecucao do
  use Ecto.Migration

  def change do
    # LINHA NOVA a cada retrabalho, nunca sobrescrita: e o que permite perguntar depois
    # quanto custou cada ciclo separadamente. Um relatorio que substitui o anterior apaga
    # justamente a evidencia de que a tarefa girou.
    create table(:ciclos) do
      add :tarefa_id, references(:tarefas, on_delete: :delete_all), null: false
      add :numero, :integer, null: false
      add :papel, :string, null: false
      add :desfecho, :string
      add :relatorio, :text

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:ciclos, [:tarefa_id, :numero, :papel])
    create index(:ciclos, [:tarefa_id])
    create constraint(:ciclos, :numero_positivo, check: "numero >= 1")

    create table(:despachos) do
      add :ciclo_id, references(:ciclos, on_delete: :delete_all), null: false
      add :operario, :string, null: false
      add :modelo, :string, null: false
      add :voltas, :integer, null: false, default: 0
      add :iniciado_em, :utc_datetime_usec
      add :terminado_em, :utc_datetime_usec
      add :desfecho, :string

      timestamps(type: :utc_datetime_usec)
    end

    create index(:despachos, [:ciclo_id])
    create constraint(:despachos, :voltas_nao_negativas, check: "voltas >= 0")

    # UMA LINHA POR VOLTA. O total por tarefa e uma soma; o contrario seria impossivel —
    # guardar so o total esconde a reparticao entrada/leitura/escrita, que e exatamente o
    # numero que decide o desenho (a escrita de cache e ~6,7% dos tokens e ~50% da conta).
    create table(:consumos) do
      add :despacho_id, references(:despachos, on_delete: :delete_all), null: false
      add :volta, :integer, null: false
      add :tokens_entrada, :integer, null: false, default: 0
      add :tokens_cache_escrita, :integer, null: false, default: 0
      add :tokens_cache_leitura, :integer, null: false, default: 0
      add :tokens_saida, :integer, null: false, default: 0
      add :custo_usd, :decimal, precision: 12, scale: 6, null: false, default: 0
      add :cota_unidades, :decimal, precision: 12, scale: 6, null: false, default: 0
      add :duracao_ms, :integer

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:consumos, [:despacho_id, :volta])
    create constraint(:consumos, :volta_positiva, check: "volta >= 1")

    create constraint(:consumos, :tokens_nao_negativos,
             check: """
             tokens_entrada >= 0 AND tokens_cache_escrita >= 0
             AND tokens_cache_leitura >= 0 AND tokens_saida >= 0
             """
           )
  end
end
