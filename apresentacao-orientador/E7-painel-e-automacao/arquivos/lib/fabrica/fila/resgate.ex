defmodule Fabrica.Fila.Resgate do
  @moduledoc """
  Devolve a `available`, sem intervencao, todo trabalho preso em `executing` porque o
  no caiu no meio da execucao (T-037).

  ## Por que nao `Oban.Lifeline`

  O `Oban.Lifeline` de fabrica faz a mesma varredura por tempo, mas quando o job preso ja
  esgotou as tentativas (`attempt >= max_attempts`) ele marca `discarded` em vez de
  `available` — a decisao certa para o caso comum, onde `max_attempts > 1` e um job parado
  em `executing` pode genuinamente ter falhado `max_attempts` vezes.

  Aqui `max_attempts: 1` de proposito (ver `Fabrica.Fila.Trabalho`), e o motor do Oban
  incrementa `attempt` no FETCH, antes de `perform/1` rodar — um job que trava em
  `executing` por o no ter caido tem `attempt == max_attempts` sempre, mesmo sem
  `perform/1` jamais ter chegado a executar ou falhar. Sob a heuristica do `Lifeline`,
  TODO resgate desta fabrica seria lido como "esgotou as tentativas" e descartado — o
  oposto do que a T-037 pede.

  A distincao que falta ao `Lifeline` nao falta aqui: uma falha DE VERDADE (`perform/1`
  levantou excecao ou devolveu `{:error, _}`) e reportada pelo proprio executor e MUDA o
  estado imediatamente (para `discarded`, com `max_attempts: 1`) — nunca fica parada em
  `executing`. Uma linha ainda em `executing` depois do prazo so pode significar que o
  processo morreu antes de reportar; por isso resgatar sempre para `available` (e nao
  para `discarded` por causa da contagem de tentativas) esta correto aqui, mesmo com
  `max_attempts: 1`.

  Zera `attempt` no resgate: sem isso, a proxima busca (`attempt < max_attempts`) nunca
  encontraria a linha de volta, porque o FETCH que travou ja havia consumido a unica
  tentativa permitida.
  """

  @behaviour Oban.Plugin

  use GenServer

  require Ecto.Query

  alias Oban.{Job, Peer, Period, Repo}

  defstruct [:conf, :timer, interval: :timer.minutes(1), rescue_after: :timer.minutes(60)]

  @impl Oban.Plugin
  def start_link(opts) do
    {name, opts} = Keyword.pop(opts, :name)

    state = struct!(__MODULE__, opts)

    state = %{
      state
      | interval: Period.to_milliseconds(state.interval),
        rescue_after: Period.to_milliseconds(state.rescue_after)
    }

    GenServer.start_link(__MODULE__, state, name: name)
  end

  @impl Oban.Plugin
  def validate(_opts), do: :ok

  @impl GenServer
  def init(state), do: {:ok, schedule_rescue(state)}

  @impl GenServer
  def terminate(_reason, %__MODULE__{timer: timer}) do
    cancelar_timer(timer)
    :ok
  end

  # Retorno de `Process.cancel_timer/1` descartado de proposito: `terminate/2` so quer
  # garantir que o timer nao dispare depois do processo morrer, nunca le quanto faltava.
  # Devolver sempre `:ok` evita o `unmatched_return` sem precisar de `_ =` no chamador.
  defp cancelar_timer(timer) when is_reference(timer) do
    _ = Process.cancel_timer(timer)
    :ok
  end

  defp cancelar_timer(_timer), do: :ok

  @impl GenServer
  def handle_info(:rescue, %__MODULE__{} = state) do
    if Peer.leader?(state.conf), do: rescue_jobs(state)

    {:noreply, schedule_rescue(state)}
  end

  defp rescue_jobs(%__MODULE__{conf: conf, rescue_after: rescue_after}) do
    cut = DateTime.add(DateTime.utc_now(), -rescue_after, :millisecond)

    query =
      Job
      |> Ecto.Query.where([j], j.state == "executing" and j.attempted_at < ^cut)

    Repo.update_all(conf, query, set: [state: "available"], inc: [attempt: -1])
  end

  defp schedule_rescue(state) do
    %{state | timer: Process.send_after(self(), :rescue, state.interval)}
  end
end
