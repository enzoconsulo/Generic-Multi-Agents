defmodule Fabrica.Ferramentas.Guardas do
  @moduledoc """
  Duas guardas que avaliam um comando ANTES de ele rodar.

  Nenhuma das duas aparece em documento nenhum do TCC: as duas existem na v1 porque um
  estrago as criou (`MIGRACAO_V2.md`, secao 3). Sao a segunda camada da fabrica, a que
  nasceu operando.

  ## Recusar × avisar, e a diferenca e deliberada

  | guarda | desfecho | por que |
  |---|---|---|
  | processos | **recusa** | matar a fabrica e IRREVERSIVEL — o agente morre com ela e ninguem escreve o relatorio |
  | ferramental | **avisa** | reinventar uma roda e caro mas recuperavel, e uma recusa errada bloquearia trabalho legitimo |

  Essa assimetria e a regra, e nao um acidente de implementacao. Uma guarda de ferramental
  que RECUSASSE transformaria um palpite sobre intencao numa parede — e palpite sobre
  intencao erra.

  ## As duas sao PURAS

  Nenhuma toca disco, rede ou relogio: recebem a string do comando e devolvem o veredito. E
  por isso que da para testa-las exaustivamente, e e nelas que mora todo o julgamento. Se um
  dia uma delas precisar consultar o sistema, o julgamento tem de continuar aqui e a consulta
  vira parametro.
  """

  @typedoc "O veredito da guarda de processos."
  @type veredito :: :permitido | {:recusado, motivo :: atom(), explicacao :: String.t()}

  # Nomes cuja morte derruba o proprio runtime. `beam.smp` e o nome no Unix; `erl` e o
  # lancador; `epmd` e o daemon de nomes, sem o qual o no perde a identidade.
  @processos_do_runtime ~w[beam beam.smp erl erl.exe werl epmd elixir iex mix]

  @doc """
  Avalia um comando de encerramento de processo.

  A regra e a mesma da coleta de orfaos da v1: **exige prova de propriedade**. So se pode
  matar o que a propria fabrica lancou, e por PID — nunca por nome de imagem, que alcanca
  processos que ninguem desta fabrica criou.

  `lancados` e a lista de PIDs que a fabrica lancou. Ela vem de fora de proposito: e o que
  mantem a funcao pura e o julgamento inteiro aqui dentro.
  """
  @spec avaliar_processo(String.t(), [pos_integer()]) :: veredito()
  def avaliar_processo(comando, lancados \\ []) when is_binary(comando) do
    normalizado = String.downcase(comando)

    cond do
      not encerra_processo?(normalizado) ->
        :permitido

      alcanca_runtime_por_nome?(normalizado) ->
        {:recusado, :mataria_o_runtime,
         "este comando encerra processos por NOME e alcanca o runtime da propria fabrica. " <>
           "Se ele rodar, o agente morre junto e ninguem escreve o relatorio."}

      mata_tudo?(normalizado) ->
        {:recusado, :morte_indiscriminada,
         "este comando encerra processos sem alvo definido. A fabrica so pode encerrar o " <>
           "que ela mesma lancou."}

      true ->
        conferir_propriedade(normalizado, lancados)
    end
  end

  defp conferir_propriedade(comando, lancados) do
    pedidos = pids_no_comando(comando)

    cond do
      pedidos == [] ->
        {:recusado, :sem_alvo,
         "nao consegui identificar o PID alvo. Encerrar processo exige PID explicito: " <>
           "sem ele nao ha como provar que a fabrica lancou o processo."}

      Enum.all?(pedidos, &(&1 in lancados)) ->
        :permitido

      true ->
        alheios = Enum.reject(pedidos, &(&1 in lancados))

        {:recusado, :sem_prova_de_propriedade,
         "o(s) PID(s) #{Enum.join(alheios, ", ")} nao foram lancados por esta fabrica. " <>
           "So se pode encerrar o que se lancou."}
    end
  end

  defp encerra_processo?(comando) do
    String.contains?(comando, ["taskkill", "kill ", "kill-", "stop-process", "pkill", "killall"])
  end

  # Morte por NOME e o caso perigoso: `taskkill /IM beam.exe` nao pergunta de quem e o
  # processo, e a fabrica roda dentro de um deles.
  defp alcanca_runtime_por_nome?(comando) do
    cita_runtime? = Enum.any?(@processos_do_runtime, &nome_presente?(comando, &1))
    por_nome? = String.contains?(comando, ["/im", "-name", "pkill", "killall"])

    cita_runtime? and por_nome?
  end

  # Palavra inteira: `beam` nao pode casar dentro de `beamer.exe`, e `erl` nao pode casar
  # dentro de `superlativo`. Um detector que acusa o inocente deixa de ser levado a serio.
  defp nome_presente?(comando, nome) do
    Regex.match?(~r/(?<![a-z0-9_.-])#{Regex.escape(nome)}(?![a-z0-9_-])/, comando)
  end

  defp mata_tudo?(comando) do
    String.contains?(comando, [
      "taskkill /f /im *",
      "kill -9 -1",
      "kill -9 1",
      "killall -9",
      "stop-process -name *",
      "get-process | stop-process"
    ])
  end

  defp pids_no_comando(comando) do
    ~r/(?:\/pid\s+|-p\s+|--pid\s+|\bkill\s+(?:-\w+\s+)?)(\d+)/
    |> Regex.scan(comando)
    |> Enum.map(fn [_, digitos] -> String.to_integer(digitos) end)
    |> Enum.uniq()
  end

  @typedoc "O aviso da guarda de ferramental. Nunca recusa."
  @type aviso :: %{ferramenta: String.t(), use: String.t(), texto: String.t()}

  # O catalogo do que a fabrica JA TEM. Cada linha e um par: o que o comando sugere que o
  # agente esta prestes a reinventar, e o que ele deveria usar no lugar.
  @catalogo [
    %{
      pistas: ["curl ", "wget ", "invoke-webrequest"],
      ferramenta: "cliente HTTP proprio",
      # O nome da biblioteca HTTP NAO entra aqui de proposito. O teste do marco da v0.1
      # procura clientes HTTP por palavra inteira em todo `lib/`, e ele e grosso de proposito
      # — nao distingue codigo de texto. Citar a biblioteca numa string faria o marco
      # reprovar sem que exista dependencia nenhuma, e afrouxar o detector para acomodar isso
      # trocaria uma garantia forte por uma frase. Referencia-la pela TAREFA basta.
      use: "o adaptador de operario (Fabrica.Operario), ou o adaptador HTTP da T-019",
      motivo: "baixar coisa por linha de comando escapa da contabilidade de custo e do prazo"
    },
    %{
      pistas: ["mix format --check", "mix credo", "mix dialyzer", "mix test"],
      ferramenta: "estagio solto da bateria",
      use: "mix fabrica.ci, ou o comando declarado em _gestao/ci.json",
      motivo:
        "o ci.json e a FONTE do comando de verificacao; redigir de cabeca custou 4 ciclos na v1"
    },
    %{
      pistas: ["taskkill", "pkill", "kill "],
      ferramenta: "encerramento de processo a mao",
      use: "Fabrica.Ferramentas.ArvoreProcessos.encerrar/1",
      motivo: "matar so o processo lancado deixa os filhos orfaos — foram oito node.exe na v1"
    },
    %{
      pistas: ["git add", "git commit"],
      ferramenta: "commit a mao",
      use: "a publicacao da tarefa (T-032), que gera o markdown do banco e commita junto",
      motivo: "commit fora do fluxo deixa o markdown gerado e o banco divergentes"
    }
  ]

  @doc """
  Avalia se o comando reinventa algo que a fabrica ja tem.

  **AVISA, nunca recusa.** O comando roda; o aviso volta anexado ao resultado da ferramenta,
  e o agente o le na volta seguinte. Recusar aqui seria transformar um palpite sobre intencao
  numa parede, e palpite sobre intencao erra.
  """
  @spec avaliar_ferramental(String.t()) :: [aviso()]
  def avaliar_ferramental(comando) when is_binary(comando) do
    normalizado = String.downcase(comando)

    @catalogo
    |> Enum.filter(fn entrada ->
      Enum.any?(entrada.pistas, &String.contains?(normalizado, &1))
    end)
    |> Enum.map(fn entrada ->
      %{
        ferramenta: entrada.ferramenta,
        use: entrada.use,
        texto:
          "AVISO: este comando parece reinventar #{entrada.ferramenta}. " <>
            "Use #{entrada.use} — #{entrada.motivo}. O comando RODOU assim mesmo."
      }
    end)
  end

  @doc "O catalogo de ferramentas que a fabrica ja tem, para o GUIA e para o teste."
  @spec catalogo() :: [map()]
  def catalogo, do: @catalogo
end
