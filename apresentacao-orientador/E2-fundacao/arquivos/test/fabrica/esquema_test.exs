defmodule Fabrica.EsquemaTest do
  @moduledoc """
  Trava o esquema: o que o banco aceita, o que ele recusa, e o que volta na leitura.

  O que estes testes protegem nao e "o Ecto funciona" — e que as regras que a v2 moveu
  para o ESQUEMA continuem sendo do esquema. Um status inventado, uma tarefa que depende
  de si mesma ou dois especialistas ativos com o mesmo identificador precisam falhar aqui,
  nao num `if` espalhado pelo codigo.
  """

  use Fabrica.DataCase, async: true

  alias Fabrica.Projetos.Especialista
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Consumo
  alias Fabrica.Tarefas.Criterio
  alias Fabrica.Tarefas.Dependencia
  alias Fabrica.Tarefas.Despacho
  alias Fabrica.Tarefas.Tarefa

  defp projeto!(atributos \\ %{}) do
    padrao = %{nome: "projeto-#{System.unique_integer([:positive])}", caminho: "C:/tmp/p"}

    %Projeto{}
    |> Projeto.changeset(Map.merge(padrao, atributos))
    |> Repo.insert!()
  end

  defp tarefa!(projeto, atributos \\ %{}) do
    padrao = %{
      projeto_id: projeto.id,
      codigo: "T-#{100 + System.unique_integer([:positive])}",
      titulo: "uma tarefa"
    }

    %Tarefa{}
    |> Tarefa.changeset(Map.merge(padrao, atributos))
    |> Repo.insert!()
  end

  describe "projeto" do
    test "insere e le de volta, com dominio software por padrao" do
      projeto = projeto!(%{nome: "fabrica-v2", caminho: "C:/projetos/fabrica-v2"})

      lido = Repo.get!(Projeto, projeto.id)

      assert lido.nome == "fabrica-v2"
      assert lido.caminho == "C:/projetos/fabrica-v2"
      assert lido.dominio == "software"
      assert lido.inserted_at
    end

    test "dominio e texto livre: dominio nao e lista fechada" do
      projeto = projeto!(%{dominio: "apresentacao"})
      assert Repo.get!(Projeto, projeto.id).dominio == "apresentacao"
    end

    test "nome duplicado e recusado pelo banco" do
      projeto!(%{nome: "repetido"})

      {:error, changeset} =
        %Projeto{}
        |> Projeto.changeset(%{nome: "repetido", caminho: "C:/outro"})
        |> Repo.insert()

      assert %{nome: ["has already been taken"]} = errors_on(changeset)
    end

    test "nome e caminho sao obrigatorios" do
      changeset = Projeto.changeset(%Projeto{}, %{})

      assert %{nome: ["can't be blank"], caminho: ["can't be blank"]} = errors_on(changeset)
    end
  end

  describe "tarefa" do
    test "insere com dependencia e area, e le tudo de volta" do
      projeto = projeto!()
      base = tarefa!(projeto, %{codigo: "T-001", titulo: "scaffold"})
      seguinte = tarefa!(projeto, %{codigo: "T-002", titulo: "esquema"})

      Repo.insert!(
        Dependencia.changeset(%Dependencia{}, %{
          tarefa_id: seguinte.id,
          depende_de_id: base.id
        })
      )

      Repo.insert!(
        Area.changeset(%Area{}, %{tarefa_id: seguinte.id, caminho: "priv/repo/migrations"})
      )

      lida = Repo.preload(Repo.get!(Tarefa, seguinte.id), [:areas, dependencias: :depende_de])

      assert lida.codigo == "T-002"
      assert lida.status == :backlog
      assert lida.prioridade == :media
      assert lida.tentativas == 0
      assert [%Area{caminho: "priv/repo/migrations"}] = lida.areas
      assert [%Dependencia{depende_de: %Tarefa{codigo: "T-001"}}] = lida.dependencias
    end

    test "status invalido e rejeitado pelo changeset" do
      projeto = projeto!()

      changeset =
        Tarefa.changeset(%Tarefa{}, %{
          projeto_id: projeto.id,
          codigo: "T-009",
          titulo: "marco",
          status: :em_ferias
        })

      refute changeset.valid?
      assert %{status: ["is invalid"]} = errors_on(changeset)
    end

    test "aceita os seis estados do protocolo e os dois terminais" do
      projeto = projeto!()

      for status <- Tarefa.estados() ++ Tarefa.terminais() do
        tarefa = tarefa!(projeto, %{status: status})
        assert Repo.get!(Tarefa, tarefa.id).status == status
      end
    end

    test "codigo fora do formato T-NNN e recusado" do
      projeto = projeto!()

      changeset =
        Tarefa.changeset(%Tarefa{}, %{projeto_id: projeto.id, codigo: "tarefa 1", titulo: "x"})

      refute changeset.valid?
      assert %{codigo: [_ | _]} = errors_on(changeset)
    end

    test "codigo com sufixo de replanejamento e aceito" do
      projeto = projeto!()
      tarefa = tarefa!(projeto, %{codigo: "T-017a"})
      assert Repo.get!(Tarefa, tarefa.id).codigo == "T-017a"
    end

    test "codigo e citext: mesmo codigo em caixa diferente e a MESMA tarefa" do
      projeto = projeto!()
      tarefa!(projeto, %{codigo: "T-042"})

      {:error, changeset} =
        %Tarefa{}
        |> Tarefa.changeset(%{projeto_id: projeto.id, codigo: "t-042", titulo: "outra"})
        |> Repo.insert()

      assert %{projeto_id: ["has already been taken"]} = errors_on(changeset)
    end

    test "o mesmo codigo em projetos diferentes convive" do
      um = tarefa!(projeto!(), %{codigo: "T-001"})
      outro = tarefa!(projeto!(), %{codigo: "T-001"})

      assert um.id != outro.id
    end

    test "tentativas negativas sao recusadas" do
      projeto = projeto!()

      changeset =
        Tarefa.changeset(%Tarefa{}, %{
          projeto_id: projeto.id,
          codigo: "T-003",
          titulo: "x",
          tentativas: -1
        })

      refute changeset.valid?
      assert %{tentativas: [_ | _]} = errors_on(changeset)
    end

    test "tarefa replanejada aponta para a original" do
      projeto = projeto!()
      original = tarefa!(projeto, %{codigo: "T-017", status: :cancelada})
      substituta = tarefa!(projeto, %{codigo: "T-017a", replanejada_de_id: original.id})

      lida = Repo.preload(Repo.get!(Tarefa, substituta.id), :replanejada_de)
      assert lida.replanejada_de.codigo == "T-017"
    end
  end

  describe "dependencias" do
    test "tarefa que depende de si mesma e recusada pelo BANCO, com mensagem nomeada" do
      tarefa = tarefa!(projeto!())

      # Quem recusa e o CHECK do banco, nao uma validacao do changeset: o changeset entra
      # valido (nada nele compara os dois campos) e so o `check_constraint` traduz a
      # violacao em erro legivel. E isso que se quer travar aqui — se alguem apagar a
      # constraint da migracao, este teste cai mesmo com o changeset intacto.
      changeset =
        Dependencia.changeset(%Dependencia{}, %{
          tarefa_id: tarefa.id,
          depende_de_id: tarefa.id
        })

      assert changeset.valid?

      {:error, recusado} = Repo.insert(changeset)

      assert %{depende_de_id: ["uma tarefa nao pode depender de si mesma"]} =
               errors_on(recusado)
    end

    test "a mesma aresta duas vezes e recusada" do
      projeto = projeto!()
      uma = tarefa!(projeto)
      outra = tarefa!(projeto)
      atributos = %{tarefa_id: uma.id, depende_de_id: outra.id}

      Repo.insert!(Dependencia.changeset(%Dependencia{}, atributos))

      {:error, changeset} =
        %Dependencia{} |> Dependencia.changeset(atributos) |> Repo.insert()

      refute changeset.valid?
    end
  end

  describe "areas" do
    test "o mesmo arquivo duas vezes na mesma tarefa e recusado" do
      tarefa = tarefa!(projeto!())
      atributos = %{tarefa_id: tarefa.id, caminho: "mix.exs"}

      Repo.insert!(Area.changeset(%Area{}, atributos))

      {:error, changeset} = %Area{} |> Area.changeset(atributos) |> Repo.insert()
      assert %{tarefa_id: ["has already been taken"]} = errors_on(changeset)
    end
  end

  describe "criterios" do
    test "criterio executado guarda o comando" do
      tarefa = tarefa!(projeto!())

      criterio =
        Repo.insert!(
          Criterio.changeset(%Criterio{}, %{
            tarefa_id: tarefa.id,
            texto: "a suite passa",
            comando: "mix verificar",
            grau: :executado
          })
        )

      assert Repo.get!(Criterio, criterio.id).grau == :executado
    end

    test "criterio executado SEM comando e recusado" do
      tarefa = tarefa!(projeto!())

      changeset =
        Criterio.changeset(%Criterio{}, %{
          tarefa_id: tarefa.id,
          texto: "roda",
          grau: :executado
        })

      assert %{comando: ["criterio executado precisa de comando"]} = errors_on(changeset)
    end

    test "criterio com comando mas grau mais fraco e recusado" do
      tarefa = tarefa!(projeto!())

      changeset =
        Criterio.changeset(%Criterio{}, %{
          tarefa_id: tarefa.id,
          texto: "roda",
          comando: "mix test",
          grau: :julgado
        })

      assert %{grau: ["criterio com comando deve ter grau :executado"]} = errors_on(changeset)
    end

    test "grau invalido e recusado" do
      tarefa = tarefa!(projeto!())

      changeset =
        Criterio.changeset(%Criterio{}, %{tarefa_id: tarefa.id, texto: "x", grau: :achismo})

      assert %{grau: ["is invalid"]} = errors_on(changeset)
    end
  end

  describe "especialistas versionados" do
    test "dois ativos com o mesmo identificador sao recusados" do
      projeto = projeto!()

      atributos = %{
        projeto_id: projeto.id,
        identificador: "frontend",
        nome: "Front",
        prompt: "v1"
      }

      Repo.insert!(Especialista.changeset(%Especialista{}, atributos))

      {:error, changeset} =
        %Especialista{} |> Especialista.changeset(atributos) |> Repo.insert()

      assert %{projeto_id: [_ | _]} = errors_on(changeset)
    end

    test "trocar o prompt cria linha nova e o historico fica consultavel" do
      projeto = projeto!()

      base = %{projeto_id: projeto.id, identificador: "frontend", nome: "Front"}

      antigo =
        Repo.insert!(Especialista.changeset(%Especialista{}, Map.put(base, :prompt, "v1")))

      Repo.update!(Especialista.changeset(antigo, %{ativo: false}))
      Repo.insert!(Especialista.changeset(%Especialista{}, Map.put(base, :prompt, "v2")))

      todos =
        Especialista
        |> Repo.all()
        |> Enum.filter(&(&1.projeto_id == projeto.id))

      assert length(todos) == 2
      assert Enum.count(todos, & &1.ativo) == 1
      assert Enum.find(todos, & &1.ativo).prompt == "v2"
    end
  end

  describe "ciclos, despachos e consumos" do
    test "um ciclo por retrabalho, e o consumo por volta soma para o total" do
      tarefa = tarefa!(projeto!())

      ciclo =
        Repo.insert!(
          Ciclo.changeset(%Ciclo{}, %{tarefa_id: tarefa.id, numero: 1, papel: "construtor"})
        )

      despacho =
        Repo.insert!(
          Despacho.changeset(%Despacho{}, %{
            ciclo_id: ciclo.id,
            operario: "Operario.Falso",
            modelo: "haiku-4.5",
            voltas: 2
          })
        )

      for volta <- 1..2 do
        Repo.insert!(
          Consumo.changeset(%Consumo{}, %{
            despacho_id: despacho.id,
            volta: volta,
            tokens_entrada: 100 * volta,
            tokens_cache_leitura: 900 * volta,
            tokens_saida: 10 * volta
          })
        )
      end

      lido = Repo.preload(Repo.get!(Despacho, despacho.id), :consumos)

      assert length(lido.consumos) == 2
      assert Enum.sum(Enum.map(lido.consumos, & &1.tokens_entrada)) == 300
      assert Enum.sum(Enum.map(lido.consumos, & &1.tokens_cache_leitura)) == 2700
    end

    test "a mesma volta duas vezes no mesmo despacho e recusada" do
      tarefa = tarefa!(projeto!())

      ciclo =
        Repo.insert!(
          Ciclo.changeset(%Ciclo{}, %{tarefa_id: tarefa.id, numero: 1, papel: "verificador"})
        )

      despacho =
        Repo.insert!(
          Despacho.changeset(%Despacho{}, %{
            ciclo_id: ciclo.id,
            operario: "Operario.Falso",
            modelo: "haiku-4.5"
          })
        )

      atributos = %{despacho_id: despacho.id, volta: 1}
      Repo.insert!(Consumo.changeset(%Consumo{}, atributos))

      {:error, changeset} = %Consumo{} |> Consumo.changeset(atributos) |> Repo.insert()
      assert %{despacho_id: ["has already been taken"]} = errors_on(changeset)
    end

    test "volta zero e recusada: a contagem comeca em 1" do
      tarefa = tarefa!(projeto!())

      ciclo =
        Repo.insert!(Ciclo.changeset(%Ciclo{}, %{tarefa_id: tarefa.id, numero: 1, papel: "r"}))

      despacho =
        Repo.insert!(
          Despacho.changeset(%Despacho{}, %{ciclo_id: ciclo.id, operario: "o", modelo: "m"})
        )

      changeset = Consumo.changeset(%Consumo{}, %{despacho_id: despacho.id, volta: 0})

      refute changeset.valid?
      assert %{volta: [_ | _]} = errors_on(changeset)
    end

    test "tokens negativos sao recusados" do
      tarefa = tarefa!(projeto!())

      ciclo =
        Repo.insert!(Ciclo.changeset(%Ciclo{}, %{tarefa_id: tarefa.id, numero: 1, papel: "r"}))

      despacho =
        Repo.insert!(
          Despacho.changeset(%Despacho{}, %{ciclo_id: ciclo.id, operario: "o", modelo: "m"})
        )

      changeset =
        Consumo.changeset(%Consumo{}, %{
          despacho_id: despacho.id,
          volta: 1,
          tokens_cache_escrita: -5
        })

      refute changeset.valid?
      assert %{tokens_cache_escrita: [_ | _]} = errors_on(changeset)
    end

    test "apagar a tarefa leva ciclos, despachos e consumos junto" do
      tarefa = tarefa!(projeto!())

      ciclo =
        Repo.insert!(Ciclo.changeset(%Ciclo{}, %{tarefa_id: tarefa.id, numero: 1, papel: "c"}))

      despacho =
        Repo.insert!(
          Despacho.changeset(%Despacho{}, %{ciclo_id: ciclo.id, operario: "o", modelo: "m"})
        )

      Repo.insert!(Consumo.changeset(%Consumo{}, %{despacho_id: despacho.id, volta: 1}))

      Repo.delete!(tarefa)

      refute Repo.get(Ciclo, ciclo.id)
      refute Repo.get(Despacho, despacho.id)
      assert Repo.aggregate(Consumo, :count) == 0
    end
  end
end
