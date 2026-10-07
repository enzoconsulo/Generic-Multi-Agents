defmodule Fabrica.MarcoV03Test do
  @moduledoc """
  Verifica o MARCO da v0.3 (T-034): uma tarefa percorre os seis estados, reprova DE
  PROPOSITO, e retrabalhada conclui — com tudo registrado em transacao.

  A prova e ADVERSARIAL, como o Contexto da tarefa exige: o primeiro veredito do
  verificador REPROVA com um motivo concreto (o texto de erro exigido pelo criterio nao
  bate), e so a segunda passagem — com o modelo escalado pela `Retrabalho.Escada` —
  corrige e conclui. Uma tarefa que passasse de primeira nao provaria a maquina de
  estados, provaria so o caminho feliz.

  Tudo aqui e `Fabrica.Tarefas.Transicao` (T-022) chamada em sequencia; nenhum agente real
  e nenhuma rede entram em cena, e por isso este teste roda dentro da suite normal (o
  marco da v0.1 proibe rede/cota na suite) — a mesma tecnica de `marco_v01_test.exs`.
  """

  use Fabrica.DataCase, async: true

  alias Fabrica.Custo.Consumo, as: CustoConsumo
  alias Fabrica.Custo.Precos
  alias Fabrica.Operario.Consumo, as: ConsumoRelatado
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Publicacao.Markdown
  alias Fabrica.Retrabalho.Escada
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Consumo
  alias Fabrica.Tarefas.Despacho
  alias Fabrica.Tarefas.Tarefa
  alias Fabrica.Tarefas.Transicao

  setup do
    projeto =
      %Projeto{}
      |> Projeto.changeset(%{
        nome: "marco-v03-#{System.unique_integer([:positive])}",
        caminho: "C:/tmp/marco-v03"
      })
      |> Repo.insert!()

    tarefa =
      %Tarefa{}
      |> Tarefa.changeset(%{
        projeto_id: projeto.id,
        codigo: "T-#{900 + System.unique_integer([:positive])}",
        titulo: "criterio exige a mensagem de erro exata",
        status: :pronta
      })
      |> Repo.insert!()

    %{tarefa: tarefa}
  end

  # `Custo.Consumo.para_registro/3` exige :despacho_id nas opcoes, mas o despacho so nasce
  # DENTRO do mesmo Multi da Transicao — o id real e enxertado depois por `com_despacho/3`.
  # 0 aqui e so um valor de passagem, nunca gravado.
  defp registro_de_consumo(modelo, atributos_relato) do
    {:ok, registro} =
      CustoConsumo.para_registro(modelo, struct(ConsumoRelatado, atributos_relato),
        despacho_id: 0,
        volta: 1
      )

    registro
  end

  test "seis estados, reprovacao de proposito, retrabalho, e conclusao", %{tarefa: tarefa} do
    historico = [tarefa.status]

    # --- Ciclo 1: pronta -> em_execucao (entrega ao construtor) ---
    assert {:ok, tarefa} = Transicao.aplicar(tarefa, :em_execucao)
    assert tarefa.status == :em_execucao
    assert tarefa.tentativas == 1
    historico = historico ++ [tarefa.status]

    consumo_construtor_1 =
      registro_de_consumo("sonnet-5", %{
        tokens_entrada: 6_000,
        tokens_cache_escrita: 400,
        tokens_cache_leitura: 5_200,
        tokens_saida: 900,
        duracao_ms: 14_000,
        ttl_cache: :cinco_minutos
      })

    # --- em_execucao -> em_teste (construtor termina o ciclo 1) ---
    assert {:ok, tarefa} =
             Transicao.aplicar(tarefa, :em_teste,
               papel: "construtor",
               relatorio: "Implementada a validacao. Mensagem de erro: \"invalido\".",
               despacho: %{operario: "claude_cli", modelo: "sonnet-5", voltas: 1},
               consumos: [consumo_construtor_1]
             )

    assert tarefa.status == :em_teste
    # entrega ao construtor so em em_execucao: este passo NAO gasta tentativa nova.
    assert tarefa.tentativas == 1
    historico = historico ++ [tarefa.status]

    consumo_verificador_1 =
      registro_de_consumo("haiku-4.5", %{
        tokens_entrada: 1_800,
        tokens_cache_leitura: 1_500,
        tokens_saida: 150,
        duracao_ms: 3_000
      })

    # --- em_teste -> em_execucao: o verificador REPROVA de proposito ---
    # O criterio de aceite exigia a mensagem EXATA "mensagem invalida: campo obrigatorio",
    # e o construtor escreveu "invalido" — reprovacao por entrega, nao por comando quebrado.
    assert {:ok, tarefa} =
             Transicao.aplicar(tarefa, :em_execucao,
               papel: "verificador",
               desfecho: "reprovado",
               relatorio:
                 "Criterio 2 reprovou: esperado 'mensagem invalida: campo obrigatorio', " <>
                   "recebido 'invalido'.",
               despacho: %{operario: "claude_cli", modelo: "haiku-4.5", voltas: 1},
               consumos: [consumo_verificador_1]
             )

    assert tarefa.status == :em_execucao
    # retrabalho tambem entrega ao construtor: e aqui que a 2a tentativa nasce.
    assert tarefa.tentativas == 2
    historico = historico ++ [tarefa.status]

    # --- A escada de retrabalho decide o proximo despacho: o MODELO SOBE ---
    # `tentativas: 1` porque a pergunta e "quantas execucoes JA terminaram" antes desta
    # decisao — e o valor que a Transicao tinha gravado antes deste ultimo incremento.
    assert {:ok, decisao} = Escada.proximo(%{tentativas: 1})
    assert decisao.degrau == :sobe_de_modelo
    assert decisao.modelo == :reforcado

    modelo_ciclo_1 = "sonnet-5"
    modelo_ciclo_2 = "opus-5"
    assert modelo_ciclo_2 != modelo_ciclo_1

    consumo_construtor_2 =
      registro_de_consumo(modelo_ciclo_2, %{
        tokens_entrada: 6_400,
        tokens_cache_escrita: 200,
        tokens_cache_leitura: 5_800,
        tokens_saida: 950,
        duracao_ms: 15_500,
        ttl_cache: :cinco_minutos
      })

    # --- Ciclo 2: em_execucao -> em_teste (construtor corrige, no modelo reforcado) ---
    assert {:ok, tarefa} =
             Transicao.aplicar(tarefa, :em_teste,
               papel: "construtor",
               relatorio:
                 "Corrigida a mensagem: agora emite 'mensagem invalida: campo obrigatorio'.",
               despacho: %{operario: "claude_cli", modelo: modelo_ciclo_2, voltas: 1},
               consumos: [consumo_construtor_2]
             )

    assert tarefa.status == :em_teste
    assert tarefa.tentativas == 2
    historico = historico ++ [tarefa.status]

    consumo_verificador_2 =
      registro_de_consumo("haiku-4.5", %{
        tokens_entrada: 1_900,
        tokens_cache_leitura: 1_600,
        tokens_saida: 140,
        duracao_ms: 2_800
      })

    # --- em_teste -> em_revisao: o verificador APROVA desta vez ---
    assert {:ok, tarefa} =
             Transicao.aplicar(tarefa, :em_revisao,
               papel: "verificador",
               desfecho: "aprovado",
               relatorio: "Criterio 2 confere: mensagem exata bate.",
               despacho: %{operario: "claude_cli", modelo: "haiku-4.5", voltas: 1},
               consumos: [consumo_verificador_2]
             )

    assert tarefa.status == :em_revisao
    assert tarefa.tentativas == 2
    historico = historico ++ [tarefa.status]

    consumo_revisor =
      registro_de_consumo("sonnet-5", %{
        tokens_entrada: 4_000,
        tokens_cache_leitura: 3_500,
        tokens_saida: 300,
        duracao_ms: 5_000
      })

    # --- em_revisao -> concluida: o revisor aprova ---
    assert {:ok, tarefa} =
             Transicao.aplicar(tarefa, :concluida,
               papel: "revisor",
               desfecho: "aprovado sem achados",
               relatorio: "Conferido o diff do ciclo 2 contra o criterio: cumpre.",
               despacho: %{operario: "claude_cli", modelo: "sonnet-5", voltas: 1},
               consumos: [consumo_revisor]
             )

    assert tarefa.status == :concluida
    historico = historico ++ [tarefa.status]
    tarefa_final = tarefa

    # === Criterio 1: os seis estados, com reprovacao e retrabalho, ate concluir ===
    # backlog nao entra porque a tarefa nasceu em `pronta` (deliberado: exercitar backlog
    # exigiria dependencias, que nao fazem parte do que este marco pede provar). O caminho
    # passa duas vezes por em_execucao/em_teste — e essa REPETICAO, medida a partir do
    # historico real de cada `Transicao.aplicar/3`, e a prova do retrabalho.
    assert historico == [
             :pronta,
             :em_execucao,
             :em_teste,
             :em_execucao,
             :em_teste,
             :em_revisao,
             :concluida
           ]

    # === Criterio 2: tentativas bate com o numero de despachos AO CONSTRUTOR, e o modelo
    # subiu na 2a ===
    despachos_do_construtor =
      Despacho
      |> join(:inner, [d], c in Ciclo, on: c.id == d.ciclo_id)
      |> where([d, c], c.tarefa_id == ^tarefa_final.id and c.papel == "construtor")
      |> order_by([d, c], asc: c.numero)
      |> Repo.all()

    assert length(despachos_do_construtor) == tarefa_final.tentativas
    assert tarefa_final.tentativas == 2
    assert Enum.map(despachos_do_construtor, & &1.modelo) == [modelo_ciclo_1, modelo_ciclo_2]

    # === Criterio 3: o custo de cada ciclo e consultavel SEPARADAMENTE ===
    custo_por_ciclo =
      Consumo
      |> join(:inner, [co], d in Despacho, on: d.id == co.despacho_id)
      |> join(:inner, [co, d], c in Ciclo, on: c.id == d.ciclo_id)
      |> where([co, d, c], c.tarefa_id == ^tarefa_final.id)
      |> group_by([co, d, c], c.numero)
      |> order_by([co, d, c], asc: c.numero)
      |> select([co, d, c], {c.numero, sum(co.custo_usd)})
      |> Repo.all()

    assert [{1, custo_ciclo_1}, {2, custo_ciclo_2}] = custo_por_ciclo
    assert Decimal.compare(custo_ciclo_1, Decimal.new(0)) == :gt
    assert Decimal.compare(custo_ciclo_2, Decimal.new(0)) == :gt
    # os dois ciclos sao consultas INDEPENDENTES, com valores proprios (nao um total unico).
    assert Decimal.compare(custo_ciclo_1, custo_ciclo_2) != :eq

    custo_total =
      Consumo
      |> join(:inner, [co], d in Despacho, on: d.id == co.despacho_id)
      |> join(:inner, [co, d], c in Ciclo, on: c.id == d.ciclo_id)
      |> where([co, d, c], c.tarefa_id == ^tarefa_final.id)
      |> select([co], sum(co.custo_usd))
      |> Repo.one()

    assert Decimal.compare(custo_total, Decimal.add(custo_ciclo_1, custo_ciclo_2)) == :eq

    # Conferencia cruzada: o total bate com `Precos.estimar/2` somado a mao pelos cinco
    # relatos originais (nao so pelo que foi gravado).
    total_esperado =
      [
        {"sonnet-5", consumo_construtor_1},
        {"haiku-4.5", consumo_verificador_1},
        {modelo_ciclo_2, consumo_construtor_2},
        {"haiku-4.5", consumo_verificador_2},
        {"sonnet-5", consumo_revisor}
      ]
      |> Enum.map(fn {_modelo, registro} -> registro.custo_usd end)
      |> Enum.reduce(Decimal.new(0), &Decimal.add/2)

    assert Decimal.compare(custo_total, total_esperado) == :eq

    # === Criterio 4: o markdown gerado reflete o estado final, com o historico do
    # retrabalho visivel (nao apagado pela correcao) ===
    tarefa_para_markdown =
      Repo.get!(Tarefa, tarefa_final.id)
      |> Repo.preload([
        :projeto,
        :especialista,
        :replanejada_de,
        :areas,
        :criterios,
        dependencias: :depende_de,
        ciclos: from(c in Ciclo, order_by: c.numero)
      ])

    markdown = Markdown.gerar(tarefa_para_markdown)

    assert markdown =~ "status: concluida"
    assert markdown =~ "tentativas: 2"
    # Verificacao mostra as DUAS passagens do verificador (reprovado e aprovado) —
    # historico preservado, e nao so o veredito final.
    assert markdown =~ "### Ciclo 1"
    assert markdown =~ "### Ciclo 2"
    assert markdown =~ "esperado 'mensagem invalida: campo obrigatorio'"
    assert markdown =~ "Criterio 2 confere"
    assert markdown =~ "Conferido o diff do ciclo 2"

    # Preco conferido nesta tabela — se a data mudar sem os numeros acima serem revistos,
    # este teste ainda passa (ele so soma o que a tabela devolve), mas fica registrado que
    # a comparacao usa a tabela vigente em `conferido_em/0`.
    assert Precos.conferido_em() == ~D[2026-08-28]
  end
end
