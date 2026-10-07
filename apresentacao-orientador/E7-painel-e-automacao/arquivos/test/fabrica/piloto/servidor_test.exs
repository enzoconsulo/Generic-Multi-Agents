defmodule Fabrica.Piloto.ServidorTest do
  @moduledoc """
  Os tres criterios mecanicos da T-055: fim de rodada dispara a proxima quando a decisao
  manda continuar, a rodada e montada pelo mesmo caminho em qualquer um dos dois pontos de
  entrada, e o estado sobrevive a um reinicio.

  `async: false`: o servidor roda em processo proprio e faz consultas ao `Repo` de dentro
  dele — precisa do modo `shared` do sandbox (`Fabrica.DataCase.setup_sandbox/1` liga isso
  sozinho quando a tag `:async` esta ausente).
  """

  use Fabrica.DataCase, async: false
  use Oban.Testing, repo: Fabrica.Repo

  alias Fabrica.Cota
  alias Fabrica.Piloto.Servidor
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Tarefa

  # T-091: o operario dublE da parede de cota. Devolve o sinal EXATO que `ClaudeCLI` e
  # `MessagesAPI` devolvem numa parede real, com o horario que o teste fixou no env — e o
  # operario CONFIGURADO (`Fabrica.Operario.configurado/0`), porque o caminho exercitado e o
  # do job da fila, que nao recebe operario por parametro. Sem rede, sem `claude`, sem cota.
  defmodule OperarioDeParede do
    @moduledoc false
    @behaviour Fabrica.Operario

    @impl Fabrica.Operario
    def conversar(_requisicao, _opcoes),
      do: {:erro, {:cota, Application.fetch_env!(:fabrica, :reabre_em_do_teste_t091)}}
  end

  setup do
    projeto =
      %Projeto{}
      |> Projeto.changeset(%{
        nome: "piloto-#{System.unique_integer([:positive])}",
        caminho: "C:/tmp/piloto"
      })
      |> Repo.insert!()

    diretorio = Path.join(System.tmp_dir!(), "piloto-teste-#{System.unique_integer([:positive])}")
    on_exit(fn -> File.rm_rf!(diretorio) end)

    %{projeto: projeto, diretorio: diretorio}
  end

  defp tarefa!(projeto, atributos) do
    padrao = %{
      projeto_id: projeto.id,
      codigo: "T-#{100 + System.unique_integer([:positive])}",
      titulo: "uma tarefa"
    }

    %Tarefa{}
    |> Tarefa.changeset(Map.merge(padrao, atributos))
    |> Repo.insert!()
  end

  defp piloto!(projeto, diretorio, opcoes \\ []) do
    padrao = [projeto_id: projeto.id, diretorio: diretorio, nome: nil]
    {:ok, pid} = Servidor.start_link(Keyword.merge(padrao, opcoes))
    pid
  end

  defp area!(tarefa, caminho) do
    %Area{}
    |> Area.changeset(%{tarefa_id: tarefa.id, caminho: caminho})
    |> Repo.insert!()
  end

  defp concluir!(tarefa), do: tarefa |> Tarefa.changeset(%{status: :concluida}) |> Repo.update!()

  describe "montar_rodada/1 — o mesmo caminho do botao Trabalhar" do
    test "despacha a tarefa pronta para em_execucao, pela via duravel de Fabrica.Fila.Trabalho",
         %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :pronta})

      assert {:ok, movida} = Servidor.montar_rodada(projeto.id)
      assert movida.id == tarefa.id
      assert movida.status == :em_execucao
      assert Repo.get!(Tarefa, tarefa.id).status == :em_execucao

      assert_enqueued(
        worker: Fabrica.Fila.Trabalho,
        args: %{tarefa_id: tarefa.id, papel: "construtor"}
      )
    end

    test "sem tarefa pronta, devolve :sem_trabalho", %{projeto: projeto} do
      tarefa!(projeto, %{status: :backlog})

      assert Servidor.montar_rodada(projeto.id) == :sem_trabalho
    end

    test "duas tarefas prontas com areas que se cruzam: so a primeira (prioridade, depois codigo) sai",
         %{projeto: projeto} do
      _primeira = tarefa!(projeto, %{status: :pronta, codigo: "T-200", prioridade: :alta})
      segunda = tarefa!(projeto, %{status: :pronta, codigo: "T-201", prioridade: :baixa})

      assert {:ok, movida} = Servidor.montar_rodada(projeto.id)
      assert movida.codigo == "T-200"
      assert Repo.get!(Tarefa, segunda.id).status == :pronta
    end
  end

  describe "o piloto e o botao chamam o MESMO caminho (teste que compara os dois)" do
    test "dispachar manualmente (montar_rodada/1) e dispachar via o piloto ligado produzem o mesmo efeito",
         %{projeto: projeto, diretorio: diretorio} do
      manual = tarefa!(projeto, %{status: :pronta, codigo: "T-300"})
      automatica = tarefa!(projeto, %{status: :pronta, codigo: "T-999", prioridade: :baixa})
      # `areas` disjuntas: sem elas as duas disputariam o mesmo lugar de "sem areas roda
      # sozinha" em `Fabrica.Fila.Exclusao`, e so uma das duas conseguiria sair — o que
      # provaria o mutex, nao a comparacao que este teste quer fazer.
      area!(manual, "lib/um.ex")
      area!(automatica, "lib/dois.ex")

      # "clicar o botao": chamar montar_rodada/1 direto, sem nenhum piloto no ar.
      assert {:ok, %{status: :em_execucao}} = Servidor.montar_rodada(projeto.id)
      assert Repo.get!(Tarefa, manual.id).status == :em_execucao

      assert_enqueued(
        worker: Fabrica.Fila.Trabalho,
        args: %{tarefa_id: manual.id, papel: "construtor"}
      )

      # o piloto, ligado, dispara a rodada sozinho para a proxima tarefa pronta — pelo MESMO
      # caminho: nao ha um segundo algoritmo aqui, e o efeito e identico ao de cima.
      pid = piloto!(projeto, diretorio)
      assert {:ok, publico} = Servidor.ligar(pid, 50.0, 10)
      assert publico.ligado?

      assert Repo.get!(Tarefa, automatica.id).status == :em_execucao

      assert_enqueued(
        worker: Fabrica.Fila.Trabalho,
        args: %{tarefa_id: automatica.id, papel: "construtor"}
      )
    end
  end

  describe "ligar/3" do
    test "recusa sem os dois freios, delegando para Fabrica.Piloto.Decisao.ligar/2", %{
      projeto: projeto,
      diretorio: diretorio
    } do
      pid = piloto!(projeto, diretorio)

      assert {:erro, [:sem_teto_de_gasto, :sem_maximo_de_rodadas]} = Servidor.ligar(pid, nil, nil)
      refute Servidor.estado(pid).ligado?
    end

    test "sem tarefa pronta nenhuma, liga e ja para com :sem_tarefa_pronta", %{
      projeto: projeto,
      diretorio: diretorio
    } do
      pid = piloto!(projeto, diretorio)

      assert {:ok, publico} = Servidor.ligar(pid, 50.0, 10)
      refute publico.ligado?
      assert publico.motivo_parada == :sem_tarefa_pronta
    end
  end

  describe "fim de rodada consulta a decisao e dispara a proxima quando ela manda continuar" do
    test "rodada_concluida/2 com :concluiu? true e outra tarefa pronta dispara a proxima", %{
      projeto: projeto,
      diretorio: diretorio
    } do
      primeira = tarefa!(projeto, %{status: :pronta, codigo: "T-400"})
      segunda = tarefa!(projeto, %{status: :backlog, codigo: "T-401"})

      pid = piloto!(projeto, diretorio)
      {:ok, _} = Servidor.ligar(pid, 50.0, 10)
      assert Repo.get!(Tarefa, primeira.id).status == :em_execucao

      # a segunda so fica pronta agora — simula o retrabalho/promocao que aconteceu durante
      # a rodada da primeira.
      segunda |> Tarefa.changeset(%{status: :pronta}) |> Repo.update!()
      # a primeira sai de `em_execucao` (o verificador, fora das areas desta tarefa, a move) —
      # senao ela sozinha ocuparia o unico lugar de "sem areas roda sozinha" do mutex.
      concluir!(primeira)

      publico = Servidor.rodada_concluida(pid, %{concluiu?: true, gasto: 3.5})

      assert publico.ligado?
      assert publico.rodadas_feitas == 1
      assert publico.rodadas_seguidas_sem_concluir == 0
      assert_in_delta publico.gasto_acumulado, 3.5, 0.0001
      assert Repo.get!(Tarefa, segunda.id).status == :em_execucao
    end

    test "duas rodadas seguidas sem concluir para o piloto (estagnado)", %{
      projeto: projeto,
      diretorio: diretorio
    } do
      tarefa!(projeto, %{status: :pronta, codigo: "T-410"})
      tarefa!(projeto, %{status: :pronta, codigo: "T-411"})
      tarefa!(projeto, %{status: :pronta, codigo: "T-412"})

      pid = piloto!(projeto, diretorio)
      {:ok, _} = Servidor.ligar(pid, 50.0, 10)

      Servidor.rodada_concluida(pid, %{concluiu?: false})
      publico = Servidor.rodada_concluida(pid, %{concluiu?: false})

      refute publico.ligado?
      assert publico.motivo_parada == :estagnado
    end

    test "sem mais tarefa pronta, para com :sem_tarefa_pronta em vez de continuar", %{
      projeto: projeto,
      diretorio: diretorio
    } do
      tarefa!(projeto, %{status: :pronta, codigo: "T-420"})

      pid = piloto!(projeto, diretorio)
      {:ok, _} = Servidor.ligar(pid, 50.0, 10)

      publico = Servidor.rodada_concluida(pid, %{concluiu?: true})

      refute publico.ligado?
      assert publico.motivo_parada == :sem_tarefa_pronta
    end

    test "o evento [:fabrica, :despacho, :fim] da tarefa em voo tambem dispara a proxima rodada (escutar)",
         %{projeto: projeto, diretorio: diretorio} do
      primeira = tarefa!(projeto, %{status: :pronta, codigo: "T-430"})
      segunda = tarefa!(projeto, %{status: :pronta, codigo: "T-431", prioridade: :baixa})

      pid = piloto!(projeto, diretorio)
      {:ok, _} = Servidor.ligar(pid, 50.0, 10)
      assert Repo.get!(Tarefa, primeira.id).status == :em_execucao
      concluir!(primeira)

      Fabrica.Eventos.despacho_fim(%{
        tarefa_id: primeira.id,
        desfecho: :fim_do_turno,
        voltas: 3,
        gasto_usd: 1.2
      })

      # o evento chega por mensagem — espera a mesma mensagem se propagar antes de conferir.
      :sys.get_state(pid)

      assert Repo.get!(Tarefa, segunda.id).status == :em_execucao
      publico = Servidor.estado(pid)
      assert publico.rodadas_feitas == 1
      assert_in_delta publico.gasto_acumulado, 1.2, 0.0001
    end

    test "evento despacho_fim de OUTRA tarefa (nao a que o piloto despachou) e ignorado", %{
      projeto: projeto,
      diretorio: diretorio
    } do
      tarefa!(projeto, %{status: :pronta, codigo: "T-440"})

      pid = piloto!(projeto, diretorio)
      {:ok, _} = Servidor.ligar(pid, 50.0, 10)

      Fabrica.Eventos.despacho_fim(%{
        tarefa_id: -1,
        desfecho: :fim_do_turno,
        voltas: 1,
        gasto_usd: 9.0
      })

      :sys.get_state(pid)

      publico = Servidor.estado(pid)
      assert publico.rodadas_feitas == 0
    end
  end

  describe "desligar nao corta a rodada em voo" do
    test "desligar so muda ligado?; o fim da rodada em voo ainda encontra ligado?: false", %{
      projeto: projeto,
      diretorio: diretorio
    } do
      tarefa!(projeto, %{status: :pronta, codigo: "T-450"})

      pid = piloto!(projeto, diretorio)
      {:ok, _} = Servidor.ligar(pid, 50.0, 10)

      :ok = Servidor.desligar(pid)
      refute Servidor.estado(pid).ligado?

      publico = Servidor.rodada_concluida(pid, %{concluiu?: true})
      refute publico.ligado?
      assert publico.motivo_parada == :desligado
    end
  end

  describe "estado sobrevive a um reinicio da aplicacao" do
    test "um novo processo, com o mesmo projeto_id e diretorio, recarrega o que foi persistido",
         %{projeto: projeto, diretorio: diretorio} do
      tarefa!(projeto, %{status: :pronta, codigo: "T-460"})
      tarefa!(projeto, %{status: :backlog, codigo: "T-461"})

      pid = piloto!(projeto, diretorio)
      {:ok, antes} = Servidor.ligar(pid, 42.0, 7)
      _ = Servidor.rodada_concluida(pid, %{concluiu?: true, gasto: 2.0})

      GenServer.stop(pid)

      depois_pid = piloto!(projeto, diretorio)
      depois = Servidor.estado(depois_pid)

      assert depois.teto_de_gasto == antes.teto_de_gasto
      assert depois.maximo_de_rodadas == antes.maximo_de_rodadas
      assert depois.rodadas_feitas == 1
      assert_in_delta depois.gasto_acumulado, 2.0, 0.0001
    end

    test "com uma rodada genuinamente EM VOO (tarefa ainda em_execucao), o novo processo NAO se desliga sozinho alegando falta de tarefa pronta",
         %{projeto: projeto, diretorio: diretorio} do
      tarefa = tarefa!(projeto, %{status: :pronta, codigo: "T-470"})

      pid = piloto!(projeto, diretorio)
      {:ok, _} = Servidor.ligar(pid, 50.0, 10)
      assert Repo.get!(Tarefa, tarefa.id).status == :em_execucao

      GenServer.stop(pid)

      depois_pid = piloto!(projeto, diretorio)
      depois = Servidor.estado(depois_pid)

      assert depois.ligado?
      refute depois.motivo_parada
      assert Repo.get!(Tarefa, tarefa.id).status == :em_execucao
    end

    test "se a rodada em voo terminou enquanto o processo estava fora (verificador moveu o status), o reinicio avalia normalmente e despacha a proxima",
         %{projeto: projeto, diretorio: diretorio} do
      primeira = tarefa!(projeto, %{status: :pronta, codigo: "T-480"})
      segunda = tarefa!(projeto, %{status: :pronta, codigo: "T-481", prioridade: :baixa})

      pid = piloto!(projeto, diretorio)
      {:ok, _} = Servidor.ligar(pid, 50.0, 10)
      assert Repo.get!(Tarefa, primeira.id).status == :em_execucao

      GenServer.stop(pid)

      # enquanto o processo estava fora, o verificador (fora das areas desta tarefa) concluiu
      # a tarefa que estava em voo.
      concluir!(primeira)

      depois_pid = piloto!(projeto, diretorio)
      depois = Servidor.estado(depois_pid)

      assert depois.ligado?
      assert Repo.get!(Tarefa, segunda.id).status == :em_execucao
    end
  end

  describe "Fabrica.Cota na arvore de supervisao da aplicacao (T-091)" do
    test "sobe com o nome Fabrica.Cota, filho de Fabrica.Supervisor" do
      pid = Process.whereis(Fabrica.Cota)

      assert is_pid(pid), "Fabrica.Cota nao esta de pe com a aplicacao no ar"
      assert Process.alive?(pid)

      # Filho da arvore da APLICACAO, e nao um processo solto que algum teste subiu.
      assert {Fabrica.Cota, ^pid, :worker, [Fabrica.Cota]} =
               List.keyfind(Supervisor.which_children(Fabrica.Supervisor), Fabrica.Cota, 0)
    end
  end

  describe "parede de cota real: o piloto DORME ate a reabertura, nao para por falha (T-091)" do
    # O caminho de producao inteiro, com o `Fabrica.Cota` GLOBAL (o da arvore da aplicacao):
    # o piloto despacha -> o job `Fabrica.Fila.Trabalho` roda o `Laco` com o operario
    # configurado -> o operario bate a parede -> o `Laco` avisa o `Fabrica.Cota` nomeado ->
    # `Trabalho` emite `[:fabrica, :despacho, :fim]` com o desfecho do `Laco` -> o piloto decide.
    #
    # Mexe em estado GLOBAL (o `Fabrica.Cota` nomeado, as filas do Oban via `pausar`/`retomar`
    # padrao, e o env `:operario`) — por isso este arquivo e `async: false`, e o `on_exit`
    # devolve tudo como estava: cota rearmada (filas retomadas) e env restaurado.
    setup do
      operario_antes = Application.get_env(:fabrica, :operario)

      reabre_em =
        DateTime.utc_now() |> DateTime.add(3600, :second) |> DateTime.truncate(:second)

      Application.put_env(:fabrica, :operario, OperarioDeParede)
      Application.put_env(:fabrica, :reabre_em_do_teste_t091, reabre_em)

      on_exit(fn ->
        # Sem `Fabrica.Cota` de pe (o "antes" do conserto, sob `git stash`) nao ha o que rearmar.
        if Process.whereis(Fabrica.Cota), do: :ok = Cota.rearmar(Fabrica.Cota)

        case operario_antes do
          nil -> Application.delete_env(:fabrica, :operario)
          modulo -> Application.put_env(:fabrica, :operario, modulo)
        end

        Application.delete_env(:fabrica, :reabre_em_do_teste_t091)
      end)

      %{reabre_em: reabre_em}
    end

    @tag :capture_log
    test "a rodada em voo termina na parede: dormindo_ate e o horario do sinal, ligado, sem motivo_parada",
         %{projeto: projeto, diretorio: diretorio, reabre_em: reabre_em} do
      tarefa = tarefa!(projeto, %{status: :pronta, codigo: "T-490"})

      pid = piloto!(projeto, diretorio)
      {:ok, _} = Servidor.ligar(pid, 50.0, 10)
      assert Repo.get!(Tarefa, tarefa.id).status == :em_execucao

      # O job que o piloto acabou de enfileirar, rodado como o Oban o rodaria (`perform/1`).
      assert :ok =
               perform_job(Fabrica.Fila.Trabalho, %{tarefa_id: tarefa.id, papel: "construtor"})

      # O evento de fim chega por mensagem — espera ele ser processado antes de conferir.
      :sys.get_state(pid)

      publico = Servidor.estado(pid)

      assert publico.motivo_parada == nil,
             "o piloto parou (#{inspect(publico.motivo_parada)}) em vez de dormir na parede"

      assert publico.ligado?
      assert publico.dormindo_ate == reabre_em

      # E a parede ficou registrada no `Fabrica.Cota` da aplicacao, como o `Laco` a deixou.
      assert %{batida?: true, reabre_em: ^reabre_em} = Cota.estado(Fabrica.Cota)
    end
  end
end
