defmodule Mix.Tasks.Fabrica.Restaurar do
  @shortdoc "Restaura o banco a partir de um dump"

  @moduledoc """
  Restaura o banco a partir de um dump gravado por `mix fabrica.backup`.

      mix fabrica.restaurar priv/backups/20260828-120000.dump
      mix fabrica.restaurar --ultimo

  Usa `pg_restore --clean --if-exists`, entao a restauracao e repetivel: ela apaga o que
  colidir em vez de falhar no primeiro objeto que ja existe.
  """

  use Mix.Task

  alias Fabrica.Backup

  @impl Mix.Task
  def run(argumentos) do
    Mix.Task.run("app.config")
    {opcoes, resto} = OptionParser.parse!(argumentos, strict: [ultimo: :boolean])

    case escolher(opcoes, resto) do
      {:ok, arquivo} -> restaurar(arquivo)
      {:erro, mensagem} -> Mix.raise(mensagem)
    end
  end

  defp escolher(opcoes, resto) do
    cond do
      resto != [] ->
        {:ok, hd(resto)}

      Keyword.get(opcoes, :ultimo, false) ->
        case Backup.listar() do
          [mais_novo | _] -> {:ok, mais_novo}
          [] -> {:erro, "nao ha nenhum dump em #{Backup.diretorio()}"}
        end

      true ->
        {:erro, "uso: mix fabrica.restaurar <arquivo.dump> | --ultimo"}
    end
  end

  defp restaurar(arquivo) do
    case Backup.restaurar(arquivo) do
      {:ok, caminho} ->
        Mix.shell().info("banco restaurado a partir de #{caminho}")

      {:erro, {:dump_ausente, caminho}} ->
        Mix.raise("dump nao encontrado: #{caminho}")

      {:erro, motivo} ->
        Mix.raise("a restauracao falhou: #{inspect(motivo)}")
    end
  end
end
