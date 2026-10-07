defmodule Fabrica.Portoes.Revisor do
  @moduledoc """
  O segundo portao, e ele faz **duas perguntas separadas**:

  1. **Conformidade** — *"e o que foi pedido?"*
  2. **Revisao** — *"esta correto?"*

  Sao independentes, e a primeira e a que costuma ser esquecida. Entrega que passa em **todos**
  os criterios e nao tem defeito nenhum **ainda pode nao ser a tarefa**: criterio frouxo nao e
  licenca para entregar outra coisa. Por isso reprovar por conformidade **nao exige achar
  defeito**, e o desfecho "conformidade reprovada, zero achados" e valido e representavel — ha
  teste so para ele.

  ## Ele le o DIFF, e nao os fontes

  O revisor recebe o diff commitado. Nao recebe arquivo inteiro, e **este modulo nao tem como
  ler disco** — nao ha `File` em lugar nenhum dele, e ha teste varrendo o fonte para garantir
  que continue assim. A restricao e de custo e de foco ao mesmo tempo: revisar o diff e
  revisar o que MUDOU, e mandar o repositorio inteiro faria o revisor gastar contexto relendo
  codigo que ninguem tocou.

  ## Ele tambem nao pode consertar

  O catalogo nao da `escrever` nem `editar` a este papel. Mesma razao do verificador: portao
  que conserta o que reprova deixa de ser portao.

  ## O formato dos achados nao e cosmetico

  `[gravidade] arquivo:linha — problema`

  E dele que a T-030 extrai a politica de retrabalho: a gravidade decide se a tarefa volta ao
  construtor normal, ao reforcado, ou se e caso de replanejar. Achado em prosa livre nao se
  classifica, e o que nao se classifica vira "tente de novo", que e a resposta que ja falhou.
  """

  alias Fabrica.Ferramentas.Catalogo

  @papel "revisor"

  @typedoc """
  Gravidade do achado, da mais grave para a menos.

  A ordem e o que permite perguntar *"houve algo acima de `:medio`?"* sem uma tabela solta em
  outro lugar.
  """
  @type gravidade :: :critico | :alto | :medio | :baixo

  @type achado :: %{
          gravidade: gravidade(),
          arquivo: String.t(),
          linha: pos_integer() | nil,
          problema: String.t()
        }

  @typedoc "O veredito de conformidade: e o que foi pedido?"
  @type conformidade :: :conforme | {:nao_conforme, String.t()}

  @type veredito :: %{
          aprovado: boolean(),
          conformidade: conformidade(),
          achados: [achado()],
          motivo: :aprovado | :nao_conforme | :defeitos
        }

  @gravidades [:critico, :alto, :medio, :baixo]

  @doc "As gravidades, da mais grave para a menos."
  @spec gravidades() :: [gravidade()]
  def gravidades, do: @gravidades

  @doc "O papel deste portao no catalogo de ferramentas."
  @spec papel() :: String.t()
  def papel, do: @papel

  @doc "As ferramentas deste papel. **Nunca inclui escrita** — ver `@moduledoc`."
  @spec ferramentas() :: {:ok, map()} | {:erro, :papel_desconhecido}
  def ferramentas, do: Catalogo.do_papel(@papel)

  @doc """
  O que o revisor precisa ver: o pedido, os criterios e o **diff**.

  Nao ha caminho para fonte inteiro, de proposito — nem por argumento. Quem quiser mandar um
  arquivo inteiro tem de passa-lo dentro do proprio diff, e ai fica visivel no contexto que
  isso foi feito.
  """
  @spec contexto(keyword()) :: %{papel: String.t(), blocos: [{atom(), String.t()}]}
  def contexto(partes) do
    %{
      papel: @papel,
      blocos: [
        {:objetivo, Keyword.get(partes, :objetivo, "")},
        {:criterios, Keyword.get(partes, :criterios, "")},
        {:diff, Keyword.get(partes, :diff, "")}
      ]
    }
  end

  @doc """
  Junta as duas respostas num veredito.

  **A conformidade tem precedencia**: nao conforme reprova mesmo com zero achados, e conforme
  ainda reprova se houver defeito. As duas perguntas sao independentes e as duas podem
  reprovar sozinhas.

  ## Exemplos

      iex> Fabrica.Portoes.Revisor.julgar({:nao_conforme, "entregou outra coisa"}, [])
      %{
        aprovado: false,
        conformidade: {:nao_conforme, "entregou outra coisa"},
        achados: [],
        motivo: :nao_conforme
      }
  """
  @spec julgar(conformidade(), [achado()]) :: veredito()
  def julgar(conformidade, achados \\ []) do
    motivo =
      cond do
        match?({:nao_conforme, _}, conformidade) -> :nao_conforme
        achados != [] -> :defeitos
        true -> :aprovado
      end

    %{
      aprovado: motivo == :aprovado,
      conformidade: conformidade,
      achados: achados,
      motivo: motivo
    }
  end

  @doc """
  Formata um achado na linha canonica.

      [gravidade] arquivo:linha — problema

  Achado sem linha sai sem o `:linha` — e o caso de um defeito que e do arquivo inteiro (falta
  um teste, o modulo nao deveria existir), e inventar `:1` para ele mandaria quem for consertar
  para o lugar errado.

  ## Exemplos

      iex> Fabrica.Portoes.Revisor.formatar(%{
      ...>   gravidade: :alto,
      ...>   arquivo: "lib/a.ex",
      ...>   linha: 42,
      ...>   problema: "divisao sem guarda de zero"
      ...> })
      "[alto] lib/a.ex:42 — divisao sem guarda de zero"
  """
  @spec formatar(achado()) :: String.t()
  def formatar(%{linha: nil} = achado) do
    "[#{achado.gravidade}] #{achado.arquivo} — #{achado.problema}"
  end

  def formatar(achado) do
    "[#{achado.gravidade}] #{achado.arquivo}:#{achado.linha} — #{achado.problema}"
  end

  @doc """
  Le os achados de um texto, uma linha por achado.

  **Tolerante:** linha que nao casa e ignorada em vez de derrubar a leitura. O revisor escreve
  prosa em volta dos achados, e um parser rigido transformaria uma frase de contexto em erro
  de sistema.

  Aceita tanto o travessao quanto o hifen como separador, porque os dois aparecem e a diferenca
  nao significa nada.
  """
  @spec ler_achados(String.t() | nil) :: [achado()]
  def ler_achados(texto) do
    texto
    |> to_string()
    |> String.split(~r/\r?\n/)
    |> Enum.flat_map(&achado_da_linha/1)
  end

  @padrao ~r/^\s*[-*]?\s*\[(critico|alto|medio|baixo)\]\s+([^\s:]+?)(?::(\d+))?\s+[—-]\s+(.+?)\s*$/iu

  defp achado_da_linha(linha) do
    case Regex.run(@padrao, linha) do
      [_inteiro, gravidade, arquivo, "", problema] ->
        [montar(gravidade, arquivo, nil, problema)]

      [_inteiro, gravidade, arquivo, linha_do_arquivo, problema] ->
        [montar(gravidade, arquivo, String.to_integer(linha_do_arquivo), problema)]

      _nao_e_achado ->
        []
    end
  end

  defp montar(gravidade, arquivo, linha, problema) do
    %{
      gravidade: String.to_existing_atom(String.downcase(gravidade)),
      arquivo: arquivo,
      linha: linha,
      problema: problema
    }
  end

  @doc """
  Le o veredito de CONFORMIDADE do relato estruturado do agente.

  Formato — uma linha, em qualquer parte do texto:

      [conformidade] conforme
      [conformidade] nao-conforme — motivo aqui

  Mesma tolerancia de `ler_achados/1`: texto sem a linha, ou com a linha fora do formato (por
  exemplo `nao-conforme` sem o `— motivo` depois), devolve `:conforme` — **ausencia** de
  declaracao explicita nunca reprova por si so; so uma declaracao explicita de
  nao-conformidade reprova (ver `@moduledoc`: "critico frouxo nao e licenca para entregar
  outra coisa", mas tambem nao e licenca para reprovar por omissao). Havendo mais de uma
  linha no formato, prevalece a ULTIMA — o agente pode reafirmar o veredito mais adiante no
  mesmo relato.
  """
  @spec ler_conformidade(String.t() | nil) :: conformidade()
  def ler_conformidade(texto) do
    texto
    |> to_string()
    |> String.split(~r/\r?\n/)
    |> Enum.reduce(:conforme, fn linha, atual ->
      case conformidade_da_linha(linha) do
        nil -> atual
        encontrada -> encontrada
      end
    end)
  end

  @padrao_nao_conforme ~r/^\s*[-*]?\s*\[conformidade\]\s*:?\s*n[ãa]o[-_]?conforme\s*[—-]\s*(.+?)\s*$/iu
  @padrao_conforme ~r/^\s*[-*]?\s*\[conformidade\]\s*:?\s*conforme\s*$/iu

  defp conformidade_da_linha(linha) do
    case Regex.run(@padrao_nao_conforme, linha) do
      [_inteiro, motivo] ->
        {:nao_conforme, motivo}

      nil ->
        case Regex.run(@padrao_conforme, linha) do
          [_inteiro] -> :conforme
          nil -> nil
        end
    end
  end

  @doc """
  O achado mais grave da lista, ou `nil`.

  E o que a T-030 le para escolher a resposta ao fracasso: um critico volta diferente de tres
  baixos.
  """
  @spec pior([achado()]) :: gravidade() | nil
  def pior([]), do: nil

  def pior(achados) do
    Enum.find(@gravidades, fn gravidade ->
      Enum.any?(achados, &(&1.gravidade == gravidade))
    end)
  end
end
