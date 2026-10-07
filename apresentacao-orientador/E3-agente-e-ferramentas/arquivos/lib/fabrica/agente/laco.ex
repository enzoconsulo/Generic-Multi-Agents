defmodule Fabrica.Agente.Laco do
  @moduledoc """
  O nucleo do sistema: o laco de uso de ferramenta, como processo supervisionado.

  Monta a requisicao, chama o operario, executa as ferramentas pedidas e repete — ate o
  modelo dizer que terminou ou ate bater num teto imposto **de fora**.

  ## Quatro regras, e cada uma tem um motivo medido

  1. **TODOS os resultados de ferramenta voltam num turno so.** Dividi-los em varias
     mensagens ensina o modelo a parar de pedir ferramentas em paralelo — e o paralelismo
     local e de graca. Desensina-lo custa tempo de parede em toda volta seguinte.
  2. **Os tetos nao vao no prompt.** Sao estado do processo. E a diferenca entre "o prompt
     pede que voce pare em 30 voltas" e "a volta 31 nao acontece".
  3. **Ferramenta que falha devolve resultado com `erro: true`, nunca some.** Resultado
     ausente deixa o modelo cego sobre o que aconteceu, e cego ele repete o mesmo erro.
  4. **Cada volta grava seu consumo ANTES de o laco decidir continuar.** Um laco cortado no
     meio precisa ter deixado registro do que ja gastou — foi exatamente isso que a v1
     perdia nos jobs mais caros, que sao justamente os cortados. Vale tambem para a volta
     que termina em ERRO do operario: quando a sessao ja gastou e o operario mediu,
     ele devolve `{:erro, {:com_consumo, motivo, consumo}}` e a conta entra antes de o laco
     encerrar com `:erro` (T-089). Erro sem consumo medido segue nu, e conta 0,0.

  ## Por que GenServer

  Porque o laco precisa ser **matavel de fora sem deixar sujeira** (T-053) e supervisionavel
  (T-036). Uma funcao recursiva faria a mesma conta e nao teria endereco: ninguem consegue
  parar o que nao tem PID.
  """

  use GenServer

  require Logger

  alias Fabrica.Agente.Estado
  alias Fabrica.Custo.Precos
  alias Fabrica.Operario
  alias Fabrica.Operario.Consumo
  alias Fabrica.Operario.Requisicao
  alias Fabrica.Operario.Resposta

  @concorrencia_de_ferramentas 4
  @prazo_de_ferramenta :timer.minutes(2)

  @doc """
  Roda o laco ate o fim e devolve o resumo. Sincrono, para quem despacha uma tarefa.

  O `timeout` do `GenServer.call` e generoso de proposito: quem impoe o limite de verdade
  sao os tetos do estado, e nao o relogio de quem chamou. Um timeout curto aqui mataria o
  laco no meio sem que nada tivesse estourado — perdendo o registro do que ja foi gasto.
  """
  @spec rodar(keyword()) :: {:ok, map()}
  def rodar(opcoes) do
    {:ok, pid} = GenServer.start_link(__MODULE__, opcoes)
    GenServer.call(pid, :rodar, :infinity)
  end

  @impl GenServer
  def init(opcoes) do
    {:ok, Estado.novo(opcoes)}
  end

  @impl GenServer
  def handle_call(:rodar, _de, estado) do
    final = laco(estado)
    {:stop, :normal, {:ok, Estado.resumo(final)}, final}
  end

  # O laco em si. Recursivo sobre o estado, que carrega tudo: historico, voltas, gasto.
  defp laco(estado) do
    modulo = estado.operario || Operario.configurado()
    familia = Operario.familia(modulo)

    case modulo.conversar(requisicao(estado, familia), agulha: estado.agulha, raiz: estado.raiz) do
      {:ok, resposta} ->
        tratar_resposta(familia, estado, resposta)

      # O erro de uma sessao que JA GASTOU (T-089): o operario entrega o consumo medido, e ele
      # entra na conta ANTES de o laco encerrar — e a regra 4 valendo tambem no erro. O desfecho
      # e o MESMO `:erro` do erro nu; so o `gasto_usd` deixa de ser 0,0.
      {:erro, {:com_consumo, motivo, %Consumo{} = consumo}} ->
        Logger.warning(
          "laco encerrado por erro do operario: #{inspect(motivo)} (consumo medido contabilizado)"
        )

        estado
        |> contabilizar(consumo, 0)
        |> Map.put(:desfecho, :erro)

      {:erro, motivo} ->
        Logger.warning("laco encerrado por erro do operario: #{inspect(motivo)}")
        %{estado | desfecho: :erro}
    end
  end

  # familia :agente_completo: o operario JA executou o que tinha para executar. Blocos de
  # :uso_de_ferramenta na resposta sao REGISTRO do que ele fez, e nao pedido para o laco.
  # Uma volta, um desfecho: contabiliza e encerra, sem anexar turno novo.
  defp tratar_resposta(:agente_completo, estado, %Resposta{} = resposta) do
    estado
    |> contabilizar(resposta)
    |> Map.put(:desfecho, resposta.motivo_parada)
  end

  # familia :endpoint_de_modelo: byte a byte o comportamento de hoje.
  defp tratar_resposta(
         :endpoint_de_modelo,
         estado,
         %Resposta{motivo_parada: :uso_de_ferramenta} = resposta
       ) do
    estado
    |> aplicar(resposta)
    |> continuar_ou_parar()
  end

  defp tratar_resposta(:endpoint_de_modelo, estado, %Resposta{motivo_parada: motivo} = resposta) do
    estado
    |> contabilizar(resposta)
    |> Map.put(:desfecho, motivo)
  end

  defp continuar_ou_parar(estado) do
    case Estado.pode_continuar(estado) do
      :ok -> laco(estado)
      {:parar, desfecho} -> %{estado | desfecho: desfecho}
    end
  end

  # A ordem aqui e a regra 4: contabiliza ANTES de anexar e de decidir. Se o processo morrer
  # entre uma coisa e outra, o consumo ja esta no estado.
  defp aplicar(estado, %Resposta{} = resposta) do
    estado
    |> contabilizar(resposta)
    |> Estado.anexar_turno(resposta.blocos, executar_ferramentas(estado, resposta.blocos))
  end

  defp contabilizar(estado, %Resposta{consumo: consumo, blocos: blocos}) do
    # Conta blocos :uso_de_ferramenta, e nao ferramentas EXECUTADAS: sob :agente_completo o
    # laco nunca executa nada, e a contagem e a MESMA linha nas duas familias por isso.
    chamadas = Enum.count(blocos, &(&1[:tipo] == :uso_de_ferramenta))

    contabilizar(estado, consumo, chamadas)
  end

  defp contabilizar(estado, %Consumo{} = consumo, chamadas) do
    custo =
      case Precos.estimar(estado.modelo, consumo) do
        {:ok, %{total_usd: total}} -> total
        # Modelo sem preco NAO interrompe o laco: a contabilidade em dolar e estimativa, e
        # perder o trabalho por causa dela seria trocar um numero por uma entrega.
        {:erro, :modelo_sem_preco} -> 0.0
      end

    Estado.contabilizar(estado, consumo, custo, chamadas)
  end

  # Os pedidos de ferramenta da volta — todos eles — rodam em paralelo, e os resultados
  # voltam JUNTOS, num turno so.
  #
  # `on_timeout: :kill_task` garante que uma ferramenta travada nao segure o laco inteiro —
  # ela vira resultado de erro, como qualquer outra falha.
  defp executar_ferramentas(estado, blocos) do
    blocos
    |> Enum.filter(&(&1[:tipo] == :uso_de_ferramenta))
    |> Task.async_stream(&executar_uma(estado, &1),
      max_concurrency: @concorrencia_de_ferramentas,
      timeout: @prazo_de_ferramenta,
      on_timeout: :kill_task,
      zip_input_on_exit: true
    )
    |> Enum.map(&resultado_ou_erro/1)
  end

  defp executar_uma(estado, bloco) do
    case Map.fetch(estado.ferramentas, bloco[:nome]) do
      {:ok, funcao} ->
        %{
          tipo: :resultado_de_ferramenta,
          id: bloco[:id],
          nome: bloco[:nome],
          conteudo: funcao.(bloco[:argumentos] || %{}, estado.raiz),
          erro: false
        }

      :error ->
        %{
          tipo: :resultado_de_ferramenta,
          id: bloco[:id],
          nome: bloco[:nome],
          conteudo: "ferramenta desconhecida: #{inspect(bloco[:nome])}",
          erro: true
        }
    end
  rescue
    excecao ->
      # REGRA 3: a ferramenta que levanta vira resultado de ERRO, e nunca some. Um resultado
      # ausente deixaria o modelo cego sobre o que aconteceu — e cego ele repete o mesmo erro
      # na volta seguinte, gastando outra volta para descobrir o que ja se sabia.
      %{
        tipo: :resultado_de_ferramenta,
        id: bloco[:id],
        nome: bloco[:nome],
        conteudo: "a ferramenta levantou: #{Exception.message(excecao)}",
        erro: true
      }
  end

  defp resultado_ou_erro({:ok, resultado}), do: resultado

  defp resultado_ou_erro({:exit, {bloco, motivo}}) do
    %{
      tipo: :resultado_de_ferramenta,
      id: bloco[:id],
      nome: bloco[:nome],
      conteudo: "a ferramenta nao terminou: #{inspect(motivo)}",
      erro: true
    }
  end

  defp resultado_ou_erro({:exit, motivo}) do
    %{
      tipo: :resultado_de_ferramenta,
      id: nil,
      nome: nil,
      conteudo: "a ferramenta nao terminou: #{inspect(motivo)}",
      erro: true
    }
  end

  defp requisicao(estado, familia) do
    %Requisicao{
      modelo: estado.modelo,
      papel: estado.papel,
      mensagens: estado.mensagens,
      ferramentas: ferramentas_da_requisicao(familia, estado),
      teto_de_voltas: estado.teto_de_voltas
    }
  end

  # A familia agente_completo roda o proprio laco de ferramentas: a lista da fabrica nao
  # significa nada para ela, e so pesaria no prefixo.
  defp ferramentas_da_requisicao(:agente_completo, _estado), do: []
  defp ferramentas_da_requisicao(:endpoint_de_modelo, estado), do: Map.keys(estado.ferramentas)
end
