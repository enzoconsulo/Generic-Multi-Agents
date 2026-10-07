defmodule Fabrica.PortoesTest do
  @moduledoc """
  Os dois portoes, e as duas AUSENCIAS que os tornam portoes.

  O teste que carrega o arquivo nao verifica comportamento: verifica **impossibilidade**.
  Enquanto ele passar, nem o verificador nem o revisor tem como consertar o que reprovam — e
  "quem implementa nunca e quem aprova" deixa de ser recomendacao de conduta.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Criterios
  alias Fabrica.Ferramentas.Catalogo
  alias Fabrica.Portoes.Revisor
  alias Fabrica.Portoes.Verificador

  doctest Fabrica.Portoes.Revisor

  defp resultado(estado, atributos \\ []) do
    padrao = %{
      texto: "um criterio",
      comando: "mix test",
      estado: estado,
      recusa: nil,
      classe: nil,
      reexecutado: false,
      implicito: false,
      saida: "",
      espelho: false
    }

    Map.merge(padrao, Map.new(atributos))
  end

  defp achado(gravidade, atributos \\ []) do
    padrao = %{
      gravidade: gravidade,
      arquivo: "lib/a.ex",
      linha: 10,
      problema: "algo errado"
    }

    Map.merge(padrao, Map.new(atributos))
  end

  describe "A AUSENCIA: nenhum dos dois portoes pode escrever" do
    test "o verificador nao recebe escrever nem editar" do
      {:ok, ferramentas} = Verificador.ferramentas()

      refute Map.has_key?(ferramentas, "escrever")
      refute Map.has_key?(ferramentas, "editar")
    end

    test "o revisor nao recebe escrever nem editar" do
      {:ok, ferramentas} = Revisor.ferramentas()

      refute Map.has_key?(ferramentas, "escrever")
      refute Map.has_key?(ferramentas, "editar")
    end

    test "nenhuma ferramenta dos dois tem poder de escrita, qualquer que seja o nome" do
      # Conferir pelo NOME deixaria passar uma ferramenta de escrita batizada de outro jeito.
      # O que decide e o poder declarado.
      for papel <- [Verificador.papel(), Revisor.papel()] do
        refute Catalogo.pode_escrever?(papel), "#{papel} nao pode ter poder de escrita"
      end
    end

    test "o construtor PODE escrever — senao o teste acima passaria por vazio" do
      assert Catalogo.pode_escrever?("construtor")
    end

    test "o revisor tem menos ferramentas que o verificador, e nao apenas as mesmas" do
      # O revisor tambem nao roda comando: ele le o diff. Se as listas fossem iguais, um dos
      # dois papeis estaria com poder que nao precisa.
      {:ok, do_verificador} = Verificador.ferramentas()
      {:ok, do_revisor} = Revisor.ferramentas()

      assert Map.has_key?(do_verificador, "rodar")
      refute Map.has_key?(do_revisor, "rodar")
    end
  end

  describe "o revisor le o DIFF, e nao os fontes" do
    test "o contexto tem o diff, e nao ha bloco de fonte" do
      contexto =
        Revisor.contexto(
          objetivo: "somar dois numeros",
          criterios: "- [ ] soma",
          diff: "+++ b/lib/soma.ex\n+def somar(a, b), do: a + b"
        )

      especies = Enum.map(contexto.blocos, &elem(&1, 0))

      assert especies == [:objetivo, :criterios, :diff]
      refute :fonte in especies
      refute :arquivos in especies
    end

    test "o modulo do revisor NAO TEM COMO ler disco" do
      # E a garantia estrutural por tras do criterio. Sem ela, bastaria alguem acrescentar um
      # `File.read!` "so para conferir o arquivo inteiro" e a restricao viraria conselho.
      fonte = File.read!("lib/fabrica/portoes/revisor.ex")

      for proibido <- ["File.read", "File.stream", "Path.wildcard", "File.ls"] do
        refute fonte =~ proibido, "Revisor referencia #{proibido}: ele so pode ver o diff."
      end
    end

    test "o detector do teste acima funciona, e nao passa por vazio" do
      # Sensor que nunca dispara e indistinguivel de sensor quebrado: este arquivo de teste
      # usa `File.read!`, entao o padrao tem de encontra-lo aqui.
      assert File.read!("test/fabrica/portoes_test.exs") =~ "File.read"
    end

    test "o contexto nao inventa bloco quando falta uma parte" do
      contexto = Revisor.contexto([])

      assert Enum.map(contexto.blocos, &elem(&1, 0)) == [:objetivo, :criterios, :diff]
      assert Enum.all?(contexto.blocos, fn {_especie, texto} -> texto == "" end)
    end
  end

  describe "conformidade e revisao sao INDEPENDENTES" do
    test "nao conforme com ZERO achados reprova — e este e o teste central" do
      # Entrega que passa em todos os criterios e nao tem defeito nenhum ainda pode nao ser a
      # tarefa. Criterio frouxo nao e licenca para entregar outra coisa.
      veredito =
        Revisor.julgar({:nao_conforme, "implementou busca, e a tarefa pedia ordenacao"}, [])

      refute veredito.aprovado
      assert veredito.motivo == :nao_conforme
      assert veredito.achados == []
      assert {:nao_conforme, motivo} = veredito.conformidade
      assert motivo =~ "ordenacao"
    end

    test "conforme com achados tambem reprova" do
      veredito = Revisor.julgar(:conforme, [achado(:alto)])

      refute veredito.aprovado
      assert veredito.motivo == :defeitos
    end

    test "so aprova quando as DUAS respostas passam" do
      veredito = Revisor.julgar(:conforme, [])

      assert veredito.aprovado
      assert veredito.motivo == :aprovado
    end

    test "a conformidade tem precedencia sobre os achados no motivo" do
      # Quando as duas reprovam, o motivo registrado e a conformidade: refazer o codigo nao
      # ajuda se o que se pediu era outra coisa.
      veredito = Revisor.julgar({:nao_conforme, "outra coisa"}, [achado(:critico)])

      assert veredito.motivo == :nao_conforme
      assert veredito.achados != []
    end
  end

  describe "o formato dos achados" do
    test "sai como [gravidade] arquivo:linha — problema" do
      texto =
        Revisor.formatar(%{
          gravidade: :critico,
          arquivo: "lib/fabrica/conta.ex",
          linha: 91,
          problema: "divisao sem guarda de zero"
        })

      assert texto == "[critico] lib/fabrica/conta.ex:91 — divisao sem guarda de zero"
    end

    test "achado sem linha sai sem o numero, em vez de inventar :1" do
      # Ha defeito que e do arquivo inteiro (falta um teste, o modulo nao deveria existir), e
      # inventar uma linha mandaria quem for consertar para o lugar errado.
      texto =
        Revisor.formatar(achado(:medio, arquivo: "lib/b.ex", linha: nil, problema: "sem teste"))

      assert texto == "[medio] lib/b.ex — sem teste"
    end

    test "cada gravidade formata igual" do
      for gravidade <- Revisor.gravidades() do
        assert Revisor.formatar(achado(gravidade)) =~ "[#{gravidade}]"
      end
    end

    test "ler_achados/1 e formatar/1 sao inversos" do
      originais = [
        achado(:critico, arquivo: "lib/a.ex", linha: 1, problema: "um"),
        achado(:baixo, arquivo: "lib/b.ex", linha: nil, problema: "dois")
      ]

      texto = Enum.map_join(originais, "\n", &Revisor.formatar/1)

      assert Revisor.ler_achados(texto) == originais
    end

    test "a leitura ignora a prosa em volta, sem derrubar" do
      # O revisor escreve texto em volta dos achados; parser rigido transformaria uma frase de
      # contexto em erro de sistema.
      texto = """
      ## Revisao

      Li o diff inteiro. Dois pontos:

      - [alto] lib/a.ex:12 — condicao invertida
      Nada mais me chamou atencao.
      - [baixo] lib/b.ex:99 — nome pouco claro
      """

      assert [%{gravidade: :alto, linha: 12}, %{gravidade: :baixo, linha: 99}] =
               Revisor.ler_achados(texto)
    end

    test "aceita travessao e hifen como separador" do
      assert [%{problema: "com travessao"}] =
               Revisor.ler_achados("[alto] lib/a.ex:1 — com travessao")

      assert [%{problema: "com hifen"}] = Revisor.ler_achados("[alto] lib/a.ex:1 - com hifen")
    end

    test "gravidade desconhecida nao vira achado" do
      assert Revisor.ler_achados("[urgentissimo] lib/a.ex:1 — inventado") == []
    end

    test "texto vazio ou nulo devolve lista vazia" do
      assert Revisor.ler_achados("") == []
      assert Revisor.ler_achados(nil) == []
    end

    test "pior/1 devolve a gravidade mais alta, e nao a primeira da lista" do
      # E o que a T-030 le para escolher a resposta ao fracasso: um critico volta diferente de
      # tres baixos.
      assert Revisor.pior([achado(:baixo), achado(:critico), achado(:medio)]) == :critico
      assert Revisor.pior([achado(:medio), achado(:baixo)]) == :medio
      assert Revisor.pior([]) == nil
    end
  end

  describe "o verificador julga a partir da passada mecanica" do
    test "aprova quando cada criterio com comando passou" do
      veredito = Verificador.julgar([resultado(:passou), resultado(:nao_executado)])

      assert veredito.aprovado
      assert veredito.motivo == :aprovado
    end

    test "reprova quando algum criterio falhou por entrega" do
      veredito = Verificador.julgar([resultado(:passou), resultado(:falhou, classe: :entrega)])

      refute veredito.aprovado
      assert veredito.motivo == :criterio_reprovado
    end

    test "NAO aprova com criterio inconclusivo pendente" do
      # Transformar "o comando nao conseguiu avaliar" em "passou" seria aprovar por omissao,
      # que e o oposto de um portao. E tambem nao reprova: a tarefa nao errou.
      veredito =
        Verificador.julgar([
          resultado(:passou),
          resultado(:inconclusivo, classe: :ferramenta_quebrada)
        ])

      refute veredito.aprovado
      assert veredito.motivo == :sem_prova
      refute Criterios.reprovou?(veredito.resultados)
    end

    test "criterio SEM comando nao impede a aprovacao" do
      # Ele e o que o verificador julga com o proprio texto — a maioria dos criterios de
      # julgamento e assim, e exigir comando para cada um mataria o portao.
      veredito = Verificador.julgar([resultado(:nao_executado, recusa: :sem_comando)])

      assert veredito.aprovado
    end

    test "o relatorio da passada vem junto do veredito" do
      veredito = Verificador.julgar([resultado(:passou, texto: "a suite passa")])

      assert veredito.relatorio =~ "a suite passa"
      assert veredito.relatorio =~ "Graus de prova:"
    end

    test "lista vazia aprova, porque nao ha o que reprovar" do
      assert Verificador.julgar([]).aprovado
    end
  end

  describe "o contexto do verificador" do
    test "tem a tarefa e a passada mecanica, e NAO tem o diff" do
      # Ler o codigo e a pergunta do outro portao. Dar o diff aqui convidaria a julgar
      # implementacao em vez de resultado.
      contexto = Verificador.contexto("## Objetivo\nsomar", "### Passada mecanica")

      especies = Enum.map(contexto.blocos, &elem(&1, 0))

      assert especies == [:tarefa, :passada_mecanica]
      refute :diff in especies
    end

    test "o papel do contexto e o mesmo do catalogo" do
      assert Verificador.contexto("", "").papel == Verificador.papel()
      assert Revisor.contexto([]).papel == Revisor.papel()
    end
  end
end
