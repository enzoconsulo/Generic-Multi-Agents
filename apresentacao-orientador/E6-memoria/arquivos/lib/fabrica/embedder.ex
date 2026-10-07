defmodule Fabrica.Embedder do
  @moduledoc """
  O contrato de vetorizacao — a mesma doutrina do operario, e pelo mesmo motivo economico.

  O modelo de embedding local e a UNICA peca pesada do desenho inteiro (centenas de MB a
  GB), e o perfil alvo declarado da v2 e **8 GB de RAM**. Por isso o embedding e adaptador,
  e por isso NENHUMA versao anterior a v0.5 carrega modelo nenhum:

    * `Fabrica.Embedder.Falso` — vetores deterministicos por hash (v0.1). E o que a suite
      usa para sempre;
    * `Fabrica.Embedder.Ollama` — modelo local pelo Ollama (`embeddinggemma`), o adaptador
      DECIDIDO por medicao (`_gestao/DECISOES.md`, D-004): sem chave, sem fatura;
    * `Fabrica.Embedder.Servico` — uma chamada HTTP a um servico pago devolve o vetor; existe
      e esta provado, mas fica sem configuracao enquanto a D-002 (sem credencial de API)
      valer;
    * `Fabrica.Embedder.Local` — Bumblebee no proprio no. A D-001 mediu que o EXLA nao tem
      binario para Windows e que o fallback interpretado nao completa nem 10 trechos; por
      isso fica OPCIONAL, atras de `FABRICA_EMBEDDER_LOCAL=1`.

  Qual adaptador e o padrao ja foi decidido por medicao (D-001, D-004) — nao ha mais uma
  escolha em aberto aqui.

  ## Sempre em lote

  `vetorizar/1` recebe uma LISTA. A ingestao da v0.5 vetoriza a historia inteira do projeto
  ao commitar; uma API de um-por-vez tornaria isso lento por desenho, e a diferenca entre
  uma chamada de rede e mil e a conta toda.

  ## Documento x consulta (D-005, T-063)

  `embeddinggemma` (o adaptador `Ollama`) exige um prefixo diferente para texto que vira
  DOCUMENTO indexado e para texto que e uma CONSULTA de busca — sem o prefixo certo, a
  qualidade medida na D-004 nao se reproduz. `vetorizar/1` e sempre o caminho de documento
  (o caso de longe mais comum: a ingestao vetoriza a historia do projeto). O caminho de
  consulta e o callback OPCIONAL `vetorizar_consulta/1`: `Falso`, `Servico` e `Local` nao tem
  prefixo nenhum e nao precisam implementa-lo — a fachada `vetorizar_consulta/2` cai em
  `vetorizar/1` quando o adaptador configurado nao o exporta.
  """

  @doc """
  Vetoriza um lote de textos. A ordem da saida acompanha a da entrada, sempre.

  Todos os vetores tem exatamente `dimensoes/0` posicoes.
  """
  @callback vetorizar(textos :: [String.t()]) :: {:ok, [[float()]]} | {:erro, term()}

  @doc "Quantas posicoes tem cada vetor deste adaptador."
  @callback dimensoes() :: pos_integer()

  @doc """
  Vetoriza um lote de CONSULTAS de busca — mesma forma de `vetorizar/1`, mas aplicando o
  prefixo de tipo CONSULTA em vez de DOCUMENTO, para adaptadores que distinguem os dois (ver
  a secao "Documento x consulta" do `@moduledoc`).

  Callback OPCIONAL: um adaptador sem prefixo por tipo nao precisa implementa-lo — a fachada
  `Fabrica.Embedder.vetorizar_consulta/2` cai em `vetorizar/1` quando ele nao existe.
  """
  @callback vetorizar_consulta(textos :: [String.t()]) :: {:ok, [[float()]]} | {:erro, term()}

  @optional_callbacks vetorizar_consulta: 1

  @doc "O embedder configurado, ou o `Falso` — que e o default e o que a suite usa."
  @spec configurado() :: module()
  def configurado do
    Application.get_env(:fabrica, :embedder, Fabrica.Embedder.Falso)
  end

  @doc "Vetoriza com o embedder configurado."
  @spec vetorizar([String.t()]) :: {:ok, [[float()]]} | {:erro, term()}
  def vetorizar(textos), do: configurado().vetorizar(textos)

  @doc "As dimensoes do embedder configurado."
  @spec dimensoes() :: pos_integer()
  def dimensoes, do: configurado().dimensoes()

  @doc """
  Vetoriza uma consulta de busca com `embedder` (o padrao e `configurado/0`). Usa o callback
  OPCIONAL `vetorizar_consulta/1` do adaptador quando ele o exporta, e cai em `vetorizar/1`
  quando nao — o caso de `Falso`, `Servico` e `Local`, que nao distinguem tipo de texto.

  `Code.ensure_loaded?/1` roda ANTES de `function_exported?/3`: sem ele, `function_exported?/3`
  mente para um modulo ainda nao carregado — e em `test` o codigo carrega sob demanda, entao
  isto nao e zelo teorico.
  """
  @spec vetorizar_consulta([String.t()], module()) :: {:ok, [[float()]]} | {:erro, term()}
  def vetorizar_consulta(textos, embedder \\ configurado()) do
    if Code.ensure_loaded?(embedder) and function_exported?(embedder, :vetorizar_consulta, 1) do
      embedder.vetorizar_consulta(textos)
    else
      embedder.vetorizar(textos)
    end
  end
end
