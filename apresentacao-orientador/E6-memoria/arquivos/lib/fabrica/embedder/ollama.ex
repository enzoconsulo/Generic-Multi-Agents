defmodule Fabrica.Embedder.Ollama do
  @moduledoc """
  Vetorizacao pelo Ollama local — o adaptador padrao decidido na D-004
  (`_gestao/pesquisas/2026-09-13-ollama-embedding-local.md`), modelo `embeddinggemma`.

  ## Por que este adaptador, e nao `Embedder.Servico` reconfigurado

  `Servico` fala um formato que ELE definiu — `%{"textos" => ..., "modelo" => ...}` →
  `%{"vetores" => ...}`. O Ollama fala outro protocolo, medido (nao inventado) pelo script do
  bench que produziu os numeros da D-004 (`_gestao/pesquisas/2026-09-13-ollama-embedding-bench.py`,
  funcao `embed`):

      POST http://127.0.0.1:11434/api/embed
      {"model": "embeddinggemma", "input": [texto, ...], "truncate": true, "keep_alive": "10m"}
      -> {"embeddings": [[float, ...], ...]}

  Nao e configuracao, e um protocolo diferente — por isso um modulo novo, e nao um `:url`
  apontado para o `Servico`.

  ## O prefixo por tipo de texto — sem ele, a qualidade medida nao se reproduz

  `embeddinggemma` foi treinado com prefixo por tipo, e as formas abaixo sao as EXATAS que
  produziram o recall@8 de 15/23 medido na D-004:

      documento: "title: none | text: "
      consulta:  "task: search result | query: "

  O adaptador aplica o prefixo; quem chama nao precisa saber que ele existe.
  `vetorizar/1` e `vetorizar/2` (o callback do behaviour) usam o prefixo de **documento** — e o
  que a ingestao usa, e documento e o caso de longe mais comum. `vetorizar_consulta/1` e
  `vetorizar_consulta/2` usam o prefixo de **consulta**. Ligar a busca ao caminho de consulta e a
  T-063; aqui as funcoes so precisam existir e estar provadas.

  ## Por que a dimensao e conferida, e nao so repassada

  Mesmo motivo do `Servico`: um vetor de tamanho errado so quebraria depois, gravando no indice
  (`vector(768)`) — e ali o erro perderia a origem. Por isso confere `dimensoes/0` posicoes em
  CADA vetor da resposta antes de devolver `{:ok, _}`, e falha com `{:erro, {:dimensao_invalida,
  esperado, tamanhos}}` em vez disso.

  ## `receive_timeout` — de onde veio o numero

  Medido na D-004 (mesma pesquisa, placa de video): 2.814 trechos em 6,5 min, 7,2 trechos/s. Um
  lote grande (ingestao da historia inteira de um projeto) pode levar minutos, e o padrao do
  `Req` (poucos segundos) e curto demais para isso. O padrao aqui e 5 minutos (300.000 ms) — cobre
  um lote de milhares de trechos com folga — e e configuravel para quem tiver lote maior ou
  maquina mais lenta.

  ## Sem credencial — a D-002 continua valendo

  O Ollama e local, nao tem chave, nao gera fatura. Este adaptador nao le `System.get_env`: a
  credencial tem dono unico no marco da v0.1 (`lib/fabrica/operario/messages_api.ex`), e este
  adaptador nao tem credencial nenhuma para ler.

  ## A PROVA DO MARCO DA V0.1 MUDA DE NOVO — este e o terceiro dono da rede

  `test/fabrica/marco_v01_test.exs` afirma que so os `@donos_da_rede` referenciam `Req`. Este
  modulo referencia `Req` para falar com o Ollama, entao entrou na lista — ao lado de
  `Operario.MessagesAPI` (T-019) e `Embedder.Servico` (T-045). A prova fica mais especifica, nao
  mais fraca: quem FALA HTTP e uma lista de tres agora, quem LE CREDENCIAL segue sendo um so, e
  este modulo nao le nenhuma.

  ## Como o teste dubla a chamada, sem tocar em configuracao global

  `vetorizar/2` e `vetorizar_consulta/2` aceitam as mesmas chaves de configuracao como OPCOES
  (`:url`, `:modelo`, `:dimensoes`, `:keep_alive`, `:prefixo_documento`, `:prefixo_consulta`,
  `:receive_timeout`, e o `:plug` do `Req.Test`), sobrepondo
  `Application.get_env(:fabrica, Fabrica.Embedder.Ollama)`. Mesma forma que `Servico` e
  `Operario.MessagesAPI` usam — nenhum teste desta suite chama `127.0.0.1:11434` de verdade; o
  contato com o servico real e a T-064.
  """

  @behaviour Fabrica.Embedder

  @url "http://127.0.0.1:11434"
  @modelo "embeddinggemma"
  @dimensoes 768
  @keep_alive "10m"
  @prefixo_documento "title: none | text: "
  @prefixo_consulta "task: search result | query: "
  @receive_timeout 300_000

  @impl Fabrica.Embedder
  def dimensoes, do: Keyword.fetch!(configuracao([]), :dimensoes)

  @impl Fabrica.Embedder
  def vetorizar(textos), do: vetorizar(textos, [])

  @doc """
  Vetoriza documentos aceitando configuracao por OPCAO (`:url`, `:modelo`, `:dimensoes`,
  `:keep_alive`, `:prefixo_documento`, `:plug`, `:req`, `:receive_timeout`), que sobrepoe a
  configuracao da aplicacao. `vetorizar/1` (o callback do behaviour) chama esta com `[]`. Aplica
  o prefixo de DOCUMENTO em cada texto antes de mandar.
  """
  @spec vetorizar([String.t()], keyword()) :: {:ok, [[float()]]} | {:erro, term()}
  def vetorizar(textos, opcoes), do: fazer(textos, opcoes, :prefixo_documento, @prefixo_documento)

  @doc """
  Vetoriza uma consulta de busca com o embedder configurado, aplicando o prefixo de CONSULTA.
  """
  @impl Fabrica.Embedder
  @spec vetorizar_consulta([String.t()]) :: {:ok, [[float()]]} | {:erro, term()}
  def vetorizar_consulta(textos), do: vetorizar_consulta(textos, [])

  @doc """
  Igual a `vetorizar/2`, mas aplica o prefixo de CONSULTA em vez do de documento. Mesmas opcoes,
  mais `:prefixo_consulta`.
  """
  @spec vetorizar_consulta([String.t()], keyword()) :: {:ok, [[float()]]} | {:erro, term()}
  def vetorizar_consulta(textos, opcoes),
    do: fazer(textos, opcoes, :prefixo_consulta, @prefixo_consulta)

  defp fazer([], _opcoes, _chave_prefixo, _prefixo_padrao), do: {:ok, []}

  defp fazer(textos, opcoes, chave_prefixo, prefixo_padrao) when is_list(textos) do
    if Enum.all?(textos, &is_binary/1) do
      config = configuracao(opcoes)
      prefixo = Keyword.get(config, chave_prefixo, prefixo_padrao)
      prefixados = Enum.map(textos, &(prefixo <> &1))

      case Keyword.fetch(config, :url) do
        {:ok, url} ->
          url |> pedir(prefixados, config, opcoes) |> tratar(Keyword.fetch!(config, :dimensoes))

        :error ->
          {:erro, :url_nao_configurada}
      end
    else
      {:erro, :texto_nao_e_string}
    end
  end

  defp fazer(_outro, _opcoes, _chave_prefixo, _prefixo_padrao), do: {:erro, :esperava_lista}

  defp configuracao(opcoes) do
    :fabrica
    |> Application.get_env(__MODULE__, [])
    |> Keyword.merge(opcoes)
    |> Keyword.put_new(:url, @url)
    |> Keyword.put_new(:modelo, @modelo)
    |> Keyword.put_new(:dimensoes, @dimensoes)
    |> Keyword.put_new(:keep_alive, @keep_alive)
    |> Keyword.put_new(:receive_timeout, @receive_timeout)
  end

  defp pedir(url, textos, config, opcoes) do
    corpo = %{
      "model" => Keyword.get(config, :modelo),
      "input" => textos,
      "truncate" => true,
      "keep_alive" => Keyword.get(config, :keep_alive)
    }

    requisicao =
      [
        url: url <> "/api/embed",
        json: corpo,
        receive_timeout: Keyword.get(config, :receive_timeout)
      ]
      |> Keyword.merge(Keyword.take(opcoes, [:plug, :req]))
      |> Req.new()

    Req.post(requisicao)
  end

  defp tratar({:ok, %{status: 200, body: corpo}}, dimensoes), do: extrair(corpo, dimensoes)

  defp tratar({:ok, %{status: status, body: corpo}}, _dimensoes),
    do: {:erro, {:http, status, corpo}}

  defp tratar({:error, motivo}, _dimensoes), do: {:erro, motivo}

  defp extrair(%{"embeddings" => vetores}, dimensoes) when is_list(vetores) do
    tamanhos = Enum.map(vetores, &length/1)

    if Enum.all?(tamanhos, &(&1 == dimensoes)) do
      {:ok, vetores}
    else
      {:erro, {:dimensao_invalida, dimensoes, tamanhos}}
    end
  end

  defp extrair(_outro, _dimensoes), do: {:erro, :resposta_invalida}
end
