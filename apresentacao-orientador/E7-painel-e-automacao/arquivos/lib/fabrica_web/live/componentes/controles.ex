defmodule FabricaWeb.Componentes.Controles do
  @moduledoc """
  Parar e retomar um agente pela tela — a T-053.

  **Nao inventa mecanismo novo: compoe dois ja testados.**

    * **Parar** = `Fabrica.Agente.Supervisor.encerrar/1` (mata o processo supervisionado)
      mais um evento cru (`Fabrica.Eventos.emitir/3`) com o motivo `:cortado_pelo_operador`.
      NUNCA chama `Fabrica.Tarefas.Transicao`: sem transicao de estado, `tentativas` fica
      intocado — e assim que o corte pelo operador nao conta ciclo (criterio da tarefa),
      sem precisar tocar em `Fabrica.Tarefas.Maquina` nem em `Transicao`, que estao fora das
      `areas` desta tarefa.
    * **Retomar** = `Fabrica.Recuperacao.sanear/1`, escopado a UMA tarefa. E o mesmo modulo
      que saneia queda de node (T-040): devolve ao estado anterior quando existe um (ou
      mantem `em_execucao`, ja despachavel, sem transicao) e commita trabalho parcial nas
      `areas` da tarefa ANTES de reenfileirar. Reusar em vez de reescrever preserva o
      comportamento ja coberto por `recuperacao_test.exs` — inclusive o preco documentado
      la (retomar um verificador ou revisor gasta uma tentativa, do mesmo jeito que uma
      reprovacao de verdade; so o `Parar` em si e sempre de graca).

  ## Contrato

  Espera `:id` e `:tarefa_id` nos assigns do `<.live_component>`. Carrega a tarefa (com
  `:areas` e `:projeto`, que `Fabrica.Recuperacao.sanear/1` exige) e o gasto acumulado
  sozinho — o chamador so precisa saber o id.
  """

  use FabricaWeb, :live_component

  import Ecto.Query, only: [from: 2]

  alias Fabrica.Agente.Supervisor, as: AgenteSupervisor
  alias Fabrica.Eventos
  alias Fabrica.Recuperacao
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Tarefa

  @estados_retomaveis [:em_execucao, :em_teste, :em_revisao]

  @impl true
  def update(%{tarefa_id: tarefa_id} = assigns, socket) do
    {:ok,
     socket
     |> assign(assigns)
     |> assign_new(:confirmando?, fn -> false end)
     |> assign_new(:mensagem, fn -> nil end)
     |> recarregar(tarefa_id)}
  end

  @impl true
  def handle_event("pedir_parar", _parametros, socket) do
    {:noreply, assign(socket, confirmando?: true)}
  end

  def handle_event("cancelar_parar", _parametros, socket) do
    {:noreply, assign(socket, confirmando?: false)}
  end

  def handle_event("confirmar_parar", _parametros, socket) do
    tarefa = socket.assigns.tarefa
    _ = AgenteSupervisor.encerrar(tarefa.id)

    # `[:fabrica, :tarefa, :transicao]` — nao `:cortada` — porque so os eventos de
    # `Fabrica.Telemetria.eventos/0` sao repassados ao `Phoenix.PubSub`, e esse arquivo esta
    # fora das `areas` desta tarefa. Sem transicao de estado de verdade, `:de` e `:para` sao
    # o MESMO status — o `:motivo` e o que carrega o fato.
    Eventos.tarefa_transicao(%{
      tarefa_id: tarefa.id,
      de: tarefa.status,
      para: tarefa.status,
      motivo: :cortado_pelo_operador
    })

    {:noreply,
     socket
     |> assign(confirmando?: false, mensagem: "Tarefa cortada — devolvida a fila.")
     |> recarregar(tarefa.id)}
  end

  def handle_event("retomar", _parametros, socket) do
    tarefa = socket.assigns.tarefa
    relatorio = Recuperacao.sanear(tarefas: [tarefa])

    mensagem =
      case relatorio.orfas do
        [achado] -> mensagem_de_retomada(achado)
        [] -> "Nada para retomar — a tarefa ja esta na fila."
      end

    {:noreply, socket |> assign(mensagem: mensagem) |> recarregar(tarefa.id)}
  end

  defp mensagem_de_retomada(%{commit: nil}), do: "Tarefa reenfileirada."

  defp mensagem_de_retomada(%{commit: hash}) do
    "Tarefa reenfileirada — trabalho parcial commitado (#{hash})."
  end

  defp recarregar(socket, tarefa_id) do
    tarefa = Tarefa |> Repo.get!(tarefa_id) |> Repo.preload([:areas, :projeto])
    em_voo? = em_voo?(tarefa_id)

    assign(socket,
      tarefa: tarefa,
      em_voo?: em_voo?,
      gasto_usd: gasto_acumulado(tarefa_id),
      retomavel?: not em_voo? and tarefa.status in @estados_retomaveis
    )
  end

  defp em_voo?(tarefa_id) do
    Enum.any?(AgenteSupervisor.listar(), &(&1.tarefa_id == tarefa_id))
  end

  # POR TAREFA, como em `FabricaWeb.ConsoleLive` — soma sobre ciclos -> despachos ->
  # consumos. E o numero que a confirmacao mostra ANTES de cortar (criterio da tarefa).
  defp gasto_acumulado(tarefa_id) do
    Repo.one(
      from(t in Tarefa,
        join: c in assoc(t, :ciclos),
        join: d in assoc(c, :despachos),
        join: k in assoc(d, :consumos),
        where: t.id == ^tarefa_id,
        select: sum(k.custo_usd)
      )
    ) || Decimal.new(0)
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div id={"controles-#{@tarefa.id}"} class="flex flex-col gap-2">
      <p :if={@mensagem} id={"controles-mensagem-#{@tarefa.id}"} class="text-xs text-base-content/70">
        {@mensagem}
      </p>

      <div :if={@em_voo? and not @confirmando?}>
        <button
          type="button"
          phx-click="pedir_parar"
          phx-target={@myself}
          id={"controles-parar-#{@tarefa.id}"}
          class="btn btn-sm btn-error"
        >
          Parar
        </button>
      </div>

      <div
        :if={@em_voo? and @confirmando?}
        id={"controles-confirmar-#{@tarefa.id}"}
        class="rounded border border-error/40 bg-error/10 p-2 text-xs"
      >
        <p id={"controles-gasto-#{@tarefa.id}"}>Gasto acumulado nesta tarefa: US$ {@gasto_usd}</p>
        <p>Cortar mata o processo agora e devolve a tarefa a fila, sem contar ciclo.</p>
        <div class="mt-2 flex gap-2">
          <button
            type="button"
            phx-click="confirmar_parar"
            phx-target={@myself}
            id={"controles-confirmar-parar-#{@tarefa.id}"}
            class="btn btn-xs btn-error"
          >
            Confirmar corte
          </button>
          <button
            type="button"
            phx-click="cancelar_parar"
            phx-target={@myself}
            id={"controles-cancelar-parar-#{@tarefa.id}"}
            class="btn btn-xs"
          >
            Cancelar
          </button>
        </div>
      </div>

      <div :if={@retomavel?}>
        <button
          type="button"
          phx-click="retomar"
          phx-target={@myself}
          id={"controles-retomar-#{@tarefa.id}"}
          class="btn btn-sm btn-primary"
        >
          Retomar
        </button>
      </div>
    </div>
    """
  end
end
