defmodule Fabrica.Piloto.Servidor do
  @moduledoc """
  A mecanica do piloto automatico (T-055): escutar o fim de uma rodada, consultar
  `Fabrica.Piloto.Decisao`, persistir o estado e agendar o rearme. A DECISAO em si mora em
  `Fabrica.Piloto.Decisao` (T-054), pura — este modulo e so I/O em volta dela.

  ## `montar_rodada/1` E o caminho do botao Trabalhar

  A rodada NAO e uma invencao deste modulo. `montar_rodada/1` compoe exatamente os dois
  modulos que ja resolvem "teto e trava" (a frase do Contexto da tarefa): `Fabrica.Fila.
  Exclusao.lote/2` (o teto de construtores em paralelo, a trava de `areas` disjuntas, "o
  verificador exige o projeto quieto") escolhe QUAL passo despachar agora; `Fabrica.Fila.
  Trabalho.despachar/3` grava a transicao `pronta -> em_execucao` — "despacho do construtor"
  no vocabulario de `Fabrica.Tarefas.Maquina` — na mesma via duravel que qualquer chamador
  usaria. Nao ha um segundo algoritmo de fila aqui: se houvesse, ele e este modulo
  divergiriam sem ninguem ver, exatamente o risco que o Contexto nomeia.

  `montar_rodada/1` e publica e chamavel direto, fora de qualquer processo — e assim que um
  futuro botao "Trabalhar" a chamaria manualmente, e e a MESMA funcao que este servidor
  chama sozinho ao decidir continuar. Duas chamadas, um caminho so.

  ## O que NAO esta aqui, de proposito

  Rodar o agente de verdade (`Fabrica.Agente.Supervisor.iniciar/4` + `Fabrica.Agente.Laco`)
  continua sem chamador em producao — a mesma lacuna que `Fabrica.Fila.Trabalho.perform/1`
  ja documenta como fora das suas areas. `montar_rodada/1` cobre o pedaco que JA existe
  testado (a promocao a `pronta` e o despacho para `em_execucao`); o restante da fila
  (`em_teste`/`em_revisao`) ja chega enfileirado pelo proprio efeito colateral da transicao
  anterior (`Fabrica.Fila.Trabalho.talvez_enfileirar/3`) — nao ha o que este servidor precise
  fazer para eles.

  ## Fim de rodada: o evento `[:fabrica, :despacho, :fim]`

  E o evento que `Fabrica.Agente.Laco` emitiria ao terminar um despacho — `:tarefa_id`,
  `:desfecho`, `:gasto_usd` (`Fabrica.Eventos`). Este servidor assina o barramento e reage
  so ao evento da tarefa que ELE MESMO despachou (`tarefa_em_voo_id`). `desfecho ==
  :fim_do_turno` conta como "concluiu" (o agente decidiu sozinho que tinha terminado);
  qualquer outro desfecho conta como round sem conclusao, para a contagem de rodadas
  seguidas sem concluir. `pediu_replanejamento?` fica sempre `false` aqui: nao existe hoje
  nenhum evento que carregue esse sinal (e criar um seria mexer em `Fabrica.Eventos`, fora
  das `areas` desta tarefa) — registrado como pendencia nas Notas de execucao.

  `rodada_concluida/2` e a mesma porta de entrada, publica, para quem preferir informar o
  desfecho diretamente (testes, ou um futuro chamador que saiba mais que o evento cru).

  ## Acordar da parede de cota, sem laco quente (T-094)

  Dormindo por cota batida (`{:dormir, reabre_em}`, vindo de `Decisao`), o piloto tem DOIS
  jeitos de acordar: o evento `[:fabrica, :cota, :rearme]` que `Fabrica.Cota` emite ao
  rearmar (o caminho normal, quase instantaneo), e um `:acordar` agendado em
  `reabre_em - agora` como rede de seguranca (caso o evento nao chegue). O problema que isto
  fecha: `Fabrica.Cota` so rearma de verdade em `reabre_em + folga/0` (tolerancia a relogio
  dessincronizado) — entao, so com o `:acordar` agendado, o piloto acordava ENTRE `reabre_em`
  e a folga, via `Decisao` ainda achava a cota batida, e reagendava para `max(0, ja_passou)`
  = 0ms: um laco sem pausa nenhuma, so limitado pela latencia do `Repo.all` de cada volta.
  `atraso_para_acordar/2` fecha isso: nunca agenda atraso `<= 0`, caindo no piso
  (`@piso_reacordar_padrao`) quando o horario ja passou.

  ## Por que `{:global, ...}` e nao um `Registry` supervisionado

  Um piloto por projeto precisa ser encontravel de novo entre um mount de LiveView e outro,
  mas subir um `Registry` supervisionado exigiria mexer em `Fabrica.Application` — fora das
  `areas` desta tarefa. `:global` e modulo do proprio Erlang/OTP, sem supervisor para
  registrar: `nome/1` da um nome estavel, e quem quiser um processo isolado (os testes) passa
  `nome: nil` e guarda o pid.

  ## Persistencia: um arquivo JSON por projeto, no padrao de `Fabrica.Backup`

  `Fabrica.Cota` e so memoria; sobreviver a reinicio, como o criterio pede, exige disco. Sem
  migracao nas `areas` desta tarefa, o desenho segue `Fabrica.Backup.diretorio/0` ao pe da
  letra: `Application.get_env(:fabrica, :diretorio_piloto) || "priv/piloto"`, um arquivo por
  `projeto_id`. `init/1` le o arquivo se existir; toda mudanca de estado regrava.
  """

  use GenServer

  import Ecto.Query, only: [from: 2]

  alias Fabrica.Eventos
  alias Fabrica.Fila.Exclusao
  alias Fabrica.Fila.Trabalho
  alias Fabrica.Piloto.Decisao
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Tarefa

  @diretorio_padrao "priv/piloto"
  # De proposito SEM `:em_execucao`: uma tarefa que acabou de concluir uma rodada continua
  # `em_execucao` no banco ate o verificador (fora das areas desta tarefa) a mover — e essa
  # MESMA tarefa nao pode ser, sozinha, o motivo de o piloto nunca decidir `:sem_tarefa_pronta`.
  @estados_em_espera [:pronta, :em_teste, :em_revisao]
  @espera_mutex_ms :timer.seconds(5)
  @espera_sem_horario_ms :timer.minutes(1)
  # Rede de seguranca contra o laco quente (T-094): entre `reabre_em` e `Fabrica.Cota.folga/0`
  # o piloto acordaria, veria a cota AINDA batida e reagendaria para daqui a 0ms — de novo, sem
  # pausa. O caminho principal e acordar pelo evento `[:fabrica, :cota, :rearme]` (abaixo); este
  # piso so entra quando esse evento, por algum motivo, nao chegar.
  @piso_reacordar_padrao :timer.seconds(30)

  @typedoc "O que a tela precisa mostrar: os dois tetos, o consumido, e o rearme quando dormindo."
  @type estado_publico :: %{
          ligado?: boolean(),
          teto_de_gasto: number() | nil,
          maximo_de_rodadas: pos_integer() | nil,
          gasto_acumulado: number(),
          rodadas_feitas: non_neg_integer(),
          rodadas_seguidas_sem_concluir: non_neg_integer(),
          dormindo_ate: DateTime.t() | nil,
          motivo_parada: atom() | nil
        }

  defstruct projeto_id: nil,
            diretorio: nil,
            piso_reacordar_ms: @piso_reacordar_padrao,
            ligado?: false,
            teto_de_gasto: nil,
            maximo_de_rodadas: nil,
            gasto_acumulado: 0,
            rodadas_feitas: 0,
            rodadas_seguidas_sem_concluir: 0,
            dormindo_ate: nil,
            motivo_parada: nil,
            tarefa_em_voo_id: nil,
            tentativas_na_parede: 0

  ## API publica

  @doc "O nome estavel (`:global`) de um piloto de projeto — ver @moduledoc."
  @spec nome(term()) :: {:global, {module(), term()}}
  def nome(projeto_id), do: {:global, {__MODULE__, projeto_id}}

  @doc """
  Sobe o piloto de um projeto. `opcoes` exige `:projeto_id`; aceita `:nome` (`nil` para um
  processo sem registro, util em teste), `:diretorio` (persistencia, padrao `diretorio/0`) e
  `:piso_reacordar_ms` (rede de seguranca do laco quente — T-094 — padrao #{@piso_reacordar_padrao}ms,
  util em teste para nao esperar o piso de producao).
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opcoes) do
    projeto_id = Keyword.fetch!(opcoes, :projeto_id)

    case Keyword.get(opcoes, :nome, nome(projeto_id)) do
      nil -> GenServer.start_link(__MODULE__, opcoes)
      nome_registrado -> GenServer.start_link(__MODULE__, opcoes, name: nome_registrado)
    end
  end

  @doc "O diretorio de persistencia do estado do piloto, configuravel — padrao `#{@diretorio_padrao}`."
  @spec diretorio() :: Path.t()
  def diretorio, do: Application.get_env(:fabrica, :diretorio_piloto) || @diretorio_padrao

  @doc """
  Liga o piloto com os dois freios obrigatorios (`Fabrica.Piloto.Decisao.ligar/2`). No
  sucesso, ja avalia a decisao — se houver tarefa pronta, dispara a primeira rodada na hora.
  """
  @spec ligar(GenServer.server(), number() | nil, pos_integer() | nil) ::
          {:ok, estado_publico()} | {:erro, [atom(), ...]}
  def ligar(servidor, teto_de_gasto, maximo_de_rodadas) do
    GenServer.call(servidor, {:ligar, teto_de_gasto, maximo_de_rodadas})
  end

  @doc "Desliga o piloto. NAO corta a rodada em voo — ela termina, e o fim dela encontra `ligado?: false`."
  @spec desligar(GenServer.server()) :: :ok
  def desligar(servidor), do: GenServer.call(servidor, :desligar)

  @doc "O estado publico agora — o que a tela mostra."
  @spec estado(GenServer.server()) :: estado_publico()
  def estado(servidor), do: GenServer.call(servidor, :estado)

  @doc """
  O fim de uma rodada, informado diretamente. `resultado` aceita `:gasto` (padrao 0),
  `:concluiu?` (padrao `false`), `:falhou?` (padrao `false`) e `:pediu_replanejamento?`
  (padrao `false`). Consulta a decisao e age — mesma porta que o evento
  `[:fabrica, :despacho, :fim]` usa por baixo.
  """
  @spec rodada_concluida(GenServer.server(), map()) :: estado_publico()
  def rodada_concluida(servidor, resultado \\ %{}) do
    GenServer.call(servidor, {:rodada_concluida, resultado})
  end

  @doc """
  A montagem de uma rodada — ver @moduledoc. `:sem_trabalho` quer dizer "nada despachavel
  AGORA": pode ser porque nao ha mesmo tarefa pronta, ou porque a trava de `areas`/"verificador
  sozinho" esta segurando o proximo construtor por enquanto.
  """
  @spec montar_rodada(term()) :: {:ok, Tarefa.t()} | :sem_trabalho | {:erro, term()}
  def montar_rodada(projeto_id) do
    case proximo_despacho(projeto_id) do
      nil -> :sem_trabalho
      passo -> Trabalho.despachar(passo.tarefa.id, :em_execucao)
    end
  end

  defp proximo_despacho(projeto_id) do
    projeto_id
    |> carregar_tarefas()
    |> Exclusao.lote()
    |> Enum.find(&(&1.papel == :construtor and &1.tarefa.status == :pronta))
  end

  defp carregar_tarefas(projeto_id) do
    Repo.all(
      from(t in Tarefa, where: t.projeto_id == ^projeto_id, preload: [:areas, :dependencias])
    )
  end

  defp ha_trabalho_em_curso?(projeto_id) do
    Enum.any?(carregar_tarefas(projeto_id), &(&1.status in @estados_em_espera))
  end

  ## GenServer

  @impl GenServer
  def init(opcoes) do
    projeto_id = Keyword.fetch!(opcoes, :projeto_id)
    diretorio = Keyword.get(opcoes, :diretorio, diretorio())
    piso_reacordar_ms = Keyword.get(opcoes, :piso_reacordar_ms, @piso_reacordar_padrao)

    # `{:error, {:already_registered, pid()}}` descartado de proposito: `init/1` roda uma
    # unica vez por processo, entao a falha so acontece em situacao que ja seria um bug em
    # outro lugar — nao ha o que o piloto faca diferente ao ve-la.
    _ = Eventos.assinar()

    estado =
      %__MODULE__{
        projeto_id: projeto_id,
        diretorio: diretorio,
        piso_reacordar_ms: piso_reacordar_ms
      }
      |> carregar_persistido()

    {:ok, estado, {:continue, :retomar}}
  end

  @impl GenServer
  # Com `tarefa_em_voo_id` persistido, a rodada anterior nao tinha terminado quando o processo
  # caiu — decidir/1 so vale ENTRE rodadas (moduledoc de `Decisao`), e `ha_trabalho_em_curso?`
  # ignora `:em_execucao` de proposito, entao decidir as cegas aqui via `:sem_tarefa_pronta`
  # mesmo com a rodada genuinamente em andamento (achado da revisao do ciclo 1).
  def handle_continue(:retomar, %{ligado?: true, tarefa_em_voo_id: id} = estado)
      when not is_nil(id) do
    {:noreply, retomar_com_rodada_em_voo(estado, id)}
  end

  def handle_continue(:retomar, %{ligado?: true} = estado) do
    {:noreply, avaliar_e_agir(estado)}
  end

  def handle_continue(:retomar, estado), do: {:noreply, estado}

  # A tarefa ainda esta `:em_execucao`: a rodada continua genuinamente em voo (ou o construtor
  # que a fazia caiu junto com o app — recuperar isso e fora das areas desta tarefa). Mantem
  # `tarefa_em_voo_id` e nao chama `avaliar_e_agir/2`: so o evento real de fim (ou uma futura
  # mudanca de status) deve mover o piloto adiante.
  defp retomar_com_rodada_em_voo(estado, tarefa_id) do
    case Repo.get(Tarefa, tarefa_id) do
      %Tarefa{status: :em_execucao} -> estado
      _outro_status_ou_sumiu -> avaliar_e_agir(%{estado | tarefa_em_voo_id: nil})
    end
  end

  @impl GenServer
  def handle_call({:ligar, teto_de_gasto, maximo_de_rodadas}, _de, estado) do
    case Decisao.ligar(teto_de_gasto, maximo_de_rodadas) do
      {:ok, config} ->
        novo =
          %{
            estado
            | ligado?: true,
              teto_de_gasto: config.teto_de_gasto,
              maximo_de_rodadas: config.maximo_de_rodadas,
              motivo_parada: nil,
              dormindo_ate: nil
          }
          |> avaliar_e_agir()

        {:reply, {:ok, publico(novo)}, novo}

      {:erro, motivos} ->
        {:reply, {:erro, motivos}, estado}
    end
  end

  @impl GenServer
  def handle_call(:desligar, _de, estado) do
    novo = persistir(%{estado | ligado?: false, dormindo_ate: nil})
    {:reply, :ok, novo}
  end

  @impl GenServer
  def handle_call(:estado, _de, estado), do: {:reply, publico(estado), estado}

  @impl GenServer
  def handle_call({:rodada_concluida, resultado}, _de, estado) do
    novo = aplicar_rodada_concluida(estado, resultado)
    {:reply, publico(novo), novo}
  end

  @impl GenServer
  def handle_info(
        {:fabrica, [:fabrica, :despacho, :fim], _medidas, metadados},
        %{tarefa_em_voo_id: tarefa_em_voo} = estado
      )
      when not is_nil(tarefa_em_voo) do
    if Map.get(metadados, :tarefa_id) == tarefa_em_voo do
      {:noreply, aplicar_rodada_concluida(estado, resultado_do_evento(metadados))}
    else
      {:noreply, estado}
    end
  end

  # O caminho principal de acordar da parede (T-094): a Cota emite isto ao rearmar
  # (`Fabrica.Cota.rearmar/1`), e o piloto so reage se ESTIVER dormindo — ligado e desligado
  # nao tem rodada pendurada em `dormindo_ate`, entao caem no catch-all abaixo sem reavaliar a toa.
  def handle_info(
        {:fabrica, [:fabrica, :cota, :rearme], _medidas, _metadados},
        %{ligado?: true, dormindo_ate: horario} = estado
      )
      when not is_nil(horario) do
    {:noreply, avaliar_e_agir(%{estado | dormindo_ate: nil})}
  end

  def handle_info({:fabrica, _nome, _medidas, _metadados}, estado), do: {:noreply, estado}

  def handle_info(:acordar, estado), do: {:noreply, avaliar_e_agir(%{estado | dormindo_ate: nil})}

  def handle_info(:tentar_de_novo, estado), do: {:noreply, avaliar_e_agir(estado)}

  defp resultado_do_evento(metadados) do
    %{
      gasto: Map.get(metadados, :gasto_usd, 0),
      concluiu?: Map.get(metadados, :desfecho) == :fim_do_turno,
      falhou?: Map.get(metadados, :desfecho) == :erro,
      pediu_replanejamento?: false
    }
  end

  defp aplicar_rodada_concluida(estado, resultado) do
    concluiu? = Map.get(resultado, :concluiu?, false)

    seguidas_sem_concluir =
      if concluiu?, do: 0, else: estado.rodadas_seguidas_sem_concluir + 1

    %{
      estado
      | gasto_acumulado: estado.gasto_acumulado + Map.get(resultado, :gasto, 0),
        rodadas_feitas: estado.rodadas_feitas + 1,
        rodadas_seguidas_sem_concluir: seguidas_sem_concluir,
        tarefa_em_voo_id: nil
    }
    |> avaliar_e_agir(resultado)
  end

  defp avaliar_e_agir(estado, resultado \\ %{}) do
    situacao = montar_situacao(estado, resultado)

    case Decisao.decidir(situacao) do
      :continuar -> disparar_rodada(estado)
      {:dormir, horario} -> dormir(estado, horario)
      {:parar, motivo} -> parar(estado, motivo)
    end
  end

  defp montar_situacao(estado, resultado) do
    %{
      ligado?: estado.ligado?,
      teto_de_gasto: estado.teto_de_gasto,
      maximo_de_rodadas: estado.maximo_de_rodadas,
      gasto_acumulado: estado.gasto_acumulado,
      rodadas_feitas: estado.rodadas_feitas,
      rodadas_seguidas_sem_concluir: estado.rodadas_seguidas_sem_concluir,
      ha_tarefa_pronta?: ha_trabalho_em_curso?(estado.projeto_id),
      pediu_replanejamento?: Map.get(resultado, :pediu_replanejamento?, false),
      falhou?: Map.get(resultado, :falhou?, false),
      cota: cota_agora()
    }
  end

  defp cota_agora do
    case Process.whereis(Fabrica.Cota) do
      nil -> %{batida?: false, reabre_em: nil}
      pid -> pid |> Fabrica.Cota.estado() |> Map.take([:batida?, :reabre_em])
    end
  end

  defp disparar_rodada(estado) do
    case montar_rodada(estado.projeto_id) do
      {:ok, tarefa} ->
        persistir(%{estado | tarefa_em_voo_id: tarefa.id, dormindo_ate: nil})

      :sem_trabalho ->
        # Ha tarefa em curso (`ha_tarefa_pronta?` deu true — senao `Decisao` teria mandado
        # parar), so a trava de `areas`/"verificador sozinho" esta segurando o proximo
        # construtor por ora. Tenta de novo em breve, sem contar como parada nem como rodada.
        Process.send_after(self(), :tentar_de_novo, @espera_mutex_ms)
        persistir(estado)

      {:erro, _motivo} ->
        estado
    end
  end

  defp dormir(estado, horario) do
    agendar_acordar(estado, horario)

    # Zera quando ESTA e a primeira vez que dorme nesta parede (`dormindo_ate` ainda nil);
    # conta reavaliacoes consecutivas sem ter acordado de verdade entre elas — o sintoma do
    # laco quente que esta tarefa fecha, e o que os testes de T-094 medem via `:sys.get_state`.
    tentativas = if is_nil(estado.dormindo_ate), do: 1, else: estado.tentativas_na_parede + 1

    persistir(%{estado | dormindo_ate: horario, tentativas_na_parede: tentativas})
  end

  defp parar(estado, motivo) do
    persistir(%{
      estado
      | ligado?: false,
        motivo_parada: motivo,
        dormindo_ate: nil,
        tarefa_em_voo_id: nil
    })
  end

  defp agendar_acordar(_estado, nil),
    do: Process.send_after(self(), :acordar, @espera_sem_horario_ms)

  defp agendar_acordar(estado, horario) do
    atraso = atraso_para_acordar(horario, estado.piso_reacordar_ms)
    Process.send_after(self(), :acordar, atraso)
  end

  @doc """
  O atraso (ms) ate o proximo `:acordar`, dado o horario de reabertura anunciado — ver
  `@piso_reacordar_padrao` (T-094). Nunca devolve atraso `<= 0`: se `horario` ja passou (ou e
  agora mesmo), usa `piso` no lugar, em vez de reagendar para "ja", que e o proprio laco quente.
  """
  @spec atraso_para_acordar(DateTime.t(), pos_integer()) :: pos_integer()
  def atraso_para_acordar(horario, piso) do
    case DateTime.diff(horario, DateTime.utc_now(), :millisecond) do
      atraso when atraso > 0 -> atraso
      _ja_passou_ou_agora -> piso
    end
  end

  defp publico(estado) do
    %{
      ligado?: estado.ligado?,
      teto_de_gasto: estado.teto_de_gasto,
      maximo_de_rodadas: estado.maximo_de_rodadas,
      gasto_acumulado: estado.gasto_acumulado,
      rodadas_feitas: estado.rodadas_feitas,
      rodadas_seguidas_sem_concluir: estado.rodadas_seguidas_sem_concluir,
      dormindo_ate: estado.dormindo_ate,
      motivo_parada: estado.motivo_parada
    }
  end

  ## Persistencia — ver @moduledoc

  defp caminho(estado), do: Path.join(estado.diretorio, "#{estado.projeto_id}.json")

  defp persistir(estado) do
    File.mkdir_p!(estado.diretorio)
    File.write!(caminho(estado), Jason.encode!(serializar(estado)))
    estado
  end

  defp serializar(estado) do
    %{
      ligado?: estado.ligado?,
      teto_de_gasto: estado.teto_de_gasto,
      maximo_de_rodadas: estado.maximo_de_rodadas,
      gasto_acumulado: estado.gasto_acumulado,
      rodadas_feitas: estado.rodadas_feitas,
      rodadas_seguidas_sem_concluir: estado.rodadas_seguidas_sem_concluir,
      dormindo_ate: estado.dormindo_ate && DateTime.to_iso8601(estado.dormindo_ate),
      motivo_parada: estado.motivo_parada,
      tarefa_em_voo_id: estado.tarefa_em_voo_id
    }
  end

  defp carregar_persistido(estado) do
    with {:ok, conteudo} <- File.read(caminho(estado)),
         {:ok, dados} <- Jason.decode(conteudo) do
      aplicar_persistido(estado, dados)
    else
      _ -> estado
    end
  end

  defp aplicar_persistido(estado, dados) do
    %{
      estado
      | ligado?: Map.get(dados, "ligado?", false),
        teto_de_gasto: Map.get(dados, "teto_de_gasto"),
        maximo_de_rodadas: Map.get(dados, "maximo_de_rodadas"),
        gasto_acumulado: Map.get(dados, "gasto_acumulado", 0),
        rodadas_feitas: Map.get(dados, "rodadas_feitas", 0),
        rodadas_seguidas_sem_concluir: Map.get(dados, "rodadas_seguidas_sem_concluir", 0),
        dormindo_ate: dados |> Map.get("dormindo_ate") |> parse_datetime(),
        motivo_parada: dados |> Map.get("motivo_parada") |> parse_motivo(),
        tarefa_em_voo_id: Map.get(dados, "tarefa_em_voo_id")
    }
  end

  defp parse_datetime(nil), do: nil

  defp parse_datetime(texto) do
    case DateTime.from_iso8601(texto) do
      {:ok, dt, _} -> dt
      _ -> nil
    end
  end

  # `String.to_existing_atom/1`, nunca `to_atom/1` (AGENTS.md): os motivos vem do tipo
  # fechado `Fabrica.Piloto.Decisao.motivo_parada/0`, ja carregado por este modulo depender
  # de `Decisao` — o atomo sempre existe.
  defp parse_motivo(nil), do: nil
  defp parse_motivo(texto), do: String.to_existing_atom(texto)
end
