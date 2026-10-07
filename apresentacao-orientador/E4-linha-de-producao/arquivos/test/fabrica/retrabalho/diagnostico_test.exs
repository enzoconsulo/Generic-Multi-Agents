defmodule Fabrica.Retrabalho.DiagnosticoTest do
  @moduledoc """
  O julgamento do retrabalho inteiro mora em `diagnosticar/2`, e por isso os testes aqui sao
  exaustivos: e funcao pura, entao cada caso custa microssegundos.

  O bloco que mais vale e o de PRECEDENCIA. As quatro naturezas nao sao mutuamente exclusivas
  no mundo real — uma reprovacao pode ter impedimento, conformidade e achados ao mesmo tempo —
  e escolher a errada custa um ciclo inteiro no tamanho errado.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Retrabalho.Diagnostico
  alias Fabrica.Retrabalho.Politica

  doctest Fabrica.Retrabalho.Politica

  defp achado(gravidade, atributos \\ []) do
    padrao = %{gravidade: gravidade, arquivo: "lib/a.ex", linha: 10, problema: "algo"}
    Map.merge(padrao, Map.new(atributos))
  end

  describe "as quatro naturezas — um teste por natureza" do
    test "impedimento: o construtor declarou que nao consegue" do
      politica = Diagnostico.diagnosticar(%{impedimento: "falta a credencial do Postgres"})

      assert politica.natureza == :impedimento
      assert politica.escopo == :tarefa_inteira
      assert politica.largura == :medio
      assert hd(politica.foco) =~ "IMPEDIMENTO DECLARADO: falta a credencial"
    end

    test "conformidade: entregou outra coisa" do
      politica =
        Diagnostico.diagnosticar(%{
          conformidade: {:nao_conforme, "implementou busca, e a tarefa pedia ordenacao"},
          objetivo: "ordenar a lista de jogadores"
        })

      assert politica.natureza == :conformidade
      assert politica.escopo == :tarefa_inteira
      assert politica.largura == :amplo
    end

    test "funcional: um criterio executavel reprovou" do
      politica = Diagnostico.diagnosticar(%{criterios_reprovados: ["a suite passa"]})

      assert politica.natureza == :funcional
      assert politica.escopo == :tarefa_inteira
      assert politica.largura == :medio
    end

    test "pontual: achado com arquivo e linha nomeados" do
      politica = Diagnostico.diagnosticar(%{achados: [achado(:baixo)]})

      assert politica.natureza == :pontual
      assert politica.escopo == {:arquivos, ["lib/a.ex"]}
      assert politica.largura == :estreito
    end
  end

  describe "a PRECEDENCIA entre naturezas" do
    test "impedimento vence tudo" do
      # Nenhuma quantidade de voltas resolve "nao tenho a credencial". Olhar os achados antes
      # seria consertar sintoma.
      politica =
        Diagnostico.diagnosticar(%{
          impedimento: "o binario do pg_dump nao existe nesta maquina",
          conformidade: {:nao_conforme, "outra coisa"},
          criterios_reprovados: ["a suite"],
          achados: [achado(:critico)]
        })

      assert politica.natureza == :impedimento
    end

    test "conformidade vence funcional e pontual" do
      # Nao adianta fazer passar o criterio de uma tarefa que nao e a tarefa.
      politica =
        Diagnostico.diagnosticar(%{
          conformidade: {:nao_conforme, "outra coisa"},
          criterios_reprovados: ["a suite"],
          achados: [achado(:critico)]
        })

      assert politica.natureza == :conformidade
    end

    test "funcional vence pontual" do
      # Criterio executavel que reprovou e evidencia mais forte que a leitura de um revisor.
      politica =
        Diagnostico.diagnosticar(%{
          criterios_reprovados: ["a suite"],
          achados: [achado(:baixo)]
        })

      assert politica.natureza == :funcional
    end

    test "conformidade :conforme NAO dispara a natureza de conformidade" do
      politica = Diagnostico.diagnosticar(%{conformidade: :conforme, achados: [achado(:baixo)]})

      assert politica.natureza == :pontual
    end

    test "impedimento vazio ou so espaco nao conta" do
      for texto <- ["", "   "] do
        politica = Diagnostico.diagnosticar(%{impedimento: texto, achados: [achado(:baixo)]})
        assert politica.natureza == :pontual, "impedimento #{inspect(texto)} nao deveria contar"
      end
    end

    test "reprovacao sem sinal nenhum e :funcional, e nao :pontual" do
      # Chamar isso de pontual daria escopo estreito SEM arquivo nenhum para estreitar, e o
      # construtor receberia uma lista vazia como se fosse instrucao.
      politica = Diagnostico.diagnosticar(%{})

      assert politica.natureza == :funcional
      assert politica.escopo == :tarefa_inteira
    end

    test "achado SEM arquivo nomeado nao e pontual" do
      politica = Diagnostico.diagnosticar(%{achados: [achado(:baixo, arquivo: "")]})

      assert politica.natureza == :funcional
    end
  end

  describe "as voltas: estreito para pontual, medio para grave ou funcional" do
    test "conserto pontual leve recebe teto ESTREITO" do
      # Um conserto de uma linha nao precisa de 30 voltas.
      politica = Diagnostico.diagnosticar(%{achados: [achado(:baixo), achado(:medio)]})

      assert politica.largura == :estreito
      assert politica.voltas == 8
    end

    test "falha funcional recebe teto MEDIO" do
      politica = Diagnostico.diagnosticar(%{criterios_reprovados: ["a suite"]})

      assert politica.largura == :medio
      assert politica.voltas == 18
    end

    test "defeito GRAVE num ponto nomeado sobe para medio, e mantem o escopo estreito" do
      # Escopo vem da natureza; voltas vem da natureza E da gravidade. Um critico num ponto
      # nomeado continua sendo conserto de escopo estreito — mas acertar de primeira importa
      # mais ali.
      for gravidade <- [:critico, :alto] do
        politica = Diagnostico.diagnosticar(%{achados: [achado(gravidade)]})

        assert politica.natureza == :pontual, "#{gravidade}"
        assert politica.largura == :medio, "#{gravidade}"
        assert {:arquivos, _} = politica.escopo
      end
    end

    test "conformidade recebe teto AMPLO" do
      politica = Diagnostico.diagnosticar(%{conformidade: {:nao_conforme, "x"}})

      assert politica.largura == :amplo
      assert politica.voltas == 30
    end

    test "o amplo e o teto PADRAO do laco, e nao um regime especial" do
      assert Politica.voltas(:amplo) == %Fabrica.Agente.Estado{}.teto_de_voltas
    end

    test "as tres larguras sao estritamente crescentes" do
      voltas = Enum.map(Politica.larguras(), &Politica.voltas/1)

      assert voltas == Enum.sort(voltas)
      assert length(Enum.uniq(voltas)) == 3
    end
  end

  describe "conformidade: escopo inteiro com o OBJETIVO no foco" do
    test "o objetivo entra no foco, e vem primeiro" do
      politica =
        Diagnostico.diagnosticar(%{
          conformidade: {:nao_conforme, "implementou busca"},
          objetivo: "ordenar a lista de jogadores por pontuacao",
          achados: [achado(:alto)]
        })

      assert politica.escopo == :tarefa_inteira
      assert hd(politica.foco) =~ "O QUE FOI PEDIDO: ordenar a lista de jogadores"
      assert Enum.at(politica.foco, 1) =~ "POR QUE REPROVOU: implementou busca"
    end

    test "os achados vem DEPOIS do objetivo, e nao no lugar dele" do
      # Consertar bug de uma entrega que nao e a tarefa e trabalho jogado fora — mas os
      # achados ainda servem, se a reimplementacao repetir o mesmo erro.
      politica =
        Diagnostico.diagnosticar(%{
          conformidade: {:nao_conforme, "x"},
          objetivo: "o objetivo",
          achados: [achado(:alto, problema: "divisao por zero")]
        })

      assert List.last(politica.foco) =~ "divisao por zero"
    end

    test "objetivo ausente e dito, e nao omitido em silencio" do
      politica = Diagnostico.diagnosticar(%{conformidade: {:nao_conforme, "x"}})

      assert hd(politica.foco) =~ "objetivo nao informado"
    end
  end

  describe "o foco vem em ordem de gravidade" do
    test "critico antes de alto antes de medio antes de baixo" do
      # Quem le uma lista longa conserta os primeiros itens: a ordem decide o que sera
      # consertado quando as voltas acabarem.
      achados = [
        achado(:baixo, problema: "quatro"),
        achado(:critico, problema: "um"),
        achado(:medio, problema: "tres"),
        achado(:alto, problema: "dois")
      ]

      foco = Diagnostico.diagnosticar(%{achados: achados}).foco

      assert Enum.map(foco, &String.slice(&1, 0, 9)) == [
               "[critico]",
               "[alto] li",
               "[medio] l",
               "[baixo] l"
             ]
    end

    test "achados de mesma gravidade mantem a ordem do revisor" do
      # `sort_by` e estavel: dois achados igualmente graves saem como foram escritos, e nao
      # embaralhados por um criterio invisivel.
      achados = [
        achado(:alto, problema: "primeiro"),
        achado(:alto, problema: "segundo"),
        achado(:alto, problema: "terceiro")
      ]

      foco = Diagnostico.diagnosticar(%{achados: achados}).foco

      assert Enum.map(foco, &String.replace(&1, ~r/.* — /u, "")) ==
               ["primeiro", "segundo", "terceiro"]
    end

    test "o escopo tambem sai em ordem de gravidade, e sem repetir arquivo" do
      achados = [
        achado(:baixo, arquivo: "lib/z.ex"),
        achado(:critico, arquivo: "lib/a.ex"),
        achado(:medio, arquivo: "lib/z.ex")
      ]

      assert {:arquivos, ["lib/a.ex", "lib/z.ex"]} =
               Diagnostico.diagnosticar(%{achados: achados}).escopo
    end

    test "o criterio reprovado entra no foco antes dos achados" do
      politica =
        Diagnostico.diagnosticar(%{
          criterios_reprovados: ["a suite passa", "o formato esta certo"],
          achados: [achado(:critico, problema: "bug")]
        })

      assert hd(politica.foco) == "CRITERIO REPROVADO: a suite passa"
      assert List.last(politica.foco) =~ "bug"
    end
  end

  describe "o modelo sobe no retrabalho" do
    test "primeira execucao usa o modelo do disparo" do
      assert Diagnostico.diagnosticar(%{}, tentativas: 0).modelo == :do_disparo
    end

    test "da segunda em diante usa o reforcado" do
      # Repetir a aposta que ja falhou paga construtor, verificador e revisor de novo E queima
      # uma das tres fichas.
      for tentativas <- [1, 2, 3] do
        assert Diagnostico.diagnosticar(%{}, tentativas: tentativas).modelo == :reforcado
      end
    end

    test "sem :tentativas declarado, assume a primeira" do
      assert Diagnostico.diagnosticar(%{}).modelo == :do_disparo
    end
  end

  describe "o bloco de despacho" do
    test "diz a natureza, o escopo, o teto e a lista numerada" do
      texto =
        %{achados: [achado(:critico, problema: "um"), achado(:baixo, problema: "dois")]}
        |> Diagnostico.diagnosticar()
        |> Politica.para_despacho()

      assert texto =~ "Natureza da reprovacao: pontual"
      assert texto =~ "SOMENTE estes arquivos: lib/a.ex"
      assert texto =~ "Teto desta volta: 18 idas ao modelo (medio)"
      assert texto =~ "1. [critico]"
      assert texto =~ "2. [baixo]"
    end

    test "escopo inteiro e dito por extenso" do
      texto =
        %{criterios_reprovados: ["a suite"]}
        |> Diagnostico.diagnosticar()
        |> Politica.para_despacho()

      assert texto =~ "Escopo: a tarefa inteira"
    end

    test "sem foco nenhum, diz que nao ha — e nao deixa uma lista vazia" do
      texto = %{} |> Diagnostico.diagnosticar() |> Politica.para_despacho()

      assert texto =~ "Sem achados nomeados."
      refute texto =~ "Conserte, nesta ordem"
    end
  end
end
