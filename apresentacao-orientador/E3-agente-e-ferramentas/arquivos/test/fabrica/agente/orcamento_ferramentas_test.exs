defmodule Fabrica.Agente.OrcamentoFerramentasTest do
  @moduledoc """
  Os dois numeros, e a invariante que os mantem coerentes.

  O teste que mais protege esta tarefa e o da INVARIANTE: limiar sempre maior que o maior
  alvo do papel. Um alarme abaixo do proprio alvo acusaria de debate um agente que respeitou
  exatamente o que o prompt pediu — e foi a confusao entre os dois numeros que a v1 teve de
  consertar em 16/08.
  """

  use Fabrica.DataCase, async: true

  alias Fabrica.Agente.OrcamentoFerramentas, as: Orcamento
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Despacho
  alias Fabrica.Tarefas.Tarefa

  describe "os numeros portados da v1" do
    test "o alvo do construtor escala com areas: 30 / 45 / 60" do
      assert Orcamento.alvo("construtor", 1) == 30
      assert Orcamento.alvo("construtor", 2) == 30
      assert Orcamento.alvo("construtor", 3) == 45
      assert Orcamento.alvo("construtor", 4) == 60
      assert Orcamento.alvo("construtor", 9) == 60
    end

    test "o alvo do verificador e 25 e o do revisor 20, planos" do
      assert Orcamento.alvo("verificador", 1) == 25
      assert Orcamento.alvo("verificador", 7) == 25
      assert Orcamento.alvo("revisor", 1) == 20
      assert Orcamento.alvo("revisor", 7) == 20
    end

    test "o limiar de debate e o p90 medido, e e PLANO para o construtor" do
      # `areas` nao prediz chamadas — mediana de 21 com ate 2 areas contra 12 com 3. A escada
      # do alvo escala numa variavel que nao correlaciona, entao o SENSOR nao pode escalar.
      assert Orcamento.limiar("construtor") == 65
      assert Orcamento.limiar("verificador") == 37
      assert Orcamento.limiar("revisor") == 28
    end

    test "papel desconhecido cai num padrao, e nao em zero" do
      # Zero faria todo despacho de um papel novo parecer debate.
      assert Orcamento.alvo("planejador", 1) == 60
      assert Orcamento.limiar("planejador") == 65
    end

    test "o padrao DIVERGE da v1 de proposito, e a invariante e o motivo" do
      # Na v1 os dois padroes sao 60, entao para papel nao listado o alarme fica calibrado
      # exatamente no proprio alvo — o defeito que ela consertou nos papeis listados e nao
      # propagou para o padrao. Foi a invariante deste arquivo que o pegou.
      assert Orcamento.limiar("papel-que-ninguem-mediu") >
               Orcamento.alvo("papel-que-ninguem-mediu", 1)
    end
  end

  describe "A INVARIANTE: o limiar e sempre maior que o maior alvo do papel" do
    test "vale para todos os papeis" do
      # Alarme abaixo do proprio alvo acusaria de debate quem respeitou o prompt. E por isso
      # que o construtor fica em 65 e nao no p90 puro (57): o alvo da faixa de 4 areas e 60.
      for papel <- ~w[construtor verificador revisor planejador] do
        assert Orcamento.coerente?(papel), "o limiar de #{papel} nao pode ficar abaixo do alvo"
      end
    end

    test "o construtor em 65 fica acima do alvo maximo de 60" do
      assert Orcamento.limiar("construtor") > Orcamento.alvo("construtor", 8)
    end

    test "alvo e limiar sao numeros DIFERENTES, e nao sinonimos" do
      # Confundi-los foi o defeito: o alvo do verificador estourava em 52% dos despachos, e
      # um alarme que toca em metade das rodadas e ruido.
      for papel <- ~w[construtor verificador revisor] do
        refute Orcamento.limiar(papel) == Orcamento.alvo(papel, 1)
      end
    end
  end

  describe "estourar o teto REGISTRA e NAO interrompe" do
    test "passar do alvo e marcado, e o balanco volta normalmente" do
      balanco = Orcamento.fechar("verificador", 32, areas: 2)

      assert balanco.passou_do_alvo
      assert balanco.chamadas == 32
      assert balanco.alvo == 25
    end

    test "passar do alvo SEM passar do limiar nao e debate" do
      # 32 contra alvo 25 e limiar 37: o agente passou do conselho e continua trabalhando.
      # Foi exatamente esse caso que a v1 acusava como anomalia, em 52% dos despachos.
      balanco = Orcamento.fechar("verificador", 32)

      assert balanco.passou_do_alvo
      refute balanco.debate
    end

    test "passar do LIMIAR e debate" do
      balanco = Orcamento.fechar("verificador", 40)

      assert balanco.debate
      assert balanco.limiar == 37
    end

    test "ficar dentro do alvo nao marca nada" do
      balanco = Orcamento.fechar("revisor", 10)

      refute balanco.passou_do_alvo
      refute balanco.debate
    end

    test "o aviso so existe quando ha debate" do
      # Mensagem em toda rodada seria ruido, e ruido e o que impede o sinal de virar atuador.
      refute Orcamento.aviso(Orcamento.fechar("revisor", 10))
      refute Orcamento.aviso(Orcamento.fechar("verificador", 32))

      aviso = Orcamento.aviso(Orcamento.fechar("verificador", 40))
      assert aviso =~ "40 chamadas"
      assert aviso =~ "37"
    end

    test "o aviso aponta para o DIMENSIONAMENTO, e nao para o agente" do
      aviso = Orcamento.aviso(Orcamento.fechar("construtor", 80))

      assert aviso =~ "tarefa mal dimensionada"
      assert aviso =~ "nao agente ineficiente"
    end

    test "o balanco nunca devolve instrucao de parar" do
      # MEDE E NAO CORTA: cortar exigiria converter chamadas em voltas, e despacho
      # interrompido no meio custa igual sem entregar nada (US$ 4,11 medidos na v1).
      balanco = Orcamento.fechar("construtor", 500)

      assert Map.keys(balanco) |> Enum.sort() ==
               ~w[alvo chamadas debate limiar papel passou_do_alvo]a

      refute Map.has_key?(balanco, :parar)
      refute Map.has_key?(balanco, :cortar)
    end
  end

  describe "o estouro fica legivel em `despachos`" do
    setup do
      projeto =
        Repo.insert!(
          Projeto.changeset(%Projeto{}, %{
            nome: "p-#{System.unique_integer([:positive])}",
            caminho: "C:/tmp/p"
          })
        )

      tarefa =
        Repo.insert!(
          Tarefa.changeset(%Tarefa{}, %{
            projeto_id: projeto.id,
            codigo: "T-#{100 + System.unique_integer([:positive])}",
            titulo: "orcar"
          })
        )

      ciclo =
        Repo.insert!(
          Ciclo.changeset(%Ciclo{}, %{tarefa_id: tarefa.id, numero: 1, papel: "verificador"})
        )

      {:ok, ciclo: ciclo}
    end

    test "o despacho grava o desfecho do orcamento", %{ciclo: ciclo} do
      balanco = Orcamento.fechar("verificador", 40)

      despacho =
        Repo.insert!(
          Despacho.changeset(
            %Despacho{},
            Map.merge(
              %{ciclo_id: ciclo.id, operario: "Operario.Falso", modelo: "haiku-4.5", voltas: 12},
              Orcamento.para_despacho(balanco)
            )
          )
        )

      assert Repo.get!(Despacho, despacho.id).desfecho == "debate"
    end

    test "os tres desfechos possiveis sao distinguiveis" do
      assert Orcamento.para_despacho(Orcamento.fechar("revisor", 5)).desfecho == "dentro_do_alvo"
      assert Orcamento.para_despacho(Orcamento.fechar("revisor", 24)).desfecho == "acima_do_alvo"
      assert Orcamento.para_despacho(Orcamento.fechar("revisor", 40)).desfecho == "debate"
    end

    test "o balanco carrega teto E realizado, que e o que o diagnostico da v0.3 precisa" do
      # A lacuna da v1 era esta: la a medicao nao alimentava decisao nenhuma. Sem os dois
      # numeros lado a lado, "estourou" nao diz por quanto.
      balanco = Orcamento.fechar("construtor", 80, areas: 5)

      assert balanco.alvo == 60
      assert balanco.limiar == 65
      assert balanco.chamadas == 80
    end
  end

  describe "a fonte dos numeros esta citada" do
    test "o cabecalho do arquivo cita o arquivo da v1 e a amostra" do
      fonte = File.read!("lib/fabrica/agente/orcamento_ferramentas.ex")

      assert fonte =~ "despachante.ts"
      assert fonte =~ "135 etapas"
      assert fonte =~ "p90"
    end

    test "o cabecalho registra que MEDE e nao corta, com o motivo" do
      fonte = File.read!("lib/fabrica/agente/orcamento_ferramentas.ex")

      assert fonte =~ "MEDE E NAO CORTA"
      assert fonte =~ "4,11"
    end
  end
end
