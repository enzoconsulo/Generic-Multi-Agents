defmodule Fabrica.Tarefas.TransicaoTest do
  @moduledoc """
  Trava a promessa da T-022: **estado, relatorio e custo entram juntos ou nao entram.**

  O teste que carrega o arquivo e `erro no meio da transacao nao grava NADA`. Ele nao
  confere so o resultado: confere o `changes_so_far` do `Ecto.Multi` para mostrar que a
  tarefa e o ciclo CHEGARAM a ser aplicados dentro da transacao, e depois confere o banco
  para mostrar que nada disso sobreviveu. E a diferenca entre "deu erro" e "desfez" — e e
  a unica forma de este teste reprovar se alguem trocar o Multi por chamadas em sequencia.
  """

  use Fabrica.DataCase, async: true

  alias Fabrica.Projetos.Projeto
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Consumo
  alias Fabrica.Tarefas.Despacho
  alias Fabrica.Tarefas.Tarefa
  alias Fabrica.Tarefas.Transicao

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

  defp contar(esquema, tarefa_id) do
    Repo.aggregate(from(c in esquema, where: c.tarefa_id == ^tarefa_id), :count)
  end

  describe "a transicao legal" do
    test "muda o status e devolve a tarefa ja no estado novo", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})

      assert {:ok, movida} = Transicao.aplicar(tarefa, :pronta)
      assert movida.status == :pronta
      assert Repo.get!(Tarefa, tarefa.id).status == :pronta
    end

    test "aceita o id no lugar da struct", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})

      assert {:ok, %Tarefa{status: :pronta}} = Transicao.aplicar(tarefa.id, :pronta)
    end

    test "le o STATUS do banco, e nao o da struct em maos", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})
      {:ok, _} = Transicao.aplicar(tarefa, :cancelada)

      # A struct em maos ainda diz `backlog`, de onde `pronta` seria legal. O banco diz
      # `cancelada`, de onde nao sai nada. Struct velha nao vira licenca.
      assert {:erro, {:transicao_invalida, :cancelada, :pronta}} =
               Transicao.aplicar(tarefa, :pronta)
    end

    test "le TENTATIVAS do banco, e nao da struct em maos", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :pronta, tentativas: 0})

      {:ok, _} = Transicao.aplicar(tarefa, :em_execucao)
      {:ok, _} = Transicao.aplicar(tarefa.id, :em_teste, papel: "construtor")

      # `tarefa` congelou em `tentativas: 0`. Se o incremento partisse dela, a segunda
      # entrega devolveria 1 de novo — e a tarefa giraria para sempre sem esgotar ciclo,
      # que e exatamente a falha de US$ 22,55 medida na v1.
      assert {:ok, movida} = Transicao.aplicar(tarefa, :em_execucao, papel: "verificador")
      assert movida.tentativas == 2
    end
  end

  describe "a transicao ilegal" do
    test "devolve o erro nomeado", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})

      assert {:erro, {:transicao_invalida, :backlog, :concluida}} =
               Transicao.aplicar(tarefa, :concluida)
    end

    test "nao grava nada — nem o ciclo que veio junto", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})

      assert {:erro, {:transicao_invalida, _, _}} =
               Transicao.aplicar(tarefa, :concluida, papel: "revisor", relatorio: "aprovado")

      assert Repo.get!(Tarefa, tarefa.id).status == :backlog
      assert contar(Ciclo, tarefa.id) == 0
    end

    test "tarefa que nao existe devolve erro nomeado, e nao estoura" do
      assert {:erro, {:tarefa_inexistente, -1}} = Transicao.aplicar(-1, :pronta)
    end
  end

  describe "tentativas — quem incrementa e o sistema" do
    test "entrar em em_execucao gasta uma tentativa", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :pronta, tentativas: 0})

      assert {:ok, movida} = Transicao.aplicar(tarefa, :em_execucao)
      assert movida.tentativas == 1
      assert Repo.get!(Tarefa, tarefa.id).tentativas == 1
    end

    test "os tres caminhos ate em_execucao gastam tentativa igual", %{projeto: projeto} do
      for {de, tentativas} <- [{:pronta, 0}, {:em_teste, 1}, {:em_revisao, 1}] do
        tarefa = tarefa!(projeto, %{status: de, tentativas: tentativas})

        assert {:ok, movida} = Transicao.aplicar(tarefa, :em_execucao)
        assert movida.tentativas == tentativas + 1, "vindo de #{de}"
      end
    end

    test "nenhuma outra transicao mexe em tentativas", %{projeto: projeto} do
      for {de, para} <- [
            {:backlog, :pronta},
            {:em_execucao, :em_teste},
            {:em_teste, :em_revisao},
            {:em_revisao, :concluida},
            {:em_teste, :bloqueada},
            {:em_revisao, :cancelada}
          ] do
        tarefa = tarefa!(projeto, %{status: de, tentativas: 2})

        assert {:ok, movida} = Transicao.aplicar(tarefa, para)
        assert movida.tentativas == 2, "#{de} -> #{para} nao deveria gastar tentativa"
      end
    end

    test "o incremento e transacional: falhou o resto, nao gastou tentativa", %{
      projeto: projeto
    } do
      tarefa = tarefa!(projeto, %{status: :pronta, tentativas: 0})

      assert {:erro, {:invalido, :consumo_1, _}} =
               Transicao.aplicar(tarefa, :em_execucao,
                 papel: "verificador",
                 despacho: %{operario: "Falso", modelo: "haiku-4.5"},
                 consumos: [%{volta: 0}]
               )

      assert Repo.get!(Tarefa, tarefa.id).tentativas == 0
    end

    # A ATRIBUICAO de `tentativas`, e nada mais.
    #
    # O detector foi refinado TRES vezes, sempre pela mesma razao de fundo: a afirmacao e
    # sobre ESCRITA, e o padrao so enxerga sintaxe.
    #
    #   1a (T-022): procurava a palavra solta, e acusou quatro modulos que citam `tentativas`
    #       em prosa justamente para dizer que NAO a escrevem.
    #   2a (T-030): procurava `tentativas:` como chave de mapa, e acusou o `@type situacao`
    #       da `Retrabalho.Escada` — que LE o contador e nunca o escreve.
    #   3a (T-030): sobrou um doctest, `%{tentativas: 1}`, no `@doc` da mesma Escada. Dai a
    #       varredura passar por `Fabrica.Fonte`, que remove docstring e comentario — o mesmo
    #       helper que o marco da v0.1 usa.
    #   4a (T-040): o `cartao/2` de `quadro_live.ex` (T-051) monta o mapa de EXIBICAO com
    #       `tentativas: tarefa.tentativas` — um REPASSE de leitura, sem operacao, para pintar
    #       o contador no quadro. O padrao anterior o lia como escrita porque `tarefa.tentativas`
    #       nao tem cara de tipo. A escrita de verdade INCREMENTA (`tarefa.tentativas + 1`); o
    #       repasse nao. Entao passamos a excluir `<ident>.tentativas` que NAO seja seguido de
    #       operador aritmetico — o repasse cai fora, o incremento continua dentro.
    #
    # A regra atual: e escrita quando o valor NAO tem cara de tipo E nao e mero repasse do
    # proprio campo. `non_neg_integer()` e `Tarefa.t()` sao declaracoes; `tarefa.tentativas`
    # (sem operador) e leitura para exibir; `tarefa.tentativas + 1` e a unica escrita.
    # O espaco vai DENTRO do lookahead de proposito. Com `tentativas:\s*(?!...)`, o `\s*`
    # casa zero caracteres por backtracking e o lookahead passa a olhar o espaco em vez do
    # valor — a negacao nunca dispara e o padrao volta a aceitar tipo. Custou uma rodada
    # vermelha aqui mesmo.
    @escrita_de_tentativas ~r/\btentativas:(?!\s*(?:[a-z_]+\(\)|[A-Z][\w.]*\.t\(\)|\{?[a-z_][\w]*\.tentativas\b(?!\s*[-+*])))/

    test "existe UM UNICO lugar na producao que escreve tentativas" do
      # A outra metade desta regra — o agente nao tem ferramenta de escrever estado — mora
      # no catalogo e ja e travada pela T-016. Aqui se trava a metade de ca: nao ha um
      # SEGUNDO lugar no codigo capaz de mexer no contador.
      escrevem = Fabrica.Fonte.producao_que_casa(@escrita_de_tentativas)

      assert escrevem == ["lib/fabrica/tarefas/transicao.ex"]
    end

    test "o detector de escrita funciona, e nao passa por vazio" do
      # Sensor que nunca dispara e indistinguivel de sensor quebrado — e este ja teve dois
      # falsos positivos, entao os dois estao aqui como caso negativo.
      assert "%{tentativas: 1}" =~ @escrita_de_tentativas
      assert "%{status: para, tentativas: tarefa.tentativas + 1}" =~ @escrita_de_tentativas

      refute "conta tentativas e o sistema" =~ @escrita_de_tentativas
      refute "validate_number(:tentativas, [])" =~ @escrita_de_tentativas
      refute "`tarefas.tentativas` nao existe no catalogo" =~ @escrita_de_tentativas
      refute "          tentativas: non_neg_integer()" =~ @escrita_de_tentativas
      refute "          tentativas: Tarefa.t()" =~ @escrita_de_tentativas

      # 4a refinacao (T-040): repasse de leitura para exibir, sem operacao, nao e escrita.
      refute "      tentativas: tarefa.tentativas," =~ @escrita_de_tentativas
      refute "tentativas: {tarefa.tentativas} ·" =~ @escrita_de_tentativas
    end
  end

  describe "as tres gravacoes, na mesma transacao" do
    test "status, ciclo, despacho e consumos entram juntos", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :em_execucao, tentativas: 1})

      assert {:ok, movida} =
               Transicao.aplicar(tarefa, :em_teste,
                 papel: "construtor",
                 desfecho: "entregue",
                 relatorio: "implementei X e rodei a suite",
                 despacho: %{operario: "ClaudeCLI", modelo: "sonnet-5", voltas: 4},
                 consumos: [
                   %{volta: 1, tokens_entrada: 100, tokens_cache_escrita: 9_000},
                   %{volta: 2, tokens_entrada: 40, tokens_cache_leitura: 9_000}
                 ]
               )

      assert movida.status == :em_teste

      ciclo = Repo.one!(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id))
      assert ciclo.papel == "construtor"
      assert ciclo.desfecho == "entregue"
      assert ciclo.relatorio =~ "implementei X"

      despacho = Repo.one!(from(d in Despacho, where: d.ciclo_id == ^ciclo.id))
      assert despacho.operario == "ClaudeCLI"
      assert despacho.voltas == 4

      consumos =
        Repo.all(from(c in Consumo, where: c.despacho_id == ^despacho.id, order_by: c.volta))

      assert [%{volta: 1, tokens_cache_escrita: 9_000}, %{volta: 2, tokens_cache_leitura: 9_000}] =
               consumos
    end

    test "sem :volta explicito, a posicao na lista vira o numero da volta", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :em_execucao, tentativas: 1})

      {:ok, _} =
        Transicao.aplicar(tarefa, :em_teste,
          papel: "construtor",
          despacho: %{operario: "Falso", modelo: "haiku-4.5"},
          consumos: [%{tokens_saida: 1}, %{tokens_saida: 2}, %{tokens_saida: 3}]
        )

      voltas = Repo.all(from(c in Consumo, select: c.volta, order_by: c.volta))
      assert voltas == [1, 2, 3]
    end

    test "a entrega ao construtor nao inventa relatorio", %{projeto: projeto} do
      # `pronta -> em_execucao` e um hand-off: ninguem terminou nada, entao nao ha o que
      # gravar em `ciclos`. Gravar um ciclo vazio aqui poluiria a contagem por ciclo.
      tarefa = tarefa!(projeto, %{status: :pronta})

      assert {:ok, _} = Transicao.aplicar(tarefa, :em_execucao)
      assert contar(Ciclo, tarefa.id) == 0
    end
  end

  describe "erro no meio da transacao nao grava NADA" do
    test "o Multi aplicou tarefa e ciclo, e o banco nao ficou com nenhum dos dois", %{
      projeto: projeto
    } do
      tarefa = tarefa!(projeto, %{status: :em_execucao, tentativas: 1})

      resultado =
        tarefa.id
        |> Transicao.montar(:em_teste,
          papel: "construtor",
          relatorio: "entreguei",
          despacho: %{operario: "ClaudeCLI", modelo: "sonnet-5"},
          consumos: [%{volta: 1, tokens_entrada: 10}, %{volta: 0}]
        )
        |> Repo.transaction()

      assert {:error, {:consumo, 2}, changeset, feitas} = resultado
      assert %{volta: [_ | _]} = errors_on(changeset)

      # A metade que prova que houve o que desfazer:
      assert %{status: :em_teste} = feitas.tarefa
      assert %{papel: "construtor"} = feitas.ciclo
      assert %{operario: "ClaudeCLI"} = feitas.despacho
      assert Map.has_key?(feitas, {:consumo, 1})

      # A metade que prova que foi desfeito:
      recarregada = Repo.get!(Tarefa, tarefa.id)
      assert recarregada.status == :em_execucao
      assert recarregada.tentativas == 1
      assert contar(Ciclo, tarefa.id) == 0
      assert Repo.aggregate(Despacho, :count) == 0
      assert Repo.aggregate(Consumo, :count) == 0
    end

    test "erro vindo do BANCO, e nao do changeset, desfaz igual", %{projeto: projeto} do
      # O indice unico `(tarefa, numero, papel)` so falha na ida ao banco. E o caminho que
      # o teste acima nao cobre: la o consumo invalido reprova antes de sair do Elixir.
      tarefa = tarefa!(projeto, %{status: :em_teste, tentativas: 1})

      Repo.insert!(
        Ciclo.changeset(%Ciclo{}, %{tarefa_id: tarefa.id, numero: 1, papel: "verificador"})
      )

      assert {:erro, {:invalido, :ciclo, changeset}} =
               Transicao.aplicar(tarefa, :em_revisao, papel: "verificador", desfecho: "aprovado")

      assert errors_on(changeset) != %{}
      assert Repo.get!(Tarefa, tarefa.id).status == :em_teste
      assert contar(Ciclo, tarefa.id) == 1
    end
  end

  describe "as dependencias entre opcoes sao conferidas antes de abrir transacao" do
    test "despacho sem papel devolve :despacho_sem_ciclo", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :pronta})

      assert {:erro, :despacho_sem_ciclo} =
               Transicao.aplicar(tarefa, :em_execucao,
                 despacho: %{operario: "Falso", modelo: "haiku-4.5"}
               )

      assert Repo.get!(Tarefa, tarefa.id).status == :pronta
    end

    test "papel: nil conta como AUSENCIA de ciclo, e nao como presenca", %{projeto: projeto} do
      # `Keyword.has_key?` diria "sim" aqui, a conferencia passaria, e o despacho estouraria
      # com MatchError dentro do Multi procurando um `:ciclo` que nunca foi criado. O que
      # decide precisa ser o valor.
      tarefa = tarefa!(projeto, %{status: :pronta})

      assert {:erro, :despacho_sem_ciclo} =
               Transicao.aplicar(tarefa, :em_execucao,
                 papel: nil,
                 despacho: %{operario: "Falso", modelo: "haiku-4.5"}
               )

      assert Repo.get!(Tarefa, tarefa.id).status == :pronta
    end

    test "consumo sem despacho devolve :consumo_sem_despacho", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :pronta})

      assert {:erro, :consumo_sem_despacho} =
               Transicao.aplicar(tarefa, :em_execucao,
                 papel: "construtor",
                 consumos: [%{volta: 1, tokens_entrada: 10}]
               )

      assert Repo.get!(Tarefa, tarefa.id).status == :pronta
    end
  end

  describe "acrescentar/4 — a montagem enxertada num Multi que ja existe" do
    test "o trabalho de fora e a transicao entram na mesma transacao", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})
      outra = tarefa!(projeto, %{status: :backlog})

      assert {:ok, feito} =
               Ecto.Multi.new()
               |> Ecto.Multi.update(:vizinha, Tarefa.changeset(outra, %{prioridade: :alta}))
               |> Transicao.acrescentar(tarefa.id, :pronta)
               |> Repo.transaction()

      assert feito.vizinha.prioridade == :alta
      assert feito.tarefa.status == :pronta
    end

    test "a transicao ilegal desfaz tambem o trabalho de fora", %{projeto: projeto} do
      # E o que torna a composicao util para a T-037: enfileirar e mudar estado precisam
      # cair juntos, e nao so acontecer perto um do outro.
      tarefa = tarefa!(projeto, %{status: :backlog})
      outra = tarefa!(projeto, %{status: :backlog})

      assert {:error, :conferida, {:transicao_invalida, :backlog, :concluida}, _} =
               Ecto.Multi.new()
               |> Ecto.Multi.update(:vizinha, Tarefa.changeset(outra, %{prioridade: :alta}))
               |> Transicao.acrescentar(tarefa.id, :concluida)
               |> Repo.transaction()

      assert Repo.get!(Tarefa, outra.id).prioridade == :media
    end

    test "montar/3 e o caso particular de Multi vazio", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})

      pelo_montar = Transicao.montar(tarefa.id, :pronta)
      pelo_acrescentar = Transicao.acrescentar(Ecto.Multi.new(), tarefa.id, :pronta)

      assert Ecto.Multi.to_list(pelo_montar) |> Keyword.keys() ==
               Ecto.Multi.to_list(pelo_acrescentar) |> Keyword.keys()
    end
  end

  describe "o numero do ciclo" do
    test "o laudo que reprova cai no ciclo que falhou, nao no que vai comecar", %{
      projeto: projeto
    } do
      tarefa = tarefa!(projeto, %{status: :em_teste, tentativas: 1})

      assert {:ok, movida} =
               Transicao.aplicar(tarefa, :em_execucao,
                 papel: "verificador",
                 desfecho: "reprovado",
                 relatorio: "o criterio 2 nao passa"
               )

      assert movida.tentativas == 2

      ciclo = Repo.one!(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id))
      assert ciclo.numero == 1
    end

    test "os tres papeis de uma passagem compartilham o numero", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :pronta})

      {:ok, tarefa} = Transicao.aplicar(tarefa, :em_execucao)
      {:ok, tarefa} = Transicao.aplicar(tarefa, :em_teste, papel: "construtor")
      {:ok, tarefa} = Transicao.aplicar(tarefa, :em_revisao, papel: "verificador")
      {:ok, tarefa} = Transicao.aplicar(tarefa, :concluida, papel: "revisor")

      numeros =
        Repo.all(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id, select: {c.papel, c.numero}))

      assert Enum.sort(numeros) == [{"construtor", 1}, {"revisor", 1}, {"verificador", 1}]
      assert tarefa.tentativas == 1
    end
  end

  describe "o caminho inteiro" do
    test "a tarefa percorre os seis estados, reprova, retrabalha e conclui", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :backlog})

      {:ok, tarefa} = Transicao.aplicar(tarefa, :pronta)
      {:ok, tarefa} = Transicao.aplicar(tarefa, :em_execucao)
      {:ok, tarefa} = Transicao.aplicar(tarefa, :em_teste, papel: "construtor")

      {:ok, tarefa} =
        Transicao.aplicar(tarefa, :em_execucao, papel: "verificador", desfecho: "reprovado")

      assert tarefa.tentativas == 2

      {:ok, tarefa} = Transicao.aplicar(tarefa, :em_teste, papel: "construtor")
      {:ok, tarefa} = Transicao.aplicar(tarefa, :em_revisao, papel: "verificador")
      {:ok, tarefa} = Transicao.aplicar(tarefa, :concluida, papel: "revisor")

      assert tarefa.status == :concluida
      assert tarefa.tentativas == 2

      # Quatro laudos, e o segundo ciclo separavel do primeiro — que e o que permite
      # perguntar depois quanto custou CADA passagem.
      por_ciclo =
        Repo.all(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id, select: {c.numero, c.papel}))

      assert Enum.sort(por_ciclo) == [
               {1, "construtor"},
               {1, "verificador"},
               {2, "construtor"},
               {2, "revisor"},
               {2, "verificador"}
             ]
    end

    test "esgotar ciclos bloqueia, e o replanejamento cancela a original", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :em_teste, tentativas: 3})

      {:ok, tarefa} =
        Transicao.aplicar(tarefa, :bloqueada,
          papel: "orquestrador",
          desfecho: "esgotou os ciclos"
        )

      assert tarefa.status == :bloqueada

      {:ok, tarefa} = Transicao.aplicar(tarefa, :cancelada)
      assert tarefa.status == :cancelada

      # E daqui nao sai mais nada.
      assert {:erro, {:transicao_invalida, :cancelada, :pronta}} =
               Transicao.aplicar(tarefa, :pronta)
    end
  end
end
