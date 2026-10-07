defmodule Fabrica.Criterios do
  @moduledoc """
  A passada MECANICA: roda de graca todo criterio que tem comando, antes de gastar despacho.

  **E a terceira alavanca de custo da v2.** Criterio que um comando resolve deixa de gastar
  um verificador inteiro — e um despacho de verificador custa ordens de grandeza mais que os
  segundos de CPU do comando. Porte de `pipeline/criterios.ts` da v1.

  ## O que esta passada responde, e o que ela nao responde

  Ela responde *"o comando declarado passou?"*. Nao responde *"a entrega esta certa?"* — essa
  e a pergunta do verificador, e criterio sem comando fica inteiro para ele. A passada
  mecanica **nunca aprova a tarefa**: ela adianta trabalho e reprova cedo.

  ## Deduplicacao dentro do lote

  Dois criterios que rodam o mesmo comando executam UMA vez; o segundo herda o veredito e vem
  marcado como espelho. Nao e so economia de CPU: o relatorio que repetisse a mesma parede de
  saida por criterio deixaria de ser lido, e afirmar duas verificacoes onde houve uma e
  mentira sobre o grau de prova.

  A chave e conservadora **de proposito** — na duvida, executa. Uma chave que erra para o lado
  de dizer "e o mesmo" faz um criterio herdar veredito de outro, que e pior que rodar duas
  vezes.

  ## A escada de prova

  O relatorio rotula cada criterio e fecha com `Graus de prova:`. Os rotulos sao os tres da
  escada (`_sistema/DOMINIOS.md`), e esta passada produz **dois** deles:

  | rotulo | quem produz | o que significa |
  |---|---|---|
  | `[executado]` | esta passada | um comando rodou e deu veredito |
  | `[julgado]` | esta passada | sem comando, comando recusado, ou inconclusivo |
  | `[inspecionado]` | o VERIFICADOR | alguem olhou o artefato e conferiu |

  `[inspecionado]` nunca sai daqui, e isso e correto: maquina executa ou nao executa, nao
  inspeciona. `relatorio/1` aceita o rotulo para que o verificador possa acrescentar os dele e
  a linha final fechar sobre a mesma escada — se fossem dois formatos, ninguem somaria os dois.

  **A escada tem tres degraus, e a v1 tinha quatro.** La, `inconclusivo` era rotulo proprio.
  Aqui ele e `[julgado]` — nao houve prova mecanica, entao o grau e esse mesmo — e o sinal vai
  para uma linha propria abaixo da `Graus de prova:`, porque o que ele acrescenta e a ACAO
  (quem conserta o que), e nao o grau.

  ## O criterio IMPLICITO da suite

  `Fabrica.Criterios.Suite.acrescentar/2` poe o comando da suite do projeto na lista sem que
  ele esteja escrito em tarefa nenhuma, marcado `implicito: true`. O relatorio o distingue,
  porque quem le precisa separar *"a fabrica rodou isto sozinha"* de *"alguem pediu isto"* —
  sem a marca, o proximo planejador escreve o criterio de novo por achar que sumiu.
  """

  alias Fabrica.Criterios.Allowlist
  alias Fabrica.Criterios.ClasseFalha
  alias Fabrica.Ferramentas.Comando

  @typedoc """
  Um criterio lido do arquivo da tarefa.

  `comando` e `nil` quando o criterio e de julgamento — o que e normal e nao e defeito.
  """
  @type criterio :: %{
          optional(:implicito) => boolean(),
          texto: String.t(),
          comando: String.t() | nil,
          marcado: boolean()
        }

  @typedoc """
  O veredito de um criterio depois da passada.

  `:inconclusivo` e o quarto, e ele **nunca reprova e nunca aprova**: o comando nao conseguiu
  responder a pergunta. Vai para julgamento, e quando a classe e `:ferramenta_quebrada` o que
  precisa de conserto e o CRITERIO, nao a entrega.
  """
  @type estado :: :passou | :falhou | :nao_executado | :inconclusivo

  @type resultado :: %{
          texto: String.t(),
          comando: String.t() | nil,
          estado: estado(),
          recusa: Allowlist.motivo() | nil,
          classe: ClasseFalha.t() | nil,
          reexecutado: boolean(),
          implicito: boolean(),
          saida: String.t(),
          espelho: boolean()
        }

  @limite_de_saida 2_000

  @doc """
  Le os criterios da secao `## Criterios de aceite`.

  **Tolerante por construcao:** linha malformada nao derruba a leitura — vira criterio sem
  comando, que apenas manda a decisao para o verificador. Parser rigido aqui transformaria um
  erro de digitacao do planejador em tarefa que nao roda.

  Le a CONTINUACAO indentada, e isso nao e detalhe: o planejador quebra linha o tempo todo, e
  a primeira versao da v1 lia so a linha do `- [ ]`. Numa rodada real isso **truncou 11
  criterios no meio da frase** — inclusive no relatorio que o verificador le para saber o que
  julgar.
  """
  @spec ler(String.t() | nil) :: [criterio()]
  def ler(secao) do
    linhas = secao |> to_string() |> String.split(~r/\r?\n/)

    linhas
    |> Enum.with_index()
    |> Enum.filter(fn {linha, _i} -> Regex.match?(~r/^\s*[-*]\s*\[( |x|X)\]/, linha) end)
    |> Enum.map(fn {linha, i} -> montar_criterio(linha, Enum.drop(linhas, i + 1)) end)
  end

  defp montar_criterio(linha, seguintes) do
    [_, marca, primeira] = Regex.run(~r/^\s*[-*]\s*\[( |x|X)\]\s*(.*?)\s*$/, linha)
    inteiro = [primeira | continuacao(seguintes)] |> Enum.join(" ") |> String.trim()

    %{
      texto: sem_comando(inteiro),
      comando: comando_declarado(inteiro),
      marcado: String.downcase(marca) == "x",
      implicito: false
    }
  end

  defp continuacao(linhas) do
    linhas
    |> Enum.reduce_while([], fn linha, acumulado ->
      cond do
        Regex.match?(~r/^\s*[-*]\s*\[/, linha) -> {:halt, acumulado}
        String.trim(linha) == "" -> {:cont, acumulado}
        not Regex.match?(~r/^\s+/, linha) -> {:halt, acumulado}
        true -> {:cont, [String.trim(linha) | acumulado]}
      end
    end)
    |> Enum.reverse()
  end

  defp comando_declarado(texto) do
    case Regex.run(~r/`verificar:\s*([^`]+)`/, texto) do
      [_, comando] -> String.trim(comando)
      nil -> nil
    end
  end

  defp sem_comando(texto) do
    texto
    |> String.replace(~r/`verificar:[^`]*`/, "")
    |> String.replace(~r/\s+/, " ")
    |> String.trim()
  end

  @doc """
  Roda a passada mecanica sobre os criterios, dentro de `raiz`.

  Aceita `:prazo` (padrao: o de `Fabrica.Ferramentas.Comando`). Nunca levanta: comando que
  nao executa vira `:falhou` com a saida anexada — a classificacao fina do porque e a T-026.
  """
  @spec executar([criterio()], Path.t(), keyword()) :: [resultado()]
  def executar(criterios, raiz, opcoes \\ []) do
    {resultados, _memoria} =
      Enum.map_reduce(criterios, %{}, fn criterio, memoria ->
        avaliar_e_rodar(criterio, raiz, opcoes, memoria)
      end)

    resultados
  end

  defp avaliar_e_rodar(criterio, raiz, opcoes, memoria) do
    case Allowlist.avaliar(criterio.comando) do
      {:recusado, motivo} -> {nao_executado(criterio, motivo), memoria}
      {:ok, argv} -> talvez_rodar(criterio, argv, raiz, opcoes, memoria)
    end
  end

  defp talvez_rodar(criterio, argv, raiz, opcoes, memoria) do
    chave = chave_de_comando(argv)

    case Map.fetch(memoria, chave) do
      {:ok, anterior} ->
        # O espelho herda o VEREDITO; a identidade continua sendo a do criterio atual —
        # texto, comando e a marca de implicito. Herdar a identidade junto faria o relatorio
        # atribuir a suite implicita um criterio que alguem escreveu, ou o contrario.
        espelhado = %{
          anterior
          | texto: criterio.texto,
            comando: criterio.comando,
            implicito: Map.get(criterio, :implicito, false),
            espelho: true
        }

        {espelhado, memoria}

      :error ->
        resultado = rodar(criterio, argv, raiz, opcoes)
        {resultado, Map.put(memoria, chave, resultado)}
    end
  end

  # A RETENTATIVA UNICA para falha de ambiente. A troca e assimetrica em ordens de grandeza:
  # reexecutar custa segundos de CPU e zero token, e uma reprovacao falsa custa um despacho
  # inteiro MAIS uma das tres fichas da tarefa — e a ficha e o recurso escasso, porque na
  # terceira a tarefa bloqueia. Regressao real falha as DUAS vezes.
  defp rodar(criterio, argv, raiz, opcoes) do
    primeira = uma_execucao(criterio, argv, raiz, opcoes)

    if primeira.estado == :inconclusivo and ClasseFalha.reexecuta?(primeira.classe) do
      %{uma_execucao(criterio, argv, raiz, opcoes) | reexecutado: true}
    else
      primeira
    end
  end

  defp uma_execucao(criterio, [programa | argumentos] = argv, raiz, opcoes) do
    prazo = Keyword.get(opcoes, :prazo, Comando.prazo_padrao())

    case Comando.rodar(raiz, programa, argumentos, prazo: prazo) do
      {:ok, %{codigo: 0, motivo: :normal} = saida} ->
        resultado(criterio, :passou, saida)

      {:ok, saida} ->
        julgar(criterio, argv, saida, raiz)

      # O proprio disparo falhou — nao houve execucao para julgar, e isso e ferramenta por
      # definicao: nenhuma entrega e responsavel por um processo que nao chegou a nascer.
      {:erro, motivo} ->
        %{
          base(criterio)
          | estado: :inconclusivo,
            classe: :ferramenta_quebrada,
            saida: inspect(motivo)
        }
    end
  end

  defp julgar(criterio, argv, saida, raiz) do
    classe =
      ClasseFalha.classificar(%{
        argv: argv,
        saida: saida.stdout <> "\n" <> saida.stderr,
        codigo: saida.codigo,
        estourou_prazo: saida.motivo == :prazo,
        existe_no_disco: fn caminho -> File.exists?(Path.expand(caminho, raiz)) end
      })

    estado = if classe == :entrega, do: :falhou, else: :inconclusivo
    %{resultado(criterio, estado, saida) | classe: classe}
  end

  defp resultado(criterio, estado, saida) do
    %{base(criterio) | estado: estado, saida: cortar(saida.stdout <> saida.stderr)}
  end

  defp base(criterio) do
    %{
      texto: criterio.texto,
      comando: criterio.comando,
      estado: :nao_executado,
      recusa: nil,
      classe: nil,
      reexecutado: false,
      implicito: Map.get(criterio, :implicito, false),
      saida: "",
      espelho: false
    }
  end

  defp nao_executado(criterio, motivo) do
    %{base(criterio) | recusa: motivo}
  end

  defp cortar(texto) when byte_size(texto) <= @limite_de_saida, do: texto

  defp cortar(texto) do
    String.slice(texto, 0, @limite_de_saida) <> "\n[... saida cortada ...]"
  end

  @doc """
  A chave que decide se dois criterios rodam o MESMO comando.

  Conservadora de proposito: normaliza a extensao do binario e as formas equivalentes de
  chamar o script de teste de um gerenciador de pacotes, e nada mais. Reconhecer que
  `mix test` e `mix test test/` cobrem o mesmo exigiria interpretar o manifesto de cada
  ecossistema, e chave que erra dizendo "e o mesmo" faz um criterio herdar veredito de outro.
  **Na duvida, executa.**

  ## Exemplos

      iex> Fabrica.Criterios.chave_de_comando(["npm", "run", "test"])
      "npm test"

      iex> Fabrica.Criterios.chave_de_comando(["mix.bat", "test"])
      "mix test"
  """
  @spec chave_de_comando([String.t()]) :: String.t()
  def chave_de_comando(argv) do
    [programa | resto] = Enum.reject(argv, &(&1 == ""))
    binario = programa |> String.downcase() |> String.replace(~r/\.(exe|cmd|bat)$/, "")

    Enum.join([binario | normalizar_script(binario, resto)], " ")
  end

  @gerenciadores ~w[npm pnpm yarn bun]

  defp normalizar_script(binario, ["run", script]) when binario in @gerenciadores, do: [script]
  defp normalizar_script(binario, ["t"]) when binario in @gerenciadores, do: ["test"]
  defp normalizar_script(_binario, resto), do: resto

  @doc """
  O relatorio da passada, no formato da escada de prova.

  Cada criterio sai rotulado e a linha `Graus de prova:` fecha. Aceita resultados com estado
  `:inspecionado` para que o verificador possa somar os dele ao mesmo relatorio — a escada so
  vale se as duas metades couberem na mesma conta.
  """
  @spec relatorio([resultado()]) :: String.t()
  def relatorio([]), do: ""

  def relatorio(resultados) do
    linhas = ["### Passada mecanica (sem modelo)", "" | Enum.flat_map(resultados, &linha_de/1)]

    Enum.join(linhas ++ ["", graus(resultados) | aviso_de_inconclusivos(resultados)], "\n")
  end

  defp linha_de(%{estado: :nao_executado} = resultado) do
    porque =
      case resultado.recusa do
        :sem_comando -> "sem comando declarado"
        motivo -> "comando recusado: #{motivo}"
      end

    [
      "- [julgado]#{implicito(resultado)} #{resultado.texto} — #{porque}; " <>
        "fica para o verificador."
    ]
  end

  # Inconclusivo tambem e `[julgado]`: nao houve prova mecanica, entao o grau e o mesmo. A v1
  # cunhou um quarto rotulo, e aqui isso quebraria a escada de tres degraus que as duas
  # trilhas compartilham. O sinal nao se perde — ele vai para a linha propria abaixo da
  # `Graus de prova:`, que e onde o orquestrador precisa ve-lo.
  defp linha_de(%{estado: :inconclusivo} = resultado) do
    espelho = if resultado.espelho, do: " (mesmo comando ja avaliado acima)", else: ""

    [
      "- [julgado]#{implicito(resultado)} #{resultado.texto} — `#{resultado.comando}` → " <>
        "#{ClasseFalha.explicar(resultado.classe)}#{espelho}. **Nao reprova a tarefa.**"
    ] ++
      saida_de(resultado)
  end

  defp linha_de(%{estado: :inspecionado} = resultado) do
    ["- [inspecionado] #{resultado.texto} — #{resultado.saida}"]
  end

  defp linha_de(resultado) do
    marca = if resultado.estado == :passou, do: "PASSOU", else: "FALHOU"

    [
      "- [executado]#{implicito(resultado)} #{resultado.texto} — " <>
        "`#{resultado.comando}` → **#{marca}**#{notas(resultado)}"
    ] ++ saida_de(resultado)
  end

  # A marca de implicito vem colada ao rotulo, antes do texto: e propriedade da ORIGEM do
  # criterio, e nao comentario sobre o resultado dele.
  defp implicito(%{implicito: true}), do: " [implicito]"
  defp implicito(_resultado), do: ""

  # As duas notas mudam como o resultado deve ser LIDO, entao nao podem ficar de fora: a
  # reexecucao e o registro de uma reprovacao falsa que nao aconteceu (sem ela a instabilidade
  # da maquina volta a ser folclore em vez de numero), e o espelho avisa que este criterio nao
  # foi conferido por si.
  defp notas(resultado) do
    [
      {resultado.espelho, "mesmo comando ja executado acima"},
      {resultado.reexecutado, "na 2a execucao; a 1a caiu por ambiente"}
    ]
    |> Enum.filter(&elem(&1, 0))
    |> Enum.map_join("; ", &elem(&1, 1))
    |> case do
      "" -> ""
      texto -> " (#{texto})"
    end
  end

  # A saida so aparece na PRIMEIRA vez que o comando aparece: repetir a mesma parede de texto
  # por criterio espelhado e o que fazia o relatorio da v1 deixar de ser lido.
  defp saida_de(%{espelho: false, saida: saida, estado: estado})
       when saida != "" and estado in [:falhou, :inconclusivo] do
    ["", "```", saida, "```", ""]
  end

  defp saida_de(_resultado), do: []

  # Linha separada, e so quando existe. O grau ja esta contado acima como julgado; o que esta
  # linha acrescenta e a ACAO, que e diferente para cada classe — e criterio quebrado nenhum
  # construtor conserta, porque por contrato ele nao pode alterar criterio.
  defp aviso_de_inconclusivos(resultados) do
    case inconclusivos(resultados) do
      [] ->
        []

      lista ->
        por_classe =
          lista
          |> Enum.frequencies_by(& &1.classe)
          |> Enum.map_join(", ", fn {classe, quantos} -> "#{quantos} por #{classe}" end)

        [
          "",
          "**#{length(lista)} criterio(s) INCONCLUSIVO(s)** (#{por_classe}): o comando nao " <>
            "respondeu a pergunta. Nao reprova a tarefa" <>
            se_ha_criterio_quebrado(lista) <> "."
        ]
    end
  end

  defp se_ha_criterio_quebrado(lista) do
    if Enum.any?(lista, &(&1.classe == :ferramenta_quebrada)) do
      ", e o CRITERIO precisa de conserto — nenhum construtor pode altera-lo"
    else
      ""
    end
  end

  defp graus(resultados) do
    contagem = Enum.frequencies_by(resultados, & &1.estado)
    executados = Map.get(contagem, :passou, 0) + Map.get(contagem, :falhou, 0)
    inspecionados = Map.get(contagem, :inspecionado, 0)
    julgados = length(resultados) - executados - inspecionados

    partes =
      [{executados, "executado(s)"}, {inspecionados, "inspecionado(s)"}, {julgados, "julgado(s)"}]
      |> Enum.reject(fn {quantos, _rotulo} -> quantos == 0 end)
      |> Enum.map(fn {quantos, rotulo} -> "#{quantos} #{rotulo}" end)

    # Grau com zero nao entra: linha que diz "0 inspecionado" em toda rodada vira ruido e para
    # de ser lida justamente quando o numero deixa de ser zero.
    "Graus de prova: #{Enum.join(partes, ", ")} (de #{length(resultados)})."
  end

  @doc """
  Algum criterio com comando falhou de verdade?

  E o que decide nao gastar verificador: reprovou na mecanica, volta para o construtor. Nunca
  o contrario — passar aqui **nao aprova nada**, porque os criterios de julgamento continuam
  por conferir.
  """
  @spec reprovou?([resultado()]) :: boolean()
  def reprovou?(resultados), do: Enum.any?(resultados, &(&1.estado == :falhou))

  @doc "Os criterios cujo comando foi recusado — defeito de PLANEJAMENTO, nao de entrega."
  @spec recusados([resultado()]) :: [resultado()]
  def recusados(resultados) do
    Enum.filter(resultados, &(&1.recusa != nil and &1.recusa != :sem_comando))
  end

  @doc """
  Os criterios que o comando nao conseguiu responder.

  Nunca reprovam. Quando a classe e `:ferramenta_quebrada`, o motor tem de levar isto ao
  relatorio da rodada: **nenhum despacho de construtor conserta um criterio**, e sem alguem
  dizer em voz alta a tarefa gira ate bloquear.
  """
  @spec inconclusivos([resultado()]) :: [resultado()]
  def inconclusivos(resultados), do: Enum.filter(resultados, &(&1.estado == :inconclusivo))

  @doc """
  Os criterios cujo COMANDO precisa de conserto — e nao a entrega.

  E a lista que vale US$ 12,90 e 4 ciclos: foi por nao existir que a T-030 do
  banco-imobiliario girou com o deliverable correto desde o primeiro ciclo.
  """
  @spec criterios_quebrados([resultado()]) :: [resultado()]
  def criterios_quebrados(resultados) do
    Enum.filter(resultados, &(&1.classe == :ferramenta_quebrada))
  end

  @doc """
  Quantos criterios precisaram de uma segunda execucao por causa da maquina.

  E o numero que impede a instabilidade do ambiente de voltar a ser folclore: sem conta-la,
  ninguem sabe se a retentativa esta salvando uma reprovacao falsa por semana ou nenhuma.
  """
  @spec reexecucoes([resultado()]) :: non_neg_integer()
  def reexecucoes(resultados), do: Enum.count(resultados, & &1.reexecutado)

  @doc """
  Quantas fichas esta passada gastou da tarefa.

  Zero ou um: a passada inteira e um ciclo, e ela so o gasta se algum criterio falhou por
  ENTREGA. Ferramenta quebrada e ambiente hostil nao sao culpa de quem construiu, e queimar
  ficha por eles aproxima o bloqueio sem que ninguem tenha errado.
  """
  @spec ciclos_gastos([resultado()]) :: 0 | 1
  def ciclos_gastos(resultados), do: if(reprovou?(resultados), do: 1, else: 0)
end
