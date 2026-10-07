defmodule Fabrica.Publicacao.Git do
  @moduledoc """
  Commita as `areas` de uma tarefa MAIS o markdown dela — nunca a arvore inteira.

  ## A armadilha da v1, e por que aqui nao existe `git add -A`

  Quando o agente escreve fora das `areas` declaradas, um commit escopado nao pega esses
  arquivos e o trabalho fica solto na arvore, sem rastro. Este modulo faz o oposto de
  esconder o problema: antes de adicionar qualquer coisa, pergunta ao git o que mudou na
  arvore inteira e REPROVA se houver algo fora dos caminhos declarados — devolvendo a lista,
  para quem chamou decidir (acrescentar a `areas`, descartar, investigar). Nada e commitado
  em silencio.

  Usa `Fabrica.Ferramentas.Comando`, e nao `System.cmd`: e ele que confina o diretorio de
  trabalho, mata a arvore se o git travar, e mede a duracao — a mesma ferramenta que o resto
  da fabrica ja usa para rodar comando externo.
  """

  alias Fabrica.Ferramentas.Comando

  @type caminho :: String.t()

  @doc "A mensagem canonica do commit de uma tarefa: `T-NNN: titulo`."
  @spec mensagem(String.t(), String.t()) :: String.t()
  def mensagem(codigo, titulo), do: "#{codigo}: #{titulo}"

  @doc """
  Os caminhos alterados na arvore de `raiz` que NAO estao em `caminhos`.

  Le `git status --porcelain`: cobre modificado, adicionado, removido e nao-rastreado — e um
  arquivo nao-rastreado fora das `areas` e exatamente o vazamento que a v1 media.
  """
  @spec alteracoes_fora(Path.t(), [caminho()]) :: {:ok, [caminho()]} | {:erro, term()}
  def alteracoes_fora(raiz, caminhos) do
    # `--untracked-files=all`: sem ele, um diretorio inteiramente novo sai colapsado
    # ("?? lib/") em vez de arquivo por arquivo — e "lib/" nunca bate com nenhuma `area`
    # declarada, entao TUDO dentro dele pareceria fora, mesmo quando so o arquivo certo foi
    # escrito.
    case Comando.rodar(raiz, "git", ["status", "--porcelain", "--untracked-files=all"]) do
      {:ok, %{codigo: 0, stdout: saida}} ->
        permitidos = MapSet.new(caminhos, &normalizar/1)

        fora =
          saida
          |> String.split(~r/\r?\n/, trim: true)
          |> Enum.flat_map(&caminhos_da_linha/1)
          |> Enum.map(&normalizar/1)
          |> Enum.reject(&MapSet.member?(permitidos, &1))
          |> Enum.uniq()
          |> Enum.sort()

        {:ok, fora}

      {:ok, resultado} ->
        {:erro, {:git_falhou, resultado}}

      erro ->
        erro
    end
  end

  @doc """
  Commita `caminhos` (as `areas` da tarefa + o markdown dela) em `raiz`, com `mensagem`.

  **Recusa** se houver alteracao fora de `caminhos` — devolve
  `{:erro, {:alteracoes_fora_das_areas, lista}}` e nao adiciona nem commita nada. E a
  deteccao pedida pela tarefa: reportar ANTES de commitar, nunca `add -A` em silencio.
  """
  @spec commitar(Path.t(), [caminho()], String.t()) ::
          {:ok, %{saida: String.t()}}
          | {:erro, {:alteracoes_fora_das_areas, [caminho()]}}
          | {:erro, term()}
  def commitar(raiz, caminhos, mensagem) do
    with {:ok, fora} <- alteracoes_fora(raiz, caminhos) do
      if fora == [] do
        adicionar_e_commitar(raiz, caminhos, mensagem)
      else
        {:erro, {:alteracoes_fora_das_areas, fora}}
      end
    end
  end

  @doc "O hash curto do commit mais recente em `raiz`."
  @spec hash(Path.t()) :: {:ok, String.t()} | {:erro, term()}
  def hash(raiz) do
    case Comando.rodar(raiz, "git", ["rev-parse", "--short", "HEAD"]) do
      {:ok, %{codigo: 0, stdout: saida}} -> {:ok, String.trim(saida)}
      {:ok, resultado} -> {:erro, {:git_falhou, resultado}}
      erro -> erro
    end
  end

  defp adicionar_e_commitar(raiz, caminhos, mensagem) do
    with {:ok, %{codigo: 0}} <- Comando.rodar(raiz, "git", ["add", "--"] ++ caminhos),
         {:ok, %{codigo: 0, stdout: saida}} <-
           Comando.rodar(raiz, "git", ["commit", "-m", mensagem]) do
      {:ok, %{saida: saida}}
    else
      {:ok, resultado} -> {:erro, {:git_falhou, resultado}}
      erro -> erro
    end
  end

  # "XY caminho" ou "XY origem -> destino" (renome/copia). Os dois lados de um renome contam
  # como alterados: o de origem sumiu de onde estava, o de destino apareceu onde nao devia.
  defp caminhos_da_linha(linha) do
    conteudo = String.slice(linha, 3..-1//1)

    case String.split(conteudo, " -> ") do
      [origem, destino] -> [desaspar(origem), desaspar(destino)]
      [unico] -> [desaspar(unico)]
    end
  end

  defp desaspar(caminho), do: caminho |> String.trim() |> String.trim("\"")

  defp normalizar(caminho), do: caminho |> String.trim() |> String.replace("\\", "/")
end
