defmodule Fabrica.Ferramentas.Arquivo do
  @moduledoc """
  As ferramentas de arquivo do agente: `ler`, `escrever`, `editar`, `listar` e `buscar`.

  Todas confinadas ao diretorio do projeto, e o confinamento nao e uma frase no prompt: e
  `Fabrica.Ferramentas.Confinamento`, por onde toda uma delas passa antes de tocar o disco.
  Nenhuma tem caminho alternativo ate o sistema de arquivos.

  ## `escrever`/`editar` e o mutex de `areas` (momento 2 da T-038)

  As duas ferramentas de ESCRITA recebem as `areas` da tarefa corrente e recusam, com
  `{:erro, :fora_das_areas}`, qualquer caminho que nao pertenca a elas — via
  `Fabrica.Fila.Exclusao.permitir?/2`. E o "momento 2" que torna `areas` uma PROPRIEDADE da
  ferramenta, e nao uma promessa que o texto do despacho pode furar (a armadilha paga na v1).

  O parametro `areas` e OBRIGATORIO de proposito: um default deixaria a regra opcional por
  omissao — a mesma falha da v1, uma camada acima. Lista vazia (`[]`) continua significando
  "permite qualquer caminho" (tarefa de config/doc sem `areas`, mesma semantica de
  `permitir?/2`), mas passa a ser uma decisao EXPLICITA de quem chama.

  ## `editar` e substituicao EXATA

  Ela recusa quando a string alvo aparece **zero** ou **mais de uma** vez. E a mesma
  disciplina da ferramenta de edicao que a propria fabrica usa, e a razao e a mesma: a
  edicao que "quase" acerta corrompe o arquivo em silencio. Zero ocorrencias significa que o
  agente estava olhando outra versao do arquivo; mais de uma significa que ele nao sabe qual
  vai mudar. Nos dois casos, errar e mais provavel que acertar.
  """

  alias Fabrica.Ferramentas.Confinamento
  alias Fabrica.Fila.Exclusao

  @tamanho_maximo 2_000_000

  @typedoc "Erro nomeado. O nome importa: o diagnostico da v0.3 decide a politica por ele."
  @type erro ::
          Confinamento.motivo()
          | Exclusao.motivo()
          | :arquivo_ausente
          | :arquivo_grande_demais
          | :alvo_ausente
          | :alvo_ambiguo
          | :nao_e_arquivo

  @doc "Le um arquivo do projeto."
  @spec ler(Path.t(), Path.t()) :: {:ok, String.t()} | {:erro, erro()}
  def ler(raiz, caminho) do
    with {:ok, absoluto} <- Confinamento.resolver(raiz, caminho),
         {:ok, %{size: tamanho, type: :regular}} <- estatistica(absoluto),
         :ok <- cabe?(tamanho),
         {:ok, conteudo} <- File.read(absoluto) do
      {:ok, conteudo}
    else
      {:ok, %{type: _outro}} -> {:erro, :nao_e_arquivo}
      {:error, :enoent} -> {:erro, :arquivo_ausente}
      {:error, _} -> {:erro, :arquivo_ausente}
      {:erro, motivo} -> {:erro, motivo}
    end
  end

  @doc """
  Escreve um arquivo do projeto, criando os diretorios que faltarem.

  Recusa com `{:erro, :fora_das_areas}` quando `areas` da tarefa corrente nao contem o
  `caminho` (momento 2 da T-038). `areas` vazia permite qualquer caminho.
  """
  @spec escrever(Path.t(), Path.t(), String.t(), [Fabrica.Tarefas.Area.t()]) ::
          {:ok, Path.t()} | {:erro, erro()}
  def escrever(raiz, caminho, conteudo, areas) do
    with {:ok, absoluto} <- Confinamento.resolver(raiz, caminho),
         :ok <- Exclusao.permitir?(areas, caminho) do
      File.mkdir_p!(Path.dirname(absoluto))
      File.write!(absoluto, conteudo)
      {:ok, absoluto}
    end
  end

  @doc """
  Substitui UMA ocorrencia exata de `alvo` por `novo`.

  Recusa com `:alvo_ausente` quando nao acha e `:alvo_ambiguo` quando acha mais de uma, e com
  `{:erro, :fora_das_areas}` quando o `caminho` nao pertence as `areas` da tarefa corrente
  (momento 2 da T-038). `areas` vazia permite qualquer caminho.
  """
  @spec editar(Path.t(), Path.t(), String.t(), String.t(), [Fabrica.Tarefas.Area.t()]) ::
          {:ok, Path.t()} | {:erro, erro()}
  def editar(raiz, caminho, alvo, novo, areas) do
    with {:ok, absoluto} <- Confinamento.resolver(raiz, caminho),
         :ok <- Exclusao.permitir?(areas, caminho),
         {:ok, conteudo} <- ler(raiz, caminho),
         {:ok, trocado} <- trocar(conteudo, alvo, novo) do
      File.write!(absoluto, trocado)
      {:ok, absoluto}
    end
  end

  @doc "Lista os arquivos do projeto que casam com o padrao, em ordem determinista."
  @spec listar(Path.t(), String.t()) :: {:ok, [Path.t()]} | {:erro, erro()}
  def listar(raiz, padrao \\ "**/*") do
    with {:ok, absoluta} <- Confinamento.resolver(raiz, ".") do
      arquivos =
        absoluta
        |> Path.join(padrao)
        |> String.replace("\\", "/")
        |> Path.wildcard()
        |> Enum.filter(&File.regular?/1)
        |> Enum.map(&relativo(absoluta, &1))
        |> Enum.sort()

      {:ok, arquivos}
    end
  end

  @doc """
  Busca um texto nos arquivos do projeto. Devolve `{caminho, linha, texto}`.

  A busca e por texto literal, e nao por regex: o agente pede o que quer achar, e nao um
  padrao — e um regex mal formado dele viraria erro em vez de resultado vazio.
  """
  @spec buscar(Path.t(), String.t(), keyword()) ::
          {:ok, [{Path.t(), pos_integer(), String.t()}]} | {:erro, erro()}
  def buscar(raiz, texto, opcoes \\ []) do
    padrao = Keyword.get(opcoes, :padrao, "**/*")
    limite = Keyword.get(opcoes, :limite, 200)

    with {:ok, arquivos} <- listar(raiz, padrao) do
      achados =
        arquivos
        |> Enum.flat_map(&achar_no_arquivo(raiz, &1, texto))
        |> Enum.take(limite)

      {:ok, achados}
    end
  end

  defp achar_no_arquivo(raiz, caminho, texto) do
    case ler(raiz, caminho) do
      {:ok, conteudo} ->
        conteudo
        |> String.split("\n")
        |> Enum.with_index(1)
        |> Enum.filter(fn {linha, _} -> String.contains?(linha, texto) end)
        |> Enum.map(fn {linha, numero} -> {caminho, numero, String.trim(linha)} end)

      _ ->
        []
    end
  end

  defp trocar(conteudo, alvo, novo) do
    case ocorrencias(conteudo, alvo) do
      0 -> {:erro, :alvo_ausente}
      1 -> {:ok, String.replace(conteudo, alvo, novo)}
      _ -> {:erro, :alvo_ambiguo}
    end
  end

  defp ocorrencias(conteudo, alvo) do
    conteudo |> String.split(alvo) |> length() |> Kernel.-(1)
  end

  defp estatistica(absoluto) do
    case File.stat(absoluto) do
      {:ok, stat} -> {:ok, stat}
      erro -> erro
    end
  end

  # Teto de tamanho: um arquivo de 50 MB lido para o contexto de um agente nao e leitura, e
  # um estouro de janela com o custo ja pago.
  defp cabe?(tamanho) when tamanho > @tamanho_maximo, do: {:erro, :arquivo_grande_demais}
  defp cabe?(_tamanho), do: :ok

  defp relativo(raiz, absoluto) do
    absoluto
    |> String.replace("\\", "/")
    |> String.replace_prefix(String.replace(raiz, "\\", "/") <> "/", "")
  end
end
