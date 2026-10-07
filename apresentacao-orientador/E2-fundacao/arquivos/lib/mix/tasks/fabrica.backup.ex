defmodule Mix.Tasks.Fabrica.Backup do
  @shortdoc "Grava um dump do banco em priv/backups/"

  @moduledoc """
  Grava um dump do banco, no formato custom, e imprime o caminho.

      mix fabrica.backup
      mix fabrica.backup --destino caminho/do/arquivo.dump

  O caminho do `pg_dump` vem de `config :fabrica, :pg_bin`, nunca do PATH — ver
  `Fabrica.Backup`.
  """

  use Mix.Task

  alias Fabrica.Backup

  @impl Mix.Task
  def run(argumentos) do
    Mix.Task.run("app.config")
    {opcoes, _} = OptionParser.parse!(argumentos, strict: [destino: :string])

    case Backup.gravar(opcoes) do
      {:ok, caminho} ->
        tamanho = File.stat!(caminho).size
        Mix.shell().info("dump gravado: #{caminho} (#{tamanho} bytes)")

      {:erro, {:executavel_ausente, programa, _}} ->
        Mix.raise("""
        nao encontrei o `pg_dump` em `#{programa}`.

        Configure a raiz dos binarios do PostgreSQL:

            config :fabrica, :pg_bin, "C:/pgsql/18/bin"
        """)

      {:erro, motivo} ->
        Mix.raise("o backup falhou: #{inspect(motivo)}")
    end
  end
end
