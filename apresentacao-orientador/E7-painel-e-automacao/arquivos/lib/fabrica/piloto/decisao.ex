defmodule Fabrica.Piloto.Decisao do
  @moduledoc """
  A tabela de decisao do piloto automatico: continua, dorme ou para — pura e testavel.

  Porte de `jobs/piloto/decisao.ts` da v1. Modulo puro: sem banco, sem processo, sem
  `Process.send_after`. Quem chama (`Fabrica.Piloto.Servidor`, T-055) consulta isto **so
  ENTRE rodadas** — depois que uma termina, antes de a proxima comecar. Nao ha aqui parametro
  nenhum que descreva "rodada em andamento agora": e assim que o codigo prova a doutrina
  "desligar nao corta o que esta em voo" (mesma tecnica de `Fabrica.Orcamento`, que prova
  "o teto nao interrompe" pela ausencia de um parametro equivalente).

  ## Os dois freios obrigatorios

  `ligar/2` exige os dois, sempre: **teto de gasto acumulado** (dinheiro) e **maximo de
  rodadas** (ciclos). Faltando um dos dois, o piloto recusa ligar — nao ha piloto automatico
  sem limite duplo declarado antes da primeira rodada.

  ## A ORDEM de `decidir/1` e a propria regra

  Leia esta lista antes de inserir um ramo no meio: uma condicao fora de ordem muda o
  comportamento sem que nenhum teste isolado acuse — cada teste prova o SEU ramo, nao a
  posicao relativa entre eles.

  1. **desligado** — o usuario pediu para parar. Vence tudo, inclusive a cota: nao faz
     sentido agendar rearme de um piloto que nao vai rodar de novo.
  2. **cota batida** — a UNICA nao-parada: dorme e rearma na hora anunciada (`nil` quando a
     hora nao veio — quem rearma decide o recuo, T-055/`Fabrica.Cota`). Checada logo depois
     do desligamento e ANTES de qualquer motivo de parada abaixo, de proposito: bater a cota
     faz a rodada nao concluir nada, e sem esta prioridade isso seria mal-classificado como
     estagnacao ou como falha.
  3. **acabou tarefa pronta** — nao ha mais o que fazer; fim de trabalho, nao falha.
  4. **pediu replanejamento** — uma tarefa saiu do tamanho certo; quem decide o novo tamanho
     e o planejador, nao o piloto.
  5. **duas rodadas seguidas sem concluir nada** — sinal de giro sem producao, mesmo sem
     nenhum erro isolado explicito.
  6. **falha** — um erro que a rodada nao sabe absorver sozinha.
  7. **teto de gasto acumulado atingido** — o freio obrigatorio de dinheiro, agora aplicado.
  8. **maximo de rodadas atingido** — o freio obrigatorio de ciclos, agora aplicado.
  """

  @typedoc "Por que o piloto parou."
  @type motivo_parada ::
          :desligado
          | :sem_tarefa_pronta
          | :replanejamento
          | :estagnado
          | :falha
          | :teto_de_gasto
          | :maximo_de_rodadas

  @typedoc "Continua, dorme ate um horario (`nil` = horario nao veio), ou para com um motivo."
  @type decisao :: :continuar | {:dormir, DateTime.t() | nil} | {:parar, motivo_parada()}

  @typedoc "O que se sabe da cota agora — mesmo formato de `Fabrica.Cota.estado/1`."
  @type cota :: %{batida?: boolean(), reabre_em: DateTime.t() | nil}

  @typedoc "O que se sabe no instante em que uma rodada termina e a proxima ainda nao comecou."
  @type situacao :: %{
          ligado?: boolean(),
          teto_de_gasto: number(),
          maximo_de_rodadas: pos_integer(),
          gasto_acumulado: number(),
          rodadas_feitas: non_neg_integer(),
          rodadas_seguidas_sem_concluir: non_neg_integer(),
          ha_tarefa_pronta?: boolean(),
          pediu_replanejamento?: boolean(),
          falhou?: boolean(),
          cota: cota()
        }

  @rodadas_sem_concluir_para_estagnar 2

  @doc "Quantas rodadas seguidas sem concluir nada configuram estagnacao. Duas, por definicao da tarefa."
  @spec rodadas_sem_concluir_para_estagnar() :: pos_integer()
  def rodadas_sem_concluir_para_estagnar, do: @rodadas_sem_concluir_para_estagnar

  @doc """
  Liga o piloto, com os dois freios OBRIGATORIOS. Sem um deles (ou com um numero que nao e um
  teto de verdade — zero ou negativo), recusa e diz qual falta.

  ## Exemplos

      iex> Fabrica.Piloto.Decisao.ligar(50.0, 20)
      {:ok, %{teto_de_gasto: 50.0, maximo_de_rodadas: 20}}

      iex> Fabrica.Piloto.Decisao.ligar(nil, 20)
      {:erro, [:sem_teto_de_gasto]}

      iex> Fabrica.Piloto.Decisao.ligar(nil, nil)
      {:erro, [:sem_teto_de_gasto, :sem_maximo_de_rodadas]}
  """
  @spec ligar(number() | nil, pos_integer() | nil) ::
          {:ok, %{teto_de_gasto: number(), maximo_de_rodadas: pos_integer()}}
          | {:erro, [:sem_teto_de_gasto | :sem_maximo_de_rodadas, ...]}
  def ligar(teto_de_gasto, maximo_de_rodadas) do
    faltando =
      [{teto_de_gasto, :sem_teto_de_gasto}, {maximo_de_rodadas, :sem_maximo_de_rodadas}]
      |> Enum.filter(fn {numero, _motivo} -> ausente?(numero) end)
      |> Enum.map(fn {_numero, motivo} -> motivo end)

    case faltando do
      [] -> {:ok, %{teto_de_gasto: teto_de_gasto, maximo_de_rodadas: maximo_de_rodadas}}
      motivos -> {:erro, motivos}
    end
  end

  defp ausente?(numero), do: is_nil(numero) or numero <= 0

  @doc """
  A decisao para a PROXIMA rodada. Ver `@moduledoc` para a ordem, que e a propria regra.

  ## Exemplos

      iex> situacao = %{
      ...>   ligado?: true, teto_de_gasto: 50.0, maximo_de_rodadas: 20,
      ...>   gasto_acumulado: 10.0, rodadas_feitas: 3, rodadas_seguidas_sem_concluir: 0,
      ...>   ha_tarefa_pronta?: true, pediu_replanejamento?: false, falhou?: false,
      ...>   cota: %{batida?: false, reabre_em: nil}
      ...> }
      iex> Fabrica.Piloto.Decisao.decidir(situacao)
      :continuar
  """
  @spec decidir(situacao()) :: decisao()
  def decidir(situacao) do
    cond do
      not situacao.ligado? -> {:parar, :desligado}
      situacao.cota.batida? -> {:dormir, situacao.cota.reabre_em}
      true -> avaliar_paradas(situacao)
    end
  end

  # Ramos 3 a 6 do @moduledoc: sinais da propria rodada, na mesma ordem declarada la.
  # Separado de `decidir/1` so para caber no teto de complexidade ciclomatica do credo — a
  # ORDEM entre os dois grupos continua sendo a chamada sequencial abaixo, nao a divisao.
  defp avaliar_paradas(situacao) do
    cond do
      not situacao.ha_tarefa_pronta? ->
        {:parar, :sem_tarefa_pronta}

      situacao.pediu_replanejamento? ->
        {:parar, :replanejamento}

      situacao.rodadas_seguidas_sem_concluir >= @rodadas_sem_concluir_para_estagnar ->
        {:parar, :estagnado}

      situacao.falhou? ->
        {:parar, :falha}

      true ->
        avaliar_freios(situacao)
    end
  end

  # Ramos 7 e 8 do @moduledoc: os dois freios obrigatorios, agora aplicados.
  defp avaliar_freios(situacao) do
    cond do
      situacao.gasto_acumulado >= situacao.teto_de_gasto -> {:parar, :teto_de_gasto}
      situacao.rodadas_feitas >= situacao.maximo_de_rodadas -> {:parar, :maximo_de_rodadas}
      true -> :continuar
    end
  end
end
