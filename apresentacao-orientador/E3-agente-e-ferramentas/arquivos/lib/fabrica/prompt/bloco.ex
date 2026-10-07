defmodule Fabrica.Prompt.Bloco do
  @moduledoc """
  Um bloco do prefixo, com a marca de ponto de cache e a serializacao determinista.

  O bloco existe como tipo proprio — e nao como string solta — porque a ORDEM e a marca de
  cache sao propriedades dele, e nao de quem o monta. Quem monta so empilha; quem decide se
  um bloco fecha um trecho estavel e o bloco.
  """

  @typedoc "O papel do bloco na ordem do prefixo. A ordem do atomo E a ordem de montagem."
  @type especie :: :ferramentas | :doutrina | :indice | :tarefa

  @type t :: %__MODULE__{
          especie: especie(),
          texto: String.t(),
          ponto_de_cache: boolean()
        }

  defstruct [:especie, :texto, ponto_de_cache: false]

  # A ordem NAO e alfabetica nem de insercao: e a da API, e ela e imposta pelo cache. Um
  # byte alterado invalida tudo o que vem DEPOIS dele, entao o mais estavel vem primeiro.
  @ordem %{ferramentas: 0, doutrina: 1, indice: 2, tarefa: 3}

  @doc "A posicao da especie na ordem de montagem. Menor e mais estavel."
  @spec posicao(especie()) :: non_neg_integer()
  def posicao(especie), do: Map.fetch!(@ordem, especie)

  @doc "As especies, do mais estavel para o mais volatil."
  @spec especies() :: [especie()]
  def especies, do: [:ferramentas, :doutrina, :indice, :tarefa]

  @doc """
  Cria um bloco a partir de um termo qualquer, serializado de forma DETERMINISTA.

  Mapa e lista de par viram texto com as chaves ORDENADAS. Isto nao e estetica: um mapa do
  Elixir nao promete ordem de iteracao estavel entre execucoes, e uma unica chave fora de
  lugar troca os bytes do prefixo — o que erra o cache de todo despacho seguinte, sem erro
  e sem aviso.
  """
  @spec novo(especie(), term(), keyword()) :: t()
  def novo(especie, conteudo, opcoes \\ []) do
    %__MODULE__{
      especie: especie,
      texto: serializar(conteudo),
      ponto_de_cache: Keyword.get(opcoes, :ponto_de_cache, especie != :tarefa)
    }
  end

  @doc "Serializa um termo de forma estavel: colecoes sempre ordenadas."
  @spec serializar(term()) :: String.t()
  def serializar(texto) when is_binary(texto), do: texto

  def serializar(%{} = mapa) when not is_struct(mapa) do
    mapa
    |> Enum.sort_by(fn {chave, _} -> to_string(chave) end)
    |> Enum.map_join("\n", fn {chave, valor} -> "#{chave}: #{serializar(valor)}" end)
  end

  def serializar(lista) when is_list(lista) do
    if Keyword.keyword?(lista) and lista != [] do
      lista |> Map.new() |> serializar()
    else
      Enum.map_join(lista, "\n", &serializar/1)
    end
  end

  def serializar(outro), do: to_string(outro)
end
