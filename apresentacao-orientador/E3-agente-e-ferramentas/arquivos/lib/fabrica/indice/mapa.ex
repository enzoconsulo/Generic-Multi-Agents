defmodule Fabrica.Indice.Mapa do
  @moduledoc """
  O indice denso do projeto: arvore de arquivos, simbolos publicos e o proposito de cada um.

  E o mecanismo de **maior retorno medido** da v1: derrubou o contexto por despacho de 53,5
  mil para 11–14 mil tokens, com custo de modelo **zero** para gerar. Os agentes o leem na
  abertura e so abrem na integra o que vao mudar.

  ## Por AST, nunca por regex

  A extracao usa `Code.string_to_quoted/2`. Regex sobre codigo Elixir erra em tudo que
  importa: `def` dentro de string, `defp` que parece `def`, funcao com guarda, cabecalho
  multilinha, `defdelegate`. Um indice que mente sobre o que existe e pior que indice
  nenhum — manda o agente procurar o que nao ha, e esconder o que ha.

  ## A armadilha que decide o desenho: NADA DE CABECALHO VOLATIL

  O MAPA da v1 trazia o hash do HEAD e a data de geracao no topo. Isso sozinho invalidaria o
  cache de **todo** despacho seguinte — sem erro, sem aviso, so a conta subindo. A v1
  conserta removendo o cabecalho na hora de montar o contexto (`semCabecalhoVolatil`); a v2
  **nao o gera**.

  A regra concreta, e ela e criterio de aceite: **duas geracoes sobre a mesma arvore produzem
  bytes identicos.** Sem data, sem hash, sem contador, sem ordem de sistema de arquivos. Se
  algum dia for preciso saber quando o mapa foi gerado, isso vai para um arquivo AO LADO — e
  nunca para dentro do que entra no prefixo.
  """

  @typedoc "Um simbolo publico de um modulo."
  @type simbolo :: %{
          nome: atom(),
          aridade: non_neg_integer(),
          tipo: :funcao | :macro,
          doc: String.t() | nil
        }

  @typedoc "Um modulo encontrado na arvore."
  @type modulo :: %{
          nome: String.t(),
          arquivo: Path.t(),
          doc: String.t() | nil,
          simbolos: [simbolo()]
        }

  @doc """
  Percorre os fontes e devolve os modulos publicos, em ordem determinista.

  A ordenacao e por nome de modulo, e nao pela ordem em que o sistema de arquivos entregou
  os caminhos: `Path.wildcard/1` nao promete ordem estavel entre maquinas, e uma ordem
  instavel seria exatamente o cabecalho volatil de novo, so que espalhado.
  """
  @spec extrair(keyword()) :: [modulo()]
  def extrair(opcoes \\ []) do
    raiz = raiz(opcoes)
    padroes = Keyword.get(opcoes, :padroes, ["lib/**/*.ex"])

    padroes
    |> Enum.flat_map(&Path.wildcard(Path.join(raiz, &1)))
    |> Enum.uniq()
    |> Enum.flat_map(&modulos_do_arquivo(&1, raiz))
    |> Enum.sort_by(& &1.nome)
  end

  # ARMADILHA DO WINDOWS, medida: `Path.wildcard/1` devolve `[]` para um padrao que contenha
  # `\`, mesmo com os arquivos existindo — `File.ls!` do mesmo diretorio os lista. Como
  # `System.tmp_dir!/0` e os caminhos absolutos do Windows vem com `\`, qualquer chamada com
  # raiz absoluta encontrava zero modulos e gerava um mapa VAZIO, sem erro nenhum.
  #
  # E a mesma classe do `cmd /c mix` da T-007: funcionaria num CI Linux e falha justamente
  # na maquina onde a v2 e desenvolvida.
  defp raiz(opcoes) do
    opcoes
    |> Keyword.get(:raiz, ".")
    |> String.replace("\\", "/")
  end

  defp modulos_do_arquivo(caminho, raiz) do
    relativo = caminho |> Path.relative_to(raiz) |> String.replace("\\", "/")

    case caminho |> File.read!() |> Code.string_to_quoted() do
      {:ok, arvore} -> arvore |> defmodules() |> Enum.map(&descrever(&1, relativo))
      {:error, _} -> []
    end
  end

  # Percorre a AST atras de `defmodule`. Aninhados entram tambem: um modulo dentro de outro
  # e tao publico quanto qualquer outro, e a v2 usa isso (os tipos do `Fabrica.Operario`).
  defp defmodules(arvore) do
    {_, encontrados} =
      Macro.prewalk(arvore, [], fn
        {:defmodule, _, [alias_, [do: corpo]]} = no, acumulado ->
          {no, [{nome_do_modulo(alias_), corpo} | acumulado]}

        no, acumulado ->
          {no, acumulado}
      end)

    Enum.reverse(encontrados)
  end

  defp nome_do_modulo({:__aliases__, _, partes}), do: Enum.map_join(partes, ".", &to_string/1)
  defp nome_do_modulo(outro), do: Macro.to_string(outro)

  defp descrever({nome, corpo}, arquivo) do
    %{
      nome: nome,
      arquivo: arquivo,
      doc: moduledoc(corpo),
      simbolos: simbolos(corpo)
    }
  end

  # `@moduledoc false` marca o modulo como interno — e ele NAO entra no mapa. E o unico jeito
  # que o autor tem de dizer "isto nao e interface", e o indice tem de respeitar.
  defp moduledoc(corpo) do
    corpo
    |> atributos(:moduledoc)
    |> List.first()
    |> primeira_linha()
  end

  @doc false
  def publico?(%{doc: :privado}), do: false
  def publico?(_), do: true

  defp simbolos(corpo) do
    {_, encontrados} =
      Macro.prewalk(corpo, [], fn
        {:@, _, [{:doc, _, [valor]}]} = no, acumulado ->
          {no, [{:doc, valor} | acumulado]}

        {definidor, _, [cabecalho | _]} = no, acumulado when definidor in [:def, :defmacro] ->
          {no, [{:simbolo, definidor, cabecalho} | acumulado]}

        no, acumulado ->
          {no, acumulado}
      end)

    encontrados
    |> Enum.reverse()
    |> montar_simbolos()
    |> Enum.uniq_by(&{&1.nome, &1.aridade})
    |> Enum.sort_by(&{to_string(&1.nome), &1.aridade})
  end

  # O `@doc` de uma funcao vem ANTES dela na AST; a lista e percorrida guardando o ultimo
  # `@doc` visto e gastando-o no proximo `def`. `@doc false` marca funcao interna, que sai.
  defp montar_simbolos(nos) do
    {simbolos, _} =
      Enum.reduce(nos, {[], nil}, fn
        {:doc, valor}, {acumulado, _} ->
          {acumulado, valor}

        {:simbolo, definidor, cabecalho}, {acumulado, doc} ->
          case assinatura(cabecalho) do
            nil -> {acumulado, nil}
            {nome, aridade} when doc == false -> {descartar(acumulado, nome, aridade), nil}
            {nome, aridade} -> {[novo(nome, aridade, definidor, doc) | acumulado], nil}
          end
      end)

    Enum.reverse(simbolos)
  end

  defp descartar(acumulado, _nome, _aridade), do: acumulado

  defp novo(nome, aridade, definidor, doc) do
    %{
      nome: nome,
      aridade: aridade,
      tipo: if(definidor == :defmacro, do: :macro, else: :funcao),
      doc: primeira_linha(doc)
    }
  end

  # A aridade conta os parametros do cabecalho. `when` embrulha o cabecalho numa tupla
  # propria, e sem desembrulhar a aridade sairia sempre 2 para funcao com guarda.
  defp assinatura({:when, _, [cabecalho | _]}), do: assinatura(cabecalho)

  defp assinatura({nome, _, argumentos}) when is_atom(nome) and is_list(argumentos) do
    {nome, length(argumentos)}
  end

  defp assinatura({nome, _, nil}) when is_atom(nome), do: {nome, 0}
  defp assinatura(_), do: nil

  defp atributos(corpo, chave) do
    {_, valores} =
      Macro.prewalk(corpo, [], fn
        {:@, _, [{^chave, _, [valor]}]} = no, acumulado -> {no, [valor | acumulado]}
        no, acumulado -> {no, acumulado}
      end)

    Enum.reverse(valores)
  end

  defp primeira_linha(nil), do: nil
  defp primeira_linha(false), do: :privado

  defp primeira_linha(texto) when is_binary(texto) do
    texto
    |> String.split("\n", trim: true)
    |> Enum.map(&String.trim/1)
    |> Enum.find(&(&1 != ""))
  end

  defp primeira_linha({:__block__, _, [texto]}), do: primeira_linha(texto)
  defp primeira_linha(_), do: nil

  @doc """
  Monta o markdown do mapa. **Sem data, sem hash, sem contador** — ver o `@moduledoc`.

  A unica coisa variavel aqui e o conteudo da arvore. Se a arvore nao mudou, o byte nao
  muda, e o prefixo do despacho seguinte continua valendo no cache.
  """
  @spec render([modulo()]) :: String.t()
  def render(modulos) do
    publicos = Enum.reject(modulos, &(&1.doc == :privado))

    [
      "# MAPA — indice denso do projeto\n",
      "\nGERADO por `mix fabrica.mapa`. Nao edite a mao.\n",
      "\nO que EXISTE e onde. O `GUIA.md` ao lado diz COMO SE FAZ.\n",
      "\n## Arvore\n\n",
      arvore(publicos),
      "\n## Modulos\n",
      Enum.map(publicos, &render_modulo/1)
    ]
    |> IO.iodata_to_binary()
  end

  defp arvore(modulos) do
    modulos
    |> Enum.map(& &1.arquivo)
    |> Enum.uniq()
    |> Enum.sort()
    |> Enum.map_join("", &"- `#{&1}`\n")
  end

  defp render_modulo(modulo) do
    proposito = if modulo.doc, do: " — #{modulo.doc}", else: ""

    cabecalho = "\n### `#{modulo.nome}`#{proposito}\n\n`#{modulo.arquivo}`\n"

    corpo =
      case modulo.simbolos do
        [] -> "\n_sem simbolos publicos._\n"
        simbolos -> "\n" <> Enum.map_join(simbolos, "", &render_simbolo/1)
      end

    cabecalho <> corpo
  end

  defp render_simbolo(simbolo) do
    marca = if simbolo.tipo == :macro, do: " (macro)", else: ""
    proposito = if simbolo.doc, do: " — #{simbolo.doc}", else: ""

    "- `#{simbolo.nome}/#{simbolo.aridade}`#{marca}#{proposito}\n"
  end

  @doc "Gera o mapa e grava em `_gestao/MAPA.md`. Devolve o caminho e o tamanho."
  @spec gravar(keyword()) :: {:ok, Path.t(), non_neg_integer()}
  def gravar(opcoes \\ []) do
    destino = Keyword.get(opcoes, :destino, Path.join(raiz(opcoes), "_gestao/MAPA.md"))

    conteudo = opcoes |> extrair() |> render()

    File.mkdir_p!(Path.dirname(destino))
    File.write!(destino, conteudo)

    {:ok, destino, byte_size(conteudo)}
  end
end
