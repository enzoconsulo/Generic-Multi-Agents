defmodule Fabrica.Retrabalho.Escada do
  @moduledoc """
  Os quatro degraus da resposta ao fracasso. **Cada um so e usado depois que o anterior falhou
  de verdade.**

      1. sobe de modelo          <- 1a reprovacao
      2. troca de especialista   <- 2a reprovacao SOB O MESMO especialista
      3. replaneja               <- 3 ciclos esgotados
      4. bloqueia                <- esgotou de novo (ja e fruto de replanejamento)

  ## O gatilho e sempre FATO REGISTRADO, nunca palpite

  Nenhum degrau sobe porque a tarefa "parece dificil". Sobe porque uma tentativa anterior
  reprovou, e isso esta contado em `tentativas` — que **o sistema incrementa** (T-022), nao o
  agente. Palpite sobre dificuldade e o que faz gastar modelo caro em tarefa facil e insistir
  no barato na dificil.

  ## Por que cada degrau, na ordem

  1. **Sobe de modelo.** Insistir no mesmo modelo paga construtor, verificador e revisor de
     novo **e queima uma das tres fichas**. A ficha e o recurso escasso: na terceira a tarefa
     bloqueia.
  2. **Troca de especialista.** Ele foi escolhido no planejamento, **antes de se saber onde a
     tarefa iria falhar**. Duas reprovacoes sob o mesmo prompt de dominio sao evidencia de que
     a especializacao esta enviesando o ataque — entao a terceira vai para o reforcado
     GENERICO. A troca e registrada com o motivo, porque decisao sem registro vira folclore.
  3. **Replaneja.** Tres ciclos esgotados e o reconhecimento de que o problema pode ser de
     **DIMENSIONAMENTO**, e nao de execucao. O planejador quebra a tarefa em 2-3 menores; a
     original vira `cancelada` com referencia (`Fabrica.Tarefas.Fila` ja sabe seguir essa
     linhagem).
  4. **Bloqueia.** Autocorrecao vale **UMA vez por linhagem**: tarefa que ja nasceu de
     replanejamento nao replaneja outra vez. Sem esse limite, uma tarefa impossivel gera
     substitutas para sempre.

  ## O teto de despachos, e por que ele existe mesmo com o contador correto

  A escada inteira depende de `tentativas` estar certo. Na v1 o agente as vezes esquecia de
  incrementar, e uma rodada mediu **41 despachos e US$ 22,55** — a mesma tarefa girando sem
  nunca esgotar ciclo.

  Na v2 quem incrementa e o sistema, entao o esquecimento nao acontece mais. **O teto fica
  assim mesmo**, e isso e deliberado: e defesa em profundidade. Ele nao confia na escada, nao
  confia no contador e nao confia em quem os escreveu — corta por contagem bruta de despachos
  na rodada.

  O numero: 3 ciclos x 3 papeis = 9 despachos no pior caso legitimo, mais folga para o
  documentador e para o marco. **#{12} e o teto.** Estourou, a tarefa sai da rodada — e nao
  bloqueia: rodada seguinte recomeca a contagem, porque o teto e sobre a rodada e nao sobre a
  tarefa.
  """

  @typedoc "Qual degrau da escada."
  @type degrau :: :sobe_de_modelo | :troca_de_especialista | :replaneja | :bloqueia

  @typedoc """
  O que se sabe da tarefa no momento de decidir.

  `especialistas_usados` e a lista na ORDEM das execucoes — e ela, e nao um contador, que
  responde *"as duas reprovacoes foram sob o mesmo especialista?"*.
  """
  @type situacao :: %{
          optional(:especialistas_usados) => [String.t() | nil],
          optional(:replanejada_de) => term() | nil,
          optional(:despachos_na_rodada) => non_neg_integer(),
          tentativas: non_neg_integer()
        }

  @type decisao :: %{
          degrau: degrau(),
          modelo: :do_disparo | :reforcado,
          especialista: :manter | :generico_reforcado,
          motivo: String.t()
        }

  @max_tentativas 3
  @teto_de_despachos 12

  @doc "Maximo de ciclos antes de esgotar. Tres, e o mesmo da v1."
  @spec max_tentativas() :: pos_integer()
  def max_tentativas, do: @max_tentativas

  @doc """
  Maximo de despachos de uma tarefa numa rodada.

  Defesa em profundidade: nao confia na escada nem no contador. Ver `@moduledoc`.
  """
  @spec teto_de_despachos() :: pos_integer()
  def teto_de_despachos, do: @teto_de_despachos

  @doc """
  O que fazer com esta tarefa agora.

  Devolve `{:ok, decisao}` para despachar de novo, ou `{:parar, motivo}` quando nao ha proximo
  despacho — por teto de rodada (a tarefa volta na proxima) ou por bloqueio (a tarefa espera
  o usuario).

  ## Exemplos

      iex> Fabrica.Retrabalho.Escada.proximo(%{tentativas: 1})
      {:ok,
       %{
         degrau: :sobe_de_modelo,
         modelo: :reforcado,
         especialista: :manter,
         motivo: "1a reprovacao: insistir no mesmo modelo paga o ciclo inteiro de novo"
       }}
  """
  @spec proximo(situacao()) :: {:ok, decisao()} | {:parar, term()}
  def proximo(situacao) do
    cond do
      estourou_a_rodada?(situacao) -> {:parar, :teto_de_despachos}
      esgotou_os_ciclos?(situacao) -> fim_da_linha(situacao)
      true -> {:ok, degrau_de_retrabalho(situacao)}
    end
  end

  # PRIMEIRO de todos, e de proposito: o teto nao confia em nada do que vem depois. Se a
  # escada tiver um defeito que a faca girar, e ele que corta.
  defp estourou_a_rodada?(situacao) do
    Map.get(situacao, :despachos_na_rodada, 0) >= @teto_de_despachos
  end

  defp esgotou_os_ciclos?(situacao), do: situacao.tentativas >= @max_tentativas

  defp fim_da_linha(situacao) do
    if replanejada?(situacao) do
      {:parar,
       {:bloqueada,
        "esgotou os #{@max_tentativas} ciclos e JA e fruto de replanejamento: " <>
          "autocorrecao vale uma vez por linhagem"}}
    else
      {:ok,
       %{
         degrau: :replaneja,
         modelo: :reforcado,
         especialista: :manter,
         motivo:
           "esgotou os #{@max_tentativas} ciclos: o problema pode ser de DIMENSIONAMENTO, " <>
             "e nao de execucao"
       }}
    end
  end

  defp replanejada?(situacao), do: Map.get(situacao, :replanejada_de) not in [nil, ""]

  defp degrau_de_retrabalho(situacao) do
    if situacao.tentativas >= 2 and mesmo_especialista?(situacao) do
      trocar_de_especialista(situacao)
    else
      subir_de_modelo(situacao)
    end
  end

  defp subir_de_modelo(situacao) do
    %{
      degrau: :sobe_de_modelo,
      modelo: modelo(situacao.tentativas),
      especialista: :manter,
      motivo: motivo_do_modelo(situacao.tentativas)
    }
  end

  defp trocar_de_especialista(situacao) do
    usado = situacao |> Map.get(:especialistas_usados, []) |> List.first()

    %{
      degrau: :troca_de_especialista,
      modelo: :reforcado,
      especialista: :generico_reforcado,
      motivo:
        "2a reprovacao sob o mesmo especialista (#{usado}): ele foi escolhido no " <>
          "planejamento, antes de se saber onde a tarefa iria falhar, e duas reprovacoes sob " <>
          "o mesmo prompt de dominio sao evidencia de vies no ataque"
    }
  end

  defp modelo(0), do: :do_disparo
  defp modelo(_tentativas), do: :reforcado

  defp motivo_do_modelo(0), do: "primeira execucao: usa o modelo do disparo"

  defp motivo_do_modelo(1) do
    "1a reprovacao: insistir no mesmo modelo paga o ciclo inteiro de novo"
  end

  defp motivo_do_modelo(_tentativas) do
    "retrabalho: a aposta anterior ja falhou, e repeti-la queima uma das " <>
      "#{@max_tentativas} fichas"
  end

  # Duas ou mais execucoes, e todas com o MESMO especialista nomeado. Tarefa sem especialista
  # nao tem o que trocar: ela ja roda no generico.
  defp mesmo_especialista?(situacao) do
    case situacao |> Map.get(:especialistas_usados, []) |> Enum.uniq() do
      [unico] when unico not in [nil, ""] ->
        length(Map.get(situacao, :especialistas_usados, [])) >= 2

      _varios_ou_nenhum ->
        false
    end
  end
end
