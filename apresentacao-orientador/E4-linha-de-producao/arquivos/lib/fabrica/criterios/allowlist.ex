defmodule Fabrica.Criterios.Allowlist do
  @moduledoc """
  Este comando pode rodar sem supervisao? **Allowlist, nunca lista de proibicoes.**

  A v1 aprendeu isto por estrago: uma URL de remoto aceitando `ext::<comando>` executava
  binario arbitrario, e a defesa da epoca era proibir o que alguem lembrasse. *"Proibir o
  perigoso"* e uma lista infinita e sempre incompleta; *"permitir o conhecido"* e finita e
  auditavel. A diferenca nao e de rigor, e de forma: uma lista de proibicoes falha ABERTA
  quando esta incompleta, e uma allowlist falha FECHADA.

  ## O criterio de entrada de um binario

  Ele **verifica** — roda teste, compila, confere arquivo — e nao publica, nao instala e nao
  apaga. `git` entra so em modo leitura: `status`, `log`, `diff` e afins; `push`, `reset` e
  `clean` sao recusados pelo subcomando.

  ## `npx` esta FORA, e e a unica divergencia da lista da v1

  A v1 permite `npx`, e ele e diferente em ESPECIE dos outros: `mix`, `npm run` e `cargo`
  executam codigo **do projeto** — e e disso que verificar se trata. `npx <pacote>` **baixa da
  rede e executa codigo que nao esta no projeto**, o que faz a allowlist de binarios deixar de
  significar alguma coisa: o binario permitido vira porta para qualquer outro.

  Nao e falha de seguranca explorada na v1 — quem escreve criterio e o planejador, nao o
  agente —, mas manter `npx` seria manter uma allowlist que se auto-anula. Um criterio que
  precise de ferramenta externa deve declara-la como dependencia do projeto e chama-la pelo
  script.

  ## O que o modelo de ameaca E, e o que ele NAO e

  O criterio e escrito pelo PLANEJADOR, nao pelo agente que executa a tarefa — e o construtor
  nao pode alterar criterio. Entao a ameaca real aqui e **criterio mal especificado**, e nao
  criterio malicioso. E por isso que `mix` e `cargo` entram sem constrangimento apesar de
  rodarem codigo do projeto: rodar o codigo do projeto e o objetivo.
  """

  @typedoc "Por que o comando foi recusado."
  @type motivo ::
          :sem_comando
          | :binario_nao_permitido
          | :encadeamento_proibido
          | :git_nao_leitura

  @binarios ~w[
    mix elixir iex
    npm pnpm yarn node
    python python3 pytest ruff mypy
    go cargo dotnet mvn gradle
    tsc eslint prettier vitest jest
    ls cat grep rg find test
    git
  ]

  @git_leitura ~w[status log show diff ls-files rev-parse describe cat-file]

  # Encadeamento, redirecionamento e substituicao. Um criterio precisa de UM comando, nao de
  # um script: quem precisa de script escreve um alias no projeto e chama o alias, e ai o
  # script fica versionado e revisavel em vez de escondido numa linha de frontmatter.
  @perigoso ~r/[;&|`$><\n\r]|\$\(/

  @doc "Os binarios permitidos, em ordem."
  @spec binarios() :: [String.t()]
  def binarios, do: Enum.sort(@binarios)

  @doc "Os subcomandos de `git` que so LEEM."
  @spec git_leitura() :: [String.t()]
  def git_leitura, do: Enum.sort(@git_leitura)

  @doc """
  Avalia o comando declarado num criterio.

  Devolve `{:ok, argv}` com o comando ja quebrado em programa e argumentos — pronto para
  `Fabrica.Ferramentas.Comando.rodar/4`, que nao passa por shell nenhum. Quebrar aqui e nao
  la e o que garante que o que foi AVALIADO e exatamente o que sera EXECUTADO.

  ## Exemplos

      iex> Fabrica.Criterios.Allowlist.avaliar("mix test")
      {:ok, ["mix", "test"]}

      iex> Fabrica.Criterios.Allowlist.avaliar("curl http://exemplo")
      {:recusado, :binario_nao_permitido}

      iex> Fabrica.Criterios.Allowlist.avaliar("mix test && git push")
      {:recusado, :encadeamento_proibido}
  """
  @spec avaliar(String.t() | nil) :: {:ok, [String.t()]} | {:recusado, motivo()}
  def avaliar(comando) do
    bruto = comando |> to_string() |> String.trim()

    cond do
      bruto == "" -> {:recusado, :sem_comando}
      Regex.match?(@perigoso, bruto) -> {:recusado, :encadeamento_proibido}
      true -> conferir_binario(String.split(bruto, ~r/\s+/))
    end
  end

  defp conferir_binario([programa | argumentos] = argv) do
    binario = normalizar(programa)

    cond do
      binario not in @binarios -> {:recusado, :binario_nao_permitido}
      binario == "git" and not git_leitura?(argumentos) -> {:recusado, :git_nao_leitura}
      true -> {:ok, argv}
    end
  end

  defp git_leitura?([subcomando | _]), do: String.downcase(subcomando) in @git_leitura
  defp git_leitura?([]), do: false

  # `.exe`, `.cmd` e `.bat` sao a mesma ferramenta com o nome que o Windows lhe da. Ignorar a
  # extensao evita que `mix.bat` seja recusado como binario desconhecido — o que aconteceria
  # em toda maquina Windows, que e onde esta fabrica roda.
  defp normalizar(programa) do
    programa |> String.downcase() |> String.replace(~r/\.(exe|cmd|bat)$/, "")
  end
end
