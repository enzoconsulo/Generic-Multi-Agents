defmodule Fabrica.Repo.Migrations.CriarProjetos do
  use Ecto.Migration

  def change do
    create table(:projetos) do
      add :nome, :string, null: false
      add :caminho, :string, null: false
      add :dominio, :string, null: false, default: "software"

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:projetos, [:nome])

    create table(:especialistas) do
      add :projeto_id, references(:projetos, on_delete: :delete_all), null: false
      add :identificador, :string, null: false
      add :nome, :string, null: false
      add :prompt, :text, null: false
      add :ativo, :boolean, null: false, default: true

      timestamps(type: :utc_datetime_usec)
    end

    create index(:especialistas, [:projeto_id])

    # UNICO SO ENTRE OS ATIVOS, e este indice parcial e a regra de versionamento inteira:
    # trocar o prompt de um especialista INSERE linha nova e marca a anterior inativa, em
    # vez de sobrescrever. Sem o `where`, a segunda versao seria recusada e o historico
    # (que e o que permite comparar o mesmo especialista antes e depois) nao existiria.
    create unique_index(:especialistas, [:projeto_id, :identificador],
             where: "ativo",
             name: :especialistas_ativo_por_projeto
           )
  end
end
