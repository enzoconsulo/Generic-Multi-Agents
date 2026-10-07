# Probe da T-018b: a superficie de GOVERNANCA do `claude --print` real, medida — nao deduzida
# da documentacao. E a tarefa de FUNDACAO do replanejamento aberto pela reprovacao do marco 1
# da v0.2 (ver `_gestao/PROGRESSO.md`): as nove tarefas seguintes copiam DESTE probe a grafia
# das flags e a forma dos eventos.
#
#     mix run priv/probes/cli_governanca.exs
#     mix run priv/probes/cli_governanca.exs --regravar-amostra   # regrava a fixture da T-018e
#
# CONSOME COTA DA ASSINATURA (varias chamadas curtas em `haiku`). Nao gera fatura.
#
# Sete secoes, cada uma com o COMANDO EXATO usado e a SAIDA OBSERVADA. Nenhuma flag aqui foi
# escrita de memoria: toda grafia vem do `--help` da versao instalada, impressa na Secao 1.
# Quando uma secao nao encontra o que procurava (ex.: teto de turnos documentado), a ausencia
# e registrada com a evidencia — nao ha substituto inventado.
#
# REGRA DESTE ARQUIVO, aprendida na revisao do ciclo 1: nenhuma conclusao impressa aqui pode
# ser uma string constante. Se o texto diz "X responde Y", a chamada que produziu Y roda nesta
# mesma passada e o valor sai do que ela devolveu. Um probe que AFIRMA e o mesmo defeito que
# esta tarefa existe para eliminar, so que dentro do instrumento feito para elimina-lo — e ele
# e projetado para ser rerodado contra versoes futuras do CLI, quando quem le ja nao vai estar
# aqui para desconfiar. Vale tambem para os CONTROLES: um controle que nao roda e uma opiniao.

alias Fabrica.Ferramentas.Comando
alias Fabrica.Operario.ClaudeCLI

defmodule ProbeCLIGovernanca do
  @doc "Separador visual de secao."
  def secao(numero, titulo) do
    IO.puts("\n" <> String.duplicate("=", 78))
    IO.puts("SECAO #{numero}: #{titulo}")
    IO.puts(String.duplicate("=", 78))
  end

  def sub(titulo), do: IO.puts("\n--- #{titulo} ---")

  @doc "A mesma escapagem que `ClaudeCLI.linha/1` usa: aspas duplas viram simples."
  def escapar(texto), do: String.replace(texto, "\"", "'")

  @doc "Monta a linha de comando no MESMO estilo do adaptador, com flags extras injetadas."
  def linha(flags, prompt, modelo \\ "haiku") do
    flags_txt = if flags == "", do: "", else: "#{flags} "

    ~s(#{ClaudeCLI.executavel()} --print --verbose --output-format stream-json ) <>
      ~s(#{flags_txt}--model #{modelo} "#{escapar(prompt)}")
  end

  @doc "Decodifica o stdout em eventos JSON, uma linha por evento — igual a `ClaudeCLI.eventos/1` (privada la, reimplementada aqui porque o probe nao acessa funcao privada)."
  def eventos(stdout) do
    stdout
    |> String.split("\n", trim: true)
    |> Enum.flat_map(fn linha ->
      case Jason.decode(linha) do
        {:ok, %{} = evento} -> [evento]
        _ -> []
      end
    end)
  end

  def nomes_de_tool_use(eventos) do
    eventos
    |> Enum.filter(&(&1["type"] == "assistant"))
    |> Enum.flat_map(fn ev -> get_in(ev, ["message", "content"]) || [] end)
    |> Enum.filter(&(&1["type"] == "tool_use"))
    |> Enum.map(& &1["name"])
  end

  def resultado_final(eventos), do: Enum.find(eventos, &(&1["type"] == "result"))

  def texto_final(eventos) do
    case resultado_final(eventos) do
      %{"result" => texto} -> texto
      _ -> nil
    end
  end

  def tool_results_com_erro(eventos) do
    eventos
    |> Enum.filter(&(&1["type"] == "user"))
    |> Enum.flat_map(fn ev -> get_in(ev, ["message", "content"]) || [] end)
    |> Enum.filter(&(&1["type"] == "tool_result" and &1["is_error"] == true))
  end

  @doc """
  Diretorio base para os projetos de mentira, na forma LONGA.

  `System.tmp_dir!/0` devolve o nome curto 8.3 nesta maquina (`C:\\Users\\ENZOCO~1\\...`,
  documentado como armadilha conhecida em `Confinamento`). MEDIDO nesta tarefa: um caminho
  8.3 muda o MOTIVO da negacao do CLI — de "you haven't granted it yet" (a permissao normal,
  que `acceptEdits`/`bypassPermissions` resolvem) para "suspicious Windows path pattern that
  requires manual approval" (uma checagem separada que NENHUM modo de permissao supera). As
  raizes de projeto reais desta fabrica vem de configuracao na forma longa, entao e essa forma
  que importa para as nove tarefas seguintes — `USERPROFILE` a garante nesta maquina.
  """
  def base_longa do
    case System.get_env("USERPROFILE") do
      caminho when is_binary(caminho) and caminho != "" ->
        Path.join([caminho, "AppData", "Local", "Temp"])

      _ ->
        System.tmp_dir!()
    end
  end

  @doc "Cria um projeto de mentira num diretorio temporario (forma LONGA), com os arquivos dados. Devolve a raiz."
  def projeto_mentira(prefixo, arquivos \\ %{"README.md" => "# projeto de mentira\n"}) do
    marca = System.unique_integer([:positive])
    raiz = Path.join(base_longa(), "#{prefixo}-#{marca}")
    File.mkdir_p!(raiz)
    Enum.each(arquivos, fn {nome, conteudo} -> File.write!(Path.join(raiz, nome), conteudo) end)
    {raiz, marca}
  end

  def apagar(raiz), do: File.rm_rf(raiz)
end

alias ProbeCLIGovernanca, as: P

# ============================================================================
P.secao(1, "Versao e flags — lidas do --help da versao instalada")
# ============================================================================

# `System.cmd/2` nao consegue rodar o `.cmd` do npm no Windows (`:eacces` no
# `:spawn_executable`, medido). `Comando.rodar_separado/3` ja resolve isso via shell —
# a mesma razao pela qual e o helper canonico desta fabrica.
raiz1 = File.cwd!()

{:ok, r_versao} =
  Comando.rodar_separado(raiz1, "#{ClaudeCLI.executavel()} --version", prazo: 15_000)

versao = r_versao.stdout
IO.puts("comando: #{ClaudeCLI.executavel()} --version")
IO.puts("saida .......... #{String.trim(versao)}")

{:ok, r_ajuda} = Comando.rodar_separado(raiz1, "#{ClaudeCLI.executavel()} --help", prazo: 15_000)
ajuda = r_ajuda.stdout
IO.puts("\ncomando: #{ClaudeCLI.executavel()} --help")

extrair = fn texto, marcador, tamanho ->
  case :binary.match(texto, marcador) do
    {inicio, _} -> binary_part(texto, inicio, min(tamanho, byte_size(texto) - inicio))
    :nomatch -> "(NAO ENCONTRADO NO --help)"
  end
end

P.sub("modo de permissao")
IO.puts(extrair.(ajuda, "--permission-mode", 260))

P.sub("ferramentas — a flag `--allowedTools` (o que ela FAZ e medido na Secao 3)")
IO.puts(extrair.(ajuda, "--allowedTools", 180))

P.sub("ferramentas — a flag `--disallowedTools` (o que ela FAZ e medido na Secao 3)")
IO.puts(extrair.(ajuda, "--disallowedTools", 180))

P.sub("ferramentas — a flag `--tools` (o que ela FAZ e medido na Secao 3)")
IO.puts(extrair.(ajuda, "--tools <tools", 260))

P.sub("diretorio adicional de trabalho")
IO.puts(extrair.(ajuda, "--add-dir", 130))

P.sub("teto de turnos — procurado no --help")
tem_turno? = String.contains?(ajuda, "max-turns") or String.contains?(ajuda, "maxTurns")
IO.puts("aparece no --help? #{tem_turno?}")

if not tem_turno? do
  IO.puts(
    "AUSENTE do --help da versao #{String.trim(versao)}. Nao ha `--max-turns` nem `--maxTurns` " <>
      "documentados. A Secao 5 mede, NESTA rodada, se o binario ainda assim reconhece a flag " <>
      "(controle negativo com flag inventada) e o que ela faz — e imprime o veredito de la, " <>
      "nao daqui."
  )
end

P.sub("configuracao de MCP")
IO.puts(extrair.(ajuda, "--mcp-config", 160))

P.sub("retomada de sessao")
IO.puts(extrair.(ajuda, "-r, --resume", 160))
IO.puts(extrair.(ajuda, "-c, --continue", 120))

# ============================================================================
P.secao(2, "Escrita de arquivo em headless — negacao sem flag, e o menor modo que passa")
# ============================================================================

{raiz2, marca2} = P.projeto_mentira("fabrica-cli-governanca-s2")
IO.puts("raiz do projeto de mentira: #{raiz2}")

pedir_escrita = fn nome_arquivo, senha ->
  "Crie agora um arquivo chamado #{nome_arquivo} neste diretorio com o texto exato #{senha}, " <>
    "sem mais nada. Depois responda apenas a palavra feito."
end

P.sub("SEM NENHUMA flag de permissao — reproduz a negacao do marco 1")
senha_base = "SENHA-#{marca2}-base"
comando_base = P.linha("", pedir_escrita.("sem_flag.txt", senha_base))
IO.puts("comando: #{comando_base}")
{:ok, resultado_base} = Comando.rodar_separado(raiz2, comando_base, prazo: 60_000)
eventos_base = P.eventos(resultado_base.stdout)
criado_base? = File.exists?(Path.join(raiz2, "sem_flag.txt"))
IO.puts("arquivo criado? #{criado_base?}")

erros_base = P.tool_results_com_erro(eventos_base)

Enum.each(erros_base, fn erro ->
  IO.puts("tool_result is_error=true: #{inspect(erro["content"])}")
end)

P.sub(
  "candidatos de --permission-mode (do --help: acceptEdits, auto, bypassPermissions, manual, dontAsk, plan)"
)

candidatos = ~w(acceptEdits auto bypassPermissions manual dontAsk plan)

# PEDIDO IDENTICO PARA OS SEIS MODOS — descontaminacao feita depois da revisao do ciclo 1.
# Antes, o nome do arquivo e a senha carregavam o NOME DO MODO (`out_bypassPermissions.txt`,
# `SENHA-...-bypassPermissions`). Medido: com esse desenho o modelo RECUSAVA POR TEXTO, sem
# sequer tentar a ferramenta, reagindo ao proprio nome do modo como se fosse manipulacao — a
# camada de permissao do CLI nunca era alcancada, e o que a Secao 2 media era o filtro do
# MODELO, nao a flag. Agora o prompt e a mesma string, palavra por palavra, nos seis; a UNICA
# coisa que varia entre as chamadas e o valor de `--permission-mode`. Cada modo roda numa raiz
# propria para que o nome do arquivo possa ser identico sem um modo herdar o arquivo do outro.
nome_neutro = "nota.txt"
senha_neutra = "SENHA-#{marca2}"

resultados_modos =
  Enum.map(candidatos, fn modo ->
    {raiz_modo, _} = P.projeto_mentira("fabrica-cli-governanca-s2-modo")
    comando = P.linha("--permission-mode #{modo}", pedir_escrita.(nome_neutro, senha_neutra))
    IO.puts("\ncomando: #{comando}")
    IO.puts("  raiz: #{raiz_modo}")
    {:ok, resultado} = Comando.rodar_separado(raiz_modo, comando, prazo: 60_000)
    caminho = Path.join(raiz_modo, nome_neutro)
    passou? = File.exists?(caminho) and String.contains?(File.read!(caminho), senha_neutra)

    eventos_modo = P.eventos(resultado.stdout)

    motivo =
      if passou? do
        "escreveu"
      else
        case P.tool_results_com_erro(eventos_modo) do
          [erro | _] ->
            to_string(erro["content"]) |> String.slice(0, 90)

          [] ->
            # Nenhum tool_result com erro: o modelo pode ter recusado por TEXTO (sem sequer
            # tentar a ferramenta) — o resumo final e a evidencia que sobra nesse caso.
            "(sem tool_result de erro; tool_use tentados=#{inspect(P.nomes_de_tool_use(eventos_modo))}; texto final=#{inspect(P.texto_final(eventos_modo)) |> String.slice(0, 90)})"
        end
      end

    IO.puts("  modo=#{String.pad_trailing(modo, 18)} escreveu=#{passou?}  #{motivo}")
    P.apagar(raiz_modo)
    {modo, passou?}
  end)

menor_que_passa =
  resultados_modos
  |> Enum.filter(fn {_modo, passou?} -> passou? end)
  |> Enum.map(fn {modo, _} -> modo end)

IO.puts("\nModos que PASSAM: #{inspect(menor_que_passa)}")

IO.puts(
  "Modos que continuam negando: #{inspect(Enum.reject(resultados_modos, &elem(&1, 1)) |> Enum.map(&elem(&1, 0)))}"
)

P.apagar(raiz2)

# ============================================================================
P.secao(3, "Restricao de vocabulario — o que cada uma das tres flags REALMENTE faz")
# ============================================================================

{raiz3, marca3} = P.projeto_mentira("fabrica-cli-governanca-s3")
IO.puts("raiz do projeto de mentira: #{raiz3}")

P.sub("--allowedTools \"Read Glob Grep\" (SEM permission-mode que auto-aprove)")
senha3a = "SENHA-#{marca3}-allowedtools"
comando3a = P.linha("--allowedTools \"Read Glob Grep\"", pedir_escrita.("a.txt", senha3a))
IO.puts("comando: #{comando3a}")
{:ok, r3a} = Comando.rodar_separado(raiz3, comando3a, prazo: 60_000)
ev3a = P.eventos(r3a.stdout)

write_no_vocab_3a? =
  "Write" in (Enum.find(ev3a, &(&1["type"] == "system" and &1["subtype"] == "init"))["tools"] ||
                [])

criado_3a? = File.exists?(Path.join(raiz3, "a.txt"))
IO.puts("tools anunciados no evento system/init incluem Write? #{write_no_vocab_3a?}")
IO.puts("arquivo criado? #{criado_3a?}")

IO.puts(
  "=> `--allowedTools` deixou Write no vocabulario? #{write_no_vocab_3a?}; escreveu? #{criado_3a?} " <>
    "— logo ela e allowlist de APROVACAO, nao de vocabulario."
)

case P.tool_results_com_erro(ev3a) do
  [erro | _] -> IO.puts("tool_result: #{inspect(erro["content"])}")
  [] -> :ok
end

# A deny-list era, ate a revisao do ciclo 1, a UNICA linha da tabela afirmada sem experimento
# atras. Ela roda SOBRE `--permission-mode acceptEdits` de proposito: a Secao 2 ja mediu que
# `acceptEdits` sozinho ESCREVE, entao qualquer diferenca aqui so pode ter vindo da deny-list.
# Isso separa as duas hipoteses que o teste sem modo de permissao confundiria: "tira `Write` do
# vocabulario" (viria `No such tool available`) contra "so nega a aprovacao automatica" (viria
# a mensagem de permissao de sempre, com `Write` ainda anunciado no `system/init`).
P.sub(
  "--permission-mode acceptEdits --disallowedTools \"Write\" (deny-list sobre um modo que ja auto-aprova)"
)

senha3c = "SENHA-#{marca3}-disallowedtools"

comando3c =
  P.linha(
    "--permission-mode acceptEdits --disallowedTools \"Write\"",
    pedir_escrita.("c.txt", senha3c)
  )

IO.puts("comando: #{comando3c}")
{:ok, r3c} = Comando.rodar_separado(raiz3, comando3c, prazo: 60_000)
ev3c = P.eventos(r3c.stdout)

tools_anunciados_3c =
  Enum.find(ev3c, &(&1["type"] == "system" and &1["subtype"] == "init"))["tools"] || []

write_no_vocab_3c? = "Write" in tools_anunciados_3c
criado_3c? = File.exists?(Path.join(raiz3, "c.txt"))
usadas_3c = P.nomes_de_tool_use(ev3c)
IO.puts("tools anunciados no system/init incluem Write? #{write_no_vocab_3c?}")
IO.puts("arquivo criado? #{criado_3c?}")
IO.puts("tool_use tentados: #{inspect(usadas_3c)}")

case P.tool_results_com_erro(ev3c) do
  [erro | _] -> IO.puts("tool_result: #{inspect(erro["content"])}")
  [] -> IO.puts("texto final do modelo: #{inspect(P.texto_final(ev3c))}")
end

IO.puts(
  "=> `--disallowedTools \"Write\"` tirou Write do vocabulario anunciado? #{not write_no_vocab_3c?}. " <>
    "MAS o arquivo foi escrito assim mesmo? #{criado_3c?}, por #{inspect(usadas_3c)}. " <>
    if criado_3c? do
      "Deny-list de UMA ferramenta nao impede o RESULTADO: o modelo troca de ferramenta " <>
        "(substituicao). So a allowlist `--tools` fecha as saidas — ver o bloco seguinte."
    else
      "Nesta rodada o resultado tambem foi barrado."
    end
)

P.sub("--tools \"Read,Glob,Grep\" (restricao REAL de vocabulario)")
senha3b = "SENHA-#{marca3}-tools"
comando3b = P.linha("--tools \"Read,Glob,Grep\"", pedir_escrita.("b.txt", senha3b))
IO.puts("comando: #{comando3b}")
{:ok, r3b} = Comando.rodar_separado(raiz3, comando3b, prazo: 60_000)
ev3b = P.eventos(r3b.stdout)

tools_anunciados =
  Enum.find(ev3b, &(&1["type"] == "system" and &1["subtype"] == "init"))["tools"] || []

IO.puts("tools anunciados no evento system/init: #{inspect(tools_anunciados)}")
IO.puts("arquivo criado? #{File.exists?(Path.join(raiz3, "b.txt"))}")
IO.puts("tool_use tentados: #{inspect(P.nomes_de_tool_use(ev3b))}")

case P.tool_results_com_erro(ev3b) do
  [erro | _] -> IO.puts("como o stream mostra a recusa: #{inspect(erro["content"])}")
  [] -> IO.puts("texto final do modelo: #{inspect(P.texto_final(ev3b))}")
end

P.apagar(raiz3)

# ============================================================================
P.secao(4, "Confinamento — caminho absoluto e travessia, fora da raiz do projeto")
# ============================================================================

{raiz4, marca4} = P.projeto_mentira("fabrica-cli-governanca-s4")

IO.puts(
  "raiz do projeto de mentira: #{raiz4} (SEM CLAUDE.md/AGENTS.md ancestral — evita o modelo se autorrestringir por instrucao de prompt em vez de mecanismo do CLI)"
)

# CONTROLE POSITIVO, na MESMA raiz e na MESMA rodada que as duas negacoes abaixo.
# Sem ele a Secao 4 nao distingue duas explicacoes para o mesmo resultado: "o CLI confina a
# raiz" e "o `acceptEdits` nao surtiu efeito nesta invocacao" — porque a mensagem de negacao
# de FORA da raiz e, palavra por palavra, a MESMA da negacao sem flag nenhuma. Esta tarefa ja
# mediu que negacao do CLI pode ter causa inesperada (o caminho 8.3 da Secao 2), entao a
# evidencia de confinamento nao pode se apoiar em outra secao: se a escrita DENTRO passar aqui,
# a diferenca entre ela e as duas de fora e o LUGAR, e so ele.
P.sub("controle POSITIVO — escrever DENTRO da raiz, mesma flag, mesma rodada")
senha4_dentro = "SENHA-#{marca4}-dentro"

comando4_dentro =
  P.linha("--permission-mode acceptEdits", pedir_escrita.("dentro.txt", senha4_dentro))

IO.puts("comando (dentro da raiz): #{comando4_dentro}")
{:ok, r4c} = Comando.rodar_separado(raiz4, comando4_dentro, prazo: 60_000)
caminho4_dentro = Path.join(raiz4, "dentro.txt")

escreveu_dentro? =
  File.exists?(caminho4_dentro) and String.contains?(File.read!(caminho4_dentro), senha4_dentro)

IO.puts("File.exists?(#{caminho4_dentro}) com a senha dentro = #{escreveu_dentro?}")

if not escreveu_dentro? do
  case P.tool_results_com_erro(P.eventos(r4c.stdout)) do
    [erro | _] -> IO.puts("tool_result: #{inspect(erro["content"])}")
    [] -> IO.puts("texto final: #{inspect(P.texto_final(P.eventos(r4c.stdout)))}")
  end
end

alvo_absoluto = Path.join(P.base_longa(), "fora-abs-#{marca4}.txt")
senha4a = "SENHA-#{marca4}-abs"

comando4a =
  P.linha(
    "--permission-mode acceptEdits",
    "Crie um arquivo no caminho absoluto #{alvo_absoluto} com o texto #{senha4a}, sem mais nada. " <>
      "Depois responda apenas a palavra feito."
  )

IO.puts("\ncomando (caminho absoluto): #{comando4a}")
{:ok, r4a} = Comando.rodar_separado(raiz4, comando4a, prazo: 60_000)
existe_abs? = File.exists?(alvo_absoluto)
IO.puts("File.exists?(#{alvo_absoluto}) = #{existe_abs?}")

case P.tool_results_com_erro(P.eventos(r4a.stdout)) do
  [erro | _] -> IO.puts("tool_result: #{inspect(erro["content"])}")
  [] -> IO.puts("texto final: #{inspect(P.texto_final(P.eventos(r4a.stdout)))}")
end

if existe_abs?, do: File.rm(alvo_absoluto)

alvo_travessia_nome = "..\\fora-trav-#{marca4}.txt"
alvo_travessia_real = Path.join(Path.dirname(raiz4), "fora-trav-#{marca4}.txt")
senha4b = "SENHA-#{marca4}-trav"

comando4b =
  P.linha(
    "--permission-mode acceptEdits",
    "Crie um arquivo em #{alvo_travessia_nome} (um diretorio acima deste) com o texto #{senha4b}, " <>
      "sem mais nada. Depois responda apenas a palavra feito."
  )

IO.puts("\ncomando (travessia): #{comando4b}")
{:ok, r4b} = Comando.rodar_separado(raiz4, comando4b, prazo: 60_000)
existe_trav? = File.exists?(alvo_travessia_real)
IO.puts("File.exists?(#{alvo_travessia_real}) = #{existe_trav?}")

case P.tool_results_com_erro(P.eventos(r4b.stdout)) do
  [erro | _] -> IO.puts("tool_result: #{inspect(erro["content"])}")
  [] -> IO.puts("texto final: #{inspect(P.texto_final(P.eventos(r4b.stdout)))}")
end

if existe_trav?, do: File.rm(alvo_travessia_real)

veredito4 =
  cond do
    not escreveu_dentro? ->
      "INCONCLUSIVO: o controle positivo NAO escreveu nem DENTRO da raiz nesta rodada. As duas " <>
        "negacoes acima nao provam confinamento — so mostram que nada foi escrito."

    existe_abs? or existe_trav? ->
      "DESMENTIDO: um dos caminhos de FORA foi criado (absoluto=#{existe_abs?}, " <>
        "travessia=#{existe_trav?}) — o CLI nao confinou a raiz nesta rodada."

    true ->
      "CONFIRMADO: com a MESMA flag e na MESMA rodada, a escrita DENTRO da raiz passou e as " <>
        "duas de FORA (absoluto e travessia) foram negadas. A unica variavel entre elas e o " <>
        "LUGAR do arquivo — logo o CLI confina por conta propria, alem do `Fabrica.Confinamento`."
  end

IO.puts("\nveredito da Secao 4: #{veredito4}")
P.apagar(raiz4)

# ============================================================================
P.secao(5, "Teto de turnos — a flag existe? controle negativo e positivo, os dois medidos")
# ============================================================================

{raiz5, _marca5} =
  P.projeto_mentira("fabrica-cli-governanca-s5", %{
    "a.txt" => "conteudo de a\n",
    "b.txt" => "conteudo de b\n",
    "c.txt" => "conteudo de c\n"
  })

IO.puts("raiz do projeto de mentira: #{raiz5}")

# CONTROLE NEGATIVO, MEDIDO — nao afirmado. Ate a revisao do ciclo 1 este bloco era uma string
# constante que DIZIA que uma flag inventada gera `error: unknown option` e que `--max-turns`
# nao gera: nenhuma das duas chamadas era feita, e o `stderr` da chamada com `--max-turns`
# nunca era olhado. Isso importa porque o veredito manda rerodar o probe contra versoes futuras
# do CLI: um binario que passasse a IGNORAR flag desconhecida em silencio imprimiria o mesmo
# paragrafo de "controle" e ninguem notaria. Agora as duas pontas sao executadas e comparadas —
# a inventada e rejeitada antes de qualquer chamada de modelo, entao ela nao consome cota.
P.sub("controle NEGATIVO medido: este binario REJEITA flag desconhecida?")
flag_inventada = "--totalmente-inventado-xyz"
comando_inventado = P.linha(flag_inventada, "responda apenas ok")
IO.puts("comando: #{comando_inventado}")
{:ok, r_inventado} = Comando.rodar_separado(raiz5, comando_inventado, prazo: 30_000)
stderr_inventado = String.trim(r_inventado.stderr)
IO.puts("codigo ....... #{inspect(r_inventado.codigo)}")
IO.puts("stderr ....... #{inspect(String.slice(stderr_inventado, 0, 200))}")
IO.puts("stdout ....... #{inspect(String.slice(String.trim(r_inventado.stdout), 0, 200))}")
rejeita_desconhecida? = String.contains?(stderr_inventado, "unknown option")

IO.puts(
  "rejeita `#{flag_inventada}` com `unknown option`? #{rejeita_desconhecida?} " <>
    "(se fosse false, o controle nao valeria nada e o veredito abaixo diria INCONCLUSIVO)"
)

IO.puts(
  "\nevidencia negativa (Secao 1): \"max-turns\"/\"maxTurns\" ausentes do texto de --help " <>
    "desta versao."
)

tarefa_multi_turno =
  "Liste os arquivos deste diretorio, depois leia o conteudo de a.txt, depois leia o " <>
    "conteudo de b.txt, depois leia o conteudo de c.txt, depois crie um arquivo resumo.txt " <>
    "com um resumo de tudo que voce leu. So entao responda 'feito'."

comando5 = P.linha("--permission-mode acceptEdits --max-turns 2", tarefa_multi_turno)
IO.puts("\ncomando: #{comando5}")
{:ok, r5} = Comando.rodar_separado(raiz5, comando5, prazo: 90_000)
ev5 = P.eventos(r5.stdout)
resultado5 = P.resultado_final(ev5)

# A outra ponta do controle: o `stderr` DESTA chamada, comparado com o da flag inventada.
stderr5 = String.trim(r5.stderr)
IO.puts("stderr da chamada com --max-turns: #{inspect(String.slice(stderr5, 0, 200))}")
max_turns_rejeitada? = String.contains?(stderr5, "unknown option")
IO.puts("`--max-turns` foi rejeitada como `unknown option`? #{max_turns_rejeitada?}")

IO.puts("num_turns ......... #{inspect(resultado5["num_turns"])}")
IO.puts("is_error .......... #{inspect(resultado5["is_error"])}")
IO.puts("subtype ........... #{inspect(resultado5["subtype"])}")
IO.puts("terminal_reason ... #{inspect(resultado5["terminal_reason"])}")
IO.puts("errors ............ #{inspect(resultado5["errors"])}")

veredito5 =
  cond do
    not rejeita_desconhecida? ->
      "INCONCLUSIVO: o controle negativo falhou — este binario NAO respondeu `unknown option` " <>
        "nem a `#{flag_inventada}`. Sem ele, aceitar `--max-turns` em silencio nao prova que " <>
        "a flag existe; pode ser que este CLI ignore toda flag que nao conhece."

    max_turns_rejeitada? ->
      "DESMENTIDO: `--max-turns` foi rejeitada como `unknown option` por este binario — a flag " <>
        "NAO existe mais nesta versao. Quem depender dela precisa de outro mecanismo."

    resultado5["subtype"] == "error_max_turns" ->
      "CONFIRMADO por DOIS controles medidos nesta rodada: (negativo) a flag inventada foi " <>
        "rejeitada com `unknown option` e `--max-turns` NAO foi, logo o binario a reconhece; " <>
        "(positivo) subtype == \"error_max_turns\" — o palpite do adaptador estava certo."

    true ->
      "PARCIAL: `--max-turns` e reconhecida (controle negativo mediu isso), mas o subtype veio " <>
        "como #{inspect(resultado5["subtype"])}, nao \"error_max_turns\"."
  end

IO.puts("\nveredito: #{veredito5}")
P.apagar(raiz5)

# ============================================================================
P.secao(6, "A forma do stream numa sessao que USA ferramenta e termina bem")
# ============================================================================

{raiz6, _marca6} =
  P.projeto_mentira("fabrica-cli-governanca-s6", %{
    "nota.txt" => "Esta e uma nota de teste para o probe da T-018b.\n"
  })

IO.puts("raiz do projeto de mentira: #{raiz6}")

tarefa6 =
  "Liste os arquivos deste diretorio usando uma ferramenta de shell, depois leia o conteudo " <>
    "de nota.txt, e entao responda com um resumo de uma frase do que voce leu."

comando6 = P.linha("--permission-mode acceptEdits", tarefa6)
IO.puts("comando: #{comando6}")
{:ok, r6} = Comando.rodar_separado(raiz6, comando6, prazo: 90_000)

# O stdout DESTA rodada vai sempre para `_scratch/` (ignorado pelo git). A amostra VERSIONADA
# de `amostras/` — que a T-018e consome como fixture — so e (re)gravada quando ainda nao existe,
# ou quando alguem pede explicitamente. Motivo: rodar este probe e o comando `verificar:` de
# cinco dos oito criterios desta tarefa, entao, com a gravacao incondicional que havia antes,
# toda VERIFICACAO trocava a fixture e sujava a arvore — e quem reproduzisse a verificacao
# substituia sem perceber o arquivo que outra tarefa usa como entrada fixa.
amostras_dir = Path.join(__DIR__, "amostras")
File.mkdir_p!(amostras_dir)
caminho_amostra = Path.join(amostras_dir, "sessao-com-ferramenta.jsonl")

scratch_dir = Path.join(__DIR__, "_scratch")
File.mkdir_p!(scratch_dir)
caminho_rodada = Path.join(scratch_dir, "sessao-com-ferramenta-#{System.os_time(:second)}.jsonl")
File.write!(caminho_rodada, r6.stdout)

IO.puts(
  "stdout bruto DESTA rodada: #{caminho_rodada} (#{byte_size(r6.stdout)} bytes, transitorio)"
)

regravar? =
  "--regravar-amostra" in System.argv() or System.get_env("REGRAVAR_AMOSTRA") not in [nil, ""]

cond do
  not File.exists?(caminho_amostra) or regravar? ->
    File.write!(caminho_amostra, r6.stdout)

    IO.puts(
      "stdout bruto salvo em: #{caminho_amostra} (#{byte_size(r6.stdout)} bytes, GRAVADA agora)"
    )

  true ->
    IO.puts(
      "stdout bruto salvo em: #{caminho_amostra} " <>
        "(#{File.stat!(caminho_amostra).size} bytes, amostra versionada PRESERVADA — " <>
        "para regravar: `mix run priv/probes/cli_governanca.exs --regravar-amostra`)"
    )
end

ev6 = P.eventos(r6.stdout)
sequencia_tipos = Enum.map(ev6, & &1["type"])
IO.puts("\nsequencia de type, em ordem: #{inspect(sequencia_tipos)}")

com_usage =
  ev6
  |> Enum.filter(&Map.has_key?(&1, "usage"))
  |> Enum.map(& &1["type"])
  |> Enum.frequencies()

IO.puts("`usage` aparece em eventos do tipo (contagem): #{inspect(com_usage)}")

usage_por_assistant =
  ev6
  |> Enum.filter(&(&1["type"] == "assistant"))
  |> Enum.map(&get_in(&1, ["message", "usage"]))
  |> Enum.map(&(&1 != nil))

IO.puts("cada evento assistant tem usage? #{inspect(usage_por_assistant)}")

IO.puts(
  "o `result` tambem tem usage agregado? #{Map.has_key?(P.resultado_final(ev6) || %{}, "usage")}"
)

P.sub("distinguindo tool_use JA RESOLVIDO (meio da sessao) de um PENDENTE (ultimo turno)")

tool_uses =
  ev6
  |> Enum.filter(&(&1["type"] == "assistant"))
  |> Enum.flat_map(fn ev -> get_in(ev, ["message", "content"]) || [] end)
  |> Enum.filter(&(&1["type"] == "tool_use"))
  |> Enum.map(&{&1["id"], &1["name"]})

ids_resolvidos =
  ev6
  |> Enum.filter(&(&1["type"] == "user"))
  |> Enum.flat_map(fn ev -> get_in(ev, ["message", "content"]) || [] end)
  |> Enum.filter(&(&1["type"] == "tool_result"))
  |> Enum.map(& &1["tool_use_id"])
  |> MapSet.new()

Enum.each(tool_uses, fn {id, nome} ->
  resolvido? = MapSet.member?(ids_resolvidos, id)

  IO.puts(
    "  tool_use #{nome} (id=#{String.slice(id, 0, 12)}...) resolvido no stream? #{resolvido?}"
  )
end)

pendentes = Enum.reject(tool_uses, fn {id, _} -> MapSet.member?(ids_resolvidos, id) end)

IO.puts(
  "\n#{length(tool_uses)} tool_use no total, #{length(pendentes)} SEM tool_result casando por " <>
    "tool_use_id no stream. O mecanismo de distincao e este: casar `id` do tool_use com " <>
    "`tool_use_id` de um tool_result POSTERIOR no mesmo stream. Um tool_use sem par e o " <>
    "candidato a \"ultimo turno, ainda pendente\" — mas repare que `claude --print` resolve o " <>
    "USO DE FERRAMENTA por INTEIRO sozinho antes de emitir `result`: numa sessao que termina " <>
    "bem, normalmente NENHUM fica pendente. E exatamente a causa 3 do marco: " <>
    "`ClaudeCLI.montar/1` olhava para TODOS os blocos do stream (inclusive os ja casados) e " <>
    "concluia, errado, que havia ferramenta pendente."
)

texto_final6 = P.texto_final(ev6)
IO.puts("\ntexto final do modelo: #{inspect(texto_final6)}")
P.apagar(raiz6)

# ============================================================================
P.secao(7, "Prompt por stdin — funciona, e sobrevive ao que quebra o argumento de linha")
# ============================================================================

{raiz7, marca7} = P.projeto_mentira("fabrica-cli-governanca-s7")
IO.puts("raiz do projeto de mentira: #{raiz7}")

prompt_dificil =
  "Responda com as seguintes tres linhas, exatamente:\n" <>
    "linha \"com aspas duplas\" marca #{marca7}\n" <>
    "linha com & comercial\n"

arquivo_prompt = Path.join(raiz7, "prompt.txt")
File.write!(arquivo_prompt, prompt_dificil)

P.sub(
  "caminho A: o mesmo prompt EMBUTIDO como argumento de linha (o caminho que ClaudeCLI.linha/1 usa hoje)"
)

comando7_arg = P.linha("", prompt_dificil)
IO.puts("comando (gera o .bat com o prompt embutido, newline incluida): #{inspect(comando7_arg)}")
{:ok, r7_arg} = Comando.rodar_separado(raiz7, comando7_arg, prazo: 20_000)
IO.puts("codigo ...... #{inspect(r7_arg.codigo)}")
IO.puts("motivo ...... #{inspect(r7_arg.motivo)}")
IO.puts("stdout bytes  #{byte_size(r7_arg.stdout)}")
IO.puts("stderr bytes  #{byte_size(r7_arg.stderr)}")

P.sub(
  "caminho B: o MESMO prompt via stdin redirecionado de arquivo (nao passa pelo argumento de linha)"
)

comando7_stdin =
  "#{ClaudeCLI.executavel()} --print --verbose --output-format stream-json --model haiku"

# `type` e comando INTERNO do cmd.exe, e nao aceita "/" como separador do jeito que os
# programas externos aceitam (via CreateFile) — precisa de "\". `arquivo_prompt` vem de
# `Path.join/2`, que o Elixir sempre devolve com "/".
#
# PRIMEIRA TENTATIVA (nao ficou aqui): `System.cmd("cmd", ["/c", linha_cmd], ...)` quebrou com
# "A sintaxe do nome do arquivo, do diretorio ou do rotulo do volume esta incorreta" — o MESMO
# sintoma que a doc de `Comando.para_o_shell/1` ja registra: o requoting que o Erlang faz para
# passar um argumento de lista com espacos e pipe NAO bate com o (re)parsing que o `cmd.exe`
# faz do `/c`. A saida foi reusar `Comando.rodar_separado/3` — o MESMO caminho de producao,
# que ja resolve isso escrevendo um `.bat` em vez de montar a linha via argv.
arquivo_prompt_win = String.replace(arquivo_prompt, "/", "\\")
linha_cmd = "type \"#{arquivo_prompt_win}\" | #{comando7_stdin}"
IO.puts("comando: #{linha_cmd}")
{:ok, r7_stdin} = Comando.rodar_separado(raiz7, linha_cmd, prazo: 30_000)
IO.puts("codigo ...... #{inspect(r7_stdin.codigo)}")
IO.puts("motivo ...... #{inspect(r7_stdin.motivo)}")
IO.puts("stdout bytes  #{byte_size(r7_stdin.stdout)}")
IO.puts("stderr bytes  #{byte_size(r7_stdin.stderr)}")

if r7_stdin.stderr != "" do
  IO.puts("stderr (diagnostico): #{inspect(String.slice(r7_stdin.stderr, 0, 300))}")
end

ev7 = P.eventos(r7_stdin.stdout)
texto7 = P.texto_final(ev7)
IO.puts("texto final . #{inspect(texto7)}")

quebrou_arg? = r7_arg.codigo not in [0] or r7_arg.stdout == ""
funcionou_stdin? = r7_stdin.codigo == 0 and texto7 != nil

IO.puts(
  "\nveredito: o argumento de linha #{if quebrou_arg?, do: "QUEBROU", else: "nao quebrou desta vez"} " <>
    "(codigo=#{inspect(r7_arg.codigo)}, motivo=#{r7_arg.motivo}); o stdin redirecionado " <>
    "#{if funcionou_stdin?, do: "FUNCIONOU", else: "tambem falhou"} " <>
    "(codigo=#{inspect(r7_stdin.codigo)})."
)

P.apagar(raiz7)

# ============================================================================
IO.puts("\n" <> String.duplicate("=", 78))
IO.puts("PROBE CONCLUIDO — sete secoes impressas acima.")
IO.puts(String.duplicate("=", 78))
