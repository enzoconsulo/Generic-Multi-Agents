defmodule Fabrica.Repo.Migrations.CriarExtensoes do
  use Ecto.Migration

  # `citext` existe aqui por causa do codigo da tarefa (T-NNN): "t-001" e "T-001" sao a
  # mesma tarefa, e a igualdade tem de valer no BANCO, nao no codigo que consulta. Deixar
  # isso para a aplicacao seria a mesma classe de erro que a v2 existe para eliminar.
  def up do
    execute("CREATE EXTENSION IF NOT EXISTS citext")
  end

  def down do
    execute("DROP EXTENSION IF EXISTS citext")
  end
end
