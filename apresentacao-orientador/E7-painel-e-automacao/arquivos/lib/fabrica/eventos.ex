defmodule Fabrica.Eventos do
  @moduledoc """
  O barramento de eventos do motor.

  Cada despacho conta o que fez pelo proprio caminho de execucao — inicio, volta, fim,
  transicao de tarefa, parede e rearme de cota — via `:telemetry.execute/3`. A tela assina
  (`assinar/0`) e recebe cada evento sem tocar o motor: "a contabilidade nao depende de
  alguem lembrar de gravar".

  ## Por que evento por VOLTA, e nao por despacho

  Na v1 a contabilidade so gravava no FIM do despacho. Um job cortado no meio — o `claude`
  matado por teto, ou por queda de rede — nunca emitia o evento final, e o painel marcava
  US$ 0,00 justamente nos jobs mais caros: o que ja tinha sido gasto sumia junto com o
  processo. Aqui `despacho_volta/2` e o que `Fabrica.Agente.Laco` chama a CADA volta, junto
  com a gravacao do consumo em banco — o que ja gastou fica registrado mesmo que a volta
  seguinte nunca aconteca.

  ## Os eventos, no minimo

  | evento | quando | leva no minimo |
  |---|---|---|
  | `[:fabrica, :despacho, :inicio]` | um despacho comeca | `:tarefa_id`, `:papel`, `:modelo` |
  | `[:fabrica, :despacho, :volta]` | cada volta do laco | `:tarefa_id`, `:volta` nos metadados; a reparticao de cache (`:tokens_entrada`, `:tokens_cache_escrita`, `:tokens_cache_leitura`, `:tokens_saida`) e `:custo_usd` nas medidas |
  | `[:fabrica, :despacho, :fim]` | o laco encerra | `:tarefa_id`, `:desfecho`, `:voltas`, `:gasto_usd` |
  | `[:fabrica, :tarefa, :transicao]` | uma tarefa muda de estado | `:tarefa_id`, `:de`, `:para` |
  | `[:fabrica, :cota, :parede]` | a cota da assinatura bate | `:reabre_em` |
  | `[:fabrica, :cota, :rearme]` | a fabrica volta a despachar depois de uma parede | — |

  Estes campos sao contrato de USO, e nao um `@enforce_keys`: `:telemetry` nao valida forma
  de medida nem de metadado, e impor uma struct aqui obrigaria todo emissor a conhecer um
  tipo deste modulo antes mesmo de o dado existir (varios dos emissores acima — a parede de
  cota, o despacho de verdade — ainda nao tem chamador nesta versao). Quem le, na ponta que
  assina, e que decide o que exigir.

  ## Medidas vs. metadados

  `:telemetry.execute/3` separa os dois de proposito, e este modulo preserva a separacao:
  **medidas** sao numeros que um agregador de metricas soma ou tira media (tokens, custo,
  duracao); **metadados** sao o resto — quem, o que, por que. `despacho_volta/2` e o unico
  evento com medidas de verdade; os outros usam metadados sozinhos.
  """

  @topico "fabrica:eventos"

  @typedoc "O nome de um evento: a lista de atomos que o `:telemetry` usa para casar handlers."
  @type nome :: [atom(), ...]

  @doc "O topico do Phoenix.PubSub em que os eventos chegam ja repassados por `Fabrica.Telemetria`."
  @spec topico() :: String.t()
  def topico, do: @topico

  @doc """
  Assina o barramento: o processo chamador passa a receber, por mensagem,

      {:fabrica, nome_do_evento, medidas, metadados}

  um por evento emitido, na ordem em que foram emitidos.
  """
  @spec assinar() :: :ok | {:error, term()}
  def assinar do
    Phoenix.PubSub.subscribe(Fabrica.PubSub, @topico)
  end

  @doc "Emite um evento cru. As funcoes nomeadas abaixo sao a forma preferida de chamar isto."
  @spec emitir(nome(), map(), map()) :: :ok
  def emitir(nome, medidas \\ %{}, metadados \\ %{}) do
    :telemetry.execute(nome, medidas, metadados)
  end

  @doc "Um despacho comeca. `metadados` no minimo: `:tarefa_id`, `:papel`, `:modelo`."
  @spec despacho_inicio(map()) :: :ok
  def despacho_inicio(metadados), do: emitir([:fabrica, :despacho, :inicio], %{}, metadados)

  @doc """
  Uma volta do laco terminou.

  `medidas` carrega a reparticao de cache — o numero que decide o desenho da v2, e nao um
  total: `:tokens_entrada`, `:tokens_cache_escrita`, `:tokens_cache_leitura`,
  `:tokens_saida`, `:custo_usd`. `metadados` identifica QUAL despacho e QUAL volta:
  `:tarefa_id`, `:volta`.
  """
  @spec despacho_volta(map(), map()) :: :ok
  def despacho_volta(medidas, metadados) do
    emitir([:fabrica, :despacho, :volta], medidas, metadados)
  end

  @doc "O laco encerrou. `metadados` no minimo: `:tarefa_id`, `:desfecho`, `:voltas`, `:gasto_usd`."
  @spec despacho_fim(map()) :: :ok
  def despacho_fim(metadados), do: emitir([:fabrica, :despacho, :fim], %{}, metadados)

  @doc "Uma tarefa mudou de estado. `metadados` no minimo: `:tarefa_id`, `:de`, `:para`."
  @spec tarefa_transicao(map()) :: :ok
  def tarefa_transicao(metadados), do: emitir([:fabrica, :tarefa, :transicao], %{}, metadados)

  @doc "A cota da assinatura bateu a parede. `metadados` no minimo: `:reabre_em`."
  @spec cota_parede(map()) :: :ok
  def cota_parede(metadados), do: emitir([:fabrica, :cota, :parede], %{}, metadados)

  @doc "A fabrica rearmou depois de uma parede de cota."
  @spec cota_rearme(map()) :: :ok
  def cota_rearme(metadados \\ %{}), do: emitir([:fabrica, :cota, :rearme], %{}, metadados)
end
