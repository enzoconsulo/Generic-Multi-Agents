defmodule Fabrica.Prompt.Prefixo do
  @moduledoc """
  Monta a parte ESTAVEL da requisicao. E a alavanca de custo numero um da v2.

  ## O numero que justifica este modulo

  Medido nos 27 jobs da v1 com contabilidade completa: a leitura de cache ja e **93,14%**
  dos tokens de entrada, e a economia atual e ~80%. O que sobra e a **escrita**: 6,66% dos
  tokens carregando **~50% da conta**, porque cada despacho e sessao nova e sessao nova
  escreve prefixo novo — ~21 por rodada. Transformar 21 escritas em 1 ou 2 e o premio, e ele
  so existe se o prefixo for byte a byte identico entre despachos.

  ## A ordem, imposta pela API e nao por convencao

      1. ferramentas   (identicas entre despachos do mesmo papel)   <- ponto de cache
      2. doutrina      (texto fixo do papel)                        <- ponto de cache
      3. indice denso  (o MAPA da T-010)                            <- ponto de cache
      4. tarefa        (muda sempre)                                 sem ponto

  Um byte alterado invalida tudo o que vem **depois** dele. Dai o mais estavel vir primeiro,
  e o contexto da tarefa vir por ultimo e sem ponto de cache: ele muda a cada despacho, e
  marca-lo so pagaria escrita sem nunca render leitura.

  ## O minimo cacheavel e POR MODELO, e nao e monotonico

  | modelo | minimo |
  |---|---|
  | `opus-5` | 512 |
  | `sonnet-5` | 1024 |
  | **`haiku-4.5`** | **4096** |

  A fabrica roda o verificador em Haiku **de proposito** (verificar e mecanico). Um prefixo
  de verificador abaixo de 4096 tokens **simplesmente nao cacheia, sem aviso nenhum da API**
  — o dinheiro sai e o ganho nao vem. Por isso `montar/3` recebe o modelo e AVISA. Avisa, e
  nao recusa: um prefixo curto e ineficiente, nao invalido, e derrubar o despacho por causa
  disso trocaria um desperdicio por um prejuizo maior.
  """

  require Logger

  alias Fabrica.Prompt.Bloco

  @maximo_de_pontos 4

  @minimos %{"opus-5" => 512, "sonnet-5" => 1024, "haiku-4.5" => 4096}
  @minimo_padrao 1024

  # Estimativa grosseira e DECLARADA como tal: ~4 caracteres por token. Serve para decidir
  # se vale avisar, nao para contabilidade — a contagem real vem da resposta da API, em
  # `Fabrica.Custo.Precos`. Um contador exato aqui exigiria o tokenizador do fornecedor.
  @caracteres_por_token 4

  @typedoc "O prefixo montado, pronto para o adaptador."
  @type t :: %{
          blocos: [Bloco.t()],
          texto: String.t(),
          pontos_de_cache: non_neg_integer(),
          tokens_estimados: non_neg_integer(),
          cacheavel: boolean()
        }

  @doc "O minimo cacheavel do modelo, ou o padrao conservador se ele for desconhecido."
  @spec minimo_cacheavel(String.t()) :: pos_integer()
  def minimo_cacheavel(modelo), do: Map.get(@minimos, modelo, @minimo_padrao)

  @doc "O teto de pontos de cache por requisicao, imposto pela API."
  @spec maximo_de_pontos() :: pos_integer()
  def maximo_de_pontos, do: @maximo_de_pontos

  @doc """
  Monta o prefixo a partir das partes, na ordem estavel, com os pontos de cache marcados.

  As partes sao um keyword com `:ferramentas`, `:doutrina`, `:indice` e `:tarefa`. Parte
  ausente simplesmente nao vira bloco — o que permite ao verificador, que nao recebe indice
  inteiro, montar um prefixo mais curto sem caso especial.

  Devolve o mapa com o texto final, quantos pontos de cache saíram e se o prefixo alcanca o
  minimo do modelo.
  """
  @spec montar(String.t(), keyword()) :: t()
  def montar(modelo, partes) do
    blocos =
      Bloco.especies()
      |> Enum.flat_map(&blocos_da_especie(partes, &1))
      |> Kernel.++(Keyword.get(partes, :blocos, []))
      |> Enum.sort_by(&Bloco.posicao(&1.especie))
      |> limitar_pontos()

    texto = Enum.map_join(blocos, "\n\n", & &1.texto)
    tokens = estimar_tokens(texto)
    minimo = minimo_cacheavel(modelo)

    avisar_se_curto(modelo, tokens, minimo)

    %{
      blocos: blocos,
      texto: texto,
      pontos_de_cache: Enum.count(blocos, & &1.ponto_de_cache),
      tokens_estimados: tokens,
      cacheavel: tokens >= minimo
    }
  end

  # UM bloco por especie. Uma lista aqui e CONTEUDO (as ferramentas, por exemplo), e nao
  # varios blocos — serializa junta, num bloco so.
  #
  # Blocos adicionais entram pela opcao explicita `:blocos`, e nao por adivinhacao sobre a
  # forma do valor. Eles existem por causa da janela de 20 blocos da API (T-019): uma volta
  # com muitos `tool_use` precisa de pontos intermediarios. Deixar isso implicito faria
  # `ferramentas: ["ler", "escrever"]` virar dois blocos sem ninguem pedir.
  defp blocos_da_especie(partes, especie) do
    case Keyword.get(partes, especie) do
      nil -> []
      conteudo -> [Bloco.novo(especie, conteudo)]
    end
  end

  # A API rejeita mais de quatro pontos de cache. Quando houver blocos demais marcados, os
  # que sobram perdem a marca — e perdem os MAIS VOLATEIS, nao os primeiros: o ponto vale
  # mais no fim de um trecho estavel longo.
  defp limitar_pontos(blocos) do
    marcados = Enum.count(blocos, & &1.ponto_de_cache)

    if marcados <= @maximo_de_pontos do
      blocos
    else
      excedente = marcados - @maximo_de_pontos

      {novos, _} =
        blocos
        |> Enum.reverse()
        |> Enum.map_reduce(excedente, fn
          %Bloco{ponto_de_cache: true} = bloco, restante when restante > 0 ->
            {%{bloco | ponto_de_cache: false}, restante - 1}

          bloco, restante ->
            {bloco, restante}
        end)

      Enum.reverse(novos)
    end
  end

  @doc """
  Estimativa de tokens, ~4 caracteres cada. **Estimativa, e nao contagem.**

  Serve para decidir se vale avisar sobre o minimo cacheavel. A contagem que entra na
  contabilidade vem da resposta da API, nunca daqui.
  """
  @spec estimar_tokens(String.t()) :: non_neg_integer()
  def estimar_tokens(texto), do: div(byte_size(texto), @caracteres_por_token)

  defp avisar_se_curto(_modelo, tokens, minimo) when tokens >= minimo, do: :ok

  defp avisar_se_curto(modelo, tokens, minimo) do
    Logger.warning(
      "prefixo de ~#{tokens} tokens fica ABAIXO do minimo cacheavel de #{modelo}, que e " <>
        "#{minimo}. Ele nao vai cachear, e a API nao avisa: a escrita e paga e a leitura " <>
        "nunca vem. Ou o prefixo cresce, ou este papel nao deveria rodar em #{modelo}."
    )

    :ok
  end
end
