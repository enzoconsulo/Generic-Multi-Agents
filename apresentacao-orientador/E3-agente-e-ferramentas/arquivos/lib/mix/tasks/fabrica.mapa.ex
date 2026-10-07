defmodule Mix.Tasks.Fabrica.Mapa do
  @shortdoc "Gera _gestao/MAPA.md, o indice denso do projeto"

  @moduledoc """
  Gera o indice denso do projeto em `_gestao/MAPA.md`.

      mix fabrica.mapa

  Deterministico e sem modelo: duas execucoes sobre a mesma arvore produzem bytes
  identicos. E disso que depende o cache do prefixo — ver `Fabrica.Indice.Mapa`.
  """

  use Mix.Task

  alias Fabrica.Indice.Mapa

  @impl Mix.Task
  def run(argumentos) do
    {opcoes, _} = OptionParser.parse!(argumentos, strict: [raiz: :string, destino: :string])

    {:ok, destino, bytes} = Mapa.gravar(opcoes)
    fonte = tamanho_do_fonte(Keyword.get(opcoes, :raiz, "."))

    Mix.shell().info("mapa gravado: #{destino} (#{bytes} bytes)")

    if fonte > 0 do
      Mix.shell().info("fonte: #{fonte} bytes — o mapa e #{Float.round(bytes / fonte * 100, 1)}%")
    end
  end

  defp tamanho_do_fonte(raiz) do
    raiz
    |> Path.join("lib/**/*.ex")
    |> Path.wildcard()
    |> Enum.reduce(0, fn arquivo, total -> total + File.stat!(arquivo).size end)
  end
end
