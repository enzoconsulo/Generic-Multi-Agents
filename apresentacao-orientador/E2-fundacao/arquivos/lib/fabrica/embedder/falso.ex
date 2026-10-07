defmodule Fabrica.Embedder.Falso do
  @moduledoc """
  Vetores deterministicos por hash — sem modelo, sem rede e sem custo.

  E o que permite testar a busca hibrida INTEIRA da v0.5 sem carregar modelo nenhum, e e o
  embedder que a suite usa para sempre. As duas propriedades que importam, e que os testes
  travam:

    * o MESMO texto sempre da o MESMO vetor;
    * textos diferentes dao vetores diferentes.

  Nao ha nenhuma pretensao de semantica aqui: dois textos parecidos NAO produzem vetores
  proximos, e nao devem. Quem precisa de vizinhanca semantica de verdade e a T-047, que
  avalia a qualidade da recuperacao contra os adaptadores reais. Confundir os dois papeis
  faria a avaliacao medir o hash em vez do modelo.

  ## Por que 384 dimensoes

  E o tamanho de um embedding de sentence-transformer pequeno (a familia MiniLM). Fixando
  aqui, a troca para `Embedder.Local` ou `Embedder.Servico` na v0.5 **nao muda o esquema do
  banco** — a coluna `vector(384)` continua valendo.
  """

  @behaviour Fabrica.Embedder

  @dimensoes 384

  @impl Fabrica.Embedder
  def dimensoes, do: @dimensoes

  @impl Fabrica.Embedder
  def vetorizar(textos) when is_list(textos) do
    if Enum.all?(textos, &is_binary/1) do
      {:ok, Enum.map(textos, &vetor/1)}
    else
      {:erro, :texto_nao_e_string}
    end
  end

  def vetorizar(_outro), do: {:erro, :esperava_lista}

  @doc """
  O vetor de UM texto: deterministico, normalizado, com `dimensoes/0` posicoes.

  A semente vem de `:erlang.phash2` do texto inteiro. Cada posicao e derivada da semente
  junto com o proprio indice — sem isso, um vetor constante teria a determinacao pedida e
  seria inutil para qualquer teste de ordenacao.
  """
  @spec vetor(String.t()) :: [float()]
  def vetor(texto) when is_binary(texto) do
    semente = :erlang.phash2(texto, 4_294_967_296)

    0..(@dimensoes - 1)
    |> Enum.map(fn posicao ->
      :erlang.phash2({semente, posicao}, 2_000_001) / 1_000_000.0 - 1.0
    end)
    |> normalizar()
  end

  # Normaliza para norma 1. Com vetores unitarios, a distancia por cosseno do pgvector vira
  # comparavel entre pares quaisquer — que e como a busca da v0.5 consulta.
  # A comparacao e `> 0`, e nao um `case` casando com `0.0`: a partir do OTP 27 casar com
  # `0.0` significa casar so com `+0.0`, e o compilador avisa. Guarda numerica nao tem essa
  # sutileza e diz melhor o que se quer — norma utilizavel.
  defp normalizar(vetor) do
    norma = :math.sqrt(Enum.reduce(vetor, 0.0, fn valor, soma -> soma + valor * valor end))

    if norma > 0 do
      Enum.map(vetor, &(&1 / norma))
    else
      vetor
    end
  end
end
