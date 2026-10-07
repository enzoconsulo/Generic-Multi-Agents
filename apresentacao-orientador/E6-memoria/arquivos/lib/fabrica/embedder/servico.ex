defmodule Fabrica.Embedder.Servico do
  @moduledoc """
  Vetorizacao por chamada HTTP em lote — o adaptador padrao para maquina modesta.

  Nao carrega modelo nenhum: manda o lote inteiro para um servico externo configuravel
  (`:url`, `:modelo`, `:chave`) e traduz a resposta. E o contrario de `Embedder.Local`
  (T-045): custa por chamada, mas nao pesa nada na maquina que roda a fabrica.

  ## O contrato HTTP

  Um `POST` para `:url` com corpo `%{"textos" => [...], "modelo" => modelo}` e resposta
  esperada `%{"vetores" => [[float()]]}`, na MESMA ordem da entrada. Quem definiu esse
  formato foi este adaptador — nao existe API externa fixa aqui, so a forma que ele fala.

  ## Por que a dimensao e conferida, e nao so repassada

  Um vetor de tamanho errado so quebraria depois, gravando no indice (`vector(384)`) — e ali
  o erro perderia a origem. Por isso `vetorizar/1` confere `dimensoes/0` posicoes em CADA
  vetor da resposta antes de devolver `{:ok, _}`, e falha com `{:erro, {:dimensao_invalida,
  esperado, tamanhos}}` em vez disso.

  ## Como o teste dubla a chamada, sem tocar em configuracao global

  `vetorizar/2` aceita as mesmas chaves de configuracao como OPCOES (`:url`, `:modelo`,
  `:chave`, e o `:plug` do `Req.Test`), sobrepondo `Application.get_env(:fabrica,
  Fabrica.Embedder.Servico)`. E a mesma forma que `Operario.MessagesAPI` usa — ver
  `test/support/sem_rede.ex` para o porque de nao existir chamada de rede por acidente.
  """

  @behaviour Fabrica.Embedder

  @dimensoes 384

  @impl Fabrica.Embedder
  def dimensoes, do: @dimensoes

  @impl Fabrica.Embedder
  def vetorizar(textos), do: vetorizar(textos, [])

  @doc """
  Vetoriza aceitando configuracao por OPCAO (`:url`, `:modelo`, `:chave`, `:plug`, `:req`,
  `:receive_timeout`), que sobrepoe a configuracao da aplicacao. `vetorizar/1` (o callback do
  behaviour) chama esta com `[]`.
  """
  @spec vetorizar([String.t()], keyword()) :: {:ok, [[float()]]} | {:erro, term()}
  def vetorizar([], _opcoes), do: {:ok, []}

  def vetorizar(textos, opcoes) when is_list(textos) do
    if Enum.all?(textos, &is_binary/1) do
      config = configuracao(opcoes)

      case Keyword.fetch(config, :url) do
        {:ok, url} -> url |> pedir(textos, config, opcoes) |> tratar()
        :error -> {:erro, :url_nao_configurada}
      end
    else
      {:erro, :texto_nao_e_string}
    end
  end

  def vetorizar(_outro, _opcoes), do: {:erro, :esperava_lista}

  defp configuracao(opcoes) do
    :fabrica
    |> Application.get_env(__MODULE__, [])
    |> Keyword.merge(opcoes)
  end

  defp pedir(url, textos, config, opcoes) do
    corpo = %{"textos" => textos, "modelo" => Keyword.get(config, :modelo)}

    requisicao =
      [url: url, json: corpo, headers: cabecalhos(config)]
      |> Keyword.merge(Keyword.take(opcoes, [:plug, :req, :receive_timeout]))
      |> Req.new()

    Req.post(requisicao)
  end

  # A chave e opcional: um servico auto-hospedado pode nao pedir nenhuma.
  defp cabecalhos(config) do
    case Keyword.get(config, :chave) do
      chave when is_binary(chave) and chave != "" -> [{"authorization", "Bearer #{chave}"}]
      _ -> []
    end
  end

  defp tratar({:ok, %{status: 200, body: corpo}}), do: extrair(corpo)
  defp tratar({:ok, %{status: status, body: corpo}}), do: {:erro, {:http, status, corpo}}
  defp tratar({:error, motivo}), do: {:erro, motivo}

  defp extrair(%{"vetores" => vetores}) when is_list(vetores) do
    tamanhos = Enum.map(vetores, &length/1)

    if Enum.all?(tamanhos, &(&1 == @dimensoes)) do
      {:ok, vetores}
    else
      {:erro, {:dimensao_invalida, @dimensoes, tamanhos}}
    end
  end

  defp extrair(_outro), do: {:erro, :resposta_invalida}
end
