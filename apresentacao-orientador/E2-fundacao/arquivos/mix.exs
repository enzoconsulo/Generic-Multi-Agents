defmodule Fabrica.MixProject do
  use Mix.Project

  def project do
    [
      app: :fabrica,
      version: "0.1.0",
      elixir: "~> 1.17",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      aliases: aliases(),
      deps: deps(),
      compilers: [:phoenix_live_view] ++ Mix.compilers(),
      listeners: [Phoenix.CodeReloader],
      dialyzer: dialyzer()
    ]
  end

  # POR QUE `plt_add_apps`: a fabrica tem tarefas mix proprias (`mix fabrica.ci`, e mais
  # virao), e elas chamam `Mix.shell/0` e `Mix.raise/1`. O `:mix` nao entra na PLT por
  # padrao, entao o Dialyzer reportava seis `unknown_function` para funcoes que existem —
  # ou seja, o estagio `tipos` reprovava por ignorancia da PLT, nao por defeito no codigo.
  # `:ex_unit` entra pelo mesmo motivo, para os helpers de teste.
  defp dialyzer do
    [
      plt_add_apps: [:mix, :ex_unit],
      flags: [:error_handling, :unmatched_returns]
    ]
  end

  # Configuration for the OTP application.
  #
  # Type `mix help compile.app` for more information.
  def application do
    [
      mod: {Fabrica.Application, []},
      extra_applications: [:logger, :runtime_tools]
    ]
  end

  def cli do
    # `verificar` roda no ambiente de TESTE porque termina em `mix test`, e o Mix recusa
    # rodar testes a partir de um comando que esta no ambiente `dev`. Sem esta linha o
    # alias percorre formato, compilacao e Credo e so entao falha no ultimo estagio.
    [
      preferred_envs: [precommit: :test, verificar: :test]
    ]
  end

  # Specifies which paths to compile per environment.
  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  # Specifies your project dependencies.
  #
  # Type `mix help deps` for examples and options.
  defp deps do
    [
      {:phoenix, "~> 1.8.13"},
      {:phoenix_ecto, "~> 4.5"},
      {:ecto_sql, "~> 3.13"},
      {:postgrex, ">= 0.0.0"},
      {:phoenix_html, "~> 4.1"},
      {:phoenix_live_reload, "~> 1.2", only: :dev},
      {:phoenix_live_view, "~> 1.2.0"},
      {:lazy_html, ">= 0.1.0", only: :test},
      {:phoenix_live_dashboard, "~> 0.8.3"},
      {:esbuild, "~> 0.10", runtime: Mix.env() == :dev},
      {:tailwind, "~> 0.5", runtime: Mix.env() == :dev},
      {:heroicons,
       github: "tailwindlabs/heroicons",
       tag: "v2.2.0",
       sparse: "optimized",
       app: false,
       compile: false,
       depth: 1},
      {:daisyui,
       github: "saadeghi/daisyui",
       tag: "v5.5.20",
       sparse: "packages/bundle",
       app: false,
       compile: false,
       depth: 1},
      {:telemetry_metrics, "~> 1.0"},
      {:telemetry_poller, "~> 1.0"},
      {:jason, "~> 1.2"},
      {:dns_cluster, "~> 0.2.0"},
      {:bandit, "~> 1.5"},

      # Qualidade. `runtime: false` porque nenhuma das duas roda junto com a
      # aplicacao: sao ferramentas de linha de comando, nao dependencias do sistema.
      {:credo, "~> 1.7", only: [:dev, :test], runtime: false},
      {:dialyxir, "~> 1.4", only: [:dev, :test], runtime: false}
    ]
  end

  # Aliases are shortcuts or tasks specific to the current project.
  # For example, to install project dependencies and perform other setup tasks, run:
  #
  #     $ mix setup
  #
  # See the documentation for `Mix` for more info on aliases.
  defp aliases do
    [
      setup: ["deps.get", "ecto.setup", "assets.setup", "assets.build"],
      "ecto.setup": ["ecto.create", "ecto.migrate", "run priv/repo/seeds.exs"],
      "ecto.reset": ["ecto.drop", "ecto.setup"],
      test: ["ecto.create --quiet", "ecto.migrate --quiet", "test"],
      "assets.setup": ["tailwind.install --if-missing", "esbuild.install --if-missing"],
      "assets.build": ["compile", "tailwind fabrica", "esbuild fabrica"],
      "assets.deploy": [
        "tailwind fabrica --minify",
        "esbuild fabrica --minify",
        "phx.digest"
      ],
      precommit: ["compile --warnings-as-errors", "deps.unlock --unused", "format", "test"],

      # O comando unico da fabrica. A ORDEM e a regra: o que falha mais rapido e mais
      # barato vem primeiro, e o primeiro estagio que falhar interrompe os seguintes.
      #
      # `mix dialyzer` fica FORA daqui de proposito: a primeira execucao constroi a PLT e
      # demora minutos, o que tornaria este comando inutilizavel no dia a dia. Ele entra na
      # verificacao continua (T-007) como estagio separado, e NAO pode ser removido de la:
      # checagem de tipos e uma das formas de "mover a regra para o compilador" que a tese
      # do TCC afirma.
      verificar: [
        "format --check-formatted",
        "compile --warnings-as-errors",
        "credo --strict",
        "test"
      ]
    ]
  end
end
