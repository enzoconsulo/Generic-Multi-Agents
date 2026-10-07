defmodule Fabrica.Ferramentas.RegistrarResultadoTest do
  @moduledoc """
  A unica forma de o agente reportar, e a IMPOSSIBILIDADE de ele mudar estado.

  O teste que mais importa aqui e negativo: ele varre o catalogo de ferramentas de todo papel
  e falha se alguma permitir escrever status ou tentativas. E o equivalente, em codigo, da
  ausencia da ferramenta de escrever no revisor — impossibilidade, e nao regra pedida.
  """

  use Fabrica.DataCase, async: true

  alias Fabrica.Ferramentas.Catalogo
  alias Fabrica.Ferramentas.RegistrarResultado
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Tarefa

  defp ciclo! do
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
          titulo: "reportar"
        })
      )

    Repo.insert!(
      Ciclo.changeset(%Ciclo{}, %{tarefa_id: tarefa.id, numero: 1, papel: "construtor"})
    )
  end

  describe "gravar o relatorio" do
    test "grava no ciclo corrente, dentro de uma transacao" do
      ciclo = ciclo!()

      assert {:ok, %{gravado: true, avisos: []}} =
               RegistrarResultado.registrar(ciclo.id, %{
                 resumo: "criei o modulo e o teste",
                 arquivos: ["lib/x.ex", "test/x_test.exs"],
                 comandos: ["mix verificar"],
                 commit: "abc1234"
               })

      lido = Repo.get!(Ciclo, ciclo.id)

      assert lido.relatorio =~ "criei o modulo e o teste"
      assert lido.relatorio =~ "lib/x.ex"
      assert lido.relatorio =~ "mix verificar"
      assert lido.relatorio =~ "abc1234"
    end

    test "aceita impedimento declarado" do
      # O construtor pode declarar impedimento em vez de fingir entrega — e o `lerImpedimento`
      # da v1, que existe porque fingir entrega custa um ciclo inteiro de verificacao.
      ciclo = ciclo!()

      assert {:ok, %{gravado: true}} =
               RegistrarResultado.registrar(ciclo.id, %{
                 resumo: "nao consegui",
                 impedimento: "o criterio pede um binario que nao existe nesta maquina"
               })

      assert Repo.get!(Ciclo, ciclo.id).relatorio =~ "binario que nao existe"
    end

    test "ciclo inexistente devolve erro nomeado, e nao grava nada" do
      assert {:erro, {:ciclo_ausente, 999_999}} =
               RegistrarResultado.registrar(999_999, %{resumo: "x"})
    end

    test "as secoes saem em ordem estavel" do
      # O relatorio vira markdown COMMITADO (T-032). Ordem instavel geraria diff onde nada
      # mudou, e diff falso e ruido que ensina a ignorar diff.
      ciclo = ciclo!()

      RegistrarResultado.registrar(ciclo.id, %{commit: "abc", resumo: "r", arquivos: ["a"]})
      primeiro = Repo.get!(Ciclo, ciclo.id).relatorio

      outro = ciclo!()
      RegistrarResultado.registrar(outro.id, %{arquivos: ["a"], resumo: "r", commit: "abc"})
      segundo = Repo.get!(Ciclo, outro.id).relatorio

      assert primeiro == segundo
    end
  end

  describe "campos do SISTEMA sao ignorados, com aviso" do
    test "status enviado pelo agente e ignorado" do
      ciclo = ciclo!()

      assert {:ok, %{avisos: [aviso]}} =
               RegistrarResultado.registrar(ciclo.id, %{resumo: "fiz", status: "concluida"})

      assert aviso =~ "status"
      assert aviso =~ "IGNORADO"
      refute Repo.get!(Ciclo, ciclo.id).relatorio =~ "concluida"
    end

    test "tentativas enviado pelo agente e ignorado" do
      ciclo = ciclo!()

      assert {:ok, %{avisos: [aviso]}} =
               RegistrarResultado.registrar(ciclo.id, %{resumo: "fiz", tentativas: 0})

      assert aviso =~ "tentativas"
    end

    test "o aviso EXPLICA de quem e o campo, e nao so que foi recusado" do
      {_, [aviso]} = RegistrarResultado.separar(%{status: "concluida"})

      assert aviso =~ "pertence ao sistema"
      assert aviso =~ "o estado e consequencia"
    end

    test "varios campos do sistema geram um aviso cada, em ordem estavel" do
      {aceito, avisos} =
        RegistrarResultado.separar(%{resumo: "r", status: "x", tentativas: 2, desfecho: "ok"})

      assert aceito == %{resumo: "r"}
      assert length(avisos) == 3
      assert avisos == Enum.sort(avisos) |> Enum.sort()
    end

    test "ignorar em SILENCIO seria pior, e por isso o aviso volta na mesma resposta" do
      # O agente seguiria acreditando que mudou o estado, e a divergencia so apareceria muito
      # depois, sem rastro de onde nasceu.
      ciclo = ciclo!()

      {:ok, retorno} = RegistrarResultado.registrar(ciclo.id, %{resumo: "r", status: "x"})

      assert retorno.gravado
      refute retorno.avisos == []
    end

    test "campo desconhecido e simplesmente ignorado, sem aviso" do
      # A lista de aceitos e uma ALLOWLIST: ela recusa o que ninguem previu. Mas so vira
      # aviso o que e sabidamente do sistema — avisar sobre tudo viraria ruido.
      {aceito, avisos} = RegistrarResultado.separar(%{resumo: "r", inventado_pelo_agente: 1})

      assert aceito == %{resumo: "r"}
      assert avisos == []
    end

    test "chave em string funciona igual a chave em atomo" do
      {aceito, avisos} = RegistrarResultado.separar(%{"resumo" => "r", "status" => "x"})

      assert aceito == %{resumo: "r"}
      assert length(avisos) == 1
    end

    test "chave inventada em string nao esgota a tabela de atomos" do
      # `to_existing_atom` e nao `to_atom`: a tabela de atomos nao e coletada, e um agente
      # que mandasse mil chaves novas derrubaria o runtime.
      {aceito, avisos} = RegistrarResultado.separar(%{"jamais_visto_#{:rand.uniform(9)}" => 1})

      assert aceito == %{}
      assert avisos == []
    end
  end

  describe "TESTE NEGATIVO: nenhuma ferramenta de nenhum papel escreve estado" do
    test "nenhum papel tem ferramenta com poder de escrever estado" do
      # E a impossibilidade, e nao a regra pedida. Se alguem acrescentar uma ferramenta que
      # escreva status, este teste cai antes de ela chegar a producao.
      for papel <- Catalogo.papeis() do
        {:ok, ferramentas} = Catalogo.do_papel(papel)

        for {nome, ferramenta} <- ferramentas do
          refute ferramenta.poder == :estado,
                 "o papel #{papel} tem a ferramenta #{nome} com poder de escrever ESTADO"
        end
      end
    end

    test "o poder :estado nao existe no catalogo inteiro" do
      refute :estado in Catalogo.poderes()
    end

    test "nenhuma ferramenta se chama como mudanca de estado" do
      proibidos = ~w[mudar_status definir_status concluir aprovar reprovar incrementar_tentativas]

      for {nome, _} <- Catalogo.ferramentas(), proibido <- proibidos do
        refute nome == proibido, "a ferramenta #{nome} nao pode existir: estado e do sistema"
      end
    end

    test "nenhum modulo de ferramenta sequer ALCANCA o schema de Tarefa" do
      # A primeira versao deste teste procurava a string `tarefas.status` no fonte, e
      # reprovou o proprio `catalogo.ex` — cujo `@moduledoc` ENUNCIA a proibicao. O detector
      # nao distinguia codigo de prosa, e um detector assim acusa exatamente quem documenta a
      # regra direito.
      #
      # A invariante de codigo e mais forte e nao tem esse problema: um modulo de ferramenta
      # que nunca referencia `Fabrica.Tarefas.Tarefa` **nao tem como** escrever status nem
      # tentativas, escreva o que escrever na documentacao. O relatorio vai para `Ciclo`, que
      # e outra tabela.
      for arquivo <- Path.wildcard("lib/fabrica/ferramentas/**/*.ex") do
        codigo =
          arquivo
          |> File.read!()
          |> String.replace(
            ~r/"""
.*?"""/s,
            ""
          )
          |> String.replace(~r/^\s*#.*$/m, "")

        refute codigo =~ "Tarefas.Tarefa",
               "#{arquivo} alcanca o schema de Tarefa. Nenhuma ferramenta pode: estado e " <>
                 "do sistema, e o relatorio do agente vai para Ciclo."
      end
    end

    test "o detector do teste acima funciona, e nao passa por vazio" do
      # Sem isto, um erro na remocao de docstring faria o teste anterior verde para sempre.
      codigo = ~s(defmodule X do\n  alias Fabrica.Tarefas.Tarefa\nend)
      so_prosa = ~s(defmodule X do\n  @moduledoc """\n  fala de Tarefas.Tarefa\n  """\nend)

      limpar = fn texto ->
        texto
        |> String.replace(
          ~r/"""
.*?"""/s,
          ""
        )
        |> String.replace(~r/^\s*#.*$/m, "")
      end

      assert limpar.(codigo) =~ "Tarefas.Tarefa"
      refute limpar.(so_prosa) =~ "Tarefas.Tarefa"
    end

    test "verificador e revisor NAO recebem ferramenta de escrever" do
      # A segunda ausencia: um portao que pode consertar o que reprova deixa de ser portao.
      refute Catalogo.pode_escrever?("verificador")
      refute Catalogo.pode_escrever?("revisor")
    end

    test "o construtor RECEBE ferramenta de escrever" do
      # A contraprova: sem ela, `pode_escrever?` poderia estar sempre devolvendo false e os
      # dois testes acima passariam por vazio.
      assert Catalogo.pode_escrever?("construtor")
      assert Catalogo.pode_escrever?("documentador")
    end

    test "todo papel recebe registrar_resultado" do
      # E a unica forma de reportar. Um papel sem ela nao teria como devolver nada.
      for papel <- Catalogo.papeis() do
        {:ok, ferramentas} = Catalogo.do_papel(papel)
        assert Map.has_key?(ferramentas, "registrar_resultado"), "#{papel} nao pode reportar"
      end
    end

    test "papel desconhecido devolve erro, e nao lista vazia" do
      # Lista vazia seria um agente sem ferramenta nenhuma rodando em silencio ate estourar o
      # teto de voltas — pelo mesmo custo de um despacho util.
      assert {:erro, :papel_desconhecido} = Catalogo.do_papel("inventado")
    end
  end
end
