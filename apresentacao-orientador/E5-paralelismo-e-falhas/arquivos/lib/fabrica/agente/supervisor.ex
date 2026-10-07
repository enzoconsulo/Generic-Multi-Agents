defmodule Fabrica.Agente.Supervisor do
  @moduledoc """
  A arvore de supervisao dos agentes em voo, enderecados por `{:agente, tarefa_id}`.

  E o mapeamento que decide a escolha de Elixir para esta fabrica: "agente vira processo
  supervisionado". Um agente deixa de ser uma execucao solta que ninguem vigia e passa a ter
  endereco (`Registry`), dono (`DynamicSupervisor`, estrategia `:one_for_one` — a morte de um
  agente nao toca os outros) e alguem que PERCEBE quando ele morre.

  ## O estado NAO vive aqui

  O processo pode morrer a qualquer instante sem que nada se perca, porque o estado do
  trabalho esta no banco (`Fabrica.Tarefas`), nunca no `state` deste GenServer. O que este
  modulo guarda e so o necessario para vigiar: referencia de monitor -> tarefa e callback.

  ## Por que nao reiniciar cegamente

  `DynamicSupervisor` reiniciaria o MESMO MFA, do zero — um agente novo sem nenhuma memoria da
  conversa que estava tendo, cobrando de novo o que ja tinha sido gasto. Por isso os filhos
  sobem com `restart: :temporary`: NINGUEM aqui reinicia sozinho. Ao perceber a morte, o unico
  trabalho deste modulo e chamar `opcoes[:ao_morrer]` com `(tarefa_id, motivo)` — devolver a
  tarefa a fila (ou nao) e decisao de quem despachou, nunca deste supervisor.

  ## Por que a morte e vista mesmo com `Process.exit(pid, :kill)`

  `terminate/2` de um `GenServer` NAO roda numa morte por `:kill` — o sinal e intratavel e
  pula o callback. Por isso quem descobre a morte aqui nao e o proprio agente terminando: e
  este processo MONITORANDO cada filho com `Process.monitor/1` e recebendo `:DOWN`, que
  dispara para qualquer motivo, `:kill` incluido.

  ## Por que o `Registry` e povoado pelo PROPRIO agente

  Cada agente registra a si mesmo (`Fabrica.Agente.Supervisor.Executor.init/1`) em vez de ser
  registrado por este modulo em nome dele. Uma entrada de `Registry` esta ligada ao ciclo de
  vida de quem a criou — se este supervisor a criasse EM NOME do filho, ela sobreviveria a
  morte dele ate alguem lembrar de limpar. Registrada pelo proprio filho, ela some sozinha
  quando ele morre, por qualquer motivo.
  """

  use GenServer

  require Logger

  alias Fabrica.Agente.Supervisor.Executor

  @registro Fabrica.Agente.Supervisor.Registro

  @doc "O nome do `Registry` usado para enderecar agentes por `{:agente, tarefa_id}`."
  @spec registro() :: atom()
  def registro, do: @registro

  def start_link(opcoes \\ []) do
    GenServer.start_link(__MODULE__, opcoes, name: __MODULE__)
  end

  @doc """
  Sobe um agente sob supervisao, enderecado por `{:agente, tarefa_id}`.

  `funcao` e a zero-aridade que faz o trabalho de verdade (ex.: `fn -> Agente.Laco.rodar(...)
  end`) e roda DEPOIS do `init/1` do filho retornar — subir o agente nunca bloqueia quem
  despacha.

  ## Opcoes

    * `:ao_morrer` — `(tarefa_id, motivo -> any())`, chamado quando o agente morre por motivo
      diferente de `:normal`. Sem ela, a morte so vira aviso no log.
  """
  @spec iniciar(term(), atom(), (-> any()), keyword()) :: {:ok, pid()} | {:error, term()}
  def iniciar(tarefa_id, papel, funcao, opcoes \\ []) when is_function(funcao, 0) do
    GenServer.call(__MODULE__, {:iniciar, tarefa_id, papel, funcao, opcoes})
  end

  @doc """
  Os agentes em voo agora — tarefa e papel de cada um, lidos do `Registry`.

  Filtra por `Process.alive?/1` antes de devolver. A remocao de uma entrada do `Registry` roda
  no monitor INTERNO dele, um processo separado do `Process.monitor/1` que este `Supervisor`
  mantem para disparar `:ao_morrer` — as duas mensagens `:DOWN` vao para processos diferentes, e
  Erlang so garante ordem de entrega entre o MESMO par emissor/receptor. Sem este filtro, uma
  chamada a `listar/0` logo apos `:ao_morrer` disparar pode ainda achar a entrada no Registry
  (o monitor dele nao rodou) e devolver um agente fantasma, ja morto.
  """
  @spec listar() :: [%{tarefa_id: term(), papel: atom(), pid: pid()}]
  def listar do
    @registro
    |> Registry.select([{{:"$1", :"$2", :"$3"}, [], [{{:"$1", :"$2", :"$3"}}]}])
    |> Enum.filter(fn {_chave, pid, _papel} -> Process.alive?(pid) end)
    |> Enum.map(fn {{:agente, tarefa_id}, pid, papel} ->
      %{tarefa_id: tarefa_id, papel: papel, pid: pid}
    end)
  end

  @doc "Mata o agente da tarefa, se houver um em voo agora."
  @spec encerrar(term()) :: :ok | {:error, :nao_encontrado}
  def encerrar(tarefa_id) do
    case Registry.lookup(@registro, {:agente, tarefa_id}) do
      [{pid, _papel}] ->
        Process.exit(pid, :encerrado_pelo_supervisor)
        :ok

      [] ->
        {:error, :nao_encontrado}
    end
  end

  @impl GenServer
  def init(_opcoes) do
    {:ok, sup} = DynamicSupervisor.start_link(strategy: :one_for_one)
    {:ok, %{sup: sup, monitores: %{}}}
  end

  @impl GenServer
  def handle_call({:iniciar, tarefa_id, papel, funcao, opcoes}, _de, estado) do
    especificacao = %{
      id: Executor,
      start: {Executor, :start_link, [{@registro, tarefa_id, papel, funcao}]},
      restart: :temporary
    }

    case DynamicSupervisor.start_child(estado.sup, especificacao) do
      {:ok, pid} ->
        # O monitor tem de existir ANTES de o filho comecar a rodar `funcao` — senao uma
        # funcao rapida (ou que ja morre) poderia terminar entre o `start_child` devolver e
        # este `Process.monitor` rodar, e o `:DOWN` chegaria como `:noproc`, sem o motivo
        # real. Por isso o `Executor` so roda depois de receber `:pode_rodar`, mandado
        # daqui, DEPOIS de o monitor ja estar de pe.
        referencia = Process.monitor(pid)
        send(pid, :pode_rodar)
        ao_morrer = Keyword.get(opcoes, :ao_morrer, &registrar_morte/2)
        monitores = Map.put(estado.monitores, referencia, {tarefa_id, ao_morrer})
        {:reply, {:ok, pid}, %{estado | monitores: monitores}}

      erro ->
        {:reply, erro, estado}
    end
  end

  @impl GenServer
  def handle_info({:DOWN, referencia, :process, _pid, motivo}, estado) do
    case Map.pop(estado.monitores, referencia) do
      {nil, monitores} ->
        {:noreply, %{estado | monitores: monitores}}

      {{_tarefa_id, _ao_morrer}, monitores} when motivo == :normal ->
        {:noreply, %{estado | monitores: monitores}}

      {{tarefa_id, ao_morrer}, monitores} ->
        ao_morrer.(tarefa_id, motivo)
        {:noreply, %{estado | monitores: monitores}}
    end
  end

  defp registrar_morte(tarefa_id, motivo) do
    Logger.warning(
      "agente da tarefa #{inspect(tarefa_id)} morreu (#{inspect(motivo)}) — devolvida a fila, sem reiniciar a conversa"
    )
  end

  defmodule Executor do
    @moduledoc false

    # O agente individual: registra a SI MESMO no Registry (ver o @moduledoc do Supervisor
    # sobre por que quem registra e o proprio filho) e so roda a funcao recebida depois de
    # receber `:pode_rodar` — mandado pelo Supervisor so DEPOIS de montar o monitor, para
    # nenhuma morte escapar sem motivo (ver o @moduledoc do Supervisor).

    use GenServer

    def start_link({registro, tarefa_id, papel, funcao}) do
      GenServer.start_link(__MODULE__, {registro, tarefa_id, papel, funcao})
    end

    @impl GenServer
    def init({registro, tarefa_id, papel, funcao}) do
      {:ok, _proprio} = Registry.register(registro, {:agente, tarefa_id}, papel)
      {:ok, funcao}
    end

    @impl GenServer
    def handle_info(:pode_rodar, funcao) do
      resultado = funcao.()
      {:stop, :normal, resultado}
    end
  end
end
