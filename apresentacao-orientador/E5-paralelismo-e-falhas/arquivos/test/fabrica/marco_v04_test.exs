defmodule Fabrica.MarcoV04Test do
  @moduledoc """
  Verifica o MARCO da v0.4 (T-041): tres agentes em voo ao mesmo tempo, e matar um no meio
  nao derruba os outros dois.

  Cada peca ja foi provada ISOLADA: `Agente.Supervisor` (T-036), `Fila.Exclusao` (T-038),
  `Fabrica.Recuperacao` (T-040) e `Fabrica.Cota` (T-039) tem cada um a propria suite. O que
  nenhuma delas prova sozinha e a composicao — tres agentes REAIS (processos, nao
  `Transicao.aplicar/3` encadeado como em `marco_v03_test.exs`) na MESMA rodada, um deles
  morto de verdade (`Process.exit/2`), e o que sobra disso sendo recuperado pelas mesmas
  pecas que a subida usaria.

  async: false: o segundo teste pausa/retoma o Oban REAL (mesma doutrina de
  `Fabrica.CotaTest`), e o primeiro depende do `Fabrica.Agente.Supervisor` unico da
  aplicacao — melhor nao competir com outros testes assincronos que tambem sobem agentes.
  """

  use Fabrica.DataCase, async: false

  @moduletag :capture_log

  alias Fabrica.Agente.Supervisor, as: SupervisorDeAgentes
  alias Fabrica.Cota
  alias Fabrica.Custo.Consumo, as: CustoConsumo
  alias Fabrica.Ferramentas.Comando
  alias Fabrica.Fila.Exclusao
  alias Fabrica.Fila.Trabalho
  alias Fabrica.Operario.Consumo, as: ConsumoRelatado
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Recuperacao
  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Consumo
  alias Fabrica.Tarefas.Despacho
  alias Fabrica.Tarefas.Fila
  alias Fabrica.Tarefas.Tarefa
  alias Fabrica.Tarefas.Transicao

  defp unico, do: System.unique_integer([:positive])

  defp raiz_git do
    raiz = Path.join([File.cwd!(), "_build", "test", "tmp", "marco-v04-#{unico()}"])

    File.mkdir_p!(raiz)
    {:ok, _} = git(raiz, ["init"])
    {:ok, _} = git(raiz, ["config", "user.email", "fabrica@teste.local"])
    {:ok, _} = git(raiz, ["config", "user.name", "Fabrica de Teste"])

    on_exit(fn -> File.rm_rf(raiz) end)
    raiz
  end

  defp git(raiz, argumentos), do: Comando.rodar(raiz, "git", argumentos)

  defp projeto!(atributos) do
    padrao = %{nome: "projeto-#{unico()}", caminho: "C:/tmp/sem-git-#{unico()}"}

    %Projeto{}
    |> Projeto.changeset(Map.merge(padrao, atributos))
    |> Repo.insert!()
  end

  defp tarefa!(projeto, atributos) do
    padrao = %{
      projeto_id: projeto.id,
      codigo: "T-#{800 + unico()}",
      titulo: "uma tarefa",
      status: :pronta
    }

    %Tarefa{}
    |> Tarefa.changeset(Map.merge(padrao, atributos))
    |> Repo.insert!()
    |> Repo.preload([:areas, :projeto, :dependencias])
  end

  defp area!(tarefa, caminho) do
    %Area{}
    |> Area.changeset(%{tarefa_id: tarefa.id, caminho: caminho})
    |> Repo.insert!()

    Repo.preload(tarefa, :areas, force: true)
  end

  defp escrever(raiz, caminho, conteudo) do
    absoluto = Path.join(raiz, caminho)
    File.mkdir_p!(Path.dirname(absoluto))
    File.write!(absoluto, conteudo)
  end

  # `Custo.Consumo.para_registro/3` exige :despacho_id nas opcoes, mas o despacho so nasce
  # DENTRO do mesmo Multi da Transicao (mesma tecnica de `marco_v03_test.exs`).
  defp registro_de_consumo(modelo, atributos_relato) do
    {:ok, registro} =
      CustoConsumo.para_registro(modelo, struct(ConsumoRelatado, atributos_relato),
        despacho_id: 0,
        volta: 1
      )

    registro
  end

  defp contar_consumos(tarefa_id) do
    Consumo
    |> join(:inner, [co], d in Despacho, on: d.id == co.despacho_id)
    |> join(:inner, [co, d], c in Ciclo, on: c.id == d.ciclo_id)
    |> where([co, d, c], c.tarefa_id == ^tarefa_id)
    |> Repo.aggregate(:count)
  end

  defp aguardar(condicao, tentativas \\ 100) do
    cond do
      condicao.() ->
        :ok

      tentativas <= 0 ->
        flunk("condicao nao ficou verdadeira a tempo")

      true ->
        Process.sleep(10)
        aguardar(condicao, tentativas - 1)
    end
  end

  describe "criterios 1, 2 e 3 — tres agentes em voo, matar um, e a recuperacao apos queda" do
    test "Registry confirma tres em voo; matar um devolve a fila com motivo, sem perder " <>
           "consumo nem deixar arquivo sem dono; a subida sanea e reporta" do
      raiz = raiz_git()
      projeto = projeto!(%{caminho: raiz})

      t_a = tarefa!(projeto, %{titulo: "constroi a.txt"}) |> area!("a.txt")
      t_b = tarefa!(projeto, %{titulo: "constroi b.txt"}) |> area!("b.txt")
      t_c = tarefa!(projeto, %{titulo: "constroi c.txt"}) |> area!("c.txt")

      # A rodada so dispara com as `areas` disjuntas CONFERIDAS — momento 1 da T-038, e nao
      # so a promessa de que as tres tarefas nao se cruzam.
      #
      # max_construtores: 3 explicito: este marco prova que o MECANISMO aguenta 3 em voo, nao
      # qual e o padrao — D-003/T-038a baixou o padrao para 2, e enfraquecer esta afirmacao
      # para caber no numero novo esconderia o que o marco existe para provar.
      passos = Exclusao.lote([t_a, t_b, t_c], max_construtores: 3)
      assert length(passos) == 3
      assert Enum.all?(passos, &(&1.papel == :construtor))

      for tarefa <- [t_a, t_b, t_c] do
        assert {:ok, _} = Transicao.aplicar(tarefa, :em_execucao)
      end

      dono = self()
      devolvida = fn tarefa_id, motivo -> send(dono, {:devolvida, tarefa_id, motivo}) end

      # A e B: bloqueiam ate receber :vai e entao reportam o ciclo concluido — o mesmo
      # caminho que um operario real fecharia. (Nao escrevem arquivo: quem commita o
      # trabalho de um ciclo bem-sucedido e o proprio agente, fora do escopo deste teste —
      # o que este marco precisa provar e o caso oposto, o de C, que morre ANTES de chegar
      # la e cujo parcial fica solto na arvore para a recuperacao achar.)
      trabalho_normal = fn tarefa, _arquivo ->
        fn ->
          receive do
            :vai ->
              consumo =
                registro_de_consumo("sonnet-5", %{
                  tokens_entrada: 3_000,
                  tokens_cache_leitura: 2_000,
                  tokens_saida: 400,
                  duracao_ms: 8_000
                })

              {:ok, _} =
                Transicao.aplicar(tarefa, :em_teste,
                  papel: "construtor",
                  relatorio: "feito",
                  despacho: %{operario: "claude_cli", modelo: "sonnet-5", voltas: 1},
                  consumos: [consumo]
                )
          end
        end
      end

      # C: escreve trabalho PARCIAL na propria area e trava — nunca chega a reportar. E o
      # agente que vai morrer no meio.
      trabalho_parcial = fn ->
        receive do
          :vai ->
            escrever(raiz, "c.txt", "trabalho parcial de #{t_c.codigo}")

            receive do
              :nunca_chega -> :ok
            end
        end
      end

      {:ok, pid_a} =
        SupervisorDeAgentes.iniciar(t_a.id, :construtor, trabalho_normal.(t_a, "a.txt"),
          ao_morrer: devolvida
        )

      {:ok, pid_b} =
        SupervisorDeAgentes.iniciar(t_b.id, :construtor, trabalho_normal.(t_b, "b.txt"),
          ao_morrer: devolvida
        )

      {:ok, pid_c} =
        SupervisorDeAgentes.iniciar(t_c.id, :construtor, trabalho_parcial, ao_morrer: devolvida)

      # === Criterio 1: tres agentes em voo, confirmados pelo Registry === Os tres agentes
      # continuam bloqueados no primeiro `receive`, entao esta conferencia nao tem corrida
      # com o trabalho deles: e um retrato exato de "tres em voo agora".
      em_voo = SupervisorDeAgentes.listar() |> Enum.map(& &1.tarefa_id) |> MapSet.new()
      assert MapSet.new([t_a.id, t_b.id, t_c.id]) |> MapSet.subset?(em_voo)

      send(pid_a, :vai)
      send(pid_b, :vai)
      send(pid_c, :vai)

      aguardar(fn -> Repo.get!(Tarefa, t_a.id).status == :em_teste end)
      aguardar(fn -> Repo.get!(Tarefa, t_b.id).status == :em_teste end)
      aguardar(fn -> File.exists?(Path.join(raiz, "c.txt")) end)

      # C escreveu o parcial e travou no segundo `receive` — mata de verdade.
      assert :ok = SupervisorDeAgentes.encerrar(t_c.id)

      # === Criterio 2, parte 1: matar C nao afeta A e B ===
      assert Repo.get!(Tarefa, t_a.id).status == :em_teste
      assert Repo.get!(Tarefa, t_b.id).status == :em_teste
      refute Process.alive?(pid_a)
      refute Process.alive?(pid_b)

      # === Criterio 2, parte 2: a morta volta a fila, com motivo ===
      assert_receive {:devolvida, tarefa_id_morta, motivo}, 1000
      assert tarefa_id_morta == t_c.id
      assert motivo != nil
      refute Process.alive?(pid_c)

      tarefa_c_orfa = Repo.get!(Tarefa, t_c.id)
      # `em_execucao` ja e despachavel como :construtor (Fabrica.Tarefas.Fila) — "voltar a
      # fila" nao exige nenhuma transicao de estado nova, so o motivo registrado acima.
      assert tarefa_c_orfa.status == :em_execucao
      assert Fila.papel_por_status()[tarefa_c_orfa.status] == :construtor

      # === Criterio 2, parte 3: nenhuma linha de consumo se perdeu ===
      assert contar_consumos(t_a.id) == 1
      assert contar_consumos(t_b.id) == 1
      # C nunca chegou a reportar: nada foi gravado pela metade em nome dela.
      assert contar_consumos(t_c.id) == 0

      # === Criterio 2, parte 4: nao sobrou arquivo editado sem dono ===
      # O arquivo que C escreveu antes de morrer continua dentro da AREA dela — e so dela,
      # exclusiva por construcao (T-038): nenhuma outra tarefa deste lote declara "c.txt".
      assert File.exists?(Path.join(raiz, "c.txt"))

      areas_de_c = tarefa_c_orfa |> Repo.preload(:areas, force: true) |> Map.fetch!(:areas)
      assert Enum.map(areas_de_c, & &1.caminho) == ["c.txt"]

      {:ok, %{stdout: status_antes_da_queda}} =
        git(raiz, ["status", "--porcelain", "--", "c.txt"])

      assert String.trim(status_antes_da_queda) != ""

      # === Criterio 3: derrubar a aplicacao no meio e subir dispara o saneamento ===
      # Simula a subida: nenhum agente vivo (a arvore de supervisao acabou de nascer de
      # novo, o Registry nao tem entrada nenhuma para esta tarefa) — o mesmo estado que
      # `Fabrica.Recuperacao.sanear/1` encontraria no boot.
      tarefa_para_sanear = Repo.preload(tarefa_c_orfa, [:areas, :projeto], force: true)
      relatorio = Recuperacao.sanear(vivos: [], tarefas: [tarefa_para_sanear])

      refute relatorio.nada_a_fazer?
      assert [achado] = relatorio.orfas
      assert achado.tarefa_id == t_c.id
      assert achado.status_encontrado == :em_execucao
      assert achado.status_apos == :em_execucao
      # o trabalho parcial de C, que estava so na arvore de arquivos, foi commitado em
      # nome dela — e por isso o marco pode afirmar "sem arquivo sem dono".
      assert achado.commit != nil

      {:ok, %{stdout: mensagem_do_commit}} = git(raiz, ["log", "-1", "--pretty=%s"])
      assert mensagem_do_commit =~ t_c.codigo
      assert mensagem_do_commit =~ "recuperacao"

      {:ok, %{stdout: status_depois_da_recuperacao}} = git(raiz, ["status", "--porcelain"])
      assert String.trim(status_depois_da_recuperacao) == ""

      # O saneamento reporta SEMPRE — inclusive quando nao havia nada a fazer, a outra
      # metade da promessa da T-040.
      relatorio_vazio = Recuperacao.sanear(vivos: [], tarefas: [])
      assert relatorio_vazio.nada_a_fazer?
      assert relatorio_vazio.orfas == []
    end
  end

  describe "criterio 4 — erro de cota injetado pausa as filas sem cancelar o que ja esta enfileirado" do
    test "parede/2 pausa, mantem o job available e agenda o rearme; rearmar/1 retoma" do
      projeto = projeto!(%{caminho: "C:/tmp/marco-v04-cota"})

      tarefa = tarefa!(projeto, %{titulo: "aguardando a cota"})

      {:ok, job} = Oban.insert(Trabalho.novo(tarefa.id, :construtor))

      nome = :"cota_marco_v04_#{unico()}"
      start_supervised!({Cota, name: nome})

      refute Cota.batida?(nome)

      :ok =
        Cota.parede(nome, {:erro, {:cota, DateTime.add(DateTime.utc_now(), 3600, :second)}})

      # A parede bateu, e o trabalho ja enfileirado NAO foi tocado — continua `available`,
      # pronto para sair assim que as filas voltarem.
      assert Cota.batida?(nome)
      assert Repo.get!(Oban.Job, job.id).state == "available"

      # O rearme esta agendado (nao "vai bater a hora e nada acontece").
      estado = Cota.estado(nome)
      assert estado.batida?
      assert estado.reabre_em != nil
      assert estado.proxima_tentativa_em != nil

      # Rearmar retoma as filas, sem cancelar nem descartar nada que estava esperando.
      :ok = Cota.rearmar(nome)
      refute Cota.batida?(nome)
      assert Repo.get!(Oban.Job, job.id).state == "available"
    end
  end
end
