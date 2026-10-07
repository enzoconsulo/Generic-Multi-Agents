defmodule Fabrica.Application do
  # See https://elixir.hexdocs.pm/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    # Barramento de eventos (T-050): anexa ANTES de subir qualquer filho, para que nenhum
    # evento emitido logo no boot chegue sem handler.
    :ok = Fabrica.Telemetria.anexar()

    children = [
      FabricaWeb.Telemetry,
      Fabrica.Repo,
      # Fila duravel (T-037): mesmo Postgres das tarefas, para que enfileirar e mudar
      # estado sejam a MESMA transacao. Sobe logo apos o Repo, do qual depende.
      {Oban, Application.fetch_env!(:fabrica, Oban)},
      # A parede de cota como ESTADO DO SISTEMA (T-039, ligado na T-091), sob o nome
      # `Fabrica.Cota`: e nele que `Fabrica.Agente.Laco` registra a parede que o operario
      # devolve, e e ele que `Piloto.Servidor` e o console consultam. Sobe DEPOIS do Oban
      # porque a parede pausa as filas dele (`Oban.pause_all_queues/0`) e o rearme as retoma.
      Fabrica.Cota,
      {DNSCluster, query: Application.get_env(:fabrica, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: Fabrica.PubSub},
      # Enderecamento e arvore de supervisao dos agentes em voo (T-036). O Registry precisa
      # subir ANTES do Supervisor: um agente se registra nele durante o proprio `init/1`.
      {Registry, keys: :unique, name: Fabrica.Agente.Supervisor.registro()},
      Fabrica.Agente.Supervisor,
      # Start to serve requests, typically the last entry
      FabricaWeb.Endpoint
    ]

    # See https://elixir.hexdocs.pm/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Fabrica.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    FabricaWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
