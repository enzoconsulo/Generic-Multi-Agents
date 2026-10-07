defmodule Fabrica.Retrabalho.Politica do
  @moduledoc """
  COMO refazer: qual modelo, quantas voltas, que escopo, com que foco.

  E o dado que a v1 tem e a documentacao do TCC nao descreve. A doc conta a escada — sobe
  modelo, troca especialista, replaneja, bloqueia — e a escada responde *"o que fazer da
  proxima vez"*. Falta a outra metade: **o TAMANHO do retrabalho**.

  Sem ela, toda reprovacao devolve a tarefa com o mesmo despacho de sempre: escopo inteiro,
  30 voltas, o pedido original. Um conserto de uma linha recebe o mesmo orcamento que uma
  reimplementacao — e paga por ele.

  ## As tres larguras de volta

  | largura | voltas | quando |
  |---|---|---|
  | `:estreito` | 8 | conserto pontual: arquivo e linha nomeados, defeito leve |
  | `:medio` | 18 | falha funcional, ou defeito grave num ponto nomeado |
  | `:amplo` | 30 | escopo inteiro — e o padrao do `Agente.Estado` |

  O `:amplo` **e** o teto padrao do laco de propósito: retrabalho amplo nao e um regime
  especial, e o regime normal. As outras duas larguras sao o que se ganha por saber mais.
  """

  @typedoc "Quanto espaco o proximo despacho recebe."
  @type largura :: :estreito | :medio | :amplo

  @typedoc """
  O que o construtor pode tocar.

  `{:arquivos, lista}` nao e so economia de contexto: e o mutex do paralelismo. Escopo
  estreito deixa a tarefa rodar ao lado de outra que a original bloquearia.
  """
  @type escopo :: {:arquivos, [String.t()]} | :tarefa_inteira

  @typedoc "De onde veio a reprovacao, e o que ela era."
  @type natureza :: :pontual | :funcional | :conformidade | :impedimento

  @type t :: %__MODULE__{
          natureza: natureza(),
          modelo: :do_disparo | :reforcado,
          largura: largura(),
          voltas: pos_integer(),
          escopo: escopo(),
          foco: [String.t()]
        }

  defstruct [:natureza, :modelo, :largura, :voltas, :escopo, foco: []]

  @voltas %{estreito: 8, medio: 18, amplo: 30}

  @doc """
  Quantas voltas cada largura vale.

  ## Exemplos

      iex> Fabrica.Retrabalho.Politica.voltas(:estreito)
      8

      iex> Fabrica.Retrabalho.Politica.voltas(:amplo)
      30
  """
  @spec voltas(largura()) :: pos_integer()
  def voltas(largura), do: Map.fetch!(@voltas, largura)

  @doc "As tres larguras, da mais estreita para a mais ampla."
  @spec larguras() :: [largura()]
  def larguras, do: [:estreito, :medio, :amplo]

  @doc """
  A politica como bloco de texto para o despacho.

  O foco vem numerado e **em ordem de gravidade**: quem le uma lista longa conserta os
  primeiros itens, entao a ordem decide o que sera consertado quando as voltas acabarem.
  """
  @spec para_despacho(t()) :: String.t()
  def para_despacho(%__MODULE__{} = politica) do
    """
    <retrabalho>
    Natureza da reprovacao: #{politica.natureza}
    Escopo: #{descrever_escopo(politica.escopo)}
    Teto desta volta: #{politica.voltas} idas ao modelo (#{politica.largura})

    #{focar(politica.foco)}
    </retrabalho>
    """
    |> String.trim()
  end

  defp descrever_escopo(:tarefa_inteira), do: "a tarefa inteira"

  defp descrever_escopo({:arquivos, arquivos}) do
    "SOMENTE estes arquivos: " <> Enum.join(arquivos, ", ")
  end

  defp focar([]), do: "Sem achados nomeados."

  defp focar(itens) do
    numerados =
      itens
      |> Enum.with_index(1)
      |> Enum.map_join("\n", fn {item, posicao} -> "#{posicao}. #{item}" end)

    "Conserte, nesta ordem:\n" <> numerados
  end
end
