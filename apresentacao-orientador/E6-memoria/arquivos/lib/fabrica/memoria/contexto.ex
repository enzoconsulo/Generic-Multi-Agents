defmodule Fabrica.Memoria.Contexto do
  @moduledoc """
  Monta o bloco de contexto recuperado — os melhores trechos da HISTORIA do projeto, cada
  um com a fonte citada — para entrar no despacho DEPOIS do prefixo cacheado
  (`Fabrica.Prompt.Prefixo`).

  ## Onde este bloco entra importa mais do que parece

  Ele muda a cada tarefa — a busca depende do termo da tarefa — entao vai DEPOIS do ultimo
  ponto de cache do prefixo. Coloca-lo antes invalidaria o prefixo inteiro a cada despacho: a
  exata otimizacao de contexto que destruiria a economia que a T-011 monta. `anexar/2` por
  isso so CONCATENA — nunca toca no texto do prefixo que recebe.

  ## Cada trecho carrega a fonte

  Trecho sem fonte e afirmacao sem rastro, o problema que este modulo existe pra resolver.
  Cada trecho entra citando `fonte` (arquivo e secao, ver `Fabrica.Memoria.Trecho`), pra quem
  le poder conferir e o agente poder citar de volta.

  ## Teto declarado, nao best-effort

  No maximo `#{inspect(__MODULE__)}.maximo_trechos/0` trechos e um limite de bytes.
  Recuperacao que enche o contexto piora a resposta em vez de melhorar: os trechos ja chegam
  ordenados do mais para o menos relevante (fusao de posto reciproco, `Fabrica.Memoria.Busca`),
  entao o corte e sempre por TRECHO INTEIRO a partir do fim da lista — nunca no meio de um
  corpo — e o primeiro trecho (o mais relevante) sempre entra, mesmo se sozinho ja estourar o
  limite: o teto existe para conter os trechos seguintes, nao para descartar o melhor achado.

  ## Quando NAO usar

  Busca semantica e aproximada e devolve trechos, nao verdades. Nao substitui o indice denso
  (exato, completo, gratis), nao substitui ler o arquivo que a tarefa declara tocar, e nao
  responde o que uma consulta ao banco responde melhor — "quais tarefas estao bloqueadas" e
  um WHERE, nao uma pergunta em linguagem natural.
  """

  alias Fabrica.Memoria.Busca
  alias Fabrica.Memoria.Trecho
  alias Fabrica.Prompt.Prefixo

  @maximo_trechos 8
  @limite_bytes 6_000
  @separador "\n\n"

  @typedoc "O bloco pronto — `nil` quando a recuperacao nao acha nada."
  @type t :: String.t() | nil

  @doc "O teto de trechos que entram no bloco."
  @spec maximo_trechos() :: pos_integer()
  def maximo_trechos, do: @maximo_trechos

  @doc "O limite de bytes do bloco (fora o primeiro trecho, que sempre entra)."
  @spec limite_bytes() :: pos_integer()
  def limite_bytes, do: @limite_bytes

  @doc """
  Busca os melhores trechos de `termo` no `projeto_id` e monta o bloco, ou devolve `nil`
  quando a busca nao acha nada — despacho normal, sem bloco, em vez de bloco vazio.

  `opts[:buscador]` troca quem recupera os trechos (o padrao e
  `Fabrica.Memoria.Busca.buscar/2`) — mesma razao de `opts[:embedder]` em
  `Fabrica.Memoria.Busca.buscar/3`: testar a montagem do bloco sem tocar o banco.
  """
  @spec montar(pos_integer(), String.t(), keyword()) :: t()
  def montar(projeto_id, termo, opts \\ []) do
    buscador = Keyword.get(opts, :buscador, &Busca.buscar/2)

    projeto_id
    |> buscador.(termo)
    |> formatar()
  end

  @doc """
  Formata trechos ja recuperados no bloco de contexto — respeita o teto de
  #{@maximo_trechos} trechos e o limite de #{@limite_bytes} bytes. Lista vazia devolve `nil`.
  """
  @spec formatar([Trecho.t()]) :: t()
  def formatar([]), do: nil

  def formatar(trechos) do
    trechos
    |> Enum.take(@maximo_trechos)
    |> Enum.map(&trecho_para_texto/1)
    |> limitar_bytes()
    |> Enum.join(@separador)
  end

  @doc """
  Anexa o bloco de contexto DEPOIS do prefixo ja montado
  (`Fabrica.Prompt.Prefixo.montar/2`). So concatena: os bytes do prefixo que entram aqui
  saem identicos do outro lado — essa igualdade e o que sustenta o cache.
  """
  @spec anexar(Prefixo.t(), t()) :: String.t()
  def anexar(%{texto: prefixo_texto}, nil), do: prefixo_texto

  def anexar(%{texto: prefixo_texto}, bloco) when is_binary(bloco) do
    prefixo_texto <> @separador <> bloco
  end

  defp trecho_para_texto(%Trecho{fonte: fonte, corpo: corpo}) do
    "### #{fonte}\n#{corpo}"
  end

  # O primeiro trecho (o mais relevante, os trechos ja chegam ordenados) sempre entra, mesmo
  # se sozinho ja estourar o limite — o teto existe pra conter o RESTANTE da lista, nao pra
  # descartar o melhor achado. Dai o `acumulados == []` abrir excecao so na primeira volta.
  defp limitar_bytes([primeiro | resto]) do
    {selecionados, _bytes} =
      Enum.reduce_while(resto, {[primeiro], byte_size(primeiro)}, fn texto, {acumulados, bytes} ->
        novo_total = bytes + byte_size(@separador) + byte_size(texto)

        if novo_total > @limite_bytes do
          {:halt, {acumulados, bytes}}
        else
          {:cont, {[texto | acumulados], novo_total}}
        end
      end)

    Enum.reverse(selecionados)
  end
end
