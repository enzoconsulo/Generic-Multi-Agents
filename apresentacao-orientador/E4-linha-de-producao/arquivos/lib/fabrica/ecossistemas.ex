defmodule Fabrica.Ecossistemas do
  @moduledoc """
  Que linguagem e este projeto, e qual e o comando da suite dele.

  A fabrica constroi QUALQUER tipo de projeto, entao nada aqui pode presumir um ecossistema.
  Antes de a v1 ter isto, um projeto Python, Go, Rust ou .NET simplesmente nao tinha pipeline:
  *"sem package.json"* era erro, e o unico caminho feliz era Node.

  ## A deteccao e um PALPITE, e ela sabe disso

  Arquivo-marcador na raiz e heuristica: um repositorio pode ter mais de um (uma API Python
  com frontend Node, um projeto Elixir com assets em npm). Vence o primeiro da lista, e quem
  quiser certeza declara em `_gestao/ci.json` — que **sempre vence**, porque declaracao ganha
  de palpite. Ver `Fabrica.Criterios.Suite`.

  ## A ordem, e por que ela diverge da v1

  A v1 poe **Node primeiro**, por ser o caso mais comum de raiz de monorepo. Aqui `mix.exs`
  vem primeiro, seguindo o plano da T-027 — e a razao e concreta: **a propria fabrica v2 e um
  projeto Elixir com `package.json` de assets do Phoenix**. Com a ordem da v1, ela se
  detectaria como Node e rodaria `npm test`, que nao existe. Um projeto que nao consegue
  reconhecer a si mesmo e mau sinal para os que ele constroi.

  ## Nao reconhecer nao e erro

  `detectar/1` devolve `nil`, e a passada mecanica segue **sem** criterio implicito. Levantar
  aqui transformaria "ecossistema que ainda nao mapeei" em "tarefa que nao roda", e a fabrica
  precisa conseguir construir o projeto cujo ecossistema ela ainda nao conhece.
  """

  @typedoc """
  Um ecossistema reconhecido.

  `marcadores` que comecam com ponto sao EXTENSAO (`.csproj` casa com `Api.csproj`); os demais
  sao nome exato de arquivo na raiz.
  """
  @type t :: %{
          id: atom(),
          rotulo: String.t(),
          marcadores: [String.t()],
          testes: String.t()
        }

  @catalogo [
    %{id: :elixir, rotulo: "Elixir / Mix", marcadores: ["mix.exs"], testes: "mix test"},
    %{id: :node, rotulo: "Node.js / npm", marcadores: ["package.json"], testes: "npm test"},
    %{
      id: :python,
      rotulo: "Python",
      marcadores: ["pyproject.toml", "requirements.txt", "setup.py"],
      testes: "pytest"
    },
    %{id: :rust, rotulo: "Rust / Cargo", marcadores: ["Cargo.toml"], testes: "cargo test"},
    %{id: :go, rotulo: "Go", marcadores: ["go.mod"], testes: "go test ./..."},
    %{
      id: :dotnet,
      rotulo: ".NET",
      marcadores: [".csproj", ".fsproj", ".vbproj", ".sln"],
      testes: "dotnet test"
    }
  ]

  @doc "O catalogo inteiro, **na ordem de prioridade da deteccao**."
  @spec catalogo() :: [t()]
  def catalogo, do: @catalogo

  @doc "O ecossistema com este id, ou `nil`."
  @spec por_id(atom()) :: t() | nil
  def por_id(id), do: Enum.find(@catalogo, &(&1.id == id))

  @doc """
  Detecta o ecossistema pelos arquivos da raiz. `nil` quando nada e reconhecido.

  Diretorio ilegivel tambem devolve `nil`, e nao levanta: nao poder listar a pasta e a mesma
  situacao pratica de nao reconhecer nada, e as duas seguem sem criterio implicito.
  """
  @spec detectar(Path.t()) :: t() | nil
  def detectar(raiz) do
    case File.ls(raiz) do
      {:ok, arquivos} -> Enum.find(@catalogo, &tem_marcador?(&1, arquivos))
      {:error, _motivo} -> nil
    end
  end

  defp tem_marcador?(ecossistema, arquivos) do
    Enum.any?(ecossistema.marcadores, fn marcador ->
      if String.starts_with?(marcador, ".") do
        Enum.any?(arquivos, &String.ends_with?(&1, marcador))
      else
        marcador in arquivos
      end
    end)
  end
end
