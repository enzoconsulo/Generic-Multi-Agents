defmodule FabricaWeb.Componentes.Piloto do
  @moduledoc """
  O controle do piloto automatico na tela (T-055): o toggle, os dois tetos obrigatorios, o
  que ja foi consumido de cada um, e — quando dormindo — a hora do rearme.

  **Nao inventa mecanismo novo: e so a vitrine de `Fabrica.Piloto.Servidor` (a mecanica).**
  `update/2` encontra o processo do projeto pelo nome estavel `:global`
  (`Servidor.nome/1`) ou sobe um novo se nao houver — sem supervisiona-lo, pelo mesmo motivo
  que `Servidor` documenta no proprio `@moduledoc`: subir sob um `Supervisor` exigiria mexer
  em `Fabrica.Application`, fora das `areas` desta tarefa. `Ligar`/`Desligar` chamam
  `Servidor.ligar/3` e `Servidor.desligar/1` direto; nenhuma decisao mora aqui.

  Espera `:id` e `:projeto_id` nos assigns do `<.live_component>`.
  """

  use FabricaWeb, :live_component

  alias Fabrica.Piloto.Servidor

  @impl true
  def update(%{projeto_id: projeto_id} = assigns, socket) do
    pid = garantir_processo(projeto_id)

    {:ok,
     socket
     |> assign(assigns)
     |> assign(pid: pid, erro: nil)
     |> assign_new(:form, fn -> form_vazio() end)
     |> atualizar_estado()}
  end

  defp garantir_processo(projeto_id) do
    case GenServer.whereis(Servidor.nome(projeto_id)) do
      nil ->
        {:ok, pid} = Servidor.start_link(projeto_id: projeto_id)
        pid

      pid ->
        pid
    end
  end

  defp atualizar_estado(socket) do
    assign(socket, piloto: Servidor.estado(socket.assigns.pid))
  end

  defp form_vazio, do: to_form(%{"teto_de_gasto" => "", "maximo_de_rodadas" => ""}, as: :piloto)

  @impl true
  def handle_event("ligar", %{"piloto" => parametros}, socket) do
    teto = parse_numero(parametros["teto_de_gasto"])
    maximo = parse_inteiro(parametros["maximo_de_rodadas"])

    case Servidor.ligar(socket.assigns.pid, teto, maximo) do
      {:ok, _publico} ->
        {:noreply, socket |> assign(erro: nil, form: form_vazio()) |> atualizar_estado()}

      {:erro, motivos} ->
        {:noreply, assign(socket, erro: motivos, form: to_form(parametros, as: :piloto))}
    end
  end

  def handle_event("desligar", _parametros, socket) do
    :ok = Servidor.desligar(socket.assigns.pid)
    {:noreply, socket |> assign(erro: nil) |> atualizar_estado()}
  end

  defp parse_numero(nil), do: nil
  defp parse_numero(""), do: nil

  defp parse_numero(texto) do
    case Float.parse(texto) do
      {numero, _resto} -> numero
      :error -> nil
    end
  end

  defp parse_inteiro(nil), do: nil
  defp parse_inteiro(""), do: nil

  defp parse_inteiro(texto) do
    case Integer.parse(texto) do
      {numero, _resto} -> numero
      :error -> nil
    end
  end

  defp status_texto(%{ligado?: false, motivo_parada: nil}), do: "Desligado"
  defp status_texto(%{ligado?: false, motivo_parada: motivo}), do: "Parado — #{motivo}"
  defp status_texto(%{ligado?: true, dormindo_ate: nil}), do: "Ligado"
  defp status_texto(%{ligado?: true}), do: "Dormindo"

  defp status_classe(%{ligado?: false, motivo_parada: nil}), do: "badge-neutral"
  defp status_classe(%{ligado?: false}), do: "badge-error"
  defp status_classe(%{ligado?: true, dormindo_ate: nil}), do: "badge-success"
  defp status_classe(%{ligado?: true}), do: "badge-warning"

  defp formatar(nil), do: "-"
  defp formatar(numero) when is_float(numero), do: :erlang.float_to_binary(numero, decimals: 2)
  defp formatar(numero) when is_integer(numero), do: Integer.to_string(numero)

  defp formatar_hora(nil), do: "-"
  defp formatar_hora(%DateTime{} = horario), do: Calendar.strftime(horario, "%Y-%m-%d %H:%M:%S")

  defp erro_texto(nil), do: nil

  defp erro_texto(motivos) when is_list(motivos) do
    Enum.map_join(motivos, "; ", &erro_motivo/1)
  end

  defp erro_motivo(:sem_teto_de_gasto), do: "informe o teto de gasto"
  defp erro_motivo(:sem_maximo_de_rodadas), do: "informe o maximo de rodadas"
  defp erro_motivo(motivo), do: to_string(motivo)

  @impl true
  def render(assigns) do
    ~H"""
    <div id={"piloto-#{@projeto_id}"} class="rounded border border-base-300 p-4">
      <div class="flex items-center justify-between">
        <span class="font-semibold">Piloto automatico</span>
        <span id={"piloto-status-#{@projeto_id}"} class={["badge", status_classe(@piloto)]}>
          {status_texto(@piloto)}
        </span>
      </div>

      <div :if={not @piloto.ligado?} class="mt-3">
        <.form for={@form} id={"piloto-form-#{@projeto_id}"} phx-submit="ligar" phx-target={@myself}>
          <.input
            field={@form[:teto_de_gasto]}
            type="number"
            step="0.01"
            label="Teto de gasto (US$)"
          />
          <.input field={@form[:maximo_de_rodadas]} type="number" label="Maximo de rodadas" />
          <button type="submit" id={"piloto-ligar-#{@projeto_id}"} class="btn btn-primary btn-sm mt-2">
            Ligar
          </button>
        </.form>
        <p :if={@erro} id={"piloto-erro-#{@projeto_id}"} class="mt-1 text-xs text-error">
          {erro_texto(@erro)}
        </p>
      </div>

      <div :if={@piloto.ligado?} class="mt-3 flex flex-col gap-1 text-sm">
        <p id={"piloto-gasto-#{@projeto_id}"}>
          Gasto: US$ {formatar(@piloto.gasto_acumulado)} / US$ {formatar(@piloto.teto_de_gasto)}
        </p>
        <p id={"piloto-rodadas-#{@projeto_id}"}>
          Rodadas: {@piloto.rodadas_feitas} / {formatar(@piloto.maximo_de_rodadas)}
        </p>
        <p :if={@piloto.dormindo_ate} id={"piloto-rearme-#{@projeto_id}"} class="text-base-content/70">
          Dormindo — rearme em {formatar_hora(@piloto.dormindo_ate)}
        </p>
        <button
          type="button"
          id={"piloto-desligar-#{@projeto_id}"}
          phx-click="desligar"
          phx-target={@myself}
          class="btn btn-error btn-sm mt-2 self-start"
        >
          Desligar
        </button>
      </div>
    </div>
    """
  end
end
