defmodule Fabrica.Publicacao.MarkdownTest do
  @moduledoc """
  Trava as duas promessas da T-032: o markdown gerado tem as sete secoes do protocolo, e
  duas geracoes da mesma tarefa produzem bytes identicos — sem timestamp de geracao, tudo
  ordenado.
  """

  use Fabrica.DataCase, async: true

  alias Fabrica.Projetos.Especialista
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Publicacao.Markdown
  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Criterio
  alias Fabrica.Tarefas.Dependencia
  alias Fabrica.Tarefas.Tarefa

  @preloads [
    :projeto,
    :especialista,
    :replanejada_de,
    :areas,
    :criterios,
    :ciclos,
    dependencias: :depende_de
  ]

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

  defp tarefa!(projeto, atributos \\ %{}) do
    padrao = %{
      projeto_id: projeto.id,
      codigo: "T-#{100 + System.unique_integer([:positive])}",
      titulo: "uma tarefa",
      objetivo: "o que deve existir quando terminar",
      contexto: "o que quem executa precisa saber"
    }

    %Tarefa{}
    |> Tarefa.changeset(Map.merge(padrao, atributos))
    |> Repo.insert!()
  end

  defp recarregar(tarefa), do: tarefa |> Repo.reload!() |> Repo.preload(@preloads)

  defp area!(tarefa, caminho) do
    %Area{} |> Area.changeset(%{tarefa_id: tarefa.id, caminho: caminho}) |> Repo.insert!()
  end

  defp criterio!(tarefa, atributos) do
    %Criterio{}
    |> Criterio.changeset(Map.put(atributos, :tarefa_id, tarefa.id))
    |> Repo.insert!()
  end

  defp ciclo!(tarefa, atributos) do
    %Ciclo{}
    |> Ciclo.changeset(Map.merge(%{tarefa_id: tarefa.id, numero: 1}, atributos))
    |> Repo.insert!()
  end

  describe "as sete secoes do protocolo" do
    test "o markdown tem o frontmatter e as sete secoes", %{projeto: projeto} do
      tarefa = tarefa!(projeto) |> recarregar()

      conteudo = Markdown.gerar(tarefa)

      assert String.starts_with?(conteudo, "---\n")
      assert conteudo =~ "id: #{tarefa.codigo}"
      assert conteudo =~ "titulo: uma tarefa"
      assert conteudo =~ "projeto: #{projeto.nome}"
      assert conteudo =~ "status: backlog"
      assert conteudo =~ "prioridade: media"
      assert conteudo =~ "tentativas: 0"

      for secao <- [
            "## Objetivo",
            "## Contexto",
            "## Criterios de aceite",
            "## Notas de execucao",
            "## Verificacao",
            "## Conformidade",
            "## Revisao"
          ] do
        assert conteudo =~ secao
      end
    end

    test "termina com exatamente uma quebra de linha", %{projeto: projeto} do
      tarefa = tarefa!(projeto) |> recarregar()

      conteudo = Markdown.gerar(tarefa)

      refute String.ends_with?(conteudo, "\n\n")
      assert String.ends_with?(conteudo, "\n")
    end

    test "status com underscore vira hifen no frontmatter", %{projeto: projeto} do
      tarefa = tarefa!(projeto, %{status: :em_execucao}) |> recarregar()

      assert Markdown.gerar(tarefa) =~ "status: em-execucao"
    end

    test "areas e dependencias saem ORDENADAS, nao na ordem de insercao", %{projeto: projeto} do
      alvo = tarefa!(projeto)
      dep_b = tarefa!(projeto, %{codigo: "T-#{200 + System.unique_integer([:positive])}"})
      dep_a = tarefa!(projeto, %{codigo: "T-001"})

      area!(alvo, "lib/z.ex")
      area!(alvo, "lib/a.ex")

      %Dependencia{}
      |> Dependencia.changeset(%{tarefa_id: alvo.id, depende_de_id: dep_b.id})
      |> Repo.insert!()

      %Dependencia{}
      |> Dependencia.changeset(%{tarefa_id: alvo.id, depende_de_id: dep_a.id})
      |> Repo.insert!()

      conteudo = alvo |> recarregar() |> Markdown.gerar()

      assert conteudo =~ "areas: [lib/a.ex, lib/z.ex]"
      assert conteudo =~ "dependencias: [T-001, #{dep_b.codigo}]"
    end

    test "sem area e sem dependencia, as listas saem vazias", %{projeto: projeto} do
      tarefa = tarefa!(projeto) |> recarregar()

      conteudo = Markdown.gerar(tarefa)

      assert conteudo =~ "areas: []"
      assert conteudo =~ "dependencias: []"
    end

    test "especialista ativo vira a linha `agente:`, ausente some", %{projeto: projeto} do
      sem_especialista = tarefa!(projeto) |> recarregar()
      refute Markdown.gerar(sem_especialista) =~ "agente:"

      especialista =
        %Especialista{}
        |> Especialista.changeset(%{
          projeto_id: projeto.id,
          identificador: "especialista-x",
          nome: "Especialista X",
          prompt: "faca X"
        })
        |> Repo.insert!()

      com_especialista =
        tarefa!(projeto, %{especialista_id: especialista.id}) |> recarregar()

      assert Markdown.gerar(com_especialista) =~ "agente: especialista-x"
    end

    test "tarefa replanejada leva `replanejada-de:` com o codigo da origem", %{projeto: projeto} do
      origem = tarefa!(projeto)
      substituta = tarefa!(projeto, %{replanejada_de_id: origem.id}) |> recarregar()

      assert Markdown.gerar(substituta) =~ "replanejada-de: #{origem.codigo}"
    end

    test "criterio com comando leva a linha `verificar:`; sem comando, so o texto", %{
      projeto: projeto
    } do
      tarefa = tarefa!(projeto)
      criterio!(tarefa, %{texto: "primeiro criterio", comando: "mix test", grau: :executado})
      criterio!(tarefa, %{texto: "segundo criterio, sem comando"})

      conteudo = tarefa |> recarregar() |> Markdown.gerar()

      assert conteudo =~ "- [ ] primeiro criterio\n      `verificar: mix test`"
      assert conteudo =~ "- [ ] segundo criterio, sem comando"
    end

    test "criterios saem na ordem de criacao (por id)", %{projeto: projeto} do
      tarefa = tarefa!(projeto)
      criterio!(tarefa, %{texto: "z primeiro a ser criado"})
      criterio!(tarefa, %{texto: "a criado depois"})

      conteudo = tarefa |> recarregar() |> Markdown.gerar()

      posicao_z = :binary.match(conteudo, "z primeiro a ser criado") |> elem(0)
      posicao_a = :binary.match(conteudo, "a criado depois") |> elem(0)

      assert posicao_z < posicao_a
    end
  end

  describe "ciclos viram as secoes do relatorio" do
    test "ciclo do construtor alimenta Notas de execucao", %{projeto: projeto} do
      tarefa = tarefa!(projeto)
      ciclo!(tarefa, %{papel: "construtor", relatorio: "## resumo\nfiz o basico"})

      conteudo = tarefa |> recarregar() |> Markdown.gerar()

      assert conteudo =~ "## Notas de execucao\n## resumo\nfiz o basico"
    end

    test "ciclo do verificador alimenta Verificacao", %{projeto: projeto} do
      tarefa = tarefa!(projeto)
      ciclo!(tarefa, %{papel: "verificador", relatorio: "criterio 1: PASSOU"})

      conteudo = tarefa |> recarregar() |> Markdown.gerar()

      assert conteudo =~ "## Verificacao\ncriterio 1: PASSOU"
    end

    test "ciclo do revisor alimenta Conformidade (desfecho) e Revisao (relatorio)", %{
      projeto: projeto
    } do
      tarefa = tarefa!(projeto)

      ciclo!(tarefa, %{
        papel: "revisor",
        desfecho: "cumpre",
        relatorio: "aprovado sem ressalvas"
      })

      conteudo = tarefa |> recarregar() |> Markdown.gerar()

      assert conteudo =~ "## Conformidade\nConformidade: cumpre"
      assert conteudo =~ "## Revisao\naprovado sem ressalvas"
    end

    test "mais de um ciclo do mesmo papel vira `### Ciclo N`, um por retrabalho", %{
      projeto: projeto
    } do
      tarefa = tarefa!(projeto)
      ciclo!(tarefa, %{papel: "construtor", numero: 1, relatorio: "primeira tentativa"})
      ciclo!(tarefa, %{papel: "construtor", numero: 2, relatorio: "corrigido no retrabalho"})

      conteudo = tarefa |> recarregar() |> Markdown.gerar()

      assert conteudo =~ "### Ciclo 1\nprimeira tentativa"
      assert conteudo =~ "### Ciclo 2\ncorrigido no retrabalho"
    end

    test "tarefa sem ciclo nenhum deixa as quatro secoes vazias", %{projeto: projeto} do
      tarefa = tarefa!(projeto) |> recarregar()

      conteudo = Markdown.gerar(tarefa)

      assert conteudo =~ "## Notas de execucao\n\n\n## Verificacao"
      assert conteudo =~ "## Verificacao\n\n\n## Conformidade"
      assert conteudo =~ "## Conformidade\n\n\n## Revisao"
    end
  end

  describe "determinismo — a promessa central da tarefa" do
    test "duas geracoes da mesma tarefa produzem bytes identicos", %{projeto: projeto} do
      tarefa = tarefa!(projeto)
      area!(tarefa, "lib/a.ex")
      criterio!(tarefa, %{texto: "criterio unico", comando: "mix test", grau: :executado})
      ciclo!(tarefa, %{papel: "construtor", relatorio: "notas"})

      recarregada = recarregar(tarefa)

      primeira = Markdown.gerar(recarregada)
      segunda = Markdown.gerar(recarregar(tarefa))

      assert primeira == segunda
      assert :erlang.md5(primeira) == :erlang.md5(segunda)
    end

    test "gerar/1 nao escreve no banco (funcao pura)", %{projeto: projeto} do
      tarefa = tarefa!(projeto) |> recarregar()
      antes = Repo.get!(Tarefa, tarefa.id)

      Markdown.gerar(tarefa)

      assert Repo.get!(Tarefa, tarefa.id) == antes
    end
  end
end
