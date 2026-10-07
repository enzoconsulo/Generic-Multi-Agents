defmodule Fabrica.Fila.Trabalho do
  @moduledoc """
  A fila durável (T-037): enfileirar um trabalho e mudar o estado da tarefa acontecem na
  MESMA transação, porque os dois vivem no mesmo Postgres.

  É o que fecha o estado clássico "a tarefa consta como em execução, mas ninguém está
  executando". Uma fila em memória some quando o processo reinicia; um `oban_jobs` some
  só quando a transação que o gravou também desfizer a mudança de estado — e nunca antes
  disso, porque `despachar/3` grava os dois na mesma transação.

  ## Composição, não duplicação

  `Fabrica.Tarefas.Transicao.acrescentar/4` foi deixada pública exatamente para isto: aqui
  ela é enxertada num `Ecto.Multi` que também insere o `Oban.Job`, e `Repo.transaction/1`
  fecha os dois juntos. `Fabrica.Tarefas.Fila.papel_por_status/0` decide QUAL papel
  enfileirar — o mesmo mapa que decide quem despacha o quê hoje.

  ## `unique` por `{tarefa_id, papel}`

  Considera só os estados "incompletos" (`available`, `scheduled`, `executing`,
  `retryable`) e `period: :infinity` — ou seja, "nunca duas etapas iguais da mesma tarefa
  ao mesmo tempo", sem limite de tempo. Um trabalho já `completed`/`discarded` não conta:
  a MESMA etapa pode (e deve) ser enfileirada de novo num ciclo de retrabalho.

  ## `max_attempts: 1` — de propósito, e não esquecimento

  A retentativa automática do Oban (recuo exponencial, até 20 tentativas por padrão) NÃO
  é a retentativa desta fábrica. A retentativa daqui é a escada da T-031: deliberada,
  registrada e contada em `tentativas`. Uma retentativa cega do Oban por cima disso faria
  a tarefa girar sem que `tentativas` subisse — o defeito que já custou 41 despachos na
  v1. Por isso `max_attempts: 1`: um `perform/1` que falhar vai direto para `discarded`,
  nunca de volta à fila sozinho.

  ## O que `perform/1` faz (T-070): sobe o agente real e fecha o laço

  `perform/1` é a COLA entre a fila durável e o agente. Para o `papel` que veio nos `args`:

  1. carrega a `Tarefa` (com `:projeto`, `:especialista`, `:areas`, `:criterios`) e, no papel
     `construtor`, marca `pronta -> em_execucao` (o incremento de `tentativas` é do sistema);
  2. monta a mensagem inicial com `Fabrica.Despacho.montar/4`, lendo a doutrina do papel de
     `priv/doutrina/<arquivo>.md` (o papel `verificador` usa `testador.md`);
  3. sobe o agente sob `Fabrica.Agente.Supervisor.iniciar/4` rodando `Fabrica.Agente.Laco.rodar/1`
     — confirmável em voo por `Agente.Supervisor.listar/0`. O rendez-vous é por mensagem: a
     função manda `{ref, :concluido, resultado}` ao terminar, e o `:ao_morrer` manda
     `{ref, :morto, motivo}`; `perform/1` bloqueia num `receive` que trata os dois — o mesmo
     contrato de morte provado em `test/fabrica/marco_v04_test.exs`;
  4. ao concluir, JULGA conforme o papel e aplica a transição por `despachar/3` (que já encadeia
     o próximo papel na mesma transação), gravando ciclo — com o relato que o agente chamou via
     `registrar_resultado` DURANTE o laço, lido de um coletor em memória e só agora persistido
     (T-074; ver `Fabrica.Ferramentas.RegistrarResultado` @moduledoc) — despacho e consumos;
  5. emite `[:fabrica, :despacho, :fim]` (`Fabrica.Eventos`) com `:tarefa_id`, `:desfecho` e
     `:gasto_usd` — o evento que `Fabrica.Piloto.Servidor` (T-055) já escuta.

  ## O julgamento por papel, e onde uma peça ainda falta

    * `construtor` — não julga: o trabalho dele É o resultado. Segue para `em_teste`
      (verificador), como `Fila.papel_por_status/0` mapeia.
    * `verificador` — roda a passada MECÂNICA (`Fabrica.Criterios`) sobre os critérios da tarefa
      e julga com `Fabrica.Portoes.Verificador.julgar/1`. Determinístico: não depende do relato
      livre do agente. Aprovado vai a `em_revisao`; reprovado volta a `em_execucao`.
    * `revisor` — julga com `Fabrica.Portoes.Revisor.julgar/2`. A CONFORMIDADE vem do relato
      ESTRUTURADO que o agente chamou via `registrar_resultado` durante o laço (T-074), lido
      por `Revisor.ler_conformidade/1` (T-075) — não mais fixa em `:conforme` (defeito medido:
      o revisor desta fábrica nunca reprovava por conformidade). Os ACHADOS saem das duas
      fontes (T-078): do mesmo relato estruturado — onde `priv/doutrina/revisor.md` manda
      listá-los — e do texto reconstruído das mensagens (`relatorio_do_agente/1`), que segue
      lido para não quebrar quem escreve ali; achado repetido nas duas conta uma vez. A
      limitação de "relato vazio num turno único" (T-070) vale só para o texto das mensagens:
      o coletor (`resumo.relatos`) chega aqui independente de `Agente.Laco.rodar/1` anexar ou
      não a resposta final ao estado.
  """

  use Oban.Worker, queue: :construtor, max_attempts: 1

  require Logger

  alias Ecto.Multi
  alias Fabrica.Agente.Ferramentas, as: FerramentasDoAgente
  alias Fabrica.Agente.Laco
  alias Fabrica.Agente.Supervisor, as: SupervisorDeAgentes
  alias Fabrica.Criterios
  alias Fabrica.Custo.Consumo, as: CustoConsumo
  alias Fabrica.Despacho
  alias Fabrica.Eventos
  alias Fabrica.Ferramentas.RegistrarResultado
  alias Fabrica.Operario
  alias Fabrica.Portoes.Revisor
  alias Fabrica.Portoes.Verificador
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Fila
  alias Fabrica.Tarefas.Tarefa
  alias Fabrica.Tarefas.Transicao

  @papeis [:construtor, :verificador, :revisor]

  # O papel `verificador` da fabrica usa a doutrina do testador (nao ha `verificador.md`); os
  # demais casam com o proprio nome. Ver `Fabrica.Ferramentas.Catalogo` e `Fabrica.Portoes`.
  @doutrina_do_papel %{
    construtor: "construtor.md",
    verificador: "testador.md",
    revisor: "revisor.md"
  }

  @modelo "sonnet-5"
  @teto_de_voltas 30
  # Teto de guarda: o laco tem os proprios tetos (voltas/gasto) e o `:ao_morrer` cobre a morte;
  # este `receive` so nao pode esperar para sempre se as duas coisas falharem ao mesmo tempo.
  @espera_do_agente :timer.minutes(30)

  @doc "Os papeis que a fila conhece — as mesmas filas configuradas em `config :fabrica, Oban`."
  @spec papeis() :: [atom()]
  def papeis, do: @papeis

  @doc """
  O changeset do trabalho para `tarefa_id` no `papel` dado, pronto para `Oban.insert/3`.

  Único por `{tarefa_id, papel}` entre os estados incompletos — ver `@moduledoc`.
  """
  @spec novo(integer(), atom()) :: Ecto.Changeset.t()
  def novo(tarefa_id, papel) when papel in @papeis do
    %{tarefa_id: tarefa_id, papel: Atom.to_string(papel)}
    |> new(
      queue: papel,
      unique: [
        fields: [:args],
        keys: [:tarefa_id, :papel],
        states: Oban.Job.unique_states(:incomplete),
        period: :infinity
      ]
    )
  end

  @doc """
  Aplica a transição de estado E enfileira o trabalho do papel resultante, na MESMA
  transação. Erro em qualquer um dos dois não grava nenhum.

  Sem papel para o estado de destino (`Fila.papel_por_status/0` não o conhece — por
  exemplo `:bloqueada` ou `:cancelada`), só a transição é aplicada; não há o que
  enfileirar.

  Aceita as mesmas opções de `Transicao.aplicar/3` (`:papel`, `:despacho`, `:consumos`,
  etc.), mais `:oban` para apontar a instância do Oban a usar — o padrão é a instância
  da aplicação, e o teste de recuperação após queda usa uma instância própria.
  """
  @spec despachar(integer(), atom(), keyword()) :: {:ok, Tarefa.t()} | {:erro, term()}
  def despachar(id, para, opcoes \\ []) do
    id
    |> montar(para, opcoes)
    |> Repo.transaction()
    |> traduzir()
  end

  @doc """
  O `Ecto.Multi` de `despachar/3`, sem executar.

  Pública pelo mesmo motivo de `Transicao.montar/3`: só com o Multi na mão dá para
  inspecionar `changes_so_far` de uma transação que falhou e provar que a mudança de
  estado e o enfileiramento chegaram a ser aplicados dentro da transação, e que nenhum
  dos dois sobreviveu a ela.
  """
  @spec montar(integer(), atom(), keyword()) :: Multi.t()
  def montar(id, para, opcoes \\ []) do
    {oban, opcoes} = Keyword.pop(opcoes, :oban, Oban)

    id
    |> Transicao.montar(para, opcoes)
    |> talvez_enfileirar(oban, para)
  end

  defp talvez_enfileirar(multi, oban, para) do
    case Map.get(Fila.papel_por_status(), para) do
      nil ->
        multi

      papel ->
        Oban.insert(oban, multi, :trabalho, fn %{tarefa: tarefa} -> novo(tarefa.id, papel) end)
    end
  end

  defp traduzir({:ok, %{tarefa: tarefa}}), do: {:ok, tarefa}

  defp traduzir({:error, etapa, %Ecto.Changeset{} = changeset, _feito}),
    do: {:erro, {:invalido, etapa, changeset}}

  defp traduzir({:error, _etapa, motivo, _feito}), do: {:erro, motivo}

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"tarefa_id" => tarefa_id, "papel" => papel}}) do
    executar(tarefa_id, String.to_existing_atom(papel))
  end

  @doc """
  O corpo de `perform/1`, com o papel ja como atomo — sobe o agente, julga e transiciona.

  Publica para o teste poder exercitar o laco sem fabricar um `%Oban.Job{}` a mao. `papel` e um
  dos de `papeis/0`.
  """
  @spec executar(integer(), atom()) :: :ok
  def executar(tarefa_id, papel) when papel in @papeis do
    Logger.info("fila: subindo agente #{papel} para a tarefa #{tarefa_id}")

    tarefa = carregar(tarefa_id)
    _ = garantir_em_execucao(tarefa, papel)

    Eventos.despacho_inicio(%{tarefa_id: tarefa_id, papel: papel, modelo: @modelo})

    case rodar_agente(tarefa, papel) do
      {:concluido, resumo} ->
        finalizar(tarefa, papel, resumo)

      {:morto, motivo} ->
        # Morte em voo: a tarefa continua `em_execucao` (ja despachavel — Fabrica.Tarefas.Fila),
        # e "voltar a fila" nao exige transicao nova, so o motivo registrado. Mesmo contrato de
        # `test/fabrica/marco_v04_test.exs`.
        Eventos.despacho_fim(%{
          tarefa_id: tarefa_id,
          desfecho: {:morto, motivo},
          voltas: 0,
          gasto_usd: 0.0
        })

        :ok
    end
  end

  defp carregar(tarefa_id) do
    Tarefa
    |> Repo.get!(tarefa_id)
    |> Repo.preload([:projeto, :especialista, :areas, :criterios])
  end

  # So o construtor de uma tarefa ainda `pronta` marca o inicio da execucao (e gasta a
  # tentativa). Re-despacho de uma tarefa ja `em_execucao`, ou os papeis verificador/revisor,
  # nao mexem no estado ate o julgamento.
  defp garantir_em_execucao(%Tarefa{status: :pronta} = tarefa, :construtor) do
    {:ok, _} = Transicao.aplicar(tarefa, :em_execucao)
    :ok
  end

  defp garantir_em_execucao(_tarefa, _papel), do: :ok

  defp rodar_agente(tarefa, papel) do
    dono = self()
    ref = make_ref()
    mensagens = [%{papel: :usuario, conteudo: mensagem_inicial(tarefa, papel)}]

    # O coletor (T-074) e memoria pura, sem `ciclo_id`: e onde `registrar_resultado` cai
    # enquanto o laco roda, porque a linha de `ciclos` so nasce ao FIM do despacho. Nasce e
    # morre com este despacho — nunca sobrevive alem do `receive` abaixo.
    {:ok, coletor} = RegistrarResultado.iniciar_coletor()

    funcao = fn ->
      resultado =
        Laco.rodar(
          raiz: tarefa.projeto.caminho,
          modelo: @modelo,
          papel: Atom.to_string(papel),
          mensagens: mensagens,
          teto_de_voltas: @teto_de_voltas,
          ferramentas: ferramentas_do(tarefa, papel, coletor)
        )

      send(dono, {ref, :concluido, resultado})
    end

    ao_morrer = fn _tarefa_id, motivo -> send(dono, {ref, :morto, motivo}) end

    {:ok, _pid} = SupervisorDeAgentes.iniciar(tarefa.id, papel, funcao, ao_morrer: ao_morrer)

    resultado =
      receive do
        {^ref, :concluido, {:ok, resumo}} -> {:concluido, anexar_relatos(resumo, coletor)}
        {^ref, :morto, motivo} -> {:morto, motivo}
      after
        @espera_do_agente -> {:morto, :sem_resposta}
      end

    # So le `relatos/1` ANTES de encerrar (regra acima); o coletor nao serve para mais nada
    # depois deste ponto, morto o agente ou concluido o laco.
    RegistrarResultado.encerrar_coletor(coletor)
    resultado
  end

  # O que o agente chamou `registrar_resultado` DURANTE o laco vira parte do resumo, para
  # `finalizar/3` fundir com o que o SISTEMA observou e gravar tudo na MESMA transacao do
  # ciclo — nunca antes disso (ver `RegistrarResultado` @moduledoc).
  defp anexar_relatos(resumo, coletor),
    do: Map.put(resumo, :relatos, RegistrarResultado.relatos(coletor))

  # `papel in @papeis` (garantido pela guarda de `executar/2`) e sempre conhecido do catalogo
  # (T-073) — o `{:ok, _}` e uma asserção, não uma checagem de runtime nova.
  defp ferramentas_do(tarefa, papel, coletor) do
    {:ok, ferramentas} =
      FerramentasDoAgente.montar(
        Atom.to_string(papel),
        tarefa.projeto.caminho,
        tarefa.areas,
        coletor
      )

    ferramentas
  end

  defp mensagem_inicial(tarefa, papel) do
    {:ok, prefixo} = Despacho.montar(tarefa, papel, doutrina_do(papel), modelo: @modelo)
    Enum.map_join(prefixo.blocos, "\n\n", & &1.texto)
  end

  defp doutrina_do(papel) do
    arquivo = Map.fetch!(@doutrina_do_papel, papel)

    :fabrica
    |> Application.app_dir("priv")
    |> Path.join("doutrina/#{arquivo}")
    |> File.read!()
  end

  defp finalizar(tarefa, papel, resumo) do
    {para, motivo_do_portao} = julgar(papel, tarefa, resumo)

    opcoes = [
      papel: Atom.to_string(papel),
      desfecho: to_string(motivo_do_portao),
      relatorio: relatorio_do_ciclo(papel, resumo),
      despacho: %{
        operario: inspect(Operario.configurado()),
        modelo: @modelo,
        voltas: resumo.voltas
      },
      consumos: consumos_para_registro(resumo)
    ]

    case despachar(tarefa.id, para, opcoes) do
      {:ok, _} ->
        emitir_fim(tarefa, resumo.desfecho, resumo)

      {:erro, motivo} ->
        # A transicao de destino ficou ilegal enquanto o agente estava em voo: um planejador
        # bloqueou/cancelou a tarefa (ambas legais a partir de `em_execucao` — ver
        # `Fabrica.Tarefas.Maquina`) e `despachar/3` reverteu a transacao INTEIRA, inclusive os
        # `consumos` deste turno. Emitir o fim assim mesmo e o que impede o gasto ja medido de
        # sumir da telemetria — o defeito exato que `Fabrica.Eventos` existe para eliminar (US$
        # 22,55 perdidos na v1). O job encerra `:ok`: o agente concluiu; so o registro do
        # desfecho nao coube porque a tarefa seguiu adiante.
        Logger.warning(
          "fila: fim da tarefa #{tarefa.id} (#{papel}) nao aplicou a transicao para " <>
            "#{para}: #{inspect(motivo)}; emitindo fim com desfecho :erro para nao perder o gasto"
        )

        emitir_fim(tarefa, :erro, resumo)
    end

    :ok
  end

  defp emitir_fim(tarefa, desfecho, resumo) do
    Eventos.despacho_fim(%{
      tarefa_id: tarefa.id,
      desfecho: desfecho,
      voltas: resumo.voltas,
      gasto_usd: resumo.gasto_usd
    })
  end

  # O construtor nao julga: o trabalho dele E o resultado, e a tarefa segue para o verificador.
  defp julgar(:construtor, _tarefa, _resumo), do: {:em_teste, :fim_do_turno}

  # O verificador julga a passada MECANICA (Fabrica.Criterios), sem depender do relato do agente.
  defp julgar(:verificador, tarefa, _resumo) do
    veredito =
      tarefa.criterios
      |> Enum.map(&%{texto: &1.texto, comando: &1.comando, marcado: false, implicito: false})
      |> Criterios.executar(tarefa.projeto.caminho)
      |> Verificador.julgar()

    {se_aprovado(veredito.aprovado, :em_revisao), veredito.motivo}
  end

  # O revisor julga achados + conformidade. A conformidade vem do relato ESTRUTURADO que o
  # agente chamou via `registrar_resultado` durante o laco (T-074), lido por
  # `Revisor.ler_conformidade/1` (T-075) — nao mais fixa em `:conforme`. A limitacao do texto
  # das mensagens (ver @moduledoc) nao se aplica a ela porque o coletor (`resumo.relatos`)
  # chega independente do laco anexar ou nao a resposta final ao estado.
  #
  # Os achados saem das DUAS fontes (T-078): dos relatos — onde a doutrina manda escreve-los, e
  # que antes ninguem lia — e do texto reconstruido das mensagens (`relatorio_do_agente/1`),
  # para nao quebrar quem ja os escreve ali. O mesmo texto de relatos serve a conformidade e aos
  # achados: um formatador so. `Enum.uniq/1` faz o achado repetido nas duas fontes contar uma
  # vez — o veredito nao muda com a repeticao, e a lista de achados tambem nao.
  defp julgar(:revisor, _tarefa, resumo) do
    relatos = RegistrarResultado.formatar_relatos(Map.get(resumo, :relatos, []))
    conformidade = Revisor.ler_conformidade(relatos)

    achados =
      Enum.uniq(Revisor.ler_achados(relatorio_do_agente(resumo)) ++ Revisor.ler_achados(relatos))

    veredito = Revisor.julgar(conformidade, achados)
    {se_aprovado(veredito.aprovado, :concluida), veredito.motivo}
  end

  defp se_aprovado(true, destino), do: destino
  defp se_aprovado(false, _destino), do: :em_execucao

  # O relato do sistema sobre o ciclo (o que o motor OBSERVOU: desfecho, voltas, gasto) fundido
  # com o que o AGENTE reportou via `registrar_resultado` durante o laco (T-074) — lido do
  # coletor em `anexar_relatos/2` e so agora, na MESMA transacao que grava o ciclo, persistido.
  defp relatorio_do_ciclo(papel, resumo) do
    sistema =
      "Papel #{papel}: laco encerrou por #{resumo.desfecho} em #{resumo.voltas} volta(s); " <>
        "gasto estimado US$ #{resumo.gasto_usd}."

    case RegistrarResultado.formatar_relatos(Map.get(resumo, :relatos, [])) do
      "" -> sistema
      relato_do_agente -> sistema <> "\n\n---\n\n" <> relato_do_agente
    end
  end

  defp relatorio_do_agente(resumo) do
    resumo.mensagens
    |> Enum.filter(&(&1.papel == :assistente))
    |> Enum.flat_map(fn %{conteudo: blocos} -> List.wrap(blocos) end)
    |> Enum.filter(&(&1[:tipo] == :texto))
    |> Enum.map_join("\n", &(&1[:texto] || ""))
  end

  defp consumos_para_registro(resumo) do
    resumo.consumos
    |> Enum.with_index(1)
    |> Enum.flat_map(fn {relatado, volta} ->
      # `despacho_id: 0` e so um marcador: `Transicao` o sobrescreve com o id real do despacho
      # criado na mesma transacao (ver `Fabrica.Tarefas.Transicao`).
      case CustoConsumo.para_registro(@modelo, relatado, despacho_id: 0, volta: volta) do
        {:ok, registro} -> [registro]
        {:erro, _motivo} -> []
      end
    end)
  end
end
