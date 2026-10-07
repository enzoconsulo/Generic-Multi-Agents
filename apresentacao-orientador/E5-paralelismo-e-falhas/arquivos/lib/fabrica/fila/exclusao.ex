defmodule Fabrica.Fila.Exclusao do
  @moduledoc """
  `areas` como mutex do paralelismo, verificado — e nao apenas prometido — nos DOIS
  momentos que a T-038 exige.

  ## A armadilha da v1, e por que dois momentos

  Na v1 `areas` so descrevia o que a TAREFA declarava; o despacho em si era texto livre, e
  uma linha de "contexto extra" no prompt furava o mutex sem que nada acusasse. Aconteceu em
  14/08: uma tarefa recebeu ordem de mexer num arquivo que era `area` de OUTRA, e a checagem
  de disjuncao — que so olhava as areas declaradas — disse "ok".

  Por isso a verificacao mora em dois lugares diferentes, e nenhum confia no outro:

    1. **`lote/2`** — antes de despachar: quais tarefas podem sair no mesmo lote agora.
    2. **`permitir?/2`** — na propria ferramenta de escrita: o caminho que o agente esta
       gravando pertence as `areas` DESTA tarefa? E o momento que a v1 nao tinha, e e ele
       que torna a regra uma propriedade do sistema em vez de uma instrucao que um prompt
       mal escrito pode furar.

  ## `lote/2` e composicao, nao reimplementacao

  O algoritmo que decide "ate 3 construtores com areas disjuntas, verificador so com o
  projeto quieto, revisor roda com qualquer coisa" ja existe e ja e testado —
  `Fabrica.Tarefas.Fila.proximos/2` (T-023). Reimplementa-lo aqui abriria uma segunda fonte
  de verdade que pode divergir da primeira sem que nada acuse.

  O que este modulo acrescenta em cima da delegacao e a palavra "verificada" do titulo da
  tarefa levada a serio: `lote/2` CONFERE, sobre o resultado que recebeu de volta, que as
  tres garantias realmente valem — areas disjuntas entre construtores, verificador nunca
  acompanhado de construtor, teto de construtores respeitado — e levanta se alguma delas
  falhar. Um bug futuro em `Fila.proximos/2` que quebrasse o mutex apareceria aqui como
  crash imediato, no lugar de silenciosamente despachar dois construtores sobre o mesmo
  arquivo.
  """

  alias Fabrica.Ferramentas.Confinamento
  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Fila
  alias Fabrica.Tarefas.Fila.Passo
  alias Fabrica.Tarefas.Tarefa

  @typedoc "Por que a escrita foi recusada. Nomeado, para o agente entender e nao repetir."
  @type motivo :: :fora_das_areas

  @doc """
  Momento 1 — antes de despachar. Os proximos passos, com o mutex de `areas` CONFERIDO
  sobre o que `Fabrica.Tarefas.Fila.proximos/2` devolveu.

  Aceita as mesmas opcoes de `Fila.proximos/2` (`:max_construtores`; sem ele, usa
  `Fila.max_construtores_padrao/0` — D-003. **Fonte unica**: este modulo nao guarda o
  numero, so delega).
  """
  @spec lote([Tarefa.t()], keyword()) :: [Passo.t()]
  def lote(tarefas, opcoes \\ []) do
    maximo = Keyword.get(opcoes, :max_construtores, Fila.max_construtores_padrao())
    passos = Fila.proximos(tarefas, opcoes)

    :ok = conferir_areas_disjuntas(passos)
    :ok = conferir_verificador_sozinho(passos)
    :ok = conferir_teto(passos, maximo)

    passos
  end

  @doc """
  Momento 2 — na ferramenta de escrita. O `caminho` que o agente esta gravando pertence as
  `areas` desta tarefa?

  Recusa com `{:erro, :fora_das_areas}` quando a tarefa declara `areas` e o caminho nao
  esta entre elas — comparado pela forma NORMALIZADA
  (`Fabrica.Ferramentas.Confinamento.normalizar/1`), pela mesma razao do confinamento: o
  sistema de arquivos do Windows e case-insensitive e aceita as duas barras, e uma
  comparacao ingenua deixaria `Lib\\Foo.ex` passar por nao bater com `lib/foo.ex`.

  Tarefa SEM `areas` declaradas permite qualquer caminho: o preco de "sem areas" ja foi
  pago no momento 1 (`Fabrica.Tarefas.Fila.proximos/2` a faz rodar sozinha, sem nenhum
  construtor ao lado) — recusar tambem aqui bloquearia toda tarefa de configuracao ou
  documentacao que legitimamente nao declara `areas`.
  """
  @spec permitir?([Area.t()], Path.t()) :: :ok | {:erro, motivo()}
  def permitir?([], _caminho), do: :ok

  def permitir?(areas, caminho) do
    declarados = MapSet.new(areas, &Confinamento.normalizar(&1.caminho))

    if MapSet.member?(declarados, Confinamento.normalizar(caminho)) do
      :ok
    else
      {:erro, :fora_das_areas}
    end
  end

  defp conferir_areas_disjuntas(passos) do
    conjuntos =
      passos
      |> Enum.filter(&(&1.papel == :construtor))
      |> Enum.map(
        &MapSet.new(&1.tarefa.areas, fn area -> Confinamento.normalizar(area.caminho) end)
      )
      |> Enum.reject(&(MapSet.size(&1) == 0))

    if todas_disjuntas?(conjuntos) do
      :ok
    else
      raise "Fabrica.Fila.Exclusao: Fila.proximos/2 devolveu construtores com areas que " <>
              "se cruzam — invariante do mutex quebrado"
    end
  end

  # Cada par de conjuntos de `areas` e disjunto dos demais?
  #
  # Publico (mas `@doc false`, fora do indice) so para ser PROVAVEL: a invariante que
  # `conferir_areas_disjuntas/1` protege nao e alcancavel pelo caminho de `lote/2`, porque um
  # `Fabrica.Tarefas.Fila.proximos/2` correto nunca devolve construtores sobrepostos — entao a
  # unica forma de provar que o guard esta correto e testar o predicado direto.
  #
  # Compara por POSICAO (`i < j`), nao por valor: dois construtores com conjuntos IDENTICOS sao
  # o caso mais direto de mutex quebrado, e uma comparacao `a != b` os deixaria escapar (o unico
  # par possivel seria filtrado por igualdade, a lista sairia vazia, e `Enum.all?([]) == true`).
  @doc false
  @spec todas_disjuntas?([MapSet.t()]) :: boolean()
  def todas_disjuntas?(conjuntos) do
    indexados = Enum.with_index(conjuntos)

    for({a, i} <- indexados, {b, j} <- indexados, i < j, do: MapSet.disjoint?(a, b))
    |> Enum.all?()
  end

  defp conferir_verificador_sozinho(passos) do
    tem_verificador? = Enum.any?(passos, &(&1.papel == :verificador))
    tem_construtor? = Enum.any?(passos, &(&1.papel == :construtor))

    if tem_verificador? and tem_construtor? do
      raise "Fabrica.Fila.Exclusao: Fila.proximos/2 devolveu verificador junto com " <>
              "construtor — o verificador exige o projeto quieto"
    else
      :ok
    end
  end

  defp conferir_teto(passos, maximo) do
    quantidade = passos |> Enum.filter(&(&1.papel == :construtor)) |> length()

    if quantidade <= maximo do
      :ok
    else
      raise "Fabrica.Fila.Exclusao: Fila.proximos/2 devolveu #{quantidade} construtores, " <>
              "acima do teto de #{maximo}"
    end
  end
end
