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

# Fila duravel (T-037). `notifier: Oban.Notifiers.PG` e `peer: Oban.Peers.Global` usam
# grupos de processo do Erlang distribuido em vez de LISTEN/NOTIFY e da tabela
# `oban_peers` do Postgres — esta fabrica roda em um unico no, e a alternativa via
# Postgres abriria uma conexao PROPRIA, fora do Ecto Sandbox, complicando a suite de
# testes sem trazer nada que o processo unico precise.
#
# `Fabrica.Fila.Resgate` resgata trabalho preso em `executing` apos desligamento sem
# intervencao humana — a garantia que a T-037 pede. NAO e retentativa automatica
# generica: um job com `max_attempts: 1` (ver `Fabrica.Fila.Trabalho`) que falhar de
# verdade vai para `discarded`, nunca de volta a fila sozinho; o Resgate so devolve
# trabalho que ficou executando sem terminar, o caso classico de "o processo morreu".
#
# POR QUE NAO O `Oban.Lifeline` de fabrica: com `max_attempts: 1`, um job preso em
# `executing` tem `attempt == max_attempts` (o FETCH incrementa `attempt` ANTES de
# `perform/1` rodar), e nesse caso o Lifeline marca `discarded`, nao `available` — o
# oposto de "voltar a ser despachavel". O `Resgate` sempre devolve para `available` e
# decrementa `attempt`, exatamente porque uma linha em `executing` apos o prazo so pode
# significar que o processo morreu antes de reportar. Ver o `@moduledoc` de
# `Fabrica.Fila.Resgate`.
#
# `verificador` roda 1-wide de proposito (ver `Fabrica.Tarefas.Fila`): bateria completa
# sobre arvore com edicoes alheias reprova FALSO, o desperdicio mais caro do sistema.
#
# D-003 (`_gestao/DECISOES.md`): o padrao do codigo e o perfil alvo de 8 GB — no maximo 4
# agentes `claude` em voo (2 construtores + 1 verificador + 1 revisor), medido contra os 7
# de antes. O QUE CUSTA MEMORIA E O NUMERO DE AGENTES EM VOO, nao a fila de onde vem.
#
# `max_construtores` E A FONTE UNICA deste numero: usado aqui para a fila do Oban e lido em
# runtime por `Fabrica.Tarefas.Fila.max_construtores_padrao/0` (de onde
# `Fabrica.Fila.Exclusao` tambem le, por delegacao) — os tres nunca podem divergir porque so
# ha um lugar onde o numero e escrito.
#
# MAQUINA MAIS FORTE (16 GB, onde 3/1/3 cabe): mude so o numero abaixo. Nao edite
# `lib/fabrica/tarefas/fila.ex` nem `lib/fabrica/fila/exclusao.ex` — eles nao tem mais o
# limite escrito no codigo.
max_construtores = 2
config :fabrica, :max_construtores, max_construtores

config :fabrica, Oban,
  repo: Fabrica.Repo,
  notifier: Oban.Notifiers.PG,
  peer: Oban.Peers.Global,
  plugins: [Fabrica.Fila.Resgate],
  queues: [construtor: max_construtores, verificador: 1, revisor: 1]

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
#
# `FABRICA_PG_BIN` existe para a maquina da NUVEM (Linux, sessao do Claude Code on the web):
# la os binarios ficam em `/usr/lib/postgresql/18/bin`, e o hook de inicio de sessao da
# fabrica exporta a variavel. Sem ela, o padrao continua sendo o desta maquina — o caminho
# segue EXPLICITO nos dois lugares, nunca o do PATH.
config :fabrica, :pg_bin, System.get_env("FABRICA_PG_BIN", "C:/pgsql/18/bin")

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
