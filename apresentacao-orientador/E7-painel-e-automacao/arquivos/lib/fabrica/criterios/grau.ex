defmodule Fabrica.Criterios.Grau do
  @moduledoc """
  A escada de prova e o rotulo OBRIGATORIO — o verificador nao fecha sem rotular tudo.

  Tres degraus (`Fabrica.Tarefas.Criterio.graus/0`): `:executado` (um comando decide),
  `:inspecionado` (alguem abre o artefato e afirma fatos) e `:julgado` (rubrica, e so quando
  os dois primeiros sao genuinamente impossiveis). `_sistema/DOMINIOS.md` e onde a doutrina
  esta escrita por extenso.

  ## Por que o rotulo e obrigatorio, e nao so uma recomendacao

  Sem ele, um verificador que nao sabe como provar um criterio simplesmente NAO PROVA, e a
  omissao fica invisivel dentro de um relatorio que parece completo. `fechar/2` e o portao
  que faz essa omissao virar erro explicito em vez de silencio.

  ## Por que `:julgado` exige rubrica

  `:julgado` e o degrau mais fraco: e opiniao de quem verifica, e nao execucao. Sem uma
  rubrica de itens BINARIOS declarada na tarefa, "julgado" vira "o verificador achou que sim"
  — um segundo revisor disfarcado de portao mecanico. A rubrica e o que torna esse julgamento
  auditavel por outra pessoa.

  ## O numero que este modulo torna consultavel

  "Muitos `julgado` num projeto significam portao e meio, nao dois" e uma frase da doutrina
  que so vale alguma coisa se puder ser medida. `proporcao_julgados/1` e essa medida.
  """

  alias Fabrica.Tarefas.Criterio

  @graus Criterio.graus()

  @typedoc """
  Uma avaliacao de criterio, do jeito que o verificador a produz — ANTES de persistir.

  `grau` e `nil` exatamente quando o verificador nao rotulou, e isso e o caso que
  `fechar/2` existe para barrar.
  """
  @type avaliacao :: %{required(:texto) => String.t(), required(:grau) => atom() | nil}

  @typedoc "Por que o portao nao fecha."
  @type erro :: {:rotulo_ausente, [String.t()]} | {:rubrica_ausente, [String.t()]}

  @doc """
  Fecha a verificacao SE, e so se: (1) toda avaliacao tem um rotulo valido da escada, e
  (2) todo criterio `:julgado` encontra rubrica de itens binarios em `texto_da_tarefa`.

  Devolve o motivo pelo texto do(s) criterio(s) que falharam, nunca so `:erro` cru — quem
  le precisa saber QUAL criterio ficou sem prova, para poder corrigi-lo.

  ## Exemplos

      iex> Fabrica.Criterios.Grau.fechar([%{texto: "a", grau: :executado}], "")
      {:ok, [%{texto: "a", grau: :executado}]}

      iex> Fabrica.Criterios.Grau.fechar([%{texto: "a", grau: nil}], "")
      {:erro, {:rotulo_ausente, ["a"]}}
  """
  @spec fechar([avaliacao()], String.t()) :: {:ok, [avaliacao()]} | {:erro, erro()}
  def fechar(avaliacoes, texto_da_tarefa) do
    with :ok <- exigir_rotulo(avaliacoes),
         :ok <- exigir_rubrica(avaliacoes, texto_da_tarefa) do
      {:ok, avaliacoes}
    end
  end

  defp exigir_rotulo(avaliacoes) do
    case sem_rotulo(avaliacoes) do
      [] -> :ok
      textos -> {:erro, {:rotulo_ausente, textos}}
    end
  end

  defp sem_rotulo(avaliacoes) do
    avaliacoes
    |> Enum.reject(&(&1.grau in @graus))
    |> Enum.map(& &1.texto)
  end

  defp exigir_rubrica(avaliacoes, texto_da_tarefa) do
    julgados = Enum.filter(avaliacoes, &(&1.grau == :julgado))

    cond do
      julgados == [] -> :ok
      rubrica(texto_da_tarefa) != [] -> :ok
      true -> {:erro, {:rubrica_ausente, Enum.map(julgados, & &1.texto)}}
    end
  end

  @doc """
  Os itens da secao `## Rubrica` da tarefa. Lista vazia quando a secao nao existe ou nao
  tem nenhum item — as duas formas de "nao ha rubrica utilizavel".

  ## Exemplos

      iex> Fabrica.Criterios.Grau.rubrica("## Rubrica\\n- item unico\\n")
      ["- item unico"]

      iex> Fabrica.Criterios.Grau.rubrica("sem secao nenhuma")
      []
  """
  @spec rubrica(String.t()) :: [String.t()]
  def rubrica(texto_da_tarefa) do
    texto_da_tarefa
    |> to_string()
    |> secao("## Rubrica")
    |> String.split(~r/\r?\n/)
    |> Enum.map(&String.trim/1)
    |> Enum.filter(&Regex.match?(~r/^[-*]\s+\S/, &1))
  end

  # A secao vai do cabecalho ate o PROXIMO `## `, ou ate o fim do texto quando nao ha outro.
  defp secao(texto, cabecalho) do
    case String.split(texto, cabecalho, parts: 2) do
      [_antes, depois] -> depois |> String.split(~r/\n##\s/, parts: 2) |> List.first()
      [_unico] -> ""
    end
  end

  @doc """
  A proporcao de criterios `:julgado` numa lista qualquer de criterios com `:grau`.

  `0.0` para lista vazia, em vez de levantar por divisao por zero: um projeto sem criterio
  nenhum ainda nao tem sinal de portao virando dois julgamentos, e nao pode aparecer com
  proporcao alta so por ter denominador zero.

  ## Exemplos

      iex> Fabrica.Criterios.Grau.proporcao_julgados([])
      0.0

      iex> Fabrica.Criterios.Grau.proporcao_julgados([%{grau: :julgado}, %{grau: :executado}])
      0.5
  """
  @spec proporcao_julgados([%{grau: atom()}]) :: float()
  def proporcao_julgados([]), do: 0.0

  def proporcao_julgados(criterios) do
    Enum.count(criterios, &(&1.grau == :julgado)) / length(criterios)
  end
end
