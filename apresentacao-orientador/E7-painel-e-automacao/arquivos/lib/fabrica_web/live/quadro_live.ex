defmodule FabricaWeb.QuadroLive do
  @moduledoc """
  A tela principal da fabrica: as tarefas de um projeto, agrupadas pelos seis estados do
  pipeline mais `bloqueada`, ao vivo.

  "Ao vivo" quer dizer sem polling: o `mount/3` assina `Fabrica.Eventos` (o mesmo
  barramento que o motor emite) e `handle_info/2` recarrega so quando uma tarefa muda de
  estado — nunca em ciclo. A tela le o MESMO banco que o motor escreve; nao ha arquivo de
  log no meio, que era o desenho da v1.

  Sem `?projeto_id=`, a tela nao fica em branco: mostra a lista de projetos para escolher.
  Com um `projeto_id` que nao existe, mostra erro, legivel, no lugar de quebrar.
  """

  use FabricaWeb, :live_view

  import Ecto.Query, only: [from: 2]

  alias Fabrica.Eventos
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Tarefa
  alias Phoenix.LiveView.AsyncResult

  @colunas Tarefa.estados() ++ [:bloqueada]

  @rotulos %{
    backlog: "Backlog",
    pronta: "Pronta",
    em_execucao: "Em execução",
    em_teste: "Em teste",
    em_revisao: "Em revisão",
    concluida: "Concluída",
    bloqueada: "Bloqueada"
  }

  @doc "As colunas do quadro, na ordem em que a tarefa as percorre, mais `bloqueada` por último."
  @spec colunas() :: [atom()]
  def colunas, do: @colunas

  @impl true
  def mount(_params, _session, socket) do
    # Resultado descartado de proposito (ver `Fabrica.Piloto.Servidor`): o `mount/3` de um
    # LiveView so assina uma vez, e "ja inscrito" nao muda o que a tela mostra.
    _ = if connected?(socket), do: Eventos.assinar()

    {:ok,
     assign(socket,
       pagina: :selecionar,
       projeto: nil,
       projetos: [],
       quadro: AsyncResult.loading()
     )}
  end

  # `projeto_id` vem cru da URL: pode ser digitado a mao ou truncado por outro sistema. Um
  # ID nao numerico (ex.: "abc") faz o `Repo.get/2` levantar `Ecto.Query.CastError` em vez
  # de devolver `nil` — por isso o parse acontece ANTES da consulta, e falha de parse cai
  # no mesmo caminho `:nao_encontrado` de um ID numerico que nao existe.
  @impl true
  def handle_params(%{"projeto_id" => projeto_id}, _uri, socket) do
    case Integer.parse(projeto_id) do
      {id, ""} ->
        case Repo.get(Projeto, id) do
          nil ->
            {:noreply, assign(socket, pagina: :nao_encontrado, projeto: nil)}

          projeto ->
            {:noreply,
             socket
             |> assign(pagina: :projeto, projeto: projeto)
             |> carregar_quadro()}
        end

      _ ->
        {:noreply, assign(socket, pagina: :nao_encontrado, projeto: nil)}
    end
  end

  def handle_params(_params, _uri, socket) do
    {:noreply, assign(socket, pagina: :selecionar, projeto: nil, projetos: Repo.all(Projeto))}
  end

  # A ARMADILHA DA v1 (ver `_gestao/tarefas/T-051-painel-quadro.md`) era a tela em branco
  # sem projeto; aqui a pagina `:selecionar` cobre exatamente isso.
  @impl true
  def handle_info({:fabrica, [:fabrica, :tarefa, :transicao], _medidas, _metadados}, socket) do
    {:noreply, recarregar(socket)}
  end

  def handle_info({:fabrica, _nome, _medidas, _metadados}, socket), do: {:noreply, socket}

  # O recarregamento por evento e SINCRONO, de proposito: e uma consulta unica e rapida, e
  # rodar sincrono elimina a corrida entre "o evento chegou" e "o teste ja pediu o render"
  # que uma segunda passada por `assign_async` introduziria sem necessidade nenhuma.
  defp recarregar(%{assigns: %{pagina: :projeto, projeto: projeto, quadro: quadro}} = socket) do
    assign(socket, :quadro, AsyncResult.ok(quadro, montar_quadro(projeto.id)))
  end

  defp recarregar(socket), do: socket

  # A carga inicial, ao contrario, e assincrona: e o que da a pagina um estado de
  # "carregando" de verdade (visivel no primeiro paint desconectado) em vez de um estado
  # que existe so no papel.
  defp carregar_quadro(%{assigns: %{projeto: projeto}} = socket) do
    assign_async(socket, :quadro, fn -> {:ok, %{quadro: montar_quadro(projeto.id)}} end)
  end

  defp montar_quadro(projeto_id) do
    custos = custos_por_tarefa(projeto_id)

    por_estado =
      projeto_id
      |> tarefas_do_projeto()
      |> Enum.map(&cartao(&1, custos))
      |> Enum.group_by(& &1.status)

    Enum.map(@colunas, fn estado -> {estado, Map.get(por_estado, estado, [])} end)
  end

  defp tarefas_do_projeto(projeto_id) do
    Repo.all(
      from(t in Tarefa,
        where: t.projeto_id == ^projeto_id,
        order_by: [asc: t.codigo],
        preload: :especialista
      )
    )
  end

  # O total por tarefa e uma soma sobre `ciclos -> despachos -> consumos`: o custo mora na
  # VOLTA (`Fabrica.Tarefas.Consumo`), nunca na tarefa. `coalesce` cobre a tarefa sem
  # nenhuma volta ainda, que e o caso comum de `backlog`/`pronta`.
  defp custos_por_tarefa(projeto_id) do
    Repo.all(
      from(t in Tarefa,
        where: t.projeto_id == ^projeto_id,
        left_join: c in assoc(t, :ciclos),
        left_join: d in assoc(c, :despachos),
        left_join: k in assoc(d, :consumos),
        group_by: t.id,
        select: {t.id, coalesce(sum(k.custo_usd), 0)}
      )
    )
    |> Map.new()
  end

  defp cartao(tarefa, custos) do
    %{
      id: tarefa.id,
      codigo: tarefa.codigo,
      titulo: tarefa.titulo,
      status: tarefa.status,
      tentativas: tarefa.tentativas,
      especialista: tarefa.especialista && tarefa.especialista.nome,
      custo_usd: Map.get(custos, tarefa.id, Decimal.new(0))
    }
  end

  defp rotulo(estado), do: Map.get(@rotulos, estado, to_string(estado))

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="mx-auto max-w-7xl px-4 py-8">
        <.header>
          Quadro de tarefas
          <:subtitle>{if @projeto, do: @projeto.nome, else: "Selecione um projeto"}</:subtitle>
        </.header>

        <div
          :if={@pagina == :selecionar}
          id="quadro-vazio"
          class="mt-6 rounded-lg border border-dashed border-base-300 p-8 text-center"
        >
          <p class="text-base-content/70">Nenhum projeto selecionado.</p>
          <p :if={@projetos == []} class="mt-2 text-sm text-base-content/50">
            Não há projetos cadastrados ainda.
          </p>
          <ul :if={@projetos != []} class="mt-4 flex flex-col items-center gap-2">
            <li :for={projeto <- @projetos}>
              <.link navigate={~p"/quadro?projeto_id=#{projeto.id}"} class="link link-primary">
                {projeto.nome}
              </.link>
            </li>
          </ul>
        </div>

        <div
          :if={@pagina == :nao_encontrado}
          id="quadro-erro"
          class="mt-6 rounded-lg border border-error/40 bg-error/10 p-8 text-center text-error"
        >
          Projeto não encontrado.
        </div>

        <.async_result :let={colunas} :if={@pagina == :projeto} assign={@quadro}>
          <:loading>
            <div id="quadro-carregando" class="mt-6 p-8 text-center text-base-content/70">
              Carregando tarefas…
            </div>
          </:loading>
          <:failed :let={_falha}>
            <div
              id="quadro-erro"
              class="mt-6 rounded-lg border border-error/40 bg-error/10 p-8 text-center text-error"
            >
              Não foi possível carregar as tarefas.
            </div>
          </:failed>
          <div
            id="quadro-colunas"
            class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
          >
            <div
              :for={{estado, tarefas} <- colunas}
              id={"coluna-#{estado}"}
              class="rounded-lg border border-base-300 bg-base-100 p-3"
            >
              <div class="mb-3 flex items-center justify-between">
                <h3 class="text-sm font-semibold uppercase tracking-wide">{rotulo(estado)}</h3>
                <span class="badge badge-neutral">{length(tarefas)}</span>
              </div>
              <p :if={tarefas == []} class="text-xs text-base-content/50">Sem tarefas</p>
              <div
                :for={tarefa <- tarefas}
                id={"tarefa-#{tarefa.id}"}
                class="mb-2 rounded border border-base-200 p-2 text-sm last:mb-0"
              >
                <div class="font-mono text-xs font-semibold">{tarefa.codigo}</div>
                <div class="truncate">{tarefa.titulo}</div>
                <div class="mt-1 text-xs text-base-content/60">
                  tentativas: {tarefa.tentativas} · {tarefa.especialista || "sem especialista"} · US$ {tarefa.custo_usd}
                </div>
              </div>
            </div>
          </div>
        </.async_result>
      </div>
    </Layouts.app>
    """
  end
end
