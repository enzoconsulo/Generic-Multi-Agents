defmodule Fabrica.Fila.TrabalhoTest do
  @moduledoc """
  Trava as quatro promessas da T-037.

  1. `despachar/3` muda o estado e enfileira o trabalho na MESMA transação — provado nos
     dois sentidos: o caminho feliz grava os dois juntos, e uma falha em QUALQUER ponto da
     transação (mesmo depois dos dois passos já terem "acontecido" dentro do Multi) desfaz
     os dois. É o mesmo padrão de prova de `Fabrica.Tarefas.TransicaoTest` (T-022), agora
     sobre o Multi que também carrega o `Oban.Job`.
  2. Um trabalho preso em `executing` porque o nó caiu volta a ficar `available` sozinho,
     na subida — sem intervenção. Sobe uma instância própria do Oban (com
     `Fabrica.Fila.Resgate` configurado para resgatar quase na hora), mata o supervisor NO
     MEIO da execução, sobe
     de novo, e espera o resgate.
  3. `unique` por `{tarefa_id, papel}` — duas tentativas de enfileirar a MESMA etapa da
     MESMA tarefa não duplicam a fila.
  4. A fila do verificador é 1-wide; a do construtor, até 3 — inspecionável na config da
     aplicação.
  """

  # async: false porque o teste de recuperacao apos queda sobe um Oban de VERDADE, com
  # processos proprios (Stager, Producer, Executor) que precisam da mesma conexao
  # sandboxed do processo de teste — exige `Sandbox.mode(Repo, {:shared, self()})`, que e
  # global ao Repo e colidiria com qualquer outro teste `async: true` rodando ao mesmo
  # tempo.
  use Fabrica.DataCase, async: false
  use Oban.Testing, repo: Fabrica.Repo

  alias Fabrica.Agente.Supervisor, as: SupervisorDeAgentes
  alias Fabrica.Cota
  alias Fabrica.Eventos
  alias Fabrica.Ferramentas.RegistrarResultado
  alias Fabrica.Fila.Trabalho
  alias Fabrica.Operario.Falso
  alias Fabrica.Portoes.Revisor
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Consumo
  alias Fabrica.Tarefas.Despacho
  alias Fabrica.Tarefas.Fila
  alias Fabrica.Tarefas.Tarefa
  alias Fabrica.Tarefas.Transicao

  # O operario de teste (T-070). Vive so aqui, como os adaptadores de `laco_test.exs`: e a
  # prova de que `perform/1` sobe um agente REAL sem tocar rede nem cota. Ele roda DENTRO do
  # processo do agente, entao fotografa o proprio Registry (criterio 1) antes de responder — ou
  # trava, quando o teste quer mata-lo em voo (criterio 2). Delega a montagem da resposta ao
  # `Fabrica.Operario.Falso` para reaproveitar o consumo deterministico.
  defmodule OperarioDeTeste do
    @moduledoc false
    @behaviour Fabrica.Operario

    alias Fabrica.Agente.Supervisor, as: SupervisorDeAgentes
    alias Fabrica.Operario.Falso

    @impl Fabrica.Operario
    def conversar(requisicao, opcoes) do
      if dono = Application.get_env(:fabrica, :controle_do_teste) do
        send(dono, {:em_voo, SupervisorDeAgentes.listar()})
      end

      case Application.get_env(:fabrica, :agulha_do_teste) do
        nil ->
          case Application.get_env(:fabrica, :modo_do_teste, :responder) do
            :travar -> Process.sleep(:infinity)
            :responder -> {:ok, Falso.resposta()}
            # T-095: os dois sinais de PAREDE (nenhum e erro do trabalho) que o Laco traduz
            # em `motivo_do_erro`, sem passar por `Falso` — o laco nunca contabiliza consumo
            # nos dois.
            :parede_cota -> {:erro, {:cota, Application.get_env(:fabrica, :reabre_em_do_teste)}}
            :sandbox_indisponivel -> {:erro, :sandbox_indisponivel}
            # Contraprova de T-095: um erro que E do trabalho, para provar que ele NAO vira
            # parede e segue julgado como hoje.
            :prazo -> {:erro, :prazo}
          end

        # T-073: quando o teste precisa que o modelo PEÇA uma ferramenta (para provar que
        # `Trabalho.rodar_agente/2` de fato ligou o mapa real), delega ao roteiro de
        # `Falso.iniciar/1` em vez da resposta unica de sempre.
        agulha ->
          via_agulha(requisicao, opcoes, agulha)
      end
    end

    # T-074: prova de "morte em voo DEPOIS de registrar_resultado" precisa do processo do
    # agente vivo, esperando, no exato momento em que o teste mata o supervisor — nao um
    # erro que encerraria o laco sozinho.
    defp via_agulha(requisicao, opcoes, agulha) do
      case Falso.conversar(requisicao, Keyword.put(opcoes, :agulha, agulha)) do
        {:erro, :roteiro_esgotado} -> travar_ou_esgotar()
        outro -> outro
      end
    end

    defp travar_ou_esgotar do
      if Application.get_env(:fabrica, :travar_apos_agulha, false) do
        Process.sleep(:infinity)
      else
        {:erro, :roteiro_esgotado}
      end
    end
  end

  setup do
    projeto =
      %Projeto{}
      |> Projeto.changeset(%{
        nome: "projeto-#{System.unique_integer([:positive])}",
        caminho: "C:/tmp/p"
      })
      |> Repo.insert!()

    %{projeto: projeto}
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

  describe "executar/2 — a cola entre a fila e o agente real (T-070)" do
    # Troca o operario configurado pelo dublE local e aponta o `controle_do_teste` para este
    # processo, para o `OperarioDeTeste` fotografar o Registry em voo. Restaura tudo no fim: o
    # arquivo e `async: false`, mas env global vazado contaminaria a suite seguinte.
    setup do
      operario_antes = Application.get_env(:fabrica, :operario)
      Application.put_env(:fabrica, :operario, OperarioDeTeste)
      Application.put_env(:fabrica, :controle_do_teste, self())

      on_exit(fn ->
        # T-095: os modos de parede de cota deste bloco fazem o `Laco` marcar o `Fabrica.Cota`
        # GLOBAL como batida e PAUSAR as filas do Oban (via a `:cota` padrao de `rodar_agente/2`).
        # Sem rearmar aqui, essa parede vaza para os arquivos seguintes da suite — `servidor_test`
        # (o piloto ve a cota batida e DORME em vez de despachar) e `console_live_test` (#cota-parede
        # aparece). Mesmo `on_exit` do bloco de parede de `servidor_test.exs`; `rearmar/1` e no-op
        # quando a cota nao esta batida.
        if Process.whereis(Fabrica.Cota), do: :ok = Cota.rearmar(Fabrica.Cota)

        case operario_antes do
          nil -> Application.delete_env(:fabrica, :operario)
          modulo -> Application.put_env(:fabrica, :operario, modulo)
        end

        Application.delete_env(:fabrica, :controle_do_teste)
        Application.delete_env(:fabrica, :modo_do_teste)
        Application.delete_env(:fabrica, :agulha_do_teste)
        Application.delete_env(:fabrica, :travar_apos_agulha)
        Application.delete_env(:fabrica, :reabre_em_do_teste)
      end)

      :ok
    end

    test "construtor: sobe um agente confirmavel por listar/0 e transiciona pronta -> em_teste",
         %{projeto: projeto} do
      Application.put_env(:fabrica, :modo_do_teste, :responder)
      tarefa = tarefa!(projeto, %{status: :pronta})

      assert :ok = Trabalho.executar(tarefa.id, :construtor)

      # O operario rodou DENTRO do processo do agente e, antes de responder, fotografou o
      # Registry: prova de que `executar/2` subiu um agente REAL via `Supervisor.iniciar/4`
      # (criterio 1), e nao so simulou a conclusao.
      assert_receive {:em_voo, em_voo}, 2_000
      assert Enum.any?(em_voo, &(&1.tarefa_id == tarefa.id and &1.papel == :construtor))

      # O construtor nao julga: o trabalho dele E o resultado, e a tarefa segue para o
      # verificador — o proximo papel que `Fila.papel_por_status/0` mapeia, ja enfileirado.
      assert Repo.get!(Tarefa, tarefa.id).status == :em_teste
      assert_enqueued(worker: Trabalho, args: %{tarefa_id: tarefa.id, papel: "verificador"})
    end

    @tag :capture_log
    test "matar o agente em voo devolve a tarefa a fila com motivo, sem perder consumo",
         %{projeto: projeto} do
      Application.put_env(:fabrica, :modo_do_teste, :travar)
      :ok = Eventos.assinar()
      tarefa = tarefa!(projeto, %{status: :pronta})

      # `executar/2` bloqueia ate o agente terminar ou morrer — roda num processo proprio para
      # o teste poder mata-lo em voo. Sandbox compartilhada (async: false) da ao Task a mesma
      # conexao.
      task = Task.async(fn -> Trabalho.executar(tarefa.id, :construtor) end)

      # O dublE em modo `:travar` fotografa o Registry e entao trava — o agente esta em voo.
      assert_receive {:em_voo, em_voo}, 2_000
      assert Enum.any?(em_voo, &(&1.tarefa_id == tarefa.id))

      # Mata de verdade (Process.exit/2, intratavel), o mesmo contrato do `marco_v04_test.exs`.
      assert :ok = SupervisorDeAgentes.encerrar(tarefa.id)

      # O `:ao_morrer` acordou o `receive` de `executar/2`, que emitiu o fim com o desfecho de
      # morte e devolveu :ok — sem transicao nova.
      assert_receive {:fabrica, [:fabrica, :despacho, :fim], _medidas, meta}, 2_000
      assert meta.tarefa_id == tarefa.id
      assert match?({:morto, _motivo}, meta.desfecho)
      assert :ok = Task.await(task)

      # `em_execucao` ja e despachavel como :construtor (Fabrica.Tarefas.Fila) — "voltar a fila"
      # nao exige transicao de estado nova, so o motivo registrado acima.
      tarefa_depois = Repo.get!(Tarefa, tarefa.id)
      assert tarefa_depois.status == :em_execucao
      assert Fila.papel_por_status()[tarefa_depois.status] == :construtor

      # O agente morreu ANTES de reportar: nada foi gravado pela metade em nome da tarefa — o
      # mesmo que o `marco_v04_test.exs` afirma do agente que morre no meio.
      assert contar_consumos(tarefa.id) == 0
    end

    test "ao concluir, emite [:fabrica, :despacho, :fim] com tarefa_id, desfecho e gasto_usd",
         %{projeto: projeto} do
      Application.put_env(:fabrica, :modo_do_teste, :responder)
      :ok = Eventos.assinar()
      tarefa = tarefa!(projeto, %{status: :pronta})

      assert :ok = Trabalho.executar(tarefa.id, :construtor)

      assert_receive {:fabrica, [:fabrica, :despacho, :fim], _medidas, meta}, 2_000
      assert meta.tarefa_id == tarefa.id
      assert meta.desfecho == :fim_do_turno
      assert is_float(meta.gasto_usd)
    end

    test "liga o mapa de ferramentas REAIS (T-073): um pedido de 'escrever' grava no disco de verdade",
         %{projeto: _projeto} do
      # Antes da T-073, `rodar_agente/2` chamava `Laco.rodar/1` SEM `ferramentas:` — um
      # agente real que so produz prosa. Este teste prova o contrario: um pedido de
      # ferramenta que o agente faz de verdade chega ao `Fabrica.Ferramentas.Arquivo` de
      # verdade, dentro da `raiz` do projeto e das `areas` da tarefa.
      raiz =
        Path.join(System.tmp_dir!(), "trabalho-ferramentas-#{System.unique_integer([:positive])}")

      File.mkdir_p!(Path.join(raiz, "lib"))
      on_exit(fn -> File.rm_rf(raiz) end)

      projeto_real =
        %Projeto{}
        |> Projeto.changeset(%{
          nome: "projeto-real-#{System.unique_integer([:positive])}",
          caminho: raiz
        })
        |> Repo.insert!()

      tarefa = tarefa!(projeto_real, %{status: :pronta})

      %Area{}
      |> Area.changeset(%{tarefa_id: tarefa.id, caminho: "lib/saida.txt"})
      |> Repo.insert!()

      {:ok, agulha} =
        Falso.iniciar(
          roteiro: [
            Falso.resposta(
              blocos: [
                %{
                  tipo: :uso_de_ferramenta,
                  id: "1",
                  nome: "escrever",
                  argumentos: %{"caminho" => "lib/saida.txt", "conteudo" => "prova real"}
                }
              ],
              motivo_parada: :uso_de_ferramenta
            ),
            Falso.resposta()
          ]
        )

      Application.put_env(:fabrica, :agulha_do_teste, agulha)

      assert :ok = Trabalho.executar(tarefa.id, :construtor)

      assert File.read!(Path.join(raiz, "lib/saida.txt")) == "prova real"
    end

    test "registrar_resultado chamado NO MEIO do laco fica associado ao MESMO ciclo criado pela transicao (T-074)",
         %{projeto: projeto} do
      # Prova o criterio 2 da T-074: o relato que o agente chama durante o laco (sem
      # `ciclo_id` nenhum, cai no coletor em memoria) chega ao MESMO ciclo que
      # `Transicao.aplicar/3` cria ao fim do despacho — sem registro duplicado nem orfao.
      {:ok, agulha} =
        Falso.iniciar(
          roteiro: [
            Falso.resposta(
              blocos: [
                %{
                  tipo: :uso_de_ferramenta,
                  id: "1",
                  nome: "registrar_resultado",
                  argumentos: %{"resumo" => "criei o modulo X"}
                }
              ],
              motivo_parada: :uso_de_ferramenta
            ),
            Falso.resposta()
          ]
        )

      Application.put_env(:fabrica, :agulha_do_teste, agulha)
      tarefa = tarefa!(projeto, %{status: :pronta})

      assert :ok = Trabalho.executar(tarefa.id, :construtor)

      ciclos = Repo.all(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id))
      assert [ciclo] = ciclos
      assert ciclo.relatorio =~ "criei o modulo X"
    end

    @tag :capture_log
    test "morte em voo DEPOIS de chamar registrar_resultado nao deixa relato gravado pela metade (T-074)",
         %{projeto: projeto} do
      # Prova o criterio 3 da T-074: o coletor em memoria (T-074) nao sobrevive a morte do
      # agente — nada chama `Trabalho.finalizar/3` nesse caminho, entao nem o relato nem o
      # ciclo chegam a existir no banco.
      {:ok, agulha} =
        Falso.iniciar(
          roteiro: [
            Falso.resposta(
              blocos: [
                %{
                  tipo: :uso_de_ferramenta,
                  id: "1",
                  nome: "registrar_resultado",
                  argumentos: %{"resumo" => "trabalho parcial, agente vai morrer a seguir"}
                }
              ],
              motivo_parada: :uso_de_ferramenta
            )
          ]
        )

      Application.put_env(:fabrica, :agulha_do_teste, agulha)
      Application.put_env(:fabrica, :travar_apos_agulha, true)
      :ok = Eventos.assinar()
      tarefa = tarefa!(projeto, %{status: :pronta})

      task = Task.async(fn -> Trabalho.executar(tarefa.id, :construtor) end)

      # Primeira volta: pede a ferramenta. Segunda volta: o roteiro ja esgotou e o dublE
      # trava — o `registrar_resultado` da primeira volta ja rodou (o laco so chama o
      # operario de novo DEPOIS de executar as ferramentas pedidas).
      assert_receive {:em_voo, _}, 2_000
      assert_receive {:em_voo, em_voo}, 2_000
      assert Enum.any?(em_voo, &(&1.tarefa_id == tarefa.id))

      assert :ok = SupervisorDeAgentes.encerrar(tarefa.id)

      assert_receive {:fabrica, [:fabrica, :despacho, :fim], _medidas, meta}, 2_000
      assert match?({:morto, _motivo}, meta.desfecho)
      assert :ok = Task.await(task)

      assert Repo.get!(Tarefa, tarefa.id).status == :em_execucao
      assert Repo.all(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id)) == []
      assert contar_consumos(tarefa.id) == 0
    end

    test "revisor reprova de verdade quando o agente declara nao-conformidade (T-075)",
         %{projeto: projeto} do
      # Antes da T-075, `julgar/3` chamava `Revisor.julgar(:conforme, ...)` com o primeiro
      # argumento FIXO — o papel revisor desta fabrica nunca reprovava por conformidade,
      # qualquer que fosse o relato do agente.
      {:ok, agulha} =
        Falso.iniciar(
          roteiro: [
            Falso.resposta(
              blocos: [
                %{
                  tipo: :uso_de_ferramenta,
                  id: "1",
                  nome: "registrar_resultado",
                  argumentos: %{
                    "resumo" =>
                      "[conformidade] nao-conforme — implementou busca, e a tarefa pedia ordenacao"
                  }
                }
              ],
              motivo_parada: :uso_de_ferramenta
            ),
            Falso.resposta()
          ]
        )

      Application.put_env(:fabrica, :agulha_do_teste, agulha)
      tarefa = tarefa!(projeto, %{status: :em_revisao})

      assert :ok = Trabalho.executar(tarefa.id, :revisor)

      # Reprovado por conformidade: volta a em_execucao, e nao a concluida.
      assert Repo.get!(Tarefa, tarefa.id).status == :em_execucao
    end

    test "revisor aprova quando o agente declara conforme e nao ha achado (T-075)",
         %{projeto: projeto} do
      {:ok, agulha} =
        Falso.iniciar(
          roteiro: [
            Falso.resposta(
              blocos: [
                %{
                  tipo: :uso_de_ferramenta,
                  id: "1",
                  nome: "registrar_resultado",
                  argumentos: %{"resumo" => "[conformidade] conforme"}
                }
              ],
              motivo_parada: :uso_de_ferramenta
            ),
            Falso.resposta()
          ]
        )

      Application.put_env(:fabrica, :agulha_do_teste, agulha)
      tarefa = tarefa!(projeto, %{status: :em_revisao})

      assert :ok = Trabalho.executar(tarefa.id, :revisor)

      assert Repo.get!(Tarefa, tarefa.id).status == :concluida
    end

    # T-078: a doutrina (`priv/doutrina/revisor.md`) manda o revisor listar os achados em
    # `resumo` do `registrar_resultado`. Ate a T-078 o portao lia achados so do TEXTO das
    # mensagens: achado escrito so no `resumo` virava zero achados e aprovacao silenciosa.
    @achado "[critico] lib/fabrica/conta.ex:42 — divisao sem guarda de zero"

    test "revisor reprova por achado escrito SO no resumo do registrar_resultado (T-078)",
         %{projeto: projeto} do
      so_no_resumo = revisar!(projeto, [registrar("[conformidade] conforme\n" <> @achado)])

      assert so_no_resumo == {:em_execucao, "defeitos"}

      # Classificado como o MESMO achado escrito no texto seria: mesmo destino e mesmo motivo
      # gravado no ciclo...
      assert so_no_resumo ==
               revisar!(projeto, [texto(@achado), registrar("[conformidade] conforme")])

      # ...e a mesma leitura campo a campo (gravidade inclusive) pelo caminho dos relatos.
      assert [%{gravidade: :critico, arquivo: "lib/fabrica/conta.ex", linha: 42}] =
               Revisor.ler_achados(RegistrarResultado.formatar_relatos([%{resumo: @achado}]))

      assert Revisor.ler_achados(RegistrarResultado.formatar_relatos([%{resumo: @achado}])) ==
               Revisor.ler_achados(@achado)
    end

    test "achado escrito so no TEXTO das mensagens continua reprovando (T-078)",
         %{projeto: projeto} do
      assert revisar!(projeto, [texto(@achado), registrar("[conformidade] conforme")]) ==
               {:em_execucao, "defeitos"}

      # Contraprova: sem achado em fonte nenhuma, o mesmo roteiro aprova — a reprovacao acima
      # e do achado, e nao de outra coisa do caminho.
      assert revisar!(projeto, [
               texto("revisei o diff, nada a apontar"),
               registrar("[conformidade] conforme")
             ]) == {:concluida, "aprovado"}
    end

    test "achado repetido no texto E no resumo nao muda o veredito (T-078)",
         %{projeto: projeto} do
      nas_duas =
        revisar!(projeto, [texto(@achado), registrar("[conformidade] conforme\n" <> @achado)])

      assert nas_duas == {:em_execucao, "defeitos"}

      assert nas_duas ==
               revisar!(projeto, [texto(@achado), registrar("[conformidade] conforme")])

      assert nas_duas == revisar!(projeto, [registrar("[conformidade] conforme\n" <> @achado)])
    end

    @tag :capture_log
    test "se a transicao ficou ilegal em voo, ainda emite o fim com o gasto — sem perder a contabilidade",
         %{projeto: projeto} do
      # Cenario do revisor (Ciclo 7): um planejador bloqueou a tarefa ENQUANTO o agente
      # construtor estava em voo. Ao concluir, `finalizar/3` tenta `despachar(_, :em_teste)`, mas
      # `bloqueada -> em_teste` e ilegal (Fabrica.Tarefas.Maquina) e a transacao inteira reverte.
      # O fim tem de ser emitido assim mesmo, senao o gasto ja medido some da telemetria — o
      # defeito que o `MatchError` do `{:ok, _} = despachar(...)` antigo causaria.
      Application.put_env(:fabrica, :modo_do_teste, :responder)
      :ok = Eventos.assinar()
      tarefa = tarefa!(projeto, %{status: :bloqueada})

      assert :ok = Trabalho.executar(tarefa.id, :construtor)

      # O fim foi emitido apesar de a transicao ter falhado: gasto preservado, desfecho :erro.
      assert_receive {:fabrica, [:fabrica, :despacho, :fim], _medidas, meta}, 2_000
      assert meta.tarefa_id == tarefa.id
      assert meta.desfecho == :erro
      assert is_float(meta.gasto_usd)

      # A transacao reverteu por inteiro: a tarefa nao mudou de estado e nada foi gravado pela
      # metade na contabilidade.
      assert Repo.get!(Tarefa, tarefa.id).status == :bloqueada
      assert contar_consumos(tarefa.id) == 0
    end

    test "CONSTRUTOR cujo operario bate parede de cota: nao vai a em_teste, tentativas nao sobe de novo, e e redespachavel (T-095)",
         %{projeto: projeto} do
      reabre_em = DateTime.add(DateTime.utc_now(), 120, :second)
      Application.put_env(:fabrica, :modo_do_teste, :parede_cota)
      Application.put_env(:fabrica, :reabre_em_do_teste, reabre_em)
      :ok = Eventos.assinar()
      tarefa = tarefa!(projeto, %{status: :pronta})

      assert {:parede, segundos} = Trabalho.executar(tarefa.id, :construtor)
      assert is_integer(segundos) and segundos > 0

      # `garantir_em_execucao/2` ja tinha marcado pronta -> em_execucao (e gasto a tentativa)
      # ANTES de subir o agente — isso e do despacho, nao do julgamento. O que a parede
      # IMPEDE e a tentativa SEGUINTE: nenhuma transicao nova, nenhum incremento novo.
      tarefa_depois = Repo.get!(Tarefa, tarefa.id)
      assert tarefa_depois.status == :em_execucao
      assert tarefa_depois.tentativas == 1
      assert Fila.papel_por_status()[tarefa_depois.status] == :construtor

      # O fim foi emitido com o gasto (zero, aqui: a parede bateu na primeira chamada, antes
      # de qualquer consumo) — nao pode sumir da telemetria.
      assert_receive {:fabrica, [:fabrica, :despacho, :fim], _medidas, meta}, 2_000
      assert meta.tarefa_id == tarefa.id
      assert match?({:parede, {:cota, _}}, meta.desfecho)
      assert meta.gasto_usd == 0.0

      # Nao julgou: nenhum ciclo gravado, nenhum consumo.
      assert Repo.all(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id)) == []
      assert contar_consumos(tarefa.id) == 0
    end

    test "VERIFICADOR cujo despacho bate parede de cota: nao vai a em_revisao nem volta reprovado (T-095)",
         %{projeto: projeto} do
      Application.put_env(:fabrica, :modo_do_teste, :parede_cota)
      Application.put_env(:fabrica, :reabre_em_do_teste, nil)
      tarefa = tarefa!(projeto, %{status: :em_teste, tentativas: 1})

      assert {:parede, segundos} = Trabalho.executar(tarefa.id, :verificador)
      assert is_integer(segundos) and segundos > 0

      tarefa_depois = Repo.get!(Tarefa, tarefa.id)
      assert tarefa_depois.status == :em_teste
      assert tarefa_depois.tentativas == 1
      assert Repo.all(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id)) == []
    end

    test "REVISOR cujo despacho bate parede de cota: nao vai a concluida nem volta a em_execucao (T-095)",
         %{projeto: projeto} do
      Application.put_env(:fabrica, :modo_do_teste, :parede_cota)
      Application.put_env(:fabrica, :reabre_em_do_teste, nil)
      tarefa = tarefa!(projeto, %{status: :em_revisao, tentativas: 1})

      assert {:parede, segundos} = Trabalho.executar(tarefa.id, :revisor)
      assert is_integer(segundos) and segundos > 0

      tarefa_depois = Repo.get!(Tarefa, tarefa.id)
      assert tarefa_depois.status == :em_revisao
      assert tarefa_depois.tentativas == 1
      assert Repo.all(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id)) == []
    end

    for {papel, status_antes, status_esperado_depois} <- [
          {:construtor, :pronta, :em_execucao},
          {:verificador, :em_teste, :em_teste},
          {:revisor, :em_revisao, :em_revisao}
        ] do
      @papel papel
      @status_antes status_antes
      @status_esperado_depois status_esperado_depois

      test "#{papel}: sandbox indisponivel se comporta como parede, sem julgar (T-095)",
           %{projeto: projeto} do
        Application.put_env(:fabrica, :modo_do_teste, :sandbox_indisponivel)
        tarefa = tarefa!(projeto, %{status: @status_antes})

        assert {:parede, segundos} = Trabalho.executar(tarefa.id, @papel)
        assert is_integer(segundos) and segundos > 0

        tarefa_depois = Repo.get!(Tarefa, tarefa.id)
        assert tarefa_depois.status == @status_esperado_depois
        assert Repo.all(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id)) == []
      end
    end

    test "erro que E do trabalho (:prazo) NAO vira parede: segue julgado como hoje (T-095)",
         %{projeto: projeto} do
      Application.put_env(:fabrica, :modo_do_teste, :prazo)
      tarefa = tarefa!(projeto, %{status: :em_revisao, tentativas: 1})

      assert :ok = Trabalho.executar(tarefa.id, :revisor)

      # Diferente da parede: o portao julgou de verdade e gravou um ciclo.
      assert [_ciclo] = Repo.all(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id))
    end
  end

  describe "despachar/3 — enfileirar e transicionar na mesma transacao" do
    test "transicao para um estado com papel grava a tarefa E o trabalho, juntos", %{
      projeto: projeto
    } do
      tarefa = tarefa!(projeto, %{status: :backlog})

      assert {:ok, movida} = Trabalho.despachar(tarefa.id, :pronta)
      assert movida.status == :pronta
      assert Repo.get!(Tarefa, tarefa.id).status == :pronta

      assert_enqueued(worker: Trabalho, args: %{tarefa_id: tarefa.id, papel: "construtor"})
    end

    test "transicao para um estado sem papel (bloqueada) so grava a tarefa", %{
      projeto: projeto
    } do
      tarefa = tarefa!(projeto, %{status: :em_execucao})

      assert {:ok, movida} = Trabalho.despachar(tarefa.id, :bloqueada)
      assert movida.status == :bloqueada

      refute_enqueued(worker: Trabalho, args: %{tarefa_id: tarefa.id})
    end

    test "transicao ilegal nao grava a tarefa nem enfileira nada", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})

      assert {:erro, {:transicao_invalida, :backlog, :em_teste}} =
               Trabalho.despachar(tarefa.id, :em_teste)

      assert Repo.get!(Tarefa, tarefa.id).status == :backlog
      refute_enqueued(worker: Trabalho, args: %{tarefa_id: tarefa.id})
    end

    test "erro DEPOIS dos dois passos desfaz os dois — nao so o resultado, o Multi provou que ambos chegaram a acontecer",
         %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})

      resultado =
        tarefa.id
        |> Trabalho.montar(:pronta)
        |> Ecto.Multi.run(:explode, fn _repo, _feito -> {:error, :boom} end)
        |> Repo.transaction()

      assert {:error, :explode, :boom, feitas} = resultado
      # As chaves provam que a tarefa E o trabalho JA tinham sido aplicados no Multi antes
      # do :explode falhar — a prova de que o rollback desfez algo que existia, e nao so
      # "nunca aconteceu".
      assert %{tarefa: %Tarefa{status: :pronta}, trabalho: %Oban.Job{}} = feitas

      assert Repo.get!(Tarefa, tarefa.id).status == :backlog
      refute_enqueued(worker: Trabalho, args: %{tarefa_id: tarefa.id})
    end
  end

  describe "unique por {tarefa_id, papel}" do
    test "duas tentativas de enfileirar a mesma etapa da mesma tarefa nao duplicam", %{
      projeto: projeto
    } do
      tarefa = tarefa!(projeto, %{status: :backlog})

      {:ok, _} = Trabalho.despachar(tarefa.id, :pronta)

      # A segunda tentativa de enfileirar CONSTRUTOR para a mesma tarefa, com a primeira
      # ainda incompleta (available), nao pode criar um segundo job.
      assert {:ok, job} =
               Oban.insert(Trabalho.novo(tarefa.id, :construtor))

      assert [encontrado] = all_enqueued(worker: Trabalho, args: %{tarefa_id: tarefa.id})
      assert encontrado.id == job.id
    end

    test "papeis diferentes da mesma tarefa NAO colidem", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})

      assert {:ok, _} = Oban.insert(Trabalho.novo(tarefa.id, :construtor))
      assert {:ok, _} = Oban.insert(Trabalho.novo(tarefa.id, :verificador))

      assert length(all_enqueued(worker: Trabalho, args: %{tarefa_id: tarefa.id})) == 2
    end

    test "a mesma etapa pode ser enfileirada de novo depois que a anterior terminou (retrabalho)",
         %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})

      assert {:ok, primeiro} = Oban.insert(Trabalho.novo(tarefa.id, :construtor))
      Ecto.Changeset.change(primeiro, state: "completed") |> Repo.update!()

      assert {:ok, segundo} = Oban.insert(Trabalho.novo(tarefa.id, :construtor))
      assert segundo.id != primeiro.id
    end
  end

  describe "max_attempts: 1 — sem retentativa automatica generica" do
    test "o trabalho nao tem espaco para o Oban tentar de novo sozinho", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})

      changeset = Trabalho.novo(tarefa.id, :construtor)
      assert Ecto.Changeset.get_field(changeset, :max_attempts) == 1
    end
  end

  describe "config das filas (T-037: verificador 1-wide; T-038a/D-003: construtor 2 por padrao)" do
    test "sem configuracao, a fila sobe com construtor: 2, verificador: 1, revisor: 1" do
      queues = Application.fetch_env!(:fabrica, Oban)[:queues]

      assert queues[:verificador] == 1
      assert queues[:construtor] == 2
      assert queues[:revisor] == 1
    end
  end

  describe "recuperacao apos queda — sem intervencao" do
    test "trabalho preso em executing por o no ter caido volta a ser despachavel na subida",
         %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})

      nome = :"oban_teste_#{System.unique_integer([:positive])}"

      {:ok, _} =
        Transicao.aplicar(tarefa, :pronta)

      job_pendente = Trabalho.novo(tarefa.id, :construtor)

      # Sobe a fila DE VERDADE, com a mesma configuracao de producao (menos o nome e o
      # rescate quase imediato, para o teste nao esperar os 30 minutos do default).
      {:ok, _oban1} =
        start_supervised(
          {Oban,
           name: nome,
           repo: Repo,
           testing: :disabled,
           notifier: Oban.Notifiers.PG,
           peer: Oban.Peers.Global,
           plugins: [],
           queues: [construtor: 1]},
          restart: :temporary
        )

      # `perform/1` so loga e devolve `:ok` — rapido demais para o polling por estado
      # pegar a janela em "executing" (o job vira "completed" entre uma sondagem e a
      # outra). Em vez de sondar, trava o processo que executa o job exatamente no
      # instante em que o Oban marca "executing" e dispara `[:oban, :job, :start]` — ANTES
      # de `perform/1` ser chamado — e nunca libera: o teste mata a arvore em seguida, o
      # cenario que o `Fabrica.Fila.Resgate` foi feito para resgatar (execucao que comecou
      # e nunca terminou).
      teste = self()
      handler_id = {:trabalho_teste_congelar, make_ref()}

      :telemetry.attach(
        handler_id,
        [:oban, :job, :start],
        fn _evento, _medidas, %{id: id}, _config ->
          send(teste, {:job_comecou, id})
          Process.sleep(:infinity)
        end,
        nil
      )

      {:ok, job} = Oban.insert(nome, job_pendente)
      job_id = job.id

      assert_receive {:job_comecou, ^job_id}, 2_000
      :telemetry.detach(handler_id)

      # Derruba o Oban sem gracas — e o equivalente a o processo cair, nao a um
      # desligamento educado que espera o trabalho terminar. `stop_supervised/1` quer o ID
      # do child_spec, que o `Oban.child_spec/1` deriva do `:name` — nao o pid devolvido
      # por `start_supervised/2`.
      :ok = stop_supervised(nome)

      assert Repo.get!(Oban.Job, job_id).state == "executing"

      # Sobe de novo — outro nome, porque `stop_supervised/1` ja liberou o anterior — desta
      # vez com o Resgate configurado para resgatar quase na hora.
      {:ok, _oban2} =
        start_supervised(
          {Oban,
           name: :"#{nome}_novo",
           repo: Repo,
           testing: :disabled,
           notifier: Oban.Notifiers.PG,
           peer: Oban.Peers.Global,
           plugins: [{Fabrica.Fila.Resgate, interval: 50, rescue_after: 50}],
           queues: false},
          restart: :temporary
        )

      esperar_estado(job_id, "available")
    end
  end

  # Conta as linhas de `consumos` de uma tarefa, subindo por despacho -> ciclo. Mesma junção de
  # `marco_v04_test.exs`: prova que nada foi gravado pela metade quando o agente morre em voo.
  # T-078: roda o revisor de verdade (`Trabalho.executar/2`) e devolve o que o portao decidiu e
  # gravou: `{status de destino, desfecho do ciclo}` — o desfecho e o motivo do veredito
  # (`"defeitos"`, `"nao_conforme"`, `"aprovado"`). Os blocos vao na volta que PEDE ferramenta,
  # e nao na resposta final, para o texto entrar em `resumo.mensagens` independente da
  # limitacao de "turno unico" do laco (ver @moduledoc de `Fabrica.Fila.Trabalho`).
  defp revisar!(projeto, blocos) do
    {:ok, agulha} =
      Falso.iniciar(
        roteiro: [
          Falso.resposta(blocos: blocos, motivo_parada: :uso_de_ferramenta),
          Falso.resposta()
        ]
      )

    Application.put_env(:fabrica, :agulha_do_teste, agulha)
    tarefa = tarefa!(projeto, %{status: :em_revisao})

    assert :ok = Trabalho.executar(tarefa.id, :revisor)

    [ciclo] = Repo.all(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id))
    {Repo.get!(Tarefa, tarefa.id).status, ciclo.desfecho}
  end

  defp registrar(resumo) do
    %{
      tipo: :uso_de_ferramenta,
      id: "1",
      nome: "registrar_resultado",
      argumentos: %{"resumo" => resumo}
    }
  end

  defp texto(conteudo), do: %{tipo: :texto, texto: conteudo}

  defp contar_consumos(tarefa_id) do
    Consumo
    |> join(:inner, [co], d in Despacho, on: d.id == co.despacho_id)
    |> join(:inner, [co, d], c in Ciclo, on: c.id == d.ciclo_id)
    |> where([co, d, c], c.tarefa_id == ^tarefa_id)
    |> Repo.aggregate(:count)
  end

  defp esperar_estado(job_id, estado, tentativas \\ 100)

  defp esperar_estado(_job_id, estado, 0) do
    flunk("job nao chegou ao estado #{inspect(estado)} a tempo")
  end

  defp esperar_estado(job_id, estado, tentativas) do
    case Repo.get!(Oban.Job, job_id).state do
      ^estado ->
        :ok

      _outro ->
        Process.sleep(50)
        esperar_estado(job_id, estado, tentativas - 1)
    end
  end
end
