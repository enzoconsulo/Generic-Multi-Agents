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

  ## A parede de cota vira estado do sistema (T-091)

  O `Laco` e o UNICO consumidor do `{:erro, {:cota, reabre_em}}` que `ClaudeCLI` e
  `MessagesAPI` devolvem — entao e aqui que o sinal vira `Fabrica.Cota.parede/2`, que pausa as
  filas e guarda o horario de reabertura. Sem isso o sinal morria num log: o piloto via so
  `desfecho: :erro`, a cota nunca aparecia batida, e `Piloto.Decisao` parava por falha em vez
  de dormir. O desfecho da rodada continua `:erro` de proposito: a regra 2 da `Decisao` (cota
  batida -> dormir) e checada antes da 6 (falha), e nenhum consumidor de `desfecho` muda.

  O servidor de cota e a opcao `:cota` de `rodar/1` (padrao `Fabrica.Cota`, o da arvore da
  aplicacao; `nil` desliga o aviso). Servidor que nao esta de pe NAO derruba o laco: a parede
  fica so no log, como antes — perder a rodada por causa do aviso seria pior que nao avisar.

  ## Por que GenServer

  Porque o laco precisa ser **matavel de fora sem deixar sujeira** (T-053) e supervisionavel
  (T-036). Uma funcao recursiva faria a mesma conta e nao teria endereco: ninguem consegue
  parar o que nao tem PID.
  """

  use GenServer

  require Logger

  alias Fabrica.Agente.Estado
  alias Fabrica.Cota
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

  `opcoes` sao as de `Fabrica.Agente.Estado.novo/1`, mais `:cota`: o servidor de
  `Fabrica.Cota` que recebe a parede (padrao `Fabrica.Cota`; `nil` desliga) — ver @moduledoc.
  """
  @spec rodar(keyword()) :: {:ok, map()}
  def rodar(opcoes) do
    {:ok, pid} = GenServer.start_link(__MODULE__, opcoes)
    GenServer.call(pid, :rodar, :infinity)
  end

  @impl GenServer
  # `:cota` sai das opcoes ANTES de `Estado.novo/1` (que e `struct!/2` e recusaria a chave):
  # e dado do processo, nao do historico da conversa, e viaja ao lado do estado.
  def init(opcoes) do
    {cota, opcoes} = Keyword.pop(opcoes, :cota, Cota)
    {:ok, {Estado.novo(opcoes), cota}}
  end

  @impl GenServer
  def handle_call(:rodar, _de, {estado, cota}) do
    final = laco(estado, cota)
    {:stop, :normal, {:ok, Estado.resumo(final)}, {final, cota}}
  end

  # O laco em si. Recursivo sobre o estado, que carrega tudo: historico, voltas, gasto.
  defp laco(estado, cota) do
    modulo = estado.operario || Operario.configurado()
    familia = Operario.familia(modulo)

    case modulo.conversar(requisicao(estado, familia), agulha: estado.agulha, raiz: estado.raiz) do
      {:ok, resposta} ->
        tratar_resposta(familia, estado, resposta, cota)

      # A parede de cota (T-091): vira estado do sistema ANTES de o laco encerrar — ver
      # @moduledoc. Parede NAO usa o envelope `:com_consumo` (D-015, adendo 6), por isso este
      # ramo casa o sinal nu, antes do `{:erro, motivo}` generico abaixo.
      {:erro, {:cota, _reabre_em}} = sinal ->
        Logger.warning("laco encerrado por parede de cota: #{inspect(sinal)}")
        :ok = avisar_parede(cota, sinal)
        %{estado | desfecho: :erro}

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
  defp tratar_resposta(:agente_completo, estado, %Resposta{} = resposta, _cota) do
    estado
    |> contabilizar(resposta)
    |> Map.put(:desfecho, resposta.motivo_parada)
  end

  # familia :endpoint_de_modelo: byte a byte o comportamento de hoje.
  defp tratar_resposta(
         :endpoint_de_modelo,
         estado,
         %Resposta{motivo_parada: :uso_de_ferramenta} = resposta,
         cota
       ) do
    estado
    |> aplicar(resposta)
    |> continuar_ou_parar(cota)
  end

  defp tratar_resposta(
         :endpoint_de_modelo,
         estado,
         %Resposta{motivo_parada: motivo} = resposta,
         _cota
       ) do
    estado
    |> contabilizar(resposta)
    |> Map.put(:desfecho, motivo)
  end

  defp continuar_ou_parar(estado, cota) do
    case Estado.pode_continuar(estado) do
      :ok -> laco(estado, cota)
      {:parar, desfecho} -> %{estado | desfecho: desfecho}
    end
  end

  # Avisar a parede e melhor esforco: sem servidor de cota de pe (`nil`, nome nao registrado,
  # processo que morreu no meio da chamada) o laco encerra como antes da T-091, so com o log.
  # `catch :exit` cobre os tres — `GenServer.call/2` sai com `:noproc` ou `:timeout`, nunca
  # levanta excecao comum.
  defp avisar_parede(nil, _sinal), do: :ok

  defp avisar_parede(cota, sinal) do
    Cota.parede(cota, sinal)
  catch
    :exit, motivo ->
      Logger.warning(
        "parede de cota sem servidor de cota para registrar (#{inspect(cota)}): " <>
          "#{inspect(motivo)}; a parede fica so no log"
      )

      :ok
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
