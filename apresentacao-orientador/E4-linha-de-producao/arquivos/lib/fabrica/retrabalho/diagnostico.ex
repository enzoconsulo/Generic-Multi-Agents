defmodule Fabrica.Retrabalho.Diagnostico do
  @moduledoc """
  Le a reprovacao e decide **COMO** refazer — nao apenas que refazer. **Puro.**

  Todo o julgamento do retrabalho mora aqui, e por isso e aqui que os testes sao exaustivos.
  A escada (T-030) decide *se* e *com quem*; este modulo decide *com quanto*.

  ## As quatro naturezas, e o que cada uma implica

  | natureza | o que houve | escopo | voltas |
  |---|---|---|---|
  | `:impedimento` | o construtor declarou que nao consegue | inteiro | medio |
  | `:conformidade` | entregou outra coisa | **inteiro** | amplo |
  | `:funcional` | um criterio executavel reprovou | inteiro | medio |
  | `:pontual` | achado com arquivo e linha nomeados | **so os arquivos** | pela gravidade |

  A ordem da tabela e a ordem de PRECEDENCIA, e ela nao e arbitraria:

  1. **`:impedimento` vem primeiro** porque nenhuma quantidade de voltas resolve *"nao tenho a
     credencial"*. Ignora-lo para olhar os achados seria consertar sintoma.
  2. **`:conformidade` vem antes de `:funcional`** porque nao adianta fazer passar o criterio
     de uma tarefa que nao e a tarefa. E o caso especial que a T-029 nomeia: vai direto para
     escopo inteiro com **o objetivo recolocado no foco**.
  3. **`:funcional` antes de `:pontual`** porque criterio executavel que reprovou e evidencia
     mais forte que a leitura de um revisor.

  ## Escopo e voltas seguem regras DIFERENTES, e isso e deliberado

  O **escopo** vem da natureza: so `:pontual` estreita, porque so ele tem arquivos nomeados.

  As **voltas** vem da natureza *e* da gravidade. Um `:critico` num ponto nomeado continua
  sendo conserto de escopo estreito — mas merece o teto medio, porque acertar de primeira
  importa mais ali. Foi o que reconciliou as duas frases do plano: *"estreito para conserto
  pontual"* e *"medio para defeito grave ou falha funcional"*.

  ## O foco vem em ordem de gravidade

  Quem le uma lista longa conserta os primeiros itens. Entao a ordem do foco decide o que sera
  consertado quando as voltas acabarem — e por isso ela e por gravidade, e nao pela ordem em
  que o revisor escreveu.
  """

  alias Fabrica.Portoes.Revisor
  alias Fabrica.Retrabalho.Politica

  @typedoc """
  O que se sabe sobre a reprovacao.

  Cada campo e opcional porque nem todo portao produz todos: o verificador nao emite achados,
  e o revisor nao reprova criterio executavel.
  """
  @type reprovacao :: %{
          optional(:portao) => :verificador | :revisor,
          optional(:conformidade) => Revisor.conformidade() | nil,
          optional(:achados) => [Revisor.achado()],
          optional(:criterios_reprovados) => [String.t()],
          optional(:impedimento) => String.t() | nil,
          optional(:objetivo) => String.t()
        }

  @doc """
  A natureza da falha, pela ordem de precedencia do `@moduledoc`.

  Reprovacao sem sinal nenhum e `:funcional`: algo reprovou e ninguem disse o que. Chamar isso
  de `:pontual` daria escopo estreito **sem arquivo nenhum para estreitar**, e o construtor
  receberia uma lista vazia como se fosse instrucao.
  """
  @spec natureza(reprovacao()) :: Politica.natureza()
  def natureza(reprovacao) do
    cond do
      impedido?(reprovacao) -> :impedimento
      nao_conforme?(reprovacao) -> :conformidade
      reprovou_criterio?(reprovacao) -> :funcional
      pontual?(reprovacao) -> :pontual
      true -> :funcional
    end
  end

  defp impedido?(reprovacao) do
    case Map.get(reprovacao, :impedimento) do
      nil -> false
      texto -> String.trim(texto) != ""
    end
  end

  defp nao_conforme?(reprovacao) do
    match?({:nao_conforme, _motivo}, Map.get(reprovacao, :conformidade))
  end

  defp reprovou_criterio?(reprovacao) do
    Map.get(reprovacao, :criterios_reprovados, []) != []
  end

  # Pontual exige arquivo NOMEADO. Achado sem arquivo nao estreita escopo nenhum, e prometer
  # escopo estreito sem ter onde estreitar e pior que nao prometer.
  defp pontual?(reprovacao) do
    reprovacao |> achados() |> Enum.any?(&(&1.arquivo not in [nil, ""]))
  end

  defp achados(reprovacao), do: Map.get(reprovacao, :achados, [])

  @doc """
  A politica do proximo despacho.

  `:tentativas` e o contador do sistema (T-022), lido ANTES do incremento: `0` significa que
  ainda nao houve execucao, entao a proxima usa o modelo do disparo; `>= 1` significa que ja
  houve, e a v1 mediu que repetir a aposta que ja falhou paga construtor, verificador e revisor
  de novo **e queima uma das tres fichas**.
  """
  @spec diagnosticar(reprovacao(), keyword()) :: Politica.t()
  def diagnosticar(reprovacao, opcoes \\ []) do
    natureza = natureza(reprovacao)
    ordenados = ordenar(achados(reprovacao))
    largura = largura(natureza, ordenados)

    %Politica{
      natureza: natureza,
      modelo: modelo(Keyword.get(opcoes, :tentativas, 0)),
      largura: largura,
      voltas: Politica.voltas(largura),
      escopo: escopo(natureza, ordenados),
      foco: foco(natureza, ordenados, reprovacao)
    }
  end

  defp modelo(tentativas) when tentativas >= 1, do: :reforcado
  defp modelo(_tentativas), do: :do_disparo

  # Escopo vem da NATUREZA; voltas vem da natureza E da gravidade. Ver `@moduledoc`.
  defp largura(:conformidade, _achados), do: :amplo
  defp largura(:impedimento, _achados), do: :medio
  defp largura(:funcional, _achados), do: :medio

  defp largura(:pontual, achados) do
    if Revisor.pior(achados) in [:critico, :alto], do: :medio, else: :estreito
  end

  defp escopo(:pontual, achados) do
    arquivos =
      achados
      |> Enum.map(& &1.arquivo)
      |> Enum.reject(&(&1 in [nil, ""]))
      |> Enum.uniq()

    {:arquivos, arquivos}
  end

  defp escopo(_natureza, _achados), do: :tarefa_inteira

  # Na conformidade o foco e o OBJETIVO recolocado, e nao os defeitos: consertar bug de uma
  # entrega que nao e a tarefa e trabalho jogado fora.
  defp foco(:conformidade, achados, reprovacao) do
    motivo =
      case Map.get(reprovacao, :conformidade) do
        {:nao_conforme, texto} -> texto
        _outro -> "a entrega nao corresponde ao pedido"
      end

    ["O QUE FOI PEDIDO: #{Map.get(reprovacao, :objetivo, "(objetivo nao informado)")}"] ++
      ["POR QUE REPROVOU: #{motivo}"] ++ Enum.map(achados, &Revisor.formatar/1)
  end

  defp foco(:impedimento, achados, reprovacao) do
    ["IMPEDIMENTO DECLARADO: #{Map.get(reprovacao, :impedimento)}"] ++
      Enum.map(achados, &Revisor.formatar/1)
  end

  defp foco(_natureza, achados, reprovacao) do
    Enum.map(Map.get(reprovacao, :criterios_reprovados, []), &"CRITERIO REPROVADO: #{&1}") ++
      Enum.map(achados, &Revisor.formatar/1)
  end

  # Por gravidade, e o desempate e a ordem original — sort_by e estavel, entao dois achados de
  # mesma gravidade saem como o revisor os escreveu.
  defp ordenar(achados) do
    posicao = Revisor.gravidades() |> Enum.with_index() |> Map.new()

    Enum.sort_by(achados, &Map.get(posicao, &1.gravidade, 99))
  end
end
