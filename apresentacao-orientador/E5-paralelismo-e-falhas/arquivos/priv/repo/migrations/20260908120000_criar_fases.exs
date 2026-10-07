defmodule Fabrica.Repo.Migrations.CriarFases do
  use Ecto.Migration

  # Nao previstas em T-002: o esquema original cobria projetos/tarefas/execucao, mas
  # `_gestao/PLANO.md` da v1 descreve as fases (v0.1, v0.2, ...) e os marcos que fecham cada
  # uma, e isso nao tinha para onde ir no banco. A T-033 (importador) precisa de um destino
  # para nao perder essa parte do historico — ver Notas de execucao da T-033.
  def change do
    create table(:fases) do
      add :projeto_id, references(:projetos, on_delete: :delete_all), null: false
      add :versao, :string, null: false
      add :titulo, :string
      add :ordem, :integer, null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:fases, [:projeto_id, :versao])
    create index(:fases, [:projeto_id, :ordem])
    create constraint(:fases, :ordem_positiva, check: "ordem >= 1")

    create table(:marcos) do
      add :fase_id, references(:fases, on_delete: :delete_all), null: false
      add :titulo, :string, null: false
      add :tarefa_codigo, :citext
      add :ordem, :integer, null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:marcos, [:fase_id, :ordem])
    create constraint(:marcos, :ordem_positiva, check: "ordem >= 1")
  end
end
