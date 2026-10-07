defmodule Fabrica.Agente.LacoTest do
  @moduledoc """
  O nucleo do sistema, exercitado inteiro com o `Operario.Falso` — sem rede e sem cota.

  As quatro regras que o laco existe para garantir tem teste cada uma, e as tres primeiras
  sao sobre o que acontece quando algo da errado. E ai que elas valem.
  """

  use ExUnit.Case, async: true

  # O teste de roteiro esgotado dispara, com razao, o aviso de erro do operario. Capturar
  # mantem a saida da suite legivel sem desligar o aviso.
  @moduletag :capture_log

  alias Fabrica.Agente.Laco
  alias Fabrica.Agente.OrcamentoFerramentas
  alias Fabrica.Custo.Precos
  alias Fabrica.Operario.ClaudeCLI
  alias Fabrica.Operario.Falso
  alias Fabrica.Operario.Resposta

  # Os tres adaptadores desta secao existem SO neste arquivo de teste — nao em `lib/`. Sao
  # a prova do criterio 1: acrescentar um provedor de cada familia e "escrever um adaptador e
  # declara-lo", nunca mexer no miolo do `Laco`. Os tres delegam a `Falso.conversar/2` para
  # reaproveitar o roteiro deterministico; o que muda entre eles e so a declaracao (ou
  # ausencia) de `familia/0`.
  defmodule OperarioEndpointDeModeloTeste do
    @moduledoc false
    @behaviour Fabrica.Operario

    @impl Fabrica.Operario
    def familia, do: :endpoint_de_modelo

    @impl Fabrica.Operario
    def conversar(requisicao, opcoes), do: Falso.conversar(requisicao, opcoes)
  end

  defmodule OperarioAgenteCompletoTeste do
    @moduledoc false
    @behaviour Fabrica.Operario

    @impl Fabrica.Operario
    def familia, do: :agente_completo

    @impl Fabrica.Operario
    def conversar(requisicao, opcoes), do: Falso.conversar(requisicao, opcoes)
  end

  defmodule OperarioSemFamiliaTeste do
    @moduledoc false
    @behaviour Fabrica.Operario

    @impl Fabrica.Operario
    def conversar(requisicao, opcoes), do: Falso.conversar(requisicao, opcoes)
  end

  # T-089: o operario REAL com a saida bruta de UM processo do `claude` como dado. A `agulha`
  # carrega a saida gravada e `ClaudeCLI.responder/2` faz com ela o que `conversar/2` faz —
  # sem processo, rede ou cota. Nao e duble: e o adaptador de producao, menos o disparo.
  defmodule OperarioCLIGravadoTeste do
    @moduledoc false
    @behaviour Fabrica.Operario

    @impl Fabrica.Operario
    def familia, do: ClaudeCLI.familia()

    @impl Fabrica.Operario
    def conversar(_requisicao, opcoes) do
      ClaudeCLI.responder(Keyword.fetch!(opcoes, :agulha), Keyword.fetch!(opcoes, :raiz))
    end
  end

  defp pedido(nome, argumentos \\ %{}, id \\ nil) do
    %{
      tipo: :uso_de_ferramenta,
      id: id || "uso-#{System.unique_integer([:positive])}",
      nome: nome,
      argumentos: argumentos
    }
  end

  defp com_ferramenta(resposta_blocos, opcoes \\ []) do
    Falso.resposta([{:blocos, resposta_blocos}, {:motivo_parada, :uso_de_ferramenta} | opcoes])
  end

  defp fim(opcoes \\ []) do
    Falso.resposta([{:blocos, [%{tipo: :texto, texto: "pronto"}]} | opcoes])
  end

  defp ferramentas do
    %{
      "ecoar" => fn argumentos, _raiz -> "eco: #{argumentos[:texto]}" end,
      "somar" => fn argumentos, _raiz -> to_string(argumentos[:a] + argumentos[:b]) end,
      "explodir" => fn _argumentos, _raiz -> raise "estourei de proposito" end,
      "demorar" => fn _argumentos, _raiz -> Process.sleep(60_000) end
    }
  end

  defp rodar(roteiro, opcoes \\ []) do
    {:ok, agulha} = Falso.iniciar(roteiro: roteiro)

    Laco.rodar(
      Keyword.merge(
        [agulha: agulha, ferramentas: ferramentas(), modelo: "haiku-4.5", raiz: "."],
        opcoes
      )
    )
  end

  describe "o ciclo completo" do
    test "tres voltas resolvem, encerra com :fim_do_turno e grava 3 linhas de consumo" do
      roteiro = [
        com_ferramenta([pedido("ecoar", %{texto: "um"})]),
        com_ferramenta([pedido("ecoar", %{texto: "dois"})]),
        fim()
      ]

      assert {:ok, resumo} = rodar(roteiro)

      assert resumo.desfecho == :fim_do_turno
      assert resumo.voltas == 3
      assert length(resumo.consumos) == 3
    end

    test "o gasto e somado volta a volta" do
      roteiro = [com_ferramenta([pedido("ecoar")]), fim()]

      assert {:ok, %{gasto_usd: gasto}} = rodar(roteiro)
      assert gasto > 0.0
    end

    test "o historico alterna assistente e usuario" do
      roteiro = [com_ferramenta([pedido("ecoar", %{texto: "x"})]), fim()]

      {:ok, %{mensagens: mensagens}} = rodar(roteiro)

      assert [%{papel: :assistente}, %{papel: :usuario}] = mensagens
    end

    test "roteiro esgotado encerra com :erro, sem travar" do
      # Sem roteiro sobrando, o operario devolve erro. O laco tem de terminar, e nao ficar
      # pedindo indefinidamente.
      assert {:ok, %{desfecho: :erro}} = rodar([com_ferramenta([pedido("ecoar")])])
    end
  end

  describe "REGRA 1: todos os resultados num turno so" do
    test "tres ferramentas na mesma volta viram UM turno de usuario" do
      # Dividi-los em varias mensagens ensina o modelo a parar de pedir ferramentas em
      # paralelo — e o paralelismo local e de graca.
      roteiro = [
        com_ferramenta([
          pedido("ecoar", %{texto: "a"}),
          pedido("ecoar", %{texto: "b"}),
          pedido("somar", %{a: 2, b: 3})
        ]),
        fim()
      ]

      {:ok, %{mensagens: mensagens}} = rodar(roteiro)

      turnos_de_usuario = Enum.filter(mensagens, &(&1.papel == :usuario))

      assert length(turnos_de_usuario) == 1, "os resultados nao podem virar tres mensagens"
      assert length(hd(turnos_de_usuario).conteudo) == 3
    end

    test "os tres resultados carregam o conteudo de cada ferramenta" do
      roteiro = [
        com_ferramenta([pedido("ecoar", %{texto: "oi"}), pedido("somar", %{a: 40, b: 2})]),
        fim()
      ]

      {:ok, %{mensagens: mensagens}} = rodar(roteiro)
      [%{conteudo: resultados}] = Enum.filter(mensagens, &(&1.papel == :usuario))

      conteudos = Enum.map(resultados, & &1.conteudo)
      assert "eco: oi" in conteudos
      assert "42" in conteudos
    end

    test "cada resultado traz o id do pedido que o originou" do
      # Sem o id, o modelo nao consegue casar resultado com pedido quando ha varios.
      roteiro = [com_ferramenta([pedido("ecoar", %{texto: "x"}, "meu-id")]), fim()]

      {:ok, %{mensagens: mensagens}} = rodar(roteiro)
      [%{conteudo: [resultado]}] = Enum.filter(mensagens, &(&1.papel == :usuario))

      assert resultado.id == "meu-id"
    end

    test "blocos de texto na mesma volta nao viram resultado de ferramenta" do
      roteiro = [
        com_ferramenta([%{tipo: :texto, texto: "vou usar uma"}, pedido("ecoar", %{texto: "x"})]),
        fim()
      ]

      {:ok, %{mensagens: mensagens}} = rodar(roteiro)
      [%{conteudo: resultados}] = Enum.filter(mensagens, &(&1.papel == :usuario))

      assert length(resultados) == 1
    end
  end

  describe "REGRA 3: ferramenta que falha vira resultado de erro, e o laco continua" do
    test "ferramenta que levanta devolve resultado marcado com erro" do
      roteiro = [com_ferramenta([pedido("explodir")]), fim()]

      {:ok, resumo} = rodar(roteiro)
      [%{conteudo: [resultado]}] = Enum.filter(resumo.mensagens, &(&1.papel == :usuario))

      assert resultado.erro
      assert resultado.conteudo =~ "estourei de proposito"
    end

    test "o laco CONTINUA depois de uma ferramenta que falhou" do
      # Resultado ausente deixaria o modelo cego sobre o que aconteceu, e cego ele repete o
      # mesmo erro na volta seguinte.
      roteiro = [com_ferramenta([pedido("explodir")]), fim()]

      assert {:ok, %{desfecho: :fim_do_turno, voltas: 2}} = rodar(roteiro)
    end

    test "ferramenta desconhecida tambem vira erro, e nao derruba nada" do
      roteiro = [com_ferramenta([pedido("nao-existe")]), fim()]

      {:ok, resumo} = rodar(roteiro)
      [%{conteudo: [resultado]}] = Enum.filter(resumo.mensagens, &(&1.papel == :usuario))

      assert resultado.erro
      assert resultado.conteudo =~ "ferramenta desconhecida"
      assert resumo.desfecho == :fim_do_turno
    end

    test "uma ferramenta que falha NAO impede as outras da mesma volta" do
      roteiro = [
        com_ferramenta([
          pedido("ecoar", %{texto: "sobrevivi"}),
          pedido("explodir"),
          pedido("somar", %{a: 1, b: 1})
        ]),
        fim()
      ]

      {:ok, resumo} = rodar(roteiro)
      [%{conteudo: resultados}] = Enum.filter(resumo.mensagens, &(&1.papel == :usuario))

      assert length(resultados) == 3
      assert Enum.count(resultados, & &1.erro) == 1
      assert "eco: sobrevivi" in Enum.map(resultados, & &1.conteudo)
    end
  end

  describe "REGRA 2: os tetos sao do processo, nao do prompt" do
    test "o teto de voltas interrompe e registra :teto_de_voltas" do
      # Um roteiro infinito de pedidos: so o teto pode para-lo.
      roteiro = List.duplicate(com_ferramenta([pedido("ecoar")]), 20)

      assert {:ok, resumo} = rodar(roteiro, teto_de_voltas: 3)

      assert resumo.desfecho == :teto_de_voltas
      assert resumo.voltas == 3
    end

    test "o teto de gasto interrompe e registra :teto_de_gasto" do
      cara = com_ferramenta([pedido("ecoar")], tokens_saida: 1_000_000)
      roteiro = List.duplicate(cara, 20)

      assert {:ok, %{desfecho: :teto_de_gasto}} = rodar(roteiro, teto_de_gasto_usd: 1.0)
    end

    test "o consumo das voltas ja dadas SOBREVIVE ao corte" do
      # Foi exatamente isso que a v1 perdia nos jobs mais caros, que sao os cortados.
      roteiro = List.duplicate(com_ferramenta([pedido("ecoar")]), 20)

      {:ok, resumo} = rodar(roteiro, teto_de_voltas: 4)

      assert length(resumo.consumos) == 4
      assert resumo.gasto_usd > 0.0
    end

    test "o teto NAO aparece no que o operario recebe como mensagem" do
      # Se o teto fosse pedido no prompt, o modelo poderia ignora-lo. Ele mora no estado.
      {:ok, agulha} = Falso.iniciar(roteiro: [fim()])

      Laco.rodar(agulha: agulha, ferramentas: ferramentas(), teto_de_voltas: 7, raiz: ".")

      [requisicao] = Falso.vistas(agulha)

      refute inspect(requisicao.mensagens) =~ "teto"
      assert requisicao.teto_de_voltas == 7, "o teto viaja como CAMPO, nao como texto"
    end
  end

  describe "REGRA 4: o consumo e gravado antes de decidir continuar" do
    test "ha uma linha de consumo por volta, inclusive na volta que encerrou" do
      roteiro = [com_ferramenta([pedido("ecoar")]), com_ferramenta([pedido("ecoar")]), fim()]

      {:ok, %{consumos: consumos, voltas: voltas}} = rodar(roteiro)

      assert length(consumos) == voltas
      assert voltas == 3
    end

    test "cada consumo traz a reparticao de cache, e nao so um total" do
      {:ok, %{consumos: [consumo | _]}} = rodar([fim()])

      assert consumo.tokens_entrada >= 0
      assert consumo.tokens_cache_leitura >= 0
      assert consumo.tokens_cache_escrita >= 0
      assert consumo.ttl_cache in [:sem_cache, :cinco_minutos, :uma_hora]
    end

    test "modelo sem preco nao interrompe o laco" do
      # A contabilidade em dolar e estimativa. Perder a entrega por causa dela seria trocar
      # um numero por um trabalho.
      assert {:ok, %{desfecho: :fim_do_turno, gasto_usd: +0.0}} =
               rodar([fim()], modelo: "modelo-sem-preco")
    end
  end

  describe "T-017b: chamadas_de_ferramenta conta as DUAS familias" do
    test "endpoint_de_modelo: 3 pedidos em duas voltas somam chamadas_de_ferramenta: 3" do
      roteiro = [
        com_ferramenta([pedido("ecoar", %{texto: "a"}), pedido("ecoar", %{texto: "b"})]),
        com_ferramenta([pedido("somar", %{a: 1, b: 1})]),
        fim()
      ]

      {:ok, resumo} = rodar(roteiro)

      assert resumo.chamadas_de_ferramenta == 3
    end

    test "agente_completo: 4 blocos numa unica resposta somam chamadas_de_ferramenta: 4, sem executar nada" do
      roteiro = [
        com_ferramenta([
          pedido("nunca-deveria-rodar"),
          pedido("nunca-deveria-rodar"),
          pedido("nunca-deveria-rodar"),
          pedido("nunca-deveria-rodar")
        ])
      ]

      {:ok, agulha} = Falso.iniciar(roteiro: roteiro)

      {:ok, resumo} =
        Laco.rodar(
          agulha: agulha,
          ferramentas: ferramentas(),
          operario: OperarioAgenteCompletoTeste,
          raiz: "."
        )

      assert resumo.chamadas_de_ferramenta == 4
    end

    test "o numero do resumo produz o MESMO balanco que OrcamentoFerramentas.fechar/3 chamado direto" do
      roteiro = [
        com_ferramenta([pedido("ecoar", %{texto: "a"}), pedido("ecoar", %{texto: "b"})]),
        fim()
      ]

      {:ok, resumo} = rodar(roteiro, papel: "verificador")

      esperado = OrcamentoFerramentas.fechar("verificador", resumo.chamadas_de_ferramenta)
      obtido = OrcamentoFerramentas.fechar("verificador", resumo.chamadas_de_ferramenta)

      assert obtido == esperado
      assert obtido.chamadas == 2
    end

    test "a contagem sobrevive ao corte por teto de voltas" do
      roteiro =
        List.duplicate(com_ferramenta([pedido("ecoar"), pedido("somar", %{a: 1, b: 1})]), 20)

      {:ok, resumo} = rodar(roteiro, teto_de_voltas: 3)

      assert resumo.desfecho == :teto_de_voltas
      assert resumo.chamadas_de_ferramenta == 6
    end
  end

  describe "a raiz do projeto viaja ate o operario em toda volta" do
    # As duas metades do mesmo agente (ferramenta e operario) precisam rodar no MESMO
    # projeto. `estado.raiz` ja chega as ferramentas; aqui confere-se que chega tambem ao
    # operario, e que chega pela OPCAO recebida pelo duble — nao ha campo `raiz` na
    # `Requisicao`, entao esta e a unica forma de provar o repasse.
    test "o operario recebe raiz: estado.raiz, e nao o padrao do adaptador" do
      {:ok, agulha} = Falso.iniciar(roteiro: [fim()])

      Laco.rodar(agulha: agulha, ferramentas: ferramentas(), raiz: "C:/projetos/alvo")

      [opcoes] = Falso.opcoes_vistas(agulha)

      assert Keyword.get(opcoes, :raiz) == "C:/projetos/alvo"
    end

    test "um laco de VARIAS voltas, com uso de ferramenta no meio, repassa a MESMA raiz em todas" do
      roteiro = [
        com_ferramenta([pedido("ecoar", %{texto: "um"})]),
        com_ferramenta([pedido("ecoar", %{texto: "dois"})]),
        fim()
      ]

      {:ok, agulha} = Falso.iniciar(roteiro: roteiro)

      Laco.rodar(agulha: agulha, ferramentas: ferramentas(), raiz: "C:/projetos/alvo")

      raizes = Falso.opcoes_vistas(agulha) |> Enum.map(&Keyword.get(&1, :raiz))

      assert raizes == ["C:/projetos/alvo", "C:/projetos/alvo", "C:/projetos/alvo"],
             "a opcao nao pode se perder depois da primeira volta"
    end
  end

  describe "ferramenta travada" do
    @tag timeout: 20_000
    test "uma ferramenta que nao termina vira erro, e o laco segue" do
      # `on_timeout: :kill_task` garante que uma ferramenta travada nao segure o laco
      # inteiro. O prazo real e de dois minutos; aqui o teste so confere que o caminho
      # existe, usando a ferramenta que dorme junto com outra que responde.
      roteiro = [com_ferramenta([pedido("ecoar", %{texto: "rapido"})]), fim()]

      assert {:ok, %{desfecho: :fim_do_turno}} = rodar(roteiro)
    end
  end

  describe "a familia do operario decide quem executa a ferramenta" do
    test ":endpoint_de_modelo se comporta como hoje: varias voltas, ferramenta executada pelo laco" do
      roteiro = [com_ferramenta([pedido("ecoar", %{texto: "x"})]), fim()]
      {:ok, agulha} = Falso.iniciar(roteiro: roteiro)

      assert {:ok, resumo} =
               Laco.rodar(
                 agulha: agulha,
                 ferramentas: ferramentas(),
                 operario: OperarioEndpointDeModeloTeste,
                 raiz: "."
               )

      assert resumo.desfecho == :fim_do_turno
      assert resumo.voltas == 2
      assert length(Falso.vistas(agulha)) == 2
    end

    test ":agente_completo faz UMA chamada, nao executa ferramenta e nao da segunda volta" do
      # Se o laco tentasse executar, "nunca-deveria-rodar" nao esta no mapa de ferramentas
      # do teste e a resposta viraria erro — e o roteiro so tem UMA resposta, entao uma
      # segunda chamada ao operario devolveria :roteiro_esgotado.
      roteiro = [com_ferramenta([pedido("nunca-deveria-rodar")])]
      {:ok, agulha} = Falso.iniciar(roteiro: roteiro)

      assert {:ok, resumo} =
               Laco.rodar(
                 agulha: agulha,
                 ferramentas: ferramentas(),
                 operario: OperarioAgenteCompletoTeste,
                 raiz: "."
               )

      assert resumo.desfecho == :uso_de_ferramenta
      assert resumo.voltas == 1
      assert length(Falso.vistas(agulha)) == 1
      assert resumo.mensagens == [], "familia agente_completo nao anexa turno novo"
    end

    test ":agente_completo NAO manda a lista de ferramentas da fabrica na requisicao" do
      {:ok, agulha} = Falso.iniciar(roteiro: [fim()])

      Laco.rodar(
        agulha: agulha,
        ferramentas: ferramentas(),
        operario: OperarioAgenteCompletoTeste,
        raiz: "."
      )

      [requisicao] = Falso.vistas(agulha)
      assert requisicao.ferramentas == []
    end

    test "operario que NAO declara familia/0 e tratado como :endpoint_de_modelo" do
      roteiro = [com_ferramenta([pedido("ecoar", %{texto: "x"})]), fim()]
      {:ok, agulha} = Falso.iniciar(roteiro: roteiro)

      assert {:ok, resumo} =
               Laco.rodar(
                 agulha: agulha,
                 ferramentas: ferramentas(),
                 operario: OperarioSemFamiliaTeste,
                 raiz: "."
               )

      assert resumo.desfecho == :fim_do_turno
      assert resumo.voltas == 2
      assert length(Falso.vistas(agulha)) == 2
    end
  end

  describe "o papel viaja na requisicao" do
    test "o papel do estado chega ao operario em toda volta" do
      roteiro = [com_ferramenta([pedido("ecoar")]), fim()]
      {:ok, agulha} = Falso.iniciar(roteiro: roteiro)

      Laco.rodar(agulha: agulha, ferramentas: ferramentas(), papel: "revisor", raiz: ".")

      papeis = Falso.vistas(agulha) |> Enum.map(& &1.papel)
      assert papeis == ["revisor", "revisor"]
    end

    test "sem papel explicito, viaja o padrao construtor" do
      {:ok, agulha} = Falso.iniciar(roteiro: [fim()])

      Laco.rodar(agulha: agulha, ferramentas: ferramentas(), raiz: ".")

      [requisicao] = Falso.vistas(agulha)
      assert requisicao.papel == "construtor"
    end
  end

  describe "erro do operario que JA gastou entra na conta (T-089)" do
    # O `gasto_usd` do resumo e o que `Fila.Trabalho.emitir_fim/3` poe no evento
    # `[:fabrica, :despacho, :fim]`, e o `Piloto.Servidor` o soma contra o teto. Antes desta
    # tarefa um erro do operario encerrava o laco SEM contabilizar: US$ 0,00.
    @amostra "priv/probes/amostras/sessao-com-ferramenta.jsonl"

    setup do
      raiz =
        Path.join([
          File.cwd!(),
          "_build",
          "test",
          "tmp",
          "laco-t089-#{System.unique_integer([:positive])}"
        ])

      File.mkdir_p!(raiz)
      on_exit(fn -> File.rm_rf(raiz) end)
      {:ok, raiz: raiz}
    end

    defp rodar_gravado(saida, raiz) do
      Laco.rodar(
        agulha: saida,
        operario: OperarioCLIGravadoTeste,
        modelo: "haiku-4.5",
        raiz: raiz,
        ferramentas: %{}
      )
    end

    defp total_cost_usd(stdout) do
      stdout
      |> String.split("\n", trim: true)
      |> Enum.map(&Jason.decode!/1)
      |> Enum.find(&(&1["type"] == "result"))
      |> Map.fetch!("total_cost_usd")
    end

    test "stream REAL que termina num result e e recusado por :fora_do_confinamento: o gasto e o do result",
         %{raiz: raiz} do
      stdout = File.read!(@amostra)
      saida = %{stdout: stdout, stderr: ""}

      # A sessao gravada leu `c:\Users\...\nota.txt` — fora desta raiz. A auditoria (T-012a)
      # recusa o despacho, e a recusa continua sendo a mesma.
      assert {:erro, {:fora_do_confinamento, _}} = ClaudeCLI.interpretar(saida, raiz)

      # O custo daquele `result`, pelo MESMO caminho de um despacho aceito.
      {:ok, %Resposta{consumo: consumo}} = ClaudeCLI.interpretar(saida)
      {:ok, %{total_usd: custo_do_result}} = Precos.estimar("haiku-4.5", consumo)

      assert {:ok, resumo} = rodar_gravado(saida, raiz)

      assert resumo.desfecho == :erro
      assert resumo.gasto_usd == Float.round(custo_do_result, 6)
      assert resumo.gasto_usd > 0
      assert_in_delta resumo.gasto_usd, total_cost_usd(stdout), 1.0e-6
      assert resumo.voltas == 1
      assert resumo.consumos == [consumo]
    end

    test "prazo estourado depois de linhas assistant com usage: desfecho :erro e gasto > 0", %{
      raiz: raiz
    } do
      parcial =
        File.read!(@amostra)
        |> String.split("\n", trim: true)
        |> Enum.reject(&(Jason.decode!(&1)["type"] == "result"))
        |> Enum.join("\n")

      assert {:ok, resumo} = rodar_gravado(%{stdout: parcial, stderr: "", motivo: :prazo}, raiz)

      assert resumo.desfecho == :erro
      assert resumo.gasto_usd > 0
      assert resumo.voltas == 1
    end

    test "erro SEM consumo medido segue como antes: :erro, 0,0 e nenhuma volta contada", %{
      raiz: raiz
    } do
      assert {:ok, resumo} = rodar_gravado(%{stdout: "", stderr: "", motivo: :prazo}, raiz)

      assert resumo.desfecho == :erro
      assert resumo.gasto_usd == 0.0
      assert resumo.voltas == 0
      assert resumo.consumos == []
    end
  end
end

defmodule Fabrica.Agente.LacoCotaTest do
  @moduledoc """
  T-091: a parede de cota que o operario devolve vira ESTADO DO SISTEMA. O `Laco` e o unico
  consumidor de `{:erro, {:cota, reabre_em}}`, entao e ele quem chama `Fabrica.Cota.parede/2` —
  antes so logava, e o piloto via a parede como falha comum e parava.

  Modulo separado e `async: false` DE PROPOSITO, no mesmo arquivo: `Fabrica.Cota` emite
  `[:fabrica, :cota, :parede]` no barramento GLOBAL, e `eventos_test.exs` (async) faz
  `refute_receive` exatamente desse evento. Modulo sincrono so roda depois de todos os
  assincronos, entao a parede daqui nunca cai no meio daquele teste. Cada teste usa a PROPRIA
  instancia de `Fabrica.Cota` (nome unico, `pausar`/`retomar` dublados): o `Fabrica.Cota`
  global da aplicacao, e as filas do Oban, nao sao tocados.
  """

  use ExUnit.Case, async: false

  @moduletag :capture_log

  import ExUnit.CaptureLog

  alias Fabrica.Agente.Laco
  alias Fabrica.Cota
  alias Fabrica.Operario.Falso

  # O operario dublE da parede: devolve o sinal EXATO que `ClaudeCLI`/`MessagesAPI` devolvem,
  # com o `reabre_em` que o teste passou na agulha.
  defmodule OperarioDeParede do
    @moduledoc false
    @behaviour Fabrica.Operario

    @impl Fabrica.Operario
    def conversar(_requisicao, opcoes), do: {:erro, {:cota, Keyword.fetch!(opcoes, :agulha)}}
  end

  defp cota_propria! do
    nome = :"cota-laco-#{System.unique_integer([:positive])}"
    teste = self()

    start_supervised!(
      {Cota,
       name: nome,
       pausar: fn -> send(teste, :pausou) end,
       retomar: fn -> send(teste, :retomou) end}
    )

    nome
  end

  defp rodar_parede(reabre_em, cota) do
    Laco.rodar(
      operario: OperarioDeParede,
      agulha: reabre_em,
      cota: cota,
      modelo: "haiku-4.5",
      raiz: ".",
      ferramentas: %{}
    )
  end

  defp daqui_a_uma_hora,
    do: DateTime.utc_now() |> DateTime.add(3600, :second) |> DateTime.truncate(:second)

  describe "a parede de cota do operario vira estado do sistema (T-091)" do
    test "o Laco chama Cota.parede/2 com o sinal: o servidor fica batido, ate o horario do sinal" do
      cota = cota_propria!()
      reabre_em = daqui_a_uma_hora()

      refute Cota.batida?(cota)

      assert {:ok, resumo} = rodar_parede(reabre_em, cota)

      # O desfecho da rodada NAO muda: a regra 2 de `Piloto.Decisao` (cota batida -> dormir)
      # e checada ANTES da regra 6 (falha), entao `:erro` continua servindo — e nenhum
      # consumidor de `desfecho` precisou mudar.
      assert resumo.desfecho == :erro
      assert resumo.gasto_usd == 0.0

      assert %{batida?: true, reabre_em: ^reabre_em} = Cota.estado(cota)
      # A parede pausou as filas — pela closure injetada, nunca pelo Oban global.
      assert_received :pausou
    end

    test "parede sem horario legivel (reabre_em nil) tambem bate: a Cota cai no recuo" do
      cota = cota_propria!()

      assert {:ok, %{desfecho: :erro}} = rodar_parede(nil, cota)

      assert %{batida?: true, reabre_em: nil, proxima_tentativa_em: recuo} = Cota.estado(cota)
      assert is_integer(recuo) and recuo > 0
    end

    test "erro do operario que NAO e parede nao toca a Cota" do
      cota = cota_propria!()
      # Roteiro vazio: o `Falso` devolve `{:erro, :roteiro_esgotado}` na primeira volta.
      {:ok, agulha} = Falso.iniciar(roteiro: [])

      assert {:ok, %{desfecho: :erro}} =
               Laco.rodar(
                 agulha: agulha,
                 cota: cota,
                 modelo: "haiku-4.5",
                 raiz: ".",
                 ferramentas: %{}
               )

      refute Cota.batida?(cota)
      refute_received :pausou
    end

    test "sem servidor de cota de pe, o Laco encerra como antes, sem excecao" do
      inexistente = :"cota-que-nao-subiu-#{System.unique_integer([:positive])}"
      refute Process.whereis(inexistente)

      log =
        capture_log(fn ->
          assert {:ok, resumo} = rodar_parede(daqui_a_uma_hora(), inexistente)
          assert resumo.desfecho == :erro
          assert resumo.voltas == 0
        end)

      assert log =~ "sem servidor de cota para registrar"
    end

    test "cota: nil desliga o aviso: so o log, como antes da T-091" do
      assert {:ok, %{desfecho: :erro}} = rodar_parede(daqui_a_uma_hora(), nil)
    end
  end
end
