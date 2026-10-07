defmodule Fabrica.Agente.OrcamentoFerramentas do
  @moduledoc """
  Quantas chamadas de ferramenta um papel deve gastar, e a partir de quantas ele parou de
  trabalhar e passou a se debater.

  ## Fonte dos numeros — NAO invente outros

  Portados de `painel/servidor/src/pipeline/despachante.ts` da v1
  (`orcamentoDeFerramentas` e `limiarDeDebate`), medidos sobre **135 etapas reais** dos
  proprios `dados/jobs/*.log.jsonl`, contando as linhas `ferramenta` de cada etapa — **sem
  gastar um centavo de modelo**. A recalibragem, quando houver mais rodadas, tem script no
  log da v1 de 2026-08-16.

  ## Sao DOIS numeros, e confundi-los foi o defeito que a v1 consertou

  | | o que e | como se usa |
  |---|---|---|
  | **alvo** | o teto que o prompt diz ao agente, para ele economizar | exortacao. Alvo bom e apertado, e e saudavel que seja excedido as vezes |
  | **limiar de debate** | a partir de onde o agente deixou de trabalhar | SENSOR de anomalia |

  Usar o alvo como sensor foi o defeito: medido, o alvo do verificador estourava em **52%**
  dos despachos, o do construtor em **36%**. Um alarme que toca em metade das rodadas e
  ruido, e ruido impede o sinal de virar atuador — ligar politica de retrabalho a um gatilho
  que dispara sempre equivale a "sempre o caro". O limiar e o **p90**: dispara em ~1 despacho
  em 10, e ai "estourou" volta a significar alguma coisa.

  | papel | alvo declarado | estourava em | p90 real | limiar |
  |---|---|---|---|---|
  | verificador | 25 | 52% | 37 | 37 |
  | construtor | 30–60 | 36% | 57 | **65** |
  | revisor | 20 | 20% | 28 | 28 |

  ## A premissa que a medicao derrubou

  **O numero de `areas` NAO prediz o numero de chamadas.** Mediana de 21 com ate 2 areas
  contra 12 com 3 areas; p90 de 57 e 58. A escada 30/45/60 escala numa variavel que nao
  correlaciona — o que varia e a natureza do trabalho, nao quantos arquivos a tarefa
  declarou. Por isso o **limiar e plano** para o construtor. O alvo segue escalonado de
  proposito: la ele e conselho de dimensionamento, e conselho por tamanho de tarefa continua
  fazendo sentido.

  ## MEDE E NAO CORTA, de proposito

  Esta em `DECISOES_FECHADAS.md` como caso que PARECE defeito e nao e. Cortar exigiria
  converter chamadas em voltas, e despacho interrompido no meio custa igual sem entregar nada
  (US$ 4,11 medidos num corte por cota). E a mesma doutrina do teto de orcamento: nunca cortar
  no meio, so nao COMECAR o que nao cabe.

  ## A lacuna da v1 que a v2 fecha

  Na v1 a medicao **nao alimentava decisao nenhuma** — era sensor sem atuador. Aqui ela
  alimenta duas: o diagnostico da v0.3 (despacho que passou do limiar e sinal de tarefa mal
  dimensionada) e a estimativa do proximo despacho. Por isso o estouro e GRAVADO em
  `despachos`, com teto e realizado, e nao apenas registrado em log.
  """

  @alvo_padrao 60

  # DIVERGENCIA DELIBERADA DA v1, e ela conserta uma incoerencia latente de la.
  #
  # Na v1 o padrao dos dois e 60: `orcamentoDeFerramentas` devolve 60 e `limiarDeDebate`
  # tambem. Para um papel nao listado — `planejador`, `documentador`, qualquer um novo — o
  # alarme fica calibrado EXATAMENTE no proprio alvo, que e o defeito que a v1 gastou uma
  # medicao para consertar nos papeis listados e nao propagou para o padrao.
  #
  # O numero nao e medido, e nao finge ser: e derivado da regra que a propria v1 enuncia — o
  # limiar tem de ficar acima do maior alvo do papel. E a mesma folga que o construtor
  # recebeu (p90 de 57 elevado a 65 para limpar o alvo de 60). Quando houver medicao para
  # papel novo, este numero e o primeiro a sair.
  @limiar_padrao 65

  @typedoc "O balanco de um despacho: quanto foi orcado, quanto foi gasto, e o que isso diz."
  @type balanco :: %{
          papel: String.t(),
          alvo: pos_integer(),
          limiar: pos_integer(),
          chamadas: non_neg_integer(),
          passou_do_alvo: boolean(),
          debate: boolean()
        }

  @doc """
  O ALVO de chamadas do papel — o numero que o prompt diz ao agente.

  Escala com `areas` para o construtor porque ali ele e conselho de dimensionamento. Note que
  isso NAO vale como previsao: a medicao mostrou que `areas` nao correlaciona com chamadas.
  """
  @spec alvo(String.t(), non_neg_integer()) :: pos_integer()
  def alvo("construtor", areas) when areas <= 2, do: 30
  def alvo("construtor", 3), do: 45
  def alvo("construtor", _areas), do: 60
  def alvo("verificador", _areas), do: 25
  def alvo("revisor", _areas), do: 20
  def alvo(_papel, _areas), do: @alvo_padrao

  @doc """
  O LIMIAR DE DEBATE do papel — a partir de onde o gasto vira anomalia.

  E o p90 medido, e nao o alvo. Plano para o construtor, porque `areas` nao prediz chamadas.
  """
  @spec limiar(String.t()) :: pos_integer()
  def limiar("construtor"), do: 65
  def limiar("verificador"), do: 37
  def limiar("revisor"), do: 28
  def limiar(_papel), do: @limiar_padrao

  @doc """
  Fecha o balanco de um despacho. **Nao interrompe nada** — so mede e nomeia.

  `passou_do_alvo` e informacao de dimensionamento; `debate` e o sinal que o diagnostico da
  v0.3 consome. Os dois existem separados justamente porque confundi-los foi o defeito.
  """
  @spec fechar(String.t(), non_neg_integer(), keyword()) :: balanco()
  def fechar(papel, chamadas, opcoes \\ []) do
    areas = Keyword.get(opcoes, :areas, 1)
    alvo = alvo(papel, areas)
    limiar = limiar(papel)

    %{
      papel: papel,
      alvo: alvo,
      limiar: limiar,
      chamadas: chamadas,
      passou_do_alvo: chamadas > alvo,
      debate: chamadas > limiar
    }
  end

  @doc """
  Os atributos que vao para a linha de `despachos`, fechando a lacuna da v1.

  Na v1 o estouro era calculado e nao gravado — sensor sem atuador. Gravado aqui, ele fica
  consultavel pelo diagnostico da v0.3 e pela estimativa do proximo despacho.
  """
  @spec para_despacho(balanco()) :: map()
  def para_despacho(balanco) do
    %{
      desfecho:
        cond do
          balanco.debate -> "debate"
          balanco.passou_do_alvo -> "acima_do_alvo"
          true -> "dentro_do_alvo"
        end
    }
  end

  @doc """
  A frase que vai no relatorio quando o despacho passou do limiar.

  `nil` quando nao passou: mensagem em toda rodada seria ruido, e ruido e o que impede o
  sinal de virar atuador.
  """
  @spec aviso(balanco()) :: String.t() | nil
  def aviso(%{debate: false}), do: nil

  def aviso(balanco) do
    "o #{balanco.papel} fez #{balanco.chamadas} chamadas de ferramenta, acima do limiar de " <>
      "debate (#{balanco.limiar}). O limiar e o p90 medido: passar dele acontece em ~1 " <>
      "despacho em 10, e costuma indicar tarefa mal dimensionada, e nao agente ineficiente."
  end

  @doc "A invariante que o teste trava: o limiar e sempre MAIOR que o maior alvo do papel."
  @spec coerente?(String.t()) :: boolean()
  def coerente?(papel) do
    maior_alvo = Enum.max(Enum.map(0..8, &alvo(papel, &1)))
    limiar(papel) > maior_alvo
  end
end
