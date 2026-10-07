defmodule Fabrica.Custo.Consumo do
  @moduledoc """
  A ponte entre o consumo que o operario RELATA e a linha que o banco GRAVA.

  Existem tres coisas com o nome "consumo" nesta fabrica, e elas sao diferentes de
  proposito:

    * `Fabrica.Operario.Consumo` — o que o adaptador devolve numa volta. Fica na fronteira
      do fornecedor e nao sabe nada de banco;
    * `Fabrica.Tarefas.Consumo` — o schema Ecto, uma linha por volta;
    * **este modulo** — a conversao entre os dois, e a soma. Nao define struct nenhuma:
      uma quarta forma do mesmo dado so criaria um lugar a mais para os numeros divergirem.

  Por que a conversao merece um modulo: e aqui que as **duas unidades** entram na linha do
  banco. O operario nao calcula preco (nao e trabalho dele saber a tabela), e o schema nao
  calcula nada (e so forma). O calculo mora num lugar so.
  """

  alias Fabrica.Custo.Precos
  alias Fabrica.Operario.Consumo, as: Relatado

  @doc """
  Converte o consumo relatado numa volta nos atributos da linha de `consumos`.

  `volta` e `despacho_id` vem de fora porque sao do SISTEMA, nao do relato — o agente nao
  numera a propria volta, pela mesma razao que nao escreve o proprio status.
  """
  @spec para_registro(String.t(), Relatado.t(), keyword()) ::
          {:ok, map()} | {:erro, :modelo_sem_preco}
  def para_registro(modelo, %Relatado{} = relatado, opcoes) do
    with {:ok, reparticao} <- Precos.estimar(modelo, relatado) do
      {:ok,
       %{
         despacho_id: Keyword.fetch!(opcoes, :despacho_id),
         volta: Keyword.fetch!(opcoes, :volta),
         tokens_entrada: relatado.tokens_entrada,
         tokens_cache_escrita: relatado.tokens_cache_escrita,
         tokens_cache_leitura: relatado.tokens_cache_leitura,
         tokens_saida: relatado.tokens_saida,
         custo_usd: Decimal.from_float(reparticao.total_usd),
         cota_unidades: Decimal.from_float(reparticao.cota_unidades),
         duracao_ms: relatado.duracao_ms
       }}
    end
  end

  @doc """
  Soma os tokens de um conjunto de voltas, sem tocar em preco.

  Serve para as perguntas que nao dependem da tabela — "quantos tokens esta tarefa leu de
  cache?" — e continua valendo mesmo que o preco mude.
  """
  @spec somar_tokens([Relatado.t()]) :: %{
          tokens_entrada: non_neg_integer(),
          tokens_cache_escrita: non_neg_integer(),
          tokens_cache_leitura: non_neg_integer(),
          tokens_saida: non_neg_integer(),
          voltas: non_neg_integer()
        }
  def somar_tokens(relatados) do
    zerado = %{
      tokens_entrada: 0,
      tokens_cache_escrita: 0,
      tokens_cache_leitura: 0,
      tokens_saida: 0,
      voltas: 0
    }

    Enum.reduce(relatados, zerado, fn %Relatado{} = r, acumulado ->
      %{
        tokens_entrada: acumulado.tokens_entrada + r.tokens_entrada,
        tokens_cache_escrita: acumulado.tokens_cache_escrita + r.tokens_cache_escrita,
        tokens_cache_leitura: acumulado.tokens_cache_leitura + r.tokens_cache_leitura,
        tokens_saida: acumulado.tokens_saida + r.tokens_saida,
        voltas: acumulado.voltas + 1
      }
    end)
  end

  @doc """
  A razao leitura : escrita de cache — o numero que resume se o cache esta trabalhando.

  Na v1 ela e **14:1**, e e por isso que ~80% da economia ja esta colhida. Se esta razao
  cair na v2, o prefixo deixou de ser estavel em algum lugar, e e sinal de regressao mesmo
  que nenhum teste falhe.
  """
  @spec razao_cache([Relatado.t()]) :: float() | nil
  def razao_cache(relatados) do
    soma = somar_tokens(relatados)

    case soma.tokens_cache_escrita do
      0 -> nil
      escrita -> Float.round(soma.tokens_cache_leitura / escrita, 2)
    end
  end
end
