defmodule Fabrica.Agente.Estado do
  @moduledoc """
  O estado do laco de um agente.

  ## A regra que este modulo existe para tornar impossivel de violar

  **O teto de voltas e o de gasto NAO vao no prompt.** Eles moram AQUI, no estado do
  processo, e sao conferidos pelo laco. Um teto pedido no prompt e um teto que o modelo pode
  ignorar — por distracao, por instrucao conflitante, ou porque a conversa ficou longa demais
  para ele lembrar. Um teto no estado do processo nao tem como ser ignorado: quem decide
  continuar nao e o agente.

  E a diferenca entre "o prompt pede que voce pare em 30 voltas" e "a volta 31 nao acontece".
  """

  alias Fabrica.Operario.Consumo

  @typedoc "Por que o laco terminou. E o que a v0.3 le para decidir o que fazer em seguida."
  @type desfecho :: :fim_do_turno | :teto_de_voltas | :teto_de_gasto | :recusa | :erro | nil

  @type t :: %__MODULE__{
          raiz: Path.t(),
          modelo: String.t(),
          papel: String.t(),
          vocabulario: [String.t()] | nil,
          operario: module() | nil,
          mensagens: [map()],
          voltas: non_neg_integer(),
          teto_de_voltas: pos_integer(),
          gasto_usd: float(),
          teto_de_gasto_usd: float() | nil,
          consumos: [Consumo.t()],
          desfecho: desfecho(),
          motivo_do_erro: term(),
          agulha: pid() | nil,
          ferramentas: map(),
          chamadas_de_ferramenta: non_neg_integer()
        }

  defstruct raiz: ".",
            modelo: "haiku-4.5",
            papel: "construtor",
            vocabulario: nil,
            operario: nil,
            mensagens: [],
            voltas: 0,
            teto_de_voltas: 30,
            gasto_usd: 0.0,
            teto_de_gasto_usd: nil,
            consumos: [],
            desfecho: nil,
            motivo_do_erro: nil,
            agulha: nil,
            ferramentas: %{},
            chamadas_de_ferramenta: 0

  @doc "Monta o estado inicial a partir das opcoes do despacho."
  @spec novo(keyword()) :: t()
  def novo(opcoes) do
    struct!(__MODULE__, opcoes)
  end

  @doc """
  Anexa um turno completo: o que o modelo disse e TODOS os resultados de ferramenta juntos.

  Os resultados vao num turno so, e nao um por mensagem. Dividi-los ensina o modelo a parar
  de pedir ferramentas em paralelo — e o paralelismo local e de graca, entao desensina-lo
  custa tempo de parede em toda volta seguinte.
  """
  @spec anexar_turno(t(), [map()], [map()]) :: t()
  def anexar_turno(estado, blocos_do_modelo, resultados) do
    turnos = [
      %{papel: :assistente, conteudo: blocos_do_modelo},
      %{papel: :usuario, conteudo: resultados}
    ]

    %{estado | mensagens: estado.mensagens ++ turnos}
  end

  @doc """
  Contabiliza uma volta: guarda o consumo, soma o gasto e soma as chamadas de ferramenta.

  Isto acontece ANTES de decidir se continua. Um laco cortado no meio precisa ter deixado
  registro do que ja gastou e do que ja pediu — foi exatamente o que a v1 perdia nos jobs
  mais caros, que sao justamente os cortados.

  `chamadas_de_ferramenta` conta blocos `:uso_de_ferramenta`, nao ferramentas executadas: sob
  a familia `:agente_completo` o laco nunca executa nada, e o balanco ficaria cego sem essa
  distincao.
  """
  @spec contabilizar(t(), Consumo.t(), float(), non_neg_integer()) :: t()
  def contabilizar(estado, %Consumo{} = consumo, custo_usd, chamadas_de_ferramenta \\ 0) do
    %{
      estado
      | voltas: estado.voltas + 1,
        consumos: estado.consumos ++ [consumo],
        gasto_usd: estado.gasto_usd + custo_usd,
        chamadas_de_ferramenta: estado.chamadas_de_ferramenta + chamadas_de_ferramenta
    }
  end

  @doc "Diz se o laco pode dar mais uma volta, e por que nao, quando nao pode."
  @spec pode_continuar(t()) :: :ok | {:parar, desfecho()}
  def pode_continuar(estado) do
    cond do
      estado.voltas >= estado.teto_de_voltas -> {:parar, :teto_de_voltas}
      estourou_gasto?(estado) -> {:parar, :teto_de_gasto}
      true -> :ok
    end
  end

  defp estourou_gasto?(%{teto_de_gasto_usd: nil}), do: false
  defp estourou_gasto?(estado), do: estado.gasto_usd >= estado.teto_de_gasto_usd

  @doc """
  O resumo do laco, para quem despachou.

  `motivo_do_erro` so carrega algo quando `desfecho == :erro`: o termo bruto que o operario
  devolveu (`{:cota, reabre_em}`, `:sandbox_indisponivel`, `:prazo`, etc.) — T-095 precisa
  dele para distinguir uma PAREDE (cota, sandbox indisponivel) de um erro que E do trabalho,
  sem mudar o que `desfecho` ja significa para quem le so ele (ver @moduledoc de
  `Fabrica.Agente.Laco`).
  """
  @spec resumo(t()) :: map()
  def resumo(estado) do
    %{
      desfecho: estado.desfecho,
      motivo_do_erro: estado.motivo_do_erro,
      voltas: estado.voltas,
      gasto_usd: Float.round(estado.gasto_usd, 6),
      consumos: estado.consumos,
      mensagens: estado.mensagens,
      chamadas_de_ferramenta: estado.chamadas_de_ferramenta
    }
  end
end
