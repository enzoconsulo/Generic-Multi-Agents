defmodule Fabrica.Tarefas.Transicao do
  @moduledoc """
  Muda o estado de uma tarefa. **Estado, relatorio e custo entram na MESMA transacao, ou
  nao entra nada.**

  E aqui que a tese sai da prosa: na v1 a mudanca de estado era um agente reescrevendo o
  frontmatter de um markdown, e o custo era outra escrita, noutro arquivo, noutro momento.
  Entre as duas cabia uma queda — e cabia esquecer. Aqui as tres gravacoes sao um
  `Ecto.Multi`: ou existe tarefa que mudou de estado COM o motivo e COM a conta, ou o banco
  ficou exatamente como estava.

  ## O que uma transicao grava

  | gravacao | quando | de onde vem |
  |---|---|---|
  | `tarefas.status` | sempre | o `para` |
  | `tarefas.tentativas` | so ao entrar em `em_execucao` | incremento do SISTEMA |
  | uma linha em `ciclos` | quando ha `:papel` | o relatorio da etapa |
  | uma linha em `despachos` | quando ha `:despacho` | qual operario, qual modelo |
  | N linhas em `consumos` | quando ha `:consumos` | uma por volta |

  Nada disso e obrigatorio junto: a entrega ao construtor (`pronta -> em_execucao`) nao tem
  relatorio nenhum para gravar, porque ninguem terminou nada ainda. O que e proibido e o
  contrario — relatorio ou custo **sem** a mudanca de estado que os explica.

  ## `tentativas` e do sistema, e o off-by-one importa

  `tentativas` conta **quantas vezes a tarefa ja foi entregue a um construtor**, e o
  incremento acontece dentro desta transacao. Consequencia pratica, que e a que o resto da
  fabrica le: no momento de decidir o modelo do PROXIMO despacho, `tentativas >= 1`
  significa que ja houve execucao anterior — exatamente a regra da v1, e agora impossivel
  de esquecer, porque quem incrementa nao e o agente.

  Na v1 o agente as vezes esquecia de incrementar e a mesma tarefa girava: uma rodada
  mediu 41 despachos e US$ 22,55.

  ## O numero do ciclo

  `ciclos.numero` e `max(tentativas_antes_da_transicao, 1)`. Lido ANTES do incremento, o
  relatorio do verificador que reprova cai no ciclo que acabou de falhar, e nao no que
  ainda vai comecar. Assim os tres papeis de uma mesma passagem — construtor, verificador,
  revisor — compartilham o numero, que e o que o indice unico `(tarefa, numero, papel)`
  espera.

  ## Concorrencia

  A tarefa e lida com `FOR UPDATE` dentro da transacao: duas transicoes simultaneas sobre a
  mesma tarefa serializam, em vez de as duas lerem `tentativas` e as duas escreverem o
  mesmo valor. Isto cobre a linha; **a fila** — quem chama, em que ordem, e como se
  enfileira na mesma transacao — e a T-037.
  """

  import Ecto.Query, only: [from: 2]

  alias Ecto.Multi
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Consumo
  alias Fabrica.Tarefas.Despacho
  alias Fabrica.Tarefas.Maquina
  alias Fabrica.Tarefas.Tarefa

  @type erro ::
          {:transicao_invalida, atom(), atom()}
          | {:tarefa_inexistente, term()}
          | {:invalido, atom(), Ecto.Changeset.t()}
          | :despacho_sem_ciclo
          | :consumo_sem_despacho

  @doc """
  Aplica a transicao. Devolve a tarefa ja no estado novo, ou o erro nomeado.

  ## Opcoes

    * `:papel` — quem acabou de trabalhar. Presente, grava uma linha em `ciclos`.
    * `:desfecho` e `:relatorio` — o que essa etapa concluiu, e o texto do laudo.
    * `:despacho` — mapa com `:operario`, `:modelo` e `:voltas`. Exige `:papel`.
    * `:consumos` — lista de mapas, um por volta. Exige `:despacho`. Sem `:volta`
      explicito, a posicao na lista vira o numero da volta.

  ## Erros

  `{:erro, {:transicao_invalida, de, para}}` · `{:erro, {:tarefa_inexistente, id}}` ·
  `{:erro, {:invalido, etapa, changeset}}` · `{:erro, :despacho_sem_ciclo}` ·
  `{:erro, :consumo_sem_despacho}`
  """
  @spec aplicar(Tarefa.t() | integer(), atom(), keyword()) :: {:ok, Tarefa.t()} | {:erro, erro()}
  def aplicar(tarefa, para, opcoes \\ [])

  def aplicar(%Tarefa{id: id}, para, opcoes), do: aplicar(id, para, opcoes)

  def aplicar(id, para, opcoes) do
    with :ok <- conferir_opcoes(opcoes) do
      id
      |> montar(para, opcoes)
      |> Repo.transaction()
      |> traduzir()
    end
  end

  @doc """
  O `Ecto.Multi` da transicao, sem executar.

  **Publica de proposito, e por dois motivos.** O primeiro e o teste: so com o Multi na mao
  da para inspecionar o `changes_so_far` de uma transacao que falhou e provar que o que
  estava no ar NAO chegou ao disco. O segundo e a T-037, que precisa enfileirar e mudar
  estado na mesma transacao — e composicao de Multi e como isso se faz sem duplicar esta
  logica.
  """
  @spec montar(integer(), atom(), keyword()) :: Multi.t()
  def montar(id, para, opcoes \\ []), do: acrescentar(Multi.new(), id, para, opcoes)

  @doc """
  A mesma montagem, enxertada num `Ecto.Multi` que ja existe.

  E por aqui que a T-037 vai enfileirar e mudar estado na mesma transacao, sem duplicar
  nada disto. `montar/3` e o caso particular em que o Multi comeca vazio.
  """
  @spec acrescentar(Multi.t(), integer(), atom(), keyword()) :: Multi.t()
  def acrescentar(multi, id, para, opcoes \\ []) do
    multi
    |> Multi.run(:atual, fn repo, _feito -> carregar(repo, id) end)
    |> Multi.run(:conferida, fn _repo, feito -> conferir(feito, para) end)
    |> Multi.run(:tarefa, fn repo, feito -> mover(repo, feito, para) end)
    |> talvez_ciclo(opcoes)
    |> talvez_despacho(opcoes)
    |> consumos(opcoes)
  end

  # A leitura acontece DENTRO da transacao e com bloqueio de linha: o `status` conferido e o
  # `tentativas` incrementado precisam ser os do banco no instante da escrita, e nao os de
  # uma struct que o chamador carregou faz tempo.
  defp carregar(repo, id) do
    case repo.one(from(t in Tarefa, where: t.id == ^id, lock: "FOR UPDATE")) do
      nil -> {:error, {:tarefa_inexistente, id}}
      tarefa -> {:ok, tarefa}
    end
  end

  defp conferir(%{atual: tarefa}, para) do
    case Maquina.conferir(tarefa.status, para) do
      :ok -> {:ok, {tarefa.status, para}}
      {:erro, motivo} -> {:error, motivo}
    end
  end

  defp mover(repo, %{atual: tarefa}, para) do
    tarefa
    |> Tarefa.changeset(atributos_do_movimento(tarefa, para))
    |> repo.update()
  end

  defp atributos_do_movimento(tarefa, para) do
    if Maquina.entrega_ao_construtor?(para) do
      %{status: para, tentativas: tarefa.tentativas + 1}
    else
      %{status: para}
    end
  end

  defp talvez_ciclo(multi, opcoes) do
    case Keyword.get(opcoes, :papel) do
      nil -> multi
      papel -> Multi.insert(multi, :ciclo, &changeset_de_ciclo(&1, papel, opcoes))
    end
  end

  defp changeset_de_ciclo(%{atual: tarefa}, papel, opcoes) do
    Ciclo.changeset(%Ciclo{}, %{
      tarefa_id: tarefa.id,
      # ANTES do incremento — ver "O numero do ciclo" no `@moduledoc`.
      numero: max(tarefa.tentativas, 1),
      papel: papel,
      desfecho: Keyword.get(opcoes, :desfecho),
      relatorio: Keyword.get(opcoes, :relatorio)
    })
  end

  defp talvez_despacho(multi, opcoes) do
    case Keyword.get(opcoes, :despacho) do
      nil ->
        multi

      atributos ->
        Multi.insert(multi, :despacho, fn %{ciclo: ciclo} ->
          Despacho.changeset(%Despacho{}, Map.put(atributos, :ciclo_id, ciclo.id))
        end)
    end
  end

  defp consumos(multi, opcoes) do
    opcoes
    |> Keyword.get(:consumos, [])
    |> Enum.with_index(1)
    |> Enum.reduce(multi, fn {atributos, posicao}, acumulado ->
      Multi.insert(acumulado, {:consumo, posicao}, fn %{despacho: despacho} ->
        Consumo.changeset(%Consumo{}, com_despacho(atributos, despacho, posicao))
      end)
    end)
  end

  defp com_despacho(atributos, despacho, posicao) do
    atributos
    |> Map.put_new(:volta, posicao)
    |> Map.put(:despacho_id, despacho.id)
  end

  # As duas dependencias entre opcoes sao conferidas ANTES de abrir transacao. Sem isto, um
  # `:consumos` sem `:despacho` estouraria com `MatchError` dentro do Multi — erro de
  # programacao disfarcado de falha de banco, que e o pior lugar para se descobrir.
  defp conferir_opcoes(opcoes) do
    # `Keyword.has_key?` diria "sim" para `papel: nil`, e ai um `:despacho` passaria a
    # conferencia e estouraria com MatchError dentro do Multi, procurando um `:ciclo` que
    # `talvez_ciclo/2` nao criou. O que decide e o VALOR, nao a presenca da chave.
    tem_ciclo? = Keyword.get(opcoes, :papel) != nil
    tem_despacho? = Keyword.get(opcoes, :despacho) != nil
    tem_consumo? = opcoes |> Keyword.get(:consumos, []) |> Enum.any?()

    cond do
      tem_despacho? and not tem_ciclo? -> {:erro, :despacho_sem_ciclo}
      tem_consumo? and not tem_despacho? -> {:erro, :consumo_sem_despacho}
      true -> :ok
    end
  end

  defp traduzir({:ok, %{tarefa: tarefa}}), do: {:ok, tarefa}

  defp traduzir({:error, etapa, %Ecto.Changeset{} = changeset, _feito}),
    do: {:erro, {:invalido, nome_da_etapa(etapa), changeset}}

  defp traduzir({:error, _etapa, motivo, _feito}), do: {:erro, motivo}

  defp nome_da_etapa({:consumo, posicao}), do: :"consumo_#{posicao}"
  defp nome_da_etapa(etapa), do: etapa
end
