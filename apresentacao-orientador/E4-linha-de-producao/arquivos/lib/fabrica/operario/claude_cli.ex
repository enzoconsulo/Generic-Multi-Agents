defmodule Fabrica.Operario.ClaudeCLI do
  @moduledoc """
  O adaptador que conversa com o Claude Code CLI. **E o PADRAO de operacao da fabrica.**

  Roda na assinatura: OAuth, sem `ANTHROPIC_API_KEY`. Consome **cota**, e nao dinheiro — e
  por isso que todo valor em dolar que a fabrica registra e estimativa contabil, nunca
  fatura (`DECISOES_FECHADAS.md`).

  ## O QUE ESTE ADAPTADOR NAO CONSEGUE FAZER

  **Ele nao posiciona pontos de cache.** O CLI gerencia o cache sozinho e nao expoe
  `cache_control` nem TTL — conferido na v1, no `sdk.d.ts` da versao pinada, e registrado em
  `DECISOES_FECHADAS.md`. Os pontos de cache que o `Fabrica.Prompt.Prefixo` marca chegam aqui
  e sao **ignorados**, porque nao ha onde os colocar.

  Isso nao e defeito deste adaptador: e a razao de o `Operario.MessagesAPI` (T-019) existir.
  A economia que sobra na v1 — as ~21 escritas de prefixo por rodada, ~50% da conta de
  entrada — so e alcancavel por quem monta a requisicao. E por isso que o marco da v0.2 mede
  a escrita de prefixo em vez de aceitar que ela e o que e.

  ## A parede de cota

  Sob assinatura, o que aperta nao e dinheiro: e a cota acabar. O CLI sinaliza isso com
  mensagem e horario de reabertura, e este adaptador traduz para
  `{:erro, {:cota, reabre_em}}`. A v0.4 depende disso para dormir e rearmar.

  **Este mecanismo esta ausente da documentacao inteira do TCC** e e estrutural sob
  assinatura — foi um dos 19 achados do `MIGRACAO_V2.md`.

  ## Permissao headless — `--permission-mode acceptEdits`

  Sem flag nenhuma, `claude --print` NEGA toda escrita — e a CAUSA 1 do marco 1 reprovado
  (T-020, ciclo 3). A T-018b mediu, contra o `claude` 2.1.258 instalado, os seis modos de
  `--permission-mode`: **`acceptEdits` e `bypassPermissions` escrevem; `auto`, `manual`,
  `dontAsk` e `plan` negam.** Este adaptador usa `acceptEdits` por PRIVILEGIO MINIMO — e o
  menor dos dois que funciona, nao o unico. `bypassPermissions` desliga a checagem de
  confinamento inteira; `acceptEdits` so auto-aprova edicao, e o confinamento do proprio CLI
  (medido na mesma tarefa: escrita fora da raiz e negada, mesma mensagem que sem flag
  nenhuma) continua de pe.

  ## Vocabulario de ferramentas — `--tools`, nunca `--allowedTools`/`--disallowedTools`

  Com a familia `:agente_completo`, quem executa ferramenta e o CLI — as ausencias que o
  `Fabrica.Ferramentas.Catalogo` garante (verificador e revisor sem `escrever`/`editar`) so
  valem se a LINHA DE COMANDO tambem as impuser. A T-018b mediu as tres flags de ferramenta:
  `--allowedTools` e allowlist de APROVACAO (o modelo ainda ve e pode tentar `Write`, so a
  permissao barra); `--disallowedTools` tira a ferramenta NOMEADA do vocabulario anunciado
  mas e furada por SUBSTITUICAO (medido: com `Write` proibido, o modelo escreveu com `Bash`).
  **So `--tools "<lista>"` fecha as saidas de verdade** — o `system/init` do CLI nem anuncia
  a ferramenta fora da lista, e uma tentativa volta `No such tool available`. `familia/0`
  e `ferramentas_cli/1`, abaixo, sao o que monta essa lista a partir do catalogo da fabrica.

  ## O confinamento sob agente completo — duas metades (T-012a)

  A T-012 fez do confinamento uma PROPRIEDADE do codigo: `Confinamento.resolver/2` recusa
  caminho absoluto de fora, travessia, link que aponta para fora, UNC e nome de dispositivo.
  Essa funcao governa as ferramentas que a FABRICA executa. Sob `:agente_completo` quem
  executa e o CLI, e a garantia precisa de duas metades — nenhuma sozinha basta.

  **1. Prevencao (a garantia principal, nao rede de seguranca).** O proprio `claude`, com
  `--permission-mode acceptEdits` e o diretorio de trabalho igual a `raiz` da requisicao,
  RECUSA escrita fora dele — medido pela T-018b (secao 4) contra o binario real: caminho
  absoluto e travessia negados com a MESMA mensagem ("...but you haven't granted it yet")
  de qualquer escrita sem permissao; escrita de dentro passa. A combinacao escolhida na
  T-018c (`acceptEdits`) NAO desliga essa checagem — so `bypassPermissions` a desligaria, e
  este adaptador nao usa esse modo (privilegio minimo, ver secao acima).
  `priv/probes/confinamento_cli.exs` prova as tres cenas (absoluto, travessia, dentro)
  contra o CLI real.

  **2. Auditoria (sempre, mesmo com a prevencao de pe).** `interpretar/2` passa cada
  argumento de caminho (`file_path`, `path`, `notebook_path`) de cada `tool_use` do stream
  por `Confinamento.resolver(raiz, caminho)` — a MESMA funcao da T-012, sem regra de caminho
  propria aqui. Qualquer caminho que ela recuse faz `interpretar/2` devolver
  `{:erro, {:fora_do_confinamento, caminhos}}`, mesmo que o CLI tenha marcado a sessao como
  sucesso. Isto NAO E prevencao — o trabalho pode ja ter acontecido no disco — e sim
  deteccao: o que impede a fabrica de dar por bom um despacho que saiu da raiz. Sem `raiz`
  (chamar `interpretar/1`, como todo teste que nao testa confinamento faz) a auditoria fica
  desligada, por nao ter contra o que comparar.

  ## A lacuna que fica: comando de shell nao se audita por caminho

  `rodar` (a ferramenta `Bash` do CLI) pode sair da raiz de mil formas, e nenhuma expressao
  regular sobre o texto do comando cobre isso honestamente — NAO tentamos. Tres saidas
  possiveis ficam registradas aqui, e a escolha e do Enzo, nao deste adaptador:

  (a) nao permitir a ferramenta de shell ao papel que roda sob `:agente_completo`;
  (b) a opcao D do `PLANO_V2.md` — servir as ferramentas da fabrica por MCP, em que `rodar`
      volta a ser o `Fabrica.Ferramentas.Comando` desta fabrica, com confinamento de verdade;
  (c) aceitar a lacuna e declara-la, como esta secao ja faz.

  ## O motivo de parada sai do evento TERMINAL, nunca do stream inteiro

  `blocos` e a concatenacao dos blocos de **todos** os eventos `assistant` da sessao inteira
  do CLI, com todos os turnos internos dela. Um `tool_use` que o proprio CLI pediu, executou
  (ou teve negado) e seguiu adiante aparece ali como REGISTRO do que aconteceu no meio do
  caminho — nao como pedido pendente para a fabrica resolver.

  Ler esses blocos para decidir o motivo de parada foi a CAUSA 3 do marco 1 reprovado
  (T-020, ciclo 3): o `Laco` viu `:uso_de_ferramenta` no meio da sessao, tentou executar
  `Write` pelo mapa dele, gravou "ferramenta desconhecida" e chamou o operario de novo.

  **Sob a familia `:agente_completo`, este adaptador NUNCA devolve `:uso_de_ferramenta`.** O
  CLI e quem executa as proprias ferramentas; quando ele para, ou terminou (`:fim_do_turno`),
  ou bateu no teto de turnos (`:teto_de_voltas` — nao `:teto_de_tokens`, que e o teto do
  `MessagesAPI`; ver `Fabrica.Operario.Resposta`), ou recusou (`:recusa`). Nunca "falta
  executar algo", porque o que faltava ja foi executado por dentro do proprio CLI.

  ## Como o teste roda sem tocar a rede

  O executavel vem de `config :fabrica, :claude_cli`. O teste aponta para um script falso que
  imprime eventos JSON conhecidos. A suite continua sem rede e sem cota, que e o marco da
  v0.1 e nao pode ser quebrado aqui.
  """

  @behaviour Fabrica.Operario

  require Logger

  alias Fabrica.Ferramentas.Catalogo
  alias Fabrica.Ferramentas.Comando
  alias Fabrica.Ferramentas.Confinamento
  alias Fabrica.Operario.Consumo
  alias Fabrica.Operario.Requisicao
  alias Fabrica.Operario.Resposta

  @prazo_padrao :timer.minutes(10)

  # A TRADUCAO catalogo da fabrica -> vocabulario do CLI, e o vocabulario do CLI PARA AQUI:
  # nenhum outro modulo de `lib/` cita `Write`, `Edit`, `Bash`, `Read`, `Glob` ou `Grep` — ha
  # teste que falha se vazar. `registrar_resultado` NAO tem equivalente nativo (o CLI nao tem
  # ferramenta de reportar resultado sem efeito colateral): fica de fora da traducao de
  # proposito, e a lacuna esta registrada nas Notas de execucao da T-018c.
  @vocabulario_cli %{
    "ler" => "Read",
    "listar" => "Glob",
    "buscar" => "Grep",
    "escrever" => "Write",
    "editar" => "Edit",
    "rodar" => "Bash"
  }

  # Os nomes de argumento que o CLI usa para caminho, nas ferramentas que ele anuncia
  # (medido na amostra da T-018b: `Read` manda `file_path`). `NotebookEdit` manda
  # `notebook_path`, e ferramentas de busca/listagem podem mandar `path` — a auditoria cobre
  # os tres sem precisar saber qual ferramenta e qual, porque o que importa e o CAMINHO, nao
  # o nome dela.
  @chaves_de_caminho ~w(file_path path notebook_path)

  @doc "O executavel do CLI, resolvido por configuracao. Nunca pelo PATH direto."
  @spec executavel() :: String.t()
  def executavel, do: Application.get_env(:fabrica, :claude_cli, "claude")

  @doc """
  A familia deste adaptador: `:agente_completo`.

  O CLI tem laco, ferramentas e permissoes proprios — a fabrica manda UMA requisicao e para.
  E por isso que a linha de comando, e nao o `Laco`, precisa aplicar as ausencias do
  `Fabrica.Ferramentas.Catalogo` (ver `ferramentas_cli/1`).
  """
  @impl Fabrica.Operario
  def familia, do: :agente_completo

  @doc """
  Traduz as ferramentas de um papel (`Fabrica.Ferramentas.Catalogo`) para o vocabulario do
  CLI, prontas para `--tools`.

  Papel desconhecido devolve lista vazia — que vira `--tools ""`, ou seja, TODA ferramenta
  desligada. E o mesmo principio do catalogo (`do_papel/1`): falhar para o lado sem poder
  nenhum, nunca para o lado com poder de mais.
  """
  @spec ferramentas_cli(String.t()) :: [String.t()]
  def ferramentas_cli(papel) do
    case Catalogo.do_papel(papel) do
      {:ok, ferramentas} ->
        ferramentas
        |> Map.keys()
        |> Enum.map(&Map.get(@vocabulario_cli, &1))
        |> Enum.reject(&is_nil/1)
        |> Enum.sort()

      {:erro, _} ->
        []
    end
  end

  @impl Fabrica.Operario
  def conversar(%Requisicao{} = requisicao, opcoes) do
    raiz = Keyword.get(opcoes, :raiz, ".")
    prazo = Keyword.get(opcoes, :prazo, @prazo_padrao)

    arquivo_prompt = escrever_prompt(texto_do_prompt(requisicao))

    resultado =
      Comando.rodar_separado(raiz, linha(requisicao),
        prazo: prazo,
        entrada: {:arquivo, arquivo_prompt}
      )

    apagar_prompt(arquivo_prompt)

    case resultado do
      {:ok, %{motivo: :prazo}} -> {:erro, :prazo}
      {:ok, resultado} -> interpretar(resultado, raiz)
      {:erro, motivo} -> {:erro, motivo}
    end
  end

  @doc """
  Monta a linha de comando para uma requisicao.

  Publica de proposito, como `interpretar/1`: e ela que o teste exercita para conferir que o
  vocabulario montado casa com o papel, sem gastar cota rodando o CLI de verdade.

  **A linha e CONSTANTE em relacao ao conteudo da conversa** — nenhum pedaco de
  `requisicao.mensagens` entra aqui. O texto viaja por `stdin`, a partir de um arquivo
  temporario (ver `conversar/2` e `texto_do_prompt/1`), porque nao ha escape confiavel para
  quebra de linha, aspas, `&`, `|`, crase e `%VAR%` numa linha de comando montada por
  interpolacao — medido na T-020 (ciclo 3): um prompt multi-linha desmontava o `.bat` gerado
  por `Comando.escrever_script/4` e devolvia exit 255 com stdout e stderr vazios. A T-018b
  (secao 7) mediu que o `claude --print` aceita o prompt vindo de `stdin` redirecionado de
  arquivo (`codigo: 0`, aspas e `&` intactos) enquanto o MESMO texto como argumento de linha
  quebra — e e essa medicao que sustenta este desenho.

  `--verbose` NAO e opcional, e a falta dele nao degrada: o CLI RECUSA a chamada com
  `Error: When using --print, --output-format=stream-json requires --verbose` e sai com 1,
  stdout vazio. A primeira versao desta funcao (T-018) nao o tinha, e passou por 26 testes
  verdes porque todos alimentavam `interpretar/1` com eventos fabricados — a traducao era
  exercitada, o DISPARO nunca. Descoberto no primeiro probe real, ao abrir o marco (T-020).

  `--max-turns <n>`, derivado de `requisicao.teto_de_voltas`, e o teto de voltas do
  `Fabrica.Agente.Estado` traduzido para o CLI (T-017a). A regra que `Estado` existe para
  impor — *o teto nao vai no prompt, mora no estado e e conferido pelo laco* — so continua
  valendo sob `:agente_completo` se a linha de comando o carregar: quem faz os turnos e o
  proprio CLI, e `Estado` nao ve por dentro deles. A flag esta AUSENTE do `--help` da versao
  medida (2.1.258) mas FUNCIONA — confirmado por comportamento na T-018b (secao 5): uma flag
  inventada de verdade e recusada com `error: unknown option`, `--max-turns` nao e, e ao
  bater no teto o evento `result` volta `"subtype":"error_max_turns"` (o que `motivo_parada/1`
  ja traduz para `:teto_de_voltas`). Superficie NAO documentada: uma atualizacao do CLI pode
  remove-la sem aviso.
  """
  @spec linha(Requisicao.t()) :: String.t()
  def linha(%Requisicao{} = requisicao) do
    ferramentas = requisicao.papel |> ferramentas_cli() |> Enum.join(",")

    ~s(#{executavel()} --print --verbose --output-format stream-json ) <>
      ~s(--permission-mode acceptEdits --tools "#{ferramentas}" ) <>
      ~s(--max-turns #{requisicao.teto_de_voltas} ) <>
      ~s(--model #{requisicao.modelo})
  end

  @doc """
  O texto integral do prompt: a conversa inteira, uma mensagem por linha.

  Publica pela mesma razao de `linha/1` — o teste confere que o CONTEUDO chega intacto ao
  arquivo, sem gastar cota. Fora de escopo desta tarefa mudar o formato de `texto_da_mensagem/1`
  (o `inspect/1` de bloco estruturado): isso e outro problema.
  """
  @spec texto_do_prompt(Requisicao.t()) :: String.t()
  def texto_do_prompt(%Requisicao{mensagens: mensagens}) do
    Enum.map_join(mensagens, "\n", &texto_da_mensagem/1)
  end

  defp texto_da_mensagem(%{conteudo: conteudo}) when is_binary(conteudo), do: conteudo
  defp texto_da_mensagem(%{conteudo: conteudo}), do: inspect(conteudo)
  defp texto_da_mensagem(outro), do: inspect(outro)

  # O MESMO temporario de sempre: nome unico por `System.unique_integer/1`, apagado depois —
  # mesma disciplina que `Comando.escrever_script/4` ja usa para o proprio script. Apagado
  # SEMPRE, inclusive quando a chamada falha (ver `conversar/2`): o arquivo e nosso, nao do
  # CLI, e ninguem mais tem interesse nele depois que o processo termina ou o prazo estoura.
  @spec escrever_prompt(String.t()) :: Path.t()
  defp escrever_prompt(texto) do
    marca = System.unique_integer([:positive])
    caminho = Path.join(System.tmp_dir!(), "fabrica-cli-prompt-#{marca}.txt")
    File.write!(caminho, texto)
    caminho
  end

  # Best-effort, como `Comando.apagar/1`: o resultado da chamada ja esta em maos, entao
  # falhar em apagar nao pode derrubar o retorno. Mas tambem nao pode sumir em silencio.
  @spec apagar_prompt(Path.t()) :: :ok
  defp apagar_prompt(caminho) do
    case File.rm(caminho) do
      :ok ->
        :ok

      {:error, :enoent} ->
        :ok

      {:error, motivo} ->
        Logger.warning("nao consegui apagar o prompt temporario #{caminho}: #{inspect(motivo)}")
    end
  end

  @doc """
  Interpreta a saida do CLI: uma linha de JSON por evento.

  Publica de proposito — e ela que o teste exercita com eventos conhecidos, sem processo
  nenhum no meio.

  O mapa e ABERTO de proposito. `Comando.rodar_separado/3` devolve mais campos que estes dois
  (`motivo`, `codigo`, duracao), e um spec fechado fazia o Dialyzer dizer, com razao, que
  `conversar/2` chamava esta funcao de um jeito que nunca sucede — spec mentindo enquanto a
  execucao funcionava. Declarar `Comando.resultado()` consertaria igual e acoplaria os dois
  modulos; manter o mapa aberto e o que deixa este teste passar um mapa de duas chaves montado
  a mao, que e por que `interpretar/2` e publica.

  `raiz` e a METADE 2 do confinamento (ver `@moduledoc`): com ela, cada argumento de caminho
  de cada `tool_use` passa por `Confinamento.resolver/2` antes de a resposta ser dada por
  boa. Sem ela (o padrao — todo teste que nao testa confinamento chama so `interpretar/1`) a
  auditoria fica desligada, por nao ter contra o que comparar.
  """
  @spec interpretar(
          %{
            :stdout => String.t(),
            :stderr => String.t(),
            optional(atom()) => term()
          },
          Path.t() | nil
        ) :: {:ok, Resposta.t()} | {:erro, term()}
  def interpretar(resultado, raiz \\ nil)

  def interpretar(%{stdout: stdout, stderr: stderr}, raiz) do
    eventos = eventos(stdout)

    case cota(eventos, stdout <> stderr) do
      {:cota, reabre_em} -> {:erro, {:cota, reabre_em}}
      :nao -> montar(eventos, raiz)
    end
  end

  defp eventos(stdout) do
    stdout
    |> String.split("\n", trim: true)
    |> Enum.flat_map(fn linha ->
      case Jason.decode(linha) do
        {:ok, %{} = evento} -> [evento]
        # Linha que nao e JSON e ignorada: o CLI as vezes escreve texto solto, e derrubar o
        # despacho por causa de uma linha de ruido seria trocar a entrega por rigor formal.
        _ -> []
      end
    end)
  end

  # A PAREDE DE COTA, lida do evento que o CLI realmente emite.
  #
  # A primeira versao (T-018) procurava `subtype in ["usage_limit","rate_limit"]` ou
  # `type == "usage_limit"`, e **nenhum dos dois existe**. O evento real, capturado no probe
  # da T-018a, e:
  #
  #     {"type":"rate_limit_event",
  #      "rate_limit_info":{"status":"allowed","resetsAt":1788236400,
  #                         "unifiedWindows":{"five_hour":{"utilization":0.67}}}}
  #
  # Ou seja: o ramo estruturado nunca disparava, e sobrava so o fallback por texto. A parede
  # de cota e estruturalmente necessaria sob assinatura — nao reconhece-la e nao ter o
  # mecanismo.
  #
  # `status` que nao COMECA por `allowed` e a parede. Comparar contra uma lista de status
  # ruins seria adivinhar quais existem; o que se sabe e qual e o status BOM.
  #
  # `allowed` sozinho nao bastava: a amostra real da T-018b (usada pela T-018e para provar
  # `motivo_parada` contra um stream de verdade) tem `"status":"allowed_warning"` —
  # `isUsingOverage: false`, `utilization: 0.99` sob `surpassedThreshold: 0.9` — ainda
  # PERMITIDO, so perto do teto. Comparar por igualdade exata tratava isso como parede e
  # derrubava a sessao inteira num falso positivo.
  defp cota(eventos, texto) do
    estruturado = Enum.find(eventos, &parede?/1)

    cond do
      estruturado ->
        {:cota, horario(reabre_em(estruturado))}

      texto =~ ~r/limit reached|usage limit|rate.?limit exceeded/i ->
        {:cota, horario_no_texto(texto)}

      true ->
        :nao
    end
  end

  defp parede?(%{"type" => "rate_limit_event", "rate_limit_info" => %{"status" => status}}) do
    not String.starts_with?(status, "allowed")
  end

  defp parede?(evento) do
    evento["subtype"] in ["usage_limit", "rate_limit"] or evento["type"] == "usage_limit"
  end

  defp reabre_em(%{"rate_limit_info" => %{} = info}) do
    info["resetsAt"] || info["resets_at"]
  end

  defp reabre_em(evento), do: evento["resetsAt"] || evento["resets_at"]

  @doc """
  A utilizacao das janelas de cota, quando o CLI a informa.

  Chega de graca em toda resposta, dentro do `rate_limit_event`, e e o numero que o piloto
  automatico da v1.0 vai querer para decidir se comeca mais uma rodada. Devolve `nil` quando
  o evento nao veio.
  """
  @spec janelas_de_cota(String.t()) :: %{String.t() => map()} | nil
  def janelas_de_cota(stdout) do
    stdout
    |> eventos()
    |> Enum.find_value(fn
      %{"type" => "rate_limit_event", "rate_limit_info" => info} -> info["unifiedWindows"]
      _outro -> nil
    end)
  end

  defp horario(nil), do: nil

  defp horario(valor) when is_integer(valor) do
    case DateTime.from_unix(valor) do
      {:ok, quando} -> quando
      _ -> nil
    end
  end

  defp horario(valor) when is_binary(valor) do
    case DateTime.from_iso8601(valor) do
      {:ok, quando, _} -> quando
      _ -> nil
    end
  end

  defp horario(_), do: nil

  defp horario_no_texto(texto) do
    case Regex.run(~r/(\d{4}-\d{2}-\d{2}T[\d:]+(?:\.\d+)?Z?)/, texto) do
      [_, iso] -> horario(iso)
      _ -> nil
    end
  end

  defp montar(eventos, raiz) do
    blocos = Enum.flat_map(eventos, &blocos_do_evento/1)
    resultado = Enum.find(eventos, &(&1["type"] == "result"))

    cond do
      resultado == nil and blocos == [] ->
        {:erro, :saida_ininteligivel}

      (caminhos_fora = fora_do_confinamento(blocos, raiz)) != [] ->
        {:erro, {:fora_do_confinamento, caminhos_fora}}

      true ->
        {:ok,
         %Resposta{
           blocos: blocos,
           motivo_parada: motivo_parada(resultado),
           consumo: consumo(resultado)
         }}
    end
  end

  # A AUDITORIA (metade 2 do confinamento — ver `@moduledoc`). Sem `raiz` (interpretar/1) nao
  # ha contra o que comparar, e fica desligada — a chamada de producao (`conversar/2`) sempre
  # passa `raiz`. Usa `Confinamento.resolver/2`, a MESMA funcao da T-012: nenhuma regra de
  # caminho e escrita aqui.
  defp fora_do_confinamento(_blocos, nil), do: []

  defp fora_do_confinamento(blocos, raiz) do
    blocos
    |> Enum.filter(&(&1.tipo == :uso_de_ferramenta))
    |> Enum.flat_map(&caminhos_do_bloco/1)
    |> Enum.uniq()
    |> Enum.filter(&fora_da_raiz?(raiz, &1))
  end

  defp caminhos_do_bloco(%{argumentos: argumentos}) do
    argumentos
    |> Enum.filter(fn {chave, valor} -> chave in @chaves_de_caminho and is_binary(valor) end)
    |> Enum.map(fn {_chave, valor} -> valor end)
  end

  defp fora_da_raiz?(raiz, caminho) do
    match?({:erro, _motivo}, Confinamento.resolver(raiz, caminho))
  end

  defp blocos_do_evento(%{"type" => "assistant", "message" => %{"content" => conteudo}}) do
    Enum.map(conteudo, &traduzir_bloco/1)
  end

  defp blocos_do_evento(_evento), do: []

  # A TRADUCAO e a razao deste modulo existir: o resto da fabrica nao pode saber qual
  # adaptador esta rodando. O vocabulario do CLI para aqui.
  defp traduzir_bloco(%{"type" => "text", "text" => texto}) do
    %{tipo: :texto, texto: texto}
  end

  defp traduzir_bloco(%{"type" => "tool_use"} = bloco) do
    %{
      tipo: :uso_de_ferramenta,
      id: bloco["id"],
      nome: bloco["name"],
      argumentos: bloco["input"] || %{}
    }
  end

  # O raciocinio estendido tem tipo PROPRIO, e nao cai em `:desconhecido`.
  #
  # Ele aparece em praticamente toda resposta, entao trata-lo como desconhecido encheria o
  # historico de blocos opacos — e `:desconhecido` deixaria de significar "algo que eu nao
  # esperava", que e para o que ele serve.
  #
  # A `signature` vem junto de proposito: e ela que permite devolver o bloco de raciocinio ao
  # modelo numa volta seguinte. Descarta-la aqui tornaria o historico irreaproveitavel.
  defp traduzir_bloco(%{"type" => "thinking"} = bloco) do
    %{tipo: :raciocinio, texto: bloco["thinking"], assinatura: bloco["signature"]}
  end

  defp traduzir_bloco(outro), do: %{tipo: :desconhecido, bruto: outro}

  # Le SO o evento terminal (`type: "result"`) — nunca `blocos`, que e a sessao inteira. A
  # grafia do subtype foi medida contra o CLI de verdade pela T-018b: `--max-turns` real
  # produz `"subtype":"error_max_turns"` no evento de resultado. Confirmado, e nao palpite.
  defp motivo_parada(resultado) do
    cond do
      resultado["subtype"] == "error_max_turns" -> :teto_de_voltas
      resultado["is_error"] == true -> :recusa
      true -> :fim_do_turno
    end
  end

  defp consumo(nil), do: %Consumo{}

  defp consumo(resultado) do
    uso = resultado["usage"] || %{}

    %Consumo{
      tokens_entrada: numero(uso["input_tokens"]),
      tokens_cache_escrita: numero(uso["cache_creation_input_tokens"]),
      tokens_cache_leitura: numero(uso["cache_read_input_tokens"]),
      tokens_saida: numero(uso["output_tokens"]),
      duracao_ms: numero(resultado["duration_ms"]),
      # O CLI nao expoe o TTL usado — ele gerencia o cache sozinho. `:sem_cache` aqui
      # significa "nao sei", e nao "nao houve": a reparticao de tokens acima mostra que
      # houve. Quem sabe o TTL e o MessagesAPI, e e mais uma razao de ele existir.
      ttl_cache: :sem_cache
    }
  end

  defp numero(valor) when is_integer(valor), do: valor
  defp numero(_), do: 0
end
