defmodule Mix.Tasks.Fabrica.Sintaxe do
  @shortdoc "Confere se um arquivo .ex/.exs e sintaticamente valido, sem executa-lo"

  @moduledoc """
  Confere a sintaxe de um arquivo Elixir SEM rodar o conteudo dele.

      mix fabrica.sintaxe priv/probes/confinamento_cli.exs

  Existe para que um `verificar:` possa confirmar que uma sonda que consome rede ou cota
  real (as sondas em `priv/probes/`) ao menos parseia, sem gastar essa cota rodando-a
  (nasceu do impedimento da T-092, ver D-022 em `_gestao/DECISOES.md`). Sai com codigo 0 e
  imprime confirmacao quando o arquivo parseia; sai com codigo diferente de zero, apontando
  a falha de sintaxe com arquivo/linha/coluna (sem stacktrace cru), quando nao parseia ou o
  caminho nao existe.
  """

  use Mix.Task

  @impl Mix.Task
  def run([caminho]) do
    case File.read(caminho) do
      {:ok, fonte} -> conferir(caminho, fonte)
      {:error, motivo} -> arquivo_ilegivel(caminho, motivo)
    end
  end

  def run(_argumentos) do
    Mix.raise("uso: mix fabrica.sintaxe <arquivo.ex|.exs>")
  end

  defp conferir(caminho, fonte) do
    _ = Code.string_to_quoted!(fonte, file: caminho)
    Mix.shell().info("sintaxe valida: #{caminho}")
  rescue
    erro in [SyntaxError, TokenMissingError] ->
      Mix.shell().error(Exception.message(erro))
      exit({:shutdown, 1})
  end

  @spec arquivo_ilegivel(String.t(), atom()) :: no_return()
  defp arquivo_ilegivel(caminho, motivo) do
    Mix.shell().error("nao consegui ler #{caminho}: #{:file.format_error(motivo)}")
    exit({:shutdown, 1})
  end
end
