defmodule Fabrica.Repo.Migrations.CriarTarefas do
  use Ecto.Migration

  def change do
    create table(:tarefas) do
      add :projeto_id, references(:projetos, on_delete: :delete_all), null: false
      add :codigo, :citext, null: false
      add :titulo, :string, null: false
      add :objetivo, :text
      add :contexto, :text
      add :status, :string, null: false, default: "backlog"
      add :prioridade, :string, null: false, default: "media"
      add :tentativas, :integer, null: false, default: 0
      add :especialista_id, references(:especialistas, on_delete: :nilify_all)
      add :replanejada_de_id, references(:tarefas, on_delete: :nilify_all)

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:tarefas, [:projeto_id, :codigo])
    create index(:tarefas, [:projeto_id, :status])
    create index(:tarefas, [:especialista_id])
    create index(:tarefas, [:replanejada_de_id])

    # `tentativas` e do SISTEMA, nunca do agente (decisao 6.2 do MIGRACAO_V2.md). O banco
    # nao sabe quem escreveu, mas sabe que negativo e impossivel — e essa metade da regra
    # cabe aqui, onde nenhum caminho de codigo pode contorna-la.
    create constraint(:tarefas, :tentativas_nao_negativas, check: "tentativas >= 0")

    # DEPENDENCIA E RELACAO, nao lista serializada: uma linha por par. E o que torna
    # "quais tarefas destravam se esta concluir?" uma consulta em vez de uma varredura.
    create table(:tarefa_dependencias) do
      add :tarefa_id, references(:tarefas, on_delete: :delete_all), null: false
      add :depende_de_id, references(:tarefas, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:tarefa_dependencias, [:tarefa_id, :depende_de_id])
    create index(:tarefa_dependencias, [:depende_de_id])

    # Tarefa que depende de si mesma e ciclo de tamanho 1, e o banco consegue recusar esse
    # sozinho. Ciclos maiores nao cabem em CHECK: sao da T-023, que os detecta e reporta.
    create constraint(:tarefa_dependencias, :dependencia_nao_reflexiva,
             check: "tarefa_id <> depende_de_id"
           )

    # UM ARQUIVO POR LINHA, nunca pasta: `areas` e o mutex do paralelismo (T-038), e
    # comparar prefixo de pasta produz falso negativo de interseccao.
    create table(:tarefa_areas) do
      add :tarefa_id, references(:tarefas, on_delete: :delete_all), null: false
      add :caminho, :string, null: false

      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:tarefa_areas, [:tarefa_id, :caminho])
    create index(:tarefa_areas, [:caminho])

    create table(:criterios) do
      add :tarefa_id, references(:tarefas, on_delete: :delete_all), null: false
      add :texto, :text, null: false
      add :comando, :string
      add :grau, :string, null: false, default: "inspecionado"

      timestamps(type: :utc_datetime_usec)
    end

    create index(:criterios, [:tarefa_id])
  end
end
