defmodule Fabrica.Tarefas.Maquina do
  @moduledoc """
  Quais transicoes de estado existem. **Funcao pura, sem banco e sem efeito.**

  A separacao entre esta e a `Fabrica.Tarefas.Transicao` e deliberada: aqui mora a REGRA,
  la mora a GRAVACAO. Regra pura se testa exaustivamente — as 64 combinacoes de oito
  estados cabem num teste so — e nao ha caminho pelo qual alguem escreva estado sem passar
  pela pergunta, porque quem escreve chama quem pergunta.

  ## O mapa

      backlog     -> pronta         (dependencias cada uma concluida)
      pronta      -> em_execucao    (despacho do construtor)
      em_execucao -> em_teste       (construtor terminou)
      em_teste    -> em_revisao     (verificador aprovou)
      em_teste    -> em_execucao    (verificador reprovou)
      em_revisao  -> concluida      (revisor aprovou)
      em_revisao  -> em_execucao    (revisor reprovou)
      qualquer    -> bloqueada      (esgotou ciclos)
      qualquer    -> cancelada      (replanejamento)

  ## O que "qualquer" quer dizer, exatamente

  O plano escreve *"qualquer -> bloqueada"* e *"qualquer -> cancelada"*, e a palavra e
  ambigua nos extremos. A leitura implementada aqui, e a razao de cada ponta:

  - **`concluida` nao e origem de nada.** Bloquear ou cancelar tarefa concluida desfaria
    trabalho aprovado pelos dois portoes; se o resultado estava errado, o que existe e uma
    tarefa NOVA, nao a ressurreicao da antiga.
  - **`bloqueada -> cancelada` E legal**, e nao por simetria: e o caminho da autocorrecao
    que a fabrica ja pratica. Ao esgotar os tres ciclos, a tarefa bloqueia; o planejador
    reescreve a abordagem; a original vira `cancelada` e as substitutas nascem com
    `replanejada_de`. Sem esta aresta o replanejamento nao teria como fechar a original.
  - **`cancelada` nao e origem de nada.** E o fim da linhagem.

  ## Entrega ao construtor

  `entrega_ao_construtor?/1` responde a unica pergunta que decide o incremento de
  `tentativas`, e a resposta e simples porque o desenho e: **entrar em `em_execucao` E ser
  entregue a um construtor**, venha a tarefa de `pronta` (primeira vez) ou de `em_teste` /
  `em_revisao` (retrabalho). Quem incrementa e a `Transicao`, na mesma transacao da
  mudanca de estado — nunca o agente.
  """

  alias Fabrica.Tarefas.Tarefa

  @type estado :: atom()

  @transicoes %{
    backlog: [:pronta, :bloqueada, :cancelada],
    pronta: [:em_execucao, :bloqueada, :cancelada],
    em_execucao: [:em_teste, :bloqueada, :cancelada],
    em_teste: [:em_revisao, :em_execucao, :bloqueada, :cancelada],
    em_revisao: [:concluida, :em_execucao, :bloqueada, :cancelada],
    concluida: [],
    bloqueada: [:cancelada],
    cancelada: []
  }

  @doc """
  O mapa inteiro, origem => destinos legais.

  Publico para que o teste possa varrer as combinacoes sem reescrever a tabela — teste que
  repete a tabela da producao so prova que dois arquivos concordam.
  """
  @spec transicoes() :: %{estado() => [estado()]}
  def transicoes, do: @transicoes

  @doc "Cada estado que a maquina conhece: os seis do pipeline mais os dois terminais."
  @spec estados() :: [estado()]
  def estados, do: Tarefa.estados() ++ Tarefa.terminais()

  @doc "Para onde este estado pode ir. Estado desconhecido nao leva a lugar nenhum."
  @spec destinos(estado()) :: [estado()]
  def destinos(de), do: Map.get(@transicoes, de, [])

  @doc """
  A transicao e legal?

  ## Exemplos

      iex> Fabrica.Tarefas.Maquina.pode?(:em_teste, :em_execucao)
      true

      iex> Fabrica.Tarefas.Maquina.pode?(:backlog, :concluida)
      false
  """
  @spec pode?(estado(), estado()) :: boolean()
  def pode?(de, para), do: para in destinos(de)

  @doc """
  A mesma pergunta, com o erro NOMEADO no lugar de um `false` mudo.

  E esta que a `Transicao` usa: dentro de um `Ecto.Multi`, `false` viraria
  `{:error, :conferida, false, ...}`, que nao diz o que se tentou fazer.
  """
  @spec conferir(estado(), estado()) :: :ok | {:erro, {:transicao_invalida, estado(), estado()}}
  def conferir(de, para) do
    if pode?(de, para), do: :ok, else: {:erro, {:transicao_invalida, de, para}}
  end

  @doc "O estado e um fim de linha — nada sai dele?"
  @spec terminal?(estado()) :: boolean()
  def terminal?(estado), do: destinos(estado) == []

  @doc """
  Esta transicao entrega a tarefa a um construtor, e portanto gasta uma tentativa?

  Vale para a primeira execucao e para cada retrabalho: o que conta e ENTRAR em
  `em_execucao`, nao de onde se veio.
  """
  @spec entrega_ao_construtor?(estado()) :: boolean()
  def entrega_ao_construtor?(:em_execucao), do: true
  def entrega_ao_construtor?(_para), do: false
end
