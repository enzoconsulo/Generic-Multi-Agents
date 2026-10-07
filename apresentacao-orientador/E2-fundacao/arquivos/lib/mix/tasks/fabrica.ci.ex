defmodule Mix.Tasks.Fabrica.Ci do
  @shortdoc "Roda a bateria de verificacao declarada em _gestao/ci.json"

  @moduledoc """
  Roda os estagios de `_gestao/ci.json`, em ordem, imprimindo o resultado de cada um.

      mix fabrica.ci            # os cinco estagios, incluindo `tipos`
      mix fabrica.ci --rapido   # pula `tipos` (a PLT do Dialyzer demora minutos)

  O primeiro estagio que falhar interrompe os seguintes, e o comando sai com codigo
  diferente de zero. Estagio pulado aparece na saida marcado como PULADO — nao some, para
  ninguem deixar de notar que ele parou de rodar.

  Esta tarefa e casca: a regra toda mora em `Fabrica.CI`, que e testavel sem subprocesso.
  """

  use Mix.Task

  alias Fabrica.CI

  @impl Mix.Task
  def run(argumentos) do
    {opcoes, _resto} = OptionParser.parse!(argumentos, strict: [rapido: :boolean])
    rapido? = Keyword.get(opcoes, :rapido, false)

    case CI.estagios() do
      {:ok, estagios} -> executar(estagios, rapido?)
      {:erro, motivo} -> Mix.raise("nao consegui ler _gestao/ci.json: #{inspect(motivo)}")
    end
  end

  defp executar(estagios, rapido?) do
    Mix.shell().info("bateria de verificacao — #{length(estagios)} estagios declarados")
    if rapido?, do: Mix.shell().info("modo rapido: o estagio `tipos` sera pulado")
    Mix.shell().info("")

    {desfecho, resultados} = CI.executar(estagios, rapido: rapido?, rodar: &rodar/1)

    Mix.shell().info("")
    Enum.each(resultados, &imprimir/1)
    resumir(desfecho, estagios, resultados)
  end

  # Roda e ja imprime a saida do estagio que FALHOU. Guardar para o fim faria quem le
  # esperar sem saber o que quebrou.
  defp rodar(estagio) do
    Mix.shell().info("  ... #{estagio.nome}: #{estagio.comando}")
    {desfecho, codigo, saida} = CI.rodar_estagio(estagio)

    if desfecho == :erro do
      Mix.shell().info("")
      Mix.shell().error(saida)
    end

    {desfecho, codigo, saida}
  end

  defp imprimir(%{estagio: estagio, desfecho: desfecho} = resultado) do
    marca =
      case desfecho do
        :ok -> "ok    "
        :erro -> "FALHOU"
        :pulado -> "PULADO"
      end

    tempo =
      case resultado.duracao_ms do
        nil -> "     —"
        ms -> String.pad_leading("#{Float.round(ms / 1000, 1)}s", 6)
      end

    Mix.shell().info("  #{String.pad_trailing(estagio.nome, 10)} #{marca}  #{tempo}")
  end

  defp resumir(:ok, estagios, resultados) do
    pulados = Enum.count(resultados, &(&1.desfecho == :pulado))
    rodados = length(estagios) - pulados

    Mix.shell().info("")
    Mix.shell().info("bateria passou: #{rodados} estagio(s) ok, #{pulados} pulado(s)")
  end

  defp resumir(:erro, estagios, resultados) do
    quebrado = Enum.find(resultados, &(&1.desfecho == :erro))
    nao_alcancados = length(estagios) - length(resultados)

    Mix.shell().info("")

    Mix.shell().error(
      "bateria REPROVOU no estagio `#{quebrado.estagio.nome}` " <>
        "(codigo #{quebrado.codigo}); #{nao_alcancados} estagio(s) nem chegaram a rodar"
    )

    exit({:shutdown, 1})
  end
end
