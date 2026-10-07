# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :fabrica,
  ecto_repos: [Fabrica.Repo],
  generators: [timestamp_type: :utc_datetime]

# Configure the endpoint
config :fabrica, FabricaWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: FabricaWeb.ErrorHTML, json: FabricaWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Fabrica.PubSub,
  live_view: [signing_salt: "tmUecKMb"]

# Configure LiveView
config :phoenix_live_view,
  # the attribute set on all root tags. Used for Phoenix.LiveView.ColocatedCSS.
  root_tag_attribute: "phx-r"

# Configure esbuild (the version is required)
config :esbuild,
  version: "0.25.4",
  fabrica: [
    args:
      ~w(js/app.js --bundle --target=es2022 --outdir=../priv/static/assets/js --external:/fonts/* --external:/images/* --alias:@=.),
    cd: Path.expand("../assets", __DIR__),
    env: %{"NODE_PATH" => [Path.expand("../deps", __DIR__), Mix.Project.build_path()]}
  ]

# Configure tailwind (the version is required)
config :tailwind,
  version: "4.3.0",
  fabrica: [
    args: ~w(
      --input=assets/css/app.css
      --output=priv/static/assets/css/app.css
    ),
    cd: Path.expand("..", __DIR__),
    env: %{"NODE_PATH" => [Path.expand("../deps", __DIR__), Mix.Project.build_path()]}
  ]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Silencia o aviso de symlink dos "colocated assets" do LiveView.
#
# POR QUE: criar symlink no Windows exige privilegio, e esta maquina roda sem admin — o
# LiveView entao imprime o aviso COM STACK TRACE a cada compilacao. Ele nao quebra nada
# (`mix compile --warnings-as-errors` sai com 0), mas saida que parece erro e nao e treina
# quem le a ignorar, e esta bateria vai rodar em mais 57 tarefas.
#
# E seguro porque este projeto NAO usa colocated hooks/js/css. Se um dia usar, remova esta
# linha e resolva o symlink de verdade — o aviso volta a ser informacao.
config :phoenix_live_view, :colocated_assets, disable_symlink_warning: true

# Onde estao os binarios do PostgreSQL (`pg_dump`, `pg_restore`).
#
# POR QUE NAO USAR O PATH: esta maquina teve uma instalacao de PostgreSQL INCOMPLETA cujos
# binarios de cliente respondiam normalmente a `psql --version` (ver AMBIENTE_V2.md, secao
# 3). Um `pg_dump` errado no PATH produz um dump aparentemente valido contra o servidor
# errado, ou estoura por versao no pior momento possivel: o da restauracao.
config :fabrica, :pg_bin, "C:/pgsql/18/bin"

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
