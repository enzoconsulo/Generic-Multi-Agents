defmodule Fabrica.Embedder do
  @moduledoc """
  O contrato de vetorizacao — a mesma doutrina do operario, e pelo mesmo motivo economico.

  O modelo de embedding local e a UNICA peca pesada do desenho inteiro (centenas de MB a
  GB), e o perfil alvo declarado da v2 e **8 GB de RAM**. Por isso o embedding e adaptador,
  e por isso NENHUMA versao anterior a v0.5 carrega modelo nenhum:

    * `Fabrica.Embedder.Falso` — vetores deterministicos por hash (v0.1). E o que a suite
      usa para sempre;
    * `Fabrica.Embedder.Servico` — uma chamada HTTP devolve o vetor (T-045);
    * `Fabrica.Embedder.Local` — Bumblebee no proprio no (T-045), **se** a medicao da T-042
      mostrar que cabe.

  Qual dos dois reais vira o padrao se decide COM MEDICAO na T-042 — disco, memoria
  residente e tempo por 1.000 trechos —, nunca por palpite.

  ## Sempre em lote

  `vetorizar/1` recebe uma LISTA. A ingestao da v0.5 vetoriza a historia inteira do projeto
  ao commitar; uma API de um-por-vez tornaria isso lento por desenho, e a diferenca entre
  uma chamada de rede e mil e a conta toda.
  """

  @doc """
  Vetoriza um lote de textos. A ordem da saida acompanha a da entrada, sempre.

  Todos os vetores tem exatamente `dimensoes/0` posicoes.
  """
  @callback vetorizar(textos :: [String.t()]) :: {:ok, [[float()]]} | {:erro, term()}

  @doc "Quantas posicoes tem cada vetor deste adaptador."
  @callback dimensoes() :: pos_integer()

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
end
