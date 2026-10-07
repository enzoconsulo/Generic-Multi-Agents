defmodule Fabrica.Operario.MessagesAPI do
  @moduledoc """
  O adaptador que fala HTTP direto com a Messages API. **E ele que persegue a metade da conta
  que sobrou.**

  ## Por que Req, e nao uma biblioteca pronta

  E a escolha mais contraintuitiva do projeto, e ela precisa continuar justificada: o nucleo
  precisa decidir, **requisicao a requisicao**, onde marcar os pontos de cache e qual TTL
  pedir. Camada de conveniencia esconde exatamente isso — e "exatamente isso" e o alvo:
  medido na v1, a escrita de cache e 6,66% dos tokens e carrega ~50% da conta de entrada,
  porque cada despacho e sessao nova e sessao nova escreve prefixo novo (~21 por rodada).

  ## A ordem do corpo e imposta pela API

      tools -> system -> messages

  Um byte alterado invalida tudo o que vem **depois**. Por isso o `cache_control` vai no
  ULTIMO bloco de cada faixa estavel, com `ttl: "1h"` nas faixas 1 a 3: a escrita custa 2,0x
  em vez de 1,25x, mas sobrevive ao intervalo entre etapas — e a bateria de um verificador
  leva minutos.

  ## As tres armadilhas que a v1 nao tem como enxergar

  1. **Janela de 20 blocos.** Cada ponto de cache caminha para tras **no maximo 20 blocos**
     procurando entrada anterior. Uma volta com muitos `tool_use`/`tool_result` — e a v1 tem
     rodada com **472 chamadas de ferramenta** — faz o ponto seguinte nao encontrar o anterior
     e **errar o cache em silencio**. Dai o ponto intermediario a cada ~15 blocos.
  2. **Requisicoes paralelas identicas nao compartilham cache.** Nenhuma le o que as outras
     ainda estao escrevendo. Em fan-out, dispare UMA, espere, e so entao as demais.
  3. **Mensagem de sistema no meio da conversa.** Instrucao que muda por tarefa vai como
     `{"role": "system"}` DENTRO de `messages`, nunca editando o `system` de topo — editar o
     topo invalida todo o historico cacheado.

  ## Onde se confere o ganho

  No unico lugar que nao mente: **`cache_read_input_tokens` na resposta**. Se vier zero em
  requisicoes repetidas com o mesmo prefixo, ha invalidador silencioso em algum lugar.

  ## Credencial

  `ANTHROPIC_API_KEY` e lida **so aqui**, e so no momento da chamada. Este e o unico modulo
  da fabrica que a le, e ha teste do marco da v0.1 travando essa exclusividade. **Este
  adaptador custa dinheiro de verdade** — o `ClaudeCLI` roda na assinatura e nao gera fatura.
  """

  @behaviour Fabrica.Operario

  alias Fabrica.Operario.Bloco
  alias Fabrica.Operario.Consumo
  alias Fabrica.Operario.Requisicao
  alias Fabrica.Operario.Resposta

  @url "https://api.anthropic.com/v1/messages"
  @versao "2023-06-01"
  @maximo_de_pontos 4
  @janela_de_blocos 15

  @doc "A janela entre pontos de cache intermediarios. Abaixo dos 20 que a API permite."
  @spec janela_de_blocos() :: pos_integer()
  def janela_de_blocos, do: @janela_de_blocos

  @impl Fabrica.Operario
  def conversar(%Requisicao{} = requisicao, opcoes) do
    corpo = montar(requisicao, opcoes)

    case pedir(corpo, opcoes) do
      {:ok, %{status: 200, body: resposta}} -> {:ok, traduzir(resposta)}
      {:ok, %{status: 429, body: corpo}} -> {:erro, {:cota, reabre_em(corpo)}}
      {:ok, %{status: status, body: corpo}} -> {:erro, {:http, status, corpo}}
      {:error, motivo} -> {:erro, motivo}
    end
  end

  @doc """
  Monta o corpo da requisicao. **Publica de proposito**: e ela que o teste inspeciona.

  Testar a montagem sem rede e o que permite provar as tres armadilhas sem gastar um centavo.
  """
  @spec montar(Requisicao.t(), keyword()) :: map()
  def montar(%Requisicao{} = requisicao, opcoes \\ []) do
    %{
      model: requisicao.modelo,
      max_tokens: Keyword.get(opcoes, :max_tokens, 8_192),
      tools: ferramentas(requisicao),
      system: sistema(requisicao),
      messages: mensagens(requisicao, opcoes)
    }
  end

  # FAIXA 1 — ferramentas. Identicas entre despachos do mesmo papel, entao sao o bloco mais
  # estavel de todos e o primeiro a entrar.
  defp ferramentas(%Requisicao{ferramentas: []}), do: []

  defp ferramentas(%Requisicao{ferramentas: ferramentas}) do
    ferramentas
    |> Enum.map(fn
      %{} = ferramenta ->
        ferramenta

      nome ->
        %{name: to_string(nome), description: to_string(nome), input_schema: %{type: "object"}}
    end)
    |> marcar_ultimo()
  end

  # FAIXAS 2 e 3 — doutrina e indice. Viram blocos de `system`, e o ULTIMO leva o ponto de
  # cache: marcar o do meio pagaria escrita sem fechar uma faixa.
  defp sistema(%Requisicao{prefixo: []}), do: []

  defp sistema(%Requisicao{prefixo: blocos}) do
    blocos
    |> Enum.map(fn %Bloco{} = bloco -> %{type: "text", text: bloco.texto} end)
    |> marcar_ultimo()
  end

  defp marcar_ultimo([]), do: []

  defp marcar_ultimo(blocos) do
    {inicio, [ultimo]} = Enum.split(blocos, -1)
    inicio ++ [Map.put(ultimo, :cache_control, %{type: "ephemeral", ttl: "1h"})]
  end

  # As mensagens, com os pontos intermediarios da ARMADILHA 1 e a mensagem de sistema no
  # meio da conversa da ARMADILHA 3.
  defp mensagens(%Requisicao{mensagens: mensagens}, opcoes) do
    mensagens
    |> Enum.map(&traduzir_mensagem/1)
    |> inserir_instrucao(Keyword.get(opcoes, :instrucao_da_tarefa))
    |> pontuar_intermediarios(pontos_disponiveis(mensagens))
  end

  defp traduzir_mensagem(%{papel: papel, conteudo: conteudo}) do
    %{role: papel_para_api(papel), content: conteudo}
  end

  defp traduzir_mensagem(outra), do: outra

  defp papel_para_api(:assistente), do: "assistant"
  defp papel_para_api(:usuario), do: "user"
  defp papel_para_api(:sistema), do: "system"
  defp papel_para_api(outro), do: to_string(outro)

  # ARMADILHA 3: instrucao que muda por tarefa entra como mensagem de sistema DENTRO de
  # `messages`. Editar o `system` de topo invalidaria todo o historico cacheado — e o
  # historico e justamente a parte grande.
  defp inserir_instrucao(mensagens, nil), do: mensagens

  defp inserir_instrucao(mensagens, instrucao) do
    mensagens ++ [%{role: "system", content: instrucao}]
  end

  # ARMADILHA 1: o ponto de cache caminha no maximo 20 blocos para tras. Numa volta com
  # muitos `tool_use`/`tool_result`, o ponto seguinte nao acha o anterior e o cache erra EM
  # SILENCIO — sem erro, sem aviso, so a conta subindo. Ponto intermediario a cada 15.
  defp pontuar_intermediarios(mensagens, 0), do: mensagens

  defp pontuar_intermediarios(mensagens, disponiveis) do
    total = length(mensagens)

    if total <= @janela_de_blocos do
      mensagens
    else
      aplicar_pontos(mensagens, posicoes_intermediarias(total, disponiveis))
    end
  end

  defp aplicar_pontos(mensagens, posicoes) do
    mensagens
    |> Enum.with_index()
    |> Enum.map(fn {mensagem, indice} ->
      if indice in posicoes, do: marcar_mensagem(mensagem), else: mensagem
    end)
  end

  defp posicoes_intermediarias(total, disponiveis) do
    @janela_de_blocos
    |> Stream.iterate(&(&1 + @janela_de_blocos))
    |> Stream.take_while(&(&1 < total))
    |> Enum.take(disponiveis)
    |> MapSet.new()
  end

  # O teto de 4 pontos e da API, e as faixas estaveis ja consomem parte dele. O que sobra
  # vai para os intermediarios — nunca o contrario: perder o ponto do prefixo custaria mais
  # que perder um intermediario.
  defp pontos_disponiveis(_mensagens), do: max(@maximo_de_pontos - 2, 0)

  defp marcar_mensagem(%{content: conteudo} = mensagem) when is_binary(conteudo) do
    %{
      mensagem
      | content: [
          %{type: "text", text: conteudo, cache_control: %{type: "ephemeral", ttl: "1h"}}
        ]
    }
  end

  defp marcar_mensagem(%{content: conteudo} = mensagem) when is_list(conteudo) do
    %{mensagem | content: marcar_ultimo(conteudo)}
  end

  defp marcar_mensagem(mensagem), do: mensagem

  defp pedir(corpo, opcoes) do
    requisicao =
      [
        url: @url,
        json: corpo,
        headers: cabecalhos(),
        receive_timeout: Keyword.get(opcoes, :prazo, 600_000)
      ]
      |> Keyword.merge(Keyword.take(opcoes, [:plug, :req]))
      |> Req.new()

    Req.post(requisicao)
  end

  # A credencial e lida SO AQUI, e so no momento da chamada. Nenhum outro modulo da fabrica
  # a le — ha teste do marco da v0.1 travando a exclusividade.
  defp cabecalhos do
    [
      {"x-api-key", System.get_env("ANTHROPIC_API_KEY") || ""},
      {"anthropic-version", @versao},
      {"content-type", "application/json"}
    ]
  end

  defp traduzir(%{"content" => conteudo} = resposta) do
    %Resposta{
      blocos: Enum.map(conteudo, &traduzir_bloco/1),
      motivo_parada: motivo_parada(resposta["stop_reason"]),
      consumo: consumo(resposta["usage"] || %{})
    }
  end

  defp traduzir(_outra), do: %Resposta{blocos: [], motivo_parada: :recusa, consumo: %Consumo{}}

  defp traduzir_bloco(%{"type" => "text", "text" => texto}), do: %{tipo: :texto, texto: texto}

  defp traduzir_bloco(%{"type" => "tool_use"} = bloco) do
    %{
      tipo: :uso_de_ferramenta,
      id: bloco["id"],
      nome: bloco["name"],
      argumentos: bloco["input"] || %{}
    }
  end

  defp traduzir_bloco(outro), do: %{tipo: :desconhecido, bruto: outro}

  defp motivo_parada("tool_use"), do: :uso_de_ferramenta
  defp motivo_parada("max_tokens"), do: :teto_de_tokens
  defp motivo_parada("refusal"), do: :recusa
  defp motivo_parada(_), do: :fim_do_turno

  defp consumo(uso) do
    %Consumo{
      tokens_entrada: numero(uso["input_tokens"]),
      tokens_cache_escrita: numero(uso["cache_creation_input_tokens"]),
      tokens_cache_leitura: numero(uso["cache_read_input_tokens"]),
      tokens_saida: numero(uso["output_tokens"]),
      # Diferente do CLI, AQUI o TTL e sabido: fomos nos que o pedimos.
      ttl_cache: :uma_hora
    }
  end

  defp numero(valor) when is_integer(valor), do: valor
  defp numero(_), do: 0

  defp reabre_em(%{"error" => %{"resets_at" => valor}}) when is_binary(valor) do
    case DateTime.from_iso8601(valor) do
      {:ok, quando, _} -> quando
      _ -> nil
    end
  end

  defp reabre_em(_corpo), do: nil
end
