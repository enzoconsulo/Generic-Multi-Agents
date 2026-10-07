defmodule FabricaWeb.ConsoleLive do
  @moduledoc """
  O console ao vivo: quem esta rodando agora, o que essa volta gastou, e a parede de cota —
  enquanto acontece, nao depois.

  Tres blocos, cada um com uma fonte de verdade diferente:

    * **em voo** — `Fabrica.Agente.Supervisor.listar/0`, que consulta o `Registry` de
      verdade. Nao ha evento de "agente morreu" no barramento (a morte e vista pelo
      `Supervisor`, nao emitida em `Fabrica.Eventos`), entao esta lista se atualiza por um
      tique periodico (`handle_info(:atualizar_em_voo, ...)`) alem de reagir a transicao de
      tarefa — que e o sinal mais forte de "um agente acabou de parar".
    * **custo por tarefa** — soma de `Fabrica.Tarefas.Consumo` agrupada por tarefa, com a
      reparticao entrada/cache-escrita/cache-leitura/saida aberta. E POR TAREFA, nao por
      despacho: a v1 subestimava o custo real em ate quatro vezes por calibrar o teto pelo
      custo de uma unica etapa.
    * **parede de cota** — assina `[:fabrica, :cota, :parede]`/`[:fabrica, :cota, :rearme]`
      no mesmo barramento, e NAO depende de `Fabrica.Cota` estar de pe: o estado inicial e
      so um melhor esforco (`Process.whereis/1` antes de perguntar), porque nada nesta
      fabrica hoje garante que aquele processo esteja supervisionado. Quem dispara os
      eventos e o `Fabrica.Cota` de qualquer instancia, sob qualquer nome — a tela nunca
      precisa saber qual.

  ## O console (voltas do agente selecionado)

  Cada volta que chegar pelo barramento (`[:fabrica, :despacho, :volta]`) enquanto o agente
  dono dela estiver selecionado entra numa lista em memoria, limitada
  (`@limite_console_por_agente`) — "console de agente pode produzir muita linha". Hoje NAO
  ha nenhum despachante real que emita este evento com o nome da ferramenta (ver
  `Fabrica.Eventos`, campo `:ferramenta` e opcional e ainda sem chamador real, mesmo padrao
  documentado em T-050): este painel e o ponto de EXTENSAO pronto, e mostra exatamente o que
  chegar. Sem persistencia de turno em banco, "o registro completo por consulta" que o
  Contexto da tarefa pede fica para quando essa persistencia existir — registrado como
  pendencia nas Notas de execucao.
  """

  use FabricaWeb, :live_view

  import Ecto.Query, only: [from: 2]

  alias Fabrica.Agente.Supervisor, as: AgenteSupervisor
  alias Fabrica.Cota
  alias Fabrica.Eventos
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Tarefa

  @intervalo_em_voo :timer.seconds(3)
  @limite_console_por_agente 200

  @impl true
  def mount(_params, _session, socket) do
    # Resultado descartado de proposito (ver `Fabrica.Piloto.Servidor`): "ja inscrito" e a
    # referencia do timer nao mudam o que este `mount/3` faz a seguir.
    _ =
      if connected?(socket) do
        _ = Eventos.assinar()
        agendar_atualizacao()
      end

    {:ok,
     socket
     |> assign(selecionado: nil, console: [], cota: cota_agora())
     |> atualizar_em_voo()
     |> atualizar_custos()}
  end

  @impl true
  def handle_event("selecionar", %{"tarefa_id" => tarefa_id}, socket) do
    {:noreply, assign(socket, selecionado: tarefa_id, console: [])}
  end

  @impl true
  def handle_info(:atualizar_em_voo, socket) do
    agendar_atualizacao()
    {:noreply, atualizar_em_voo(socket)}
  end

  def handle_info({:fabrica, [:fabrica, :tarefa, :transicao], _medidas, _metadados}, socket) do
    {:noreply, socket |> atualizar_em_voo() |> atualizar_custos()}
  end

  def handle_info({:fabrica, [:fabrica, :despacho, :volta], medidas, metadados}, socket) do
    {:noreply, socket |> atualizar_custos() |> registrar_volta(medidas, metadados)}
  end

  def handle_info({:fabrica, [:fabrica, :cota, :parede], _medidas, metadados}, socket) do
    {:noreply, assign(socket, cota: %{batida?: true, reabre_em: Map.get(metadados, :reabre_em)})}
  end

  def handle_info({:fabrica, [:fabrica, :cota, :rearme], _medidas, _metadados}, socket) do
    {:noreply, assign(socket, cota: %{batida?: false, reabre_em: nil})}
  end

  def handle_info({:fabrica, _nome, _medidas, _metadados}, socket), do: {:noreply, socket}

  defp agendar_atualizacao, do: Process.send_after(self(), :atualizar_em_voo, @intervalo_em_voo)

  defp atualizar_em_voo(socket) do
    em_voo = AgenteSupervisor.listar() |> Enum.map(&com_tarefa/1)
    assign(socket, em_voo: em_voo)
  end

  defp com_tarefa(%{tarefa_id: tarefa_id} = agente) do
    Map.put(agente, :tarefa, tarefa_id |> id_numerico() |> buscar_tarefa())
  end

  defp id_numerico(id) when is_integer(id), do: id

  defp id_numerico(id) when is_binary(id) do
    case Integer.parse(id) do
      {numero, ""} -> numero
      _ -> nil
    end
  end

  defp id_numerico(_id), do: nil

  defp buscar_tarefa(nil), do: nil
  defp buscar_tarefa(id), do: Repo.get(Tarefa, id)

  defp atualizar_custos(socket), do: assign(socket, custos: custos_por_tarefa())

  # POR TAREFA (nunca por despacho isolado): soma sobre ciclos -> despachos -> consumos, com
  # a reparticao de cache aberta em vez de um total que a esconderia.
  defp custos_por_tarefa do
    Repo.all(
      from(t in Tarefa,
        join: c in assoc(t, :ciclos),
        join: d in assoc(c, :despachos),
        join: k in assoc(d, :consumos),
        group_by: [t.id, t.codigo, t.titulo],
        select: %{
          tarefa_id: t.id,
          codigo: t.codigo,
          titulo: t.titulo,
          tokens_entrada: sum(k.tokens_entrada),
          tokens_cache_escrita: sum(k.tokens_cache_escrita),
          tokens_cache_leitura: sum(k.tokens_cache_leitura),
          tokens_saida: sum(k.tokens_saida),
          custo_usd: sum(k.custo_usd)
        },
        order_by: [desc: sum(k.custo_usd)]
      )
    )
  end

  # Melhor esforco: `Fabrica.Cota` pode nao estar supervisionado em lugar nenhum hoje. O
  # estado real chega pelos eventos (`handle_info` acima); isto so evita a tela abrir muda
  # quando o processo ja estiver de pe com a parede batida.
  defp cota_agora do
    case Process.whereis(Cota) do
      nil -> %{batida?: false, reabre_em: nil}
      pid -> pid |> Cota.estado() |> Map.take([:batida?, :reabre_em])
    end
  end

  defp registrar_volta(socket, medidas, metadados) do
    tarefa_id = Map.get(metadados, :tarefa_id)

    if socket.assigns.selecionado != nil and to_string(tarefa_id) == socket.assigns.selecionado do
      entrada = %{
        volta: Map.get(metadados, :volta),
        ferramenta: Map.get(metadados, :ferramenta, "—"),
        tokens_entrada: Map.get(medidas, :tokens_entrada, 0),
        tokens_cache_escrita: Map.get(medidas, :tokens_cache_escrita, 0),
        tokens_cache_leitura: Map.get(medidas, :tokens_cache_leitura, 0),
        tokens_saida: Map.get(medidas, :tokens_saida, 0),
        custo_usd: Map.get(medidas, :custo_usd, 0)
      }

      console = [entrada | socket.assigns.console] |> Enum.take(@limite_console_por_agente)
      assign(socket, :console, console)
    else
      socket
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="mx-auto max-w-7xl px-4 py-8">
        <.header>
          Console
          <:subtitle>Agentes em voo, custo por tarefa e a parede de cota, ao vivo</:subtitle>
        </.header>

        <div
          :if={@cota.batida?}
          id="cota-parede"
          class="mt-6 rounded-lg border border-warning/40 bg-warning/10 p-4 text-warning"
        >
          <p class="font-semibold">A cota da assinatura esta batida.</p>
          <p class="text-sm">
            Reabre em {if @cota.reabre_em,
              do: Calendar.strftime(@cota.reabre_em, "%d/%m %H:%M UTC"),
              else: "horario desconhecido"}.
          </p>
        </div>

        <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div id="em-voo" class="rounded-lg border border-base-300 bg-base-100 p-4">
            <h3 class="mb-3 text-sm font-semibold uppercase tracking-wide">Em voo</h3>
            <p :if={@em_voo == []} id="em-voo-vazio" class="text-xs text-base-content/50">
              Nenhum agente em voo agora.
            </p>
            <ul class="flex flex-col gap-2">
              <li :for={agente <- @em_voo} id={"agente-#{agente.tarefa_id}"}>
                <button
                  type="button"
                  phx-click="selecionar"
                  phx-value-tarefa_id={agente.tarefa_id}
                  class={[
                    "w-full rounded border p-2 text-left text-sm",
                    (to_string(agente.tarefa_id) == @selecionado && "border-primary bg-primary/10") ||
                      "border-base-200"
                  ]}
                >
                  <div class="font-mono text-xs font-semibold">
                    {if agente.tarefa, do: agente.tarefa.codigo, else: inspect(agente.tarefa_id)}
                  </div>
                  <div class="truncate text-xs text-base-content/60">
                    {if agente.tarefa, do: agente.tarefa.titulo, else: "tarefa desconhecida"} · {agente.papel}
                  </div>
                </button>
              </li>
            </ul>
          </div>

          <div id="console" class="rounded-lg border border-base-300 bg-base-100 p-4 lg:col-span-2">
            <h3 class="mb-3 text-sm font-semibold uppercase tracking-wide">Console</h3>
            <p :if={@selecionado == nil} id="console-selecionar" class="text-xs text-base-content/50">
              Selecione um agente em voo para ver as voltas.
            </p>
            <p
              :if={@selecionado != nil and @console == []}
              id="console-vazio"
              class="text-xs text-base-content/50"
            >
              Nenhuma volta registrada ainda para este agente.
            </p>
            <ul :if={@selecionado != nil and @console != []} class="flex flex-col gap-2">
              <li :for={entrada <- @console} class="rounded border border-base-200 p-2 text-xs">
                <span class="font-mono font-semibold">volta {entrada.volta}</span>
                · ferramenta: {entrada.ferramenta} · entrada {entrada.tokens_entrada} · cache-escrita {entrada.tokens_cache_escrita} · cache-leitura {entrada.tokens_cache_leitura} · saida {entrada.tokens_saida} · US$ {entrada.custo_usd}
              </li>
            </ul>
          </div>
        </div>

        <div id="custo-por-tarefa" class="mt-6 rounded-lg border border-base-300 bg-base-100 p-4">
          <h3 class="mb-3 text-sm font-semibold uppercase tracking-wide">Custo por tarefa</h3>
          <p :if={@custos == []} id="custo-vazio" class="text-xs text-base-content/50">
            Nenhum gasto registrado ainda.
          </p>
          <table :if={@custos != []} class="w-full text-left text-xs">
            <thead>
              <tr class="text-base-content/60">
                <th class="pb-2">Tarefa</th>
                <th class="pb-2">Entrada</th>
                <th class="pb-2">Cache escrita</th>
                <th class="pb-2">Cache leitura</th>
                <th class="pb-2">Saida</th>
                <th class="pb-2">Custo (US$)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                :for={linha <- @custos}
                id={"custo-#{linha.tarefa_id}"}
                class="border-t border-base-200"
              >
                <td class="py-1 font-mono">{linha.codigo} — {linha.titulo}</td>
                <td class="py-1">{linha.tokens_entrada}</td>
                <td class="py-1">{linha.tokens_cache_escrita}</td>
                <td class="py-1">{linha.tokens_cache_leitura}</td>
                <td class="py-1">{linha.tokens_saida}</td>
                <td class="py-1">{linha.custo_usd}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Layouts.app>
    """
  end
end
