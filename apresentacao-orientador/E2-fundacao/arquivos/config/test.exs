import Config

# Configure your database
#
# The MIX_TEST_PARTITION environment variable can be used
# to provide built-in test partitioning in CI environment.
# Run `mix help test` for more information.
# 127.0.0.1 explicito, e nao "localhost".
#
# MEDIDO nesta maquina, para o comentario nao afirmar mais do que se sabe: `localhost`
# resolve para `::1` PRIMEIRO e so depois para `127.0.0.1`, e ainda assim a conexao
# FUNCIONA — o cliente cai para o IPv4 sozinho (conferido em ambiente dev, que continua
# com "localhost": `inet_server_addr` volta 127.0.0.1). Ou seja, isto NAO conserta uma
# falha; e escolha de ser explicito.
#
# A razao de ser explicito: o cluster sobe com `listen_addresses = '127.0.0.1'` (so IPv4,
# ver `_sistema/AMBIENTE_V2.md`), entao fixar o endereco tira do caminho uma resolucao de
# nome e uma tentativa de conexao IPv6 que sempre falha antes de acertar. A suite roda a
# cada verificacao, em 58 tarefas.
#
# A autenticacao do cluster e `trust`; a senha abaixo e ignorada e fica so para o dia em
# que a credencial de verdade entrar (`MIGRACAO_V2.md`, 6.2).
config :fabrica, Fabrica.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "127.0.0.1",
  port: 5432,
  database: "fabrica_test#{System.get_env("MIX_TEST_PARTITION")}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :fabrica, FabricaWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "7KeJJIn0td4+fRlWULIY1+t2BVIdrcymaziDuY6z7p14Vei65brRmaxzW6tR9j6N",
  server: false

# Print only warnings and errors during test
config :logger, level: :warning

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Enable helpful, but potentially expensive runtime checks
config :phoenix_live_view,
  enable_expensive_runtime_checks: true

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true
