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

  Escolher o TTL ele nao deixa; INFORMAR o que usou, ele informa (`usage.cache_creation`, no
  `claude` 2.1.287), e e dali que sai o multiplicador da escrita de cache (T-086). Antes ela
  era cobrada a 0,0x, e o custo de um despacho real saia de 10x a 27x abaixo do
  `total_cost_usd` do proprio CLI.

  Isso nao e defeito deste adaptador: e a razao de o `Operario.MessagesAPI` (T-019) existir.
  A economia que sobra na v1 — as ~21 escritas de prefixo por rodada, ~50% da conta de
  entrada — so e alcancavel por quem monta a requisicao. E por isso que o marco da v0.2 mede
  a escrita de prefixo em vez de aceitar que ela e o que e.

  ## A parede de cota

  Sob assinatura, o que aperta nao e dinheiro: e a cota acabar. O CLI sinaliza isso com
  mensagem e horario de reabertura, e este adaptador traduz para
  `{:erro, {:cota, reabre_em}}`. A v0.4 depende disso para dormir e rearmar.

  **O veredito e do `result`, nao do aviso** (T-087). O `rate_limit_event` com `status`
  `rejected` pode chegar numa chamada que o CLI ATENDEU (medido no 2.1.287: `result` success,
  resposta dada, `total_cost_usd` > 0). Parede e so a chamada NAO atendida — sem `result`,
  `result` de erro POR LIMITE, ou `result` sem erro e sem resposta nenhuma. Um `result` de erro
  PROPRIO conhecido (`error_max_turns`, `error_during_execution`, `error_max_budget_usd`) que
  nao carrega a mensagem de limite e chamada atendida: segue o caminho que seguiria sem o aviso
  (ex.: `motivo_parada: :teto_de_voltas`, com o consumo, no `--max-turns` da propria fabrica).
  Atendida, o trabalho ja foi feito e pago, e o aviso vira `Logger.warning` com a janela e o
  `resetsAt`.

  **Parede real nunca passa por atendida** (T-087, Ciclo 3). Duas travas, as duas: (a) com o
  aviso presente, `is_error: true` de qualquer OUTRO `subtype` e parede — a parede do 2.1.287
  chega como `subtype: "success"` + `is_error: true`; (b) UM reconhecedor da mensagem de limite
  (`texto_de_limite?/1`: o prefixo do proprio CLI, "You've hit your ... limit" com o nome da
  janela no meio, mais "monthly spend limit" e as formas antigas), usado pelo caminho com aviso
  E pelo fallback por texto.

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

  ## Vocabulario de ferramentas — `--tools` fecha; `--allowedTools` nunca o substitui

  Com a familia `:agente_completo`, quem executa ferramenta e o CLI — as ausencias que o
  `Fabrica.Ferramentas.Catalogo` garante (verificador e revisor sem `escrever`/`editar`) so
  valem se a LINHA DE COMANDO tambem as impuser. A T-018b mediu as tres flags de ferramenta:
  `--allowedTools` e allowlist de APROVACAO (o modelo ainda ve e pode tentar `Write`, so a
  permissao barra); `--disallowedTools` tira a ferramenta NOMEADA do vocabulario anunciado
  mas e furada por SUBSTITUICAO (medido: com `Write` proibido, o modelo escreveu com `Bash`).
  **So `--tools "<lista>"` fecha as saidas de verdade** — o `system/init` do CLI nem anuncia
  a ferramenta fora da lista, e uma tentativa volta `No such tool available`. `familia/0`
  e `ferramentas_cli/1`, abaixo, sao o que monta essa lista a partir do catalogo da fabrica.
  `--disallowedTools` nunca entra na linha; `--allowedTools` entra so como APROVACAO do Bash,
  por cima do `--tools` e nunca no lugar dele (secao seguinte).

  **`Requisicao.vocabulario` escolhe um vocabulario MENOR que o do papel (T-100).** O papel
  e um pacote fixo (construtor leva `rodar`, goste ou nao a tarefa dele); uma tarefa cujo
  trabalho real nao precisa de Bash pode pedir so o que precisa
  (`ferramentas_cli_do_vocabulario/1`), e assim nao sobe o bloco de sandbox (secao abaixo) nem
  depende dele estar disponivel na maquina. O vocabulario explicito SUBSTITUI o do papel, nunca
  soma a ele — `linha/1` usa um ou outro, nunca os dois.

  ## Comando de shell aprovado — `--allowedTools "Bash"` (T-088)

  **O que ele aprova.** Em `--print` nao ha quem responda pedido de permissao, e `acceptEdits`
  so auto-aprova EDICAO (`Write`/`Edit`). Medido no `claude` 2.1.287 (Notas da T-088): com
  `--permission-mode acceptEdits --tools "Bash"`, TODO comando volta "This command requires
  approval" (`is_error: true`, o Bash listado em `permission_denials`) — o construtor
  escreveria codigo sem rodar um teste, e o verificador nao executaria criterio nenhum.
  Somando `--allowedTools "Bash"`, o comando roda (`42`, `permission_denials: []`). Por isso
  `linha/1` leva `--allowedTools "Bash"` para todo papel cujo `--tools` ja contem `Bash`
  (hoje: construtor e verificador) e para mais nenhum: `--tools` decide o que EXISTE,
  `--allowedTools` so APROVA dentro disso — papel sem `rodar` no catalogo nao ganha nada, e
  nenhuma outra ferramenta e aprovada por flag (`Write`/`Edit` seguem no `acceptEdits`). A
  aprovacao e do Bash INTEIRO, sem lista de comandos (D-015, adendo 2): o construtor precisa
  de comandos que nao cabem numa lista fixa — instalar dependencia, o runner de teste do
  ecossistema do projeto, `git`.

  **O que ele NAO confina.** A aprovacao, sozinha, nao confina nada: o confinamento de
  `Write`/`Edit` (`acceptEdits` + diretorio de trabalho = `raiz`, metade 1 abaixo) NAO vale
  para comando de shell, e a auditoria por caminho (metade 2) tambem nao o pega — ela le
  `file_path`/`path`/`notebook_path`, e o Bash so manda `command`. Quem confina o shell e o
  SANDBOX do proprio `claude`, que vai na mesma linha para todo papel com Bash (secao
  seguinte, T-090): o papel que tem `--allowedTools "Bash"` tem, sempre, o `--settings` do
  sandbox ao lado.

  ## O shell roda no sandbox do proprio `claude` (T-090, D-016)

  Todo papel cujo `--tools` contem `Bash` sobe com `--settings` levando
  `{"sandbox": {"enabled": true, "failIfUnavailable": true, "autoAllowBashIfSandboxed": true,
  "allowUnsandboxedCommands": false}}`; papel sem Bash nao leva o bloco (nao ha shell a
  confinar). Nao existe chave de configuracao para desliga-lo: um confinamento que se desliga
  e o mesmo risco que fez o disparo da T-058 ser recusado (D-015, adendo 7).

  **O que ele confina** (medido em 2026-10-02 no `claude` 2.1.287, haiku, `mktemp -d` em
  `/tmp`; tabela na T-090, sonda nas Notas dela): a ESCRITA do shell fica presa a raiz. Dentro
  dela, `python3 -c 'print(6*7)'` da `42`, gravar funciona e `node --test` passa; um `echo`
  para `$HOME` ou para um irmao da raiz em `/tmp` volta `Read-only file system` — o sistema
  operacional nega, nao uma regra desta fabrica. `allowUnsandboxedCommands: false` fecha a
  valvula: o agente que pede `dangerouslyDisableSandbox: true` no Bash recebe a mesma negacao.
  No Linux o sandbox depende de `bubblewrap` (`bwrap`) e `socat`.

  **Onde ele nao existe, o papel com Bash NAO sobe.** `failIfUnavailable: true` troca o shell
  solto por erro: sem `bwrap`/`socat`, o `claude` sai com 1 sem abrir sessao — no stdout
  (`stream-json`, o desta linha) so uma linha `result` de erro (`error_during_execution`,
  `num_turns: 0`, o motivo em `errors`), e no stderr "sandbox required but unavailable ...
  refusing to start without a working sandbox". `interpretar/2` reconhece a sessao que nao
  subiu (nenhum `system/init`, so `result` de zero voltas) com esse texto e devolve
  `{:erro, :sandbox_indisponivel}` — nao sucesso, nao `:recusa` (o que aquele `result` de erro
  viraria pelo caminho normal), nao parede de cota. O mesmo vale para o **Windows nativo**, que o sandbox do `claude` nao
  suporta: la o construtor e o verificador reais nao rodam; rodam no Linux (nuvem) ou em WSL2.

  **O que ele NAO confina:** (1) a LEITURA — um comando pode ler fora da raiz (o sandbox
  confina escrita, nao leitura); (2) a REDE do shell fica restrita por padrao, entao comando
  que baixa dependencia pode falhar dentro dele — isto e restricao a mais, nao a menos, mas e
  o que se ve quando um `npm install` quebra; (3) o que roda FORA do Bash — `Write`/`Edit` sao
  as metades 1 e 2, abaixo.

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
  deteccao: o que impede a fabrica de dar por bom um despacho que saiu da raiz. A sessao, porem,
  ja rodou e ja foi paga: `conversar/2` (via `responder/2`) entrega o erro com o consumo do
  `result` — `{:erro, {:com_consumo, {:fora_do_confinamento, caminhos}, consumo}}` — para o
  `Agente.Laco` contabiliza-lo (T-089). Sem `raiz`
  (chamar `interpretar/1`, como todo teste que nao testa confinamento faz) a auditoria fica
  desligada, por nao ter contra o que comparar.

  ## A lacuna que fica: comando de shell nao se audita por caminho

  `rodar` (a ferramenta `Bash` do CLI) pode sair da raiz de mil formas, e nenhuma expressao
  regular sobre o texto do comando cobre isso honestamente — NAO tentamos. As saidas
  registradas aqui, e a escolha e do Enzo, nao deste adaptador:

  (a) nao permitir a ferramenta de shell ao papel que roda sob `:agente_completo`;
  (b) a opcao D do `PLANO_V2.md` — servir as ferramentas da fabrica por MCP, em que `rodar`
      volta a ser o `Fabrica.Ferramentas.Comando` desta fabrica, com confinamento de verdade;
  (c) aceitar a lacuna e declara-la;
  (d) confinar o shell no sandbox do proprio `claude`, pelo sistema operacional.

  Escolha vigente: **(d)** (D-016, T-090), no lugar da (c) que a D-015 (adendo 2) tinha
  escolhido para a T-058 — com o Bash APROVADO, a lacuna de (c) era efetiva, e foi isso que
  fez o disparo do marco ser recusado. A ESCRITA fora da raiz deixou de ser lacuna (secao do
  sandbox, acima); o que sobra, aceito e escrito: o shell LE fora da raiz, e a auditoria
  (metade 2) continua sem ver o `command`. (a) tiraria do construtor a chance de rodar um
  teste; (b) segue como saida futura.

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

  # A TRADUCAO nome interno -> ID que o CLI aceita no `--model` (T-084). O nome interno
  # (`sonnet-5`, `opus-5`, `haiku-4.5`) e a chave da fabrica — contabilidade, cota, escada — e
  # NAO e vocabulario do CLI: medido em 2026-10-01 contra o `claude` 2.1.287,
  # `--model sonnet-5` volta `is_error: true` com `[claude-code:unrecognized_model]`. Os IDs
  # COMPLETOS foram escolhidos de proposito em vez dos apelidos curtos (`sonnet`), que o CLI
  # resolve para o modelo "mais novo" e mudam de modelo sem aviso. Cada ID foi confirmado com
  # uma chamada real (Notas de execucao da T-084). O preco destes IDs mora em
  # `Fabrica.Custo.Precos` (`@apelidos`), e ha teste que trava as duas pontas juntas.
  @modelos_cli %{
    "sonnet-5" => "claude-sonnet-5-5",
    "opus-5" => "claude-opus-5-5",
    "haiku-4.5" => "claude-haiku-4-5-20251001"
  }

  # Os apelidos curtos do PROPRIO CLI (o `--help` cita `opus` e `sonnet`; `haiku` foi medido
  # aceito em 2026-10-01) sao vocabulario dele, nao nome interno: passam como ja traduzidos.
  # Existem para as sondas de `priv/probes/`, que nasceram com `modelo: "haiku"`. A fabrica
  # nao os GERA — ela manda o ID completo.
  @apelidos_do_cli ~w(sonnet opus haiku)

  @doc """
  Os apelidos curtos do proprio CLI que `modelo_cli/1` deixa passar.

  Publica para a trava com `Fabrica.Custo.Precos` (T-086): apelido aceito aqui e sem preco la
  daria custo 0,0 por volta, e o teto de gasto do piloto pararia de frear em silencio.
  """
  @spec apelidos_do_cli() :: [String.t()]
  def apelidos_do_cli, do: @apelidos_do_cli

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
      {:ok, ferramentas} -> ferramentas |> Map.keys() |> ferramentas_cli_do_vocabulario()
      {:erro, _} -> []
    end
  end

  @doc """
  A MESMA traducao de `ferramentas_cli/1`, direto de uma lista de nomes internos do
  catalogo — sem passar pelo `Catalogo.do_papel/1` (T-100).

  Existe para `Requisicao.vocabulario`: a tarefa cujo trabalho real nao precisa de `rodar`
  (Bash) pode pedir um vocabulario MENOR do que o papel inteiro teria, sem que a fabrica
  precise inventar um papel novo no catalogo so para isso. Nome desconhecido e descartado,
  a mesma regra de `ferramentas_cli/1` (`registrar_resultado`, sem equivalente no CLI).
  """
  @spec ferramentas_cli_do_vocabulario([String.t()]) :: [String.t()]
  def ferramentas_cli_do_vocabulario(nomes) do
    nomes
    |> Enum.map(&Map.get(@vocabulario_cli, &1))
    |> Enum.reject(&is_nil/1)
    |> Enum.uniq()
    |> Enum.sort()
  end

  @doc """
  Os nomes internos de modelo e o ID que cada um vira no `--model` do CLI.

  Publica para a trava entre as duas pontas: `Fabrica.Custo.Precos` precisa precificar
  exatamente os IDs que esta tabela manda (e que voltam no `modelUsage`).
  """
  @spec modelos_cli() :: %{String.t() => String.t()}
  def modelos_cli, do: @modelos_cli

  @doc """
  Traduz o nome de modelo da fabrica para o ID que o CLI aceita no `--model`.

  - nome interno (`sonnet-5`, `opus-5`, `haiku-4.5`) -> o ID completo (`modelos_cli/0`);
  - ID completo ja traduzido, ou apelido curto do proprio CLI (`sonnet`, `opus`, `haiku`) ->
    ele mesmo (a traducao e idempotente);
  - qualquer outra coisa -> `{:erro, {:modelo_sem_traducao, nome}}`. **Nunca vai cru para o
    CLI**: o CLI recusa nome que nao conhece com `is_error`, DEPOIS de ter subido o processo,
    e a recusa chega como `:recusa` — indistinguivel de o modelo ter recusado o pedido.
  """
  @spec modelo_cli(term()) :: {:ok, String.t()} | {:erro, {:modelo_sem_traducao, term()}}
  def modelo_cli(nome) do
    cond do
      Map.has_key?(@modelos_cli, nome) -> {:ok, Map.fetch!(@modelos_cli, nome)}
      ja_do_cli?(nome) -> {:ok, nome}
      true -> {:erro, {:modelo_sem_traducao, nome}}
    end
  end

  defp ja_do_cli?(nome), do: nome in Map.values(@modelos_cli) or nome in @apelidos_do_cli

  @impl Fabrica.Operario
  def conversar(%Requisicao{} = requisicao, opcoes) do
    raiz = Keyword.get(opcoes, :raiz, ".")
    prazo = Keyword.get(opcoes, :prazo, @prazo_padrao)

    # A linha vem ANTES do arquivo do prompt: modelo sem traducao devolve o erro nomeado sem
    # subir processo nenhum e sem deixar temporario para apagar.
    with {:ok, linha} <- linha(requisicao) do
      arquivo_prompt = escrever_prompt(texto_do_prompt(requisicao))

      resultado =
        Comando.rodar_separado(raiz, linha,
          prazo: prazo,
          entrada: {:arquivo, arquivo_prompt}
        )

      apagar_prompt(arquivo_prompt)

      case resultado do
        {:ok, saida} -> responder(saida, raiz)
        {:erro, motivo} -> {:erro, motivo}
      end
    end
  end

  @doc """
  O que `conversar/2` devolve para a saida bruta de UM processo do CLI — o veredito de
  `interpretar/2` mais, nos erros de uma sessao que JA GASTOU, o consumo que ela mediu (T-089).

  Publica pela mesma razao de `interpretar/2`: o teste (e o `Agente.Laco` sob teste) alimenta
  uma saida gravada e recebe exatamente o que o despacho real receberia, sem processo nenhum.

  ## O erro com consumo: `{:erro, {:com_consumo, motivo, %Consumo{}}}`

  Antes, `{:fora_do_confinamento, _}` e `:prazo` chegavam ao `Laco` como erro nu, o laco
  encerrava sem contabilizar, e o despacho valia US$ 0,00 no `gasto_usd` que o
  `Piloto.Servidor` soma contra o teto — gasto invisivel ao freio, e custo por tarefa
  artificialmente baixo na comparacao com a v1. Agora:

    * `{:fora_do_confinamento, caminhos}` — a sessao TERMINOU e o `result` existe: o erro leva
      o consumo dele, o mesmo que um despacho aceito levaria;
    * `:prazo` — o processo foi morto antes do `result` (se ele chegou a ser escrito, vale ele).
      Sem `result`, o consumo e ESTIMADO pelo `usage` das linhas `assistant` ja escritas (ver
      `consumo_das_mensagens/2`), e e um PISO: o `output_tokens` delas e parcial;
    * nada medido (nenhum `result`, nenhuma linha com `usage`) -> o erro nu de antes, e um
      `Logger.warning` dizendo que o despacho entra como 0,0.

  O envelope e uma TUPLA DE DOIS, `{:erro, termo}`, de proposito: o contrato de
  `Fabrica.Operario` continua o mesmo, e quem casa `{:erro, motivo}` generico (o
  `Fabrica.Planejador`) segue funcionando. A parede de cota NUNCA ganha envelope —
  `Fabrica.Cota.parede/2` casa `{:erro, {:cota, reabre_em}}`.
  """
  @spec responder(
          %{
            :stdout => String.t(),
            :stderr => String.t(),
            optional(atom()) => term()
          },
          Path.t() | nil
        ) :: {:ok, Resposta.t()} | {:erro, term()}
  def responder(%{motivo: :prazo} = saida, _raiz), do: com_consumo_medido(:prazo, saida)

  def responder(saida, raiz) do
    case interpretar(saida, raiz) do
      {:erro, {:fora_do_confinamento, _caminhos} = motivo} -> com_consumo_medido(motivo, saida)
      veredito -> veredito
    end
  end

  defp com_consumo_medido(motivo, saida) do
    case consumo_medido(eventos(saida.stdout), saida[:duracao_ms]) do
      %Consumo{} = consumo ->
        {:erro, {:com_consumo, motivo, consumo}}

      nil ->
        Logger.warning(
          "erro do operario #{inspect(motivo)} sem result e sem nenhuma linha assistant com " <>
            "usage: o consumo deste despacho e desconhecido e entra como 0,0"
        )

        {:erro, motivo}
    end
  end

  # O `result`, quando existe, e o numero que vale (`consumo/1`, o mesmo de um despacho aceito).
  defp consumo_medido(eventos, duracao_ms) do
    case Enum.find(eventos, &(&1["type"] == "result")) do
      nil -> consumo_das_mensagens(eventos, duracao_ms)
      resultado -> consumo(resultado)
    end
  end

  # Sem `result` sobra o `usage` de cada linha `assistant`. Duas armadilhas, medidas nos
  # streams reais (T-018b, T-086):
  #
  #   * o CLI escreve a MESMA chamada uma linha por bloco (thinking, text, tool_use), cada uma
  #     com o `usage` inteiro dela: somar linha a linha contaria a chamada N vezes. Vale uma
  #     por `message.id` — a ultima, que e a mais adiantada;
  #   * o `output_tokens` dessas linhas e PARCIAL (3 no stream de haiku cujo `result` diz 61), e
  #     as chamadas auxiliares do CLI (que so o `modelUsage` do `result` conta) nao aparecem.
  #     A estimativa e PISO, nunca teto — e o aviso diz isso.
  defp consumo_das_mensagens(eventos, duracao_ms) do
    usos =
      eventos
      |> Enum.with_index()
      |> Enum.flat_map(fn
        {%{"type" => "assistant", "message" => %{"usage" => %{} = uso} = mensagem}, indice} ->
          [{mensagem["id"] || {:sem_id, indice}, uso}]

        _outro ->
          []
      end)
      |> Map.new()
      |> Map.values()

    if usos == [], do: nil, else: estimar_pelo_usage(usos, duracao_ms)
  end

  defp estimar_pelo_usage(usos, duracao_ms) do
    escrita = somar(usos, &numero(&1["cache_creation_input_tokens"]))

    Logger.warning(
      "prazo estourado sem result: consumo estimado pelo usage de #{length(usos)} chamada(s) " <>
        "ja escritas — piso, nao total (saida parcial, sem as chamadas auxiliares do CLI)"
    )

    %Consumo{
      tokens_entrada: somar(usos, &numero(&1["input_tokens"])),
      tokens_cache_escrita: escrita,
      tokens_cache_leitura: somar(usos, &numero(&1["cache_read_input_tokens"])),
      tokens_saida: somar(usos, &numero(&1["output_tokens"])),
      duracao_ms: if(is_integer(duracao_ms), do: duracao_ms),
      ttl_cache: ttl_cache(quebra_por_ttl(usos), escrita)
    }
  end

  defp somar(usos, campo), do: usos |> Enum.map(campo) |> Enum.sum()

  # A quebra por TTL somada sobre as chamadas — o mesmo formato de `usage.cache_creation`, para
  # `ttl_cache/2` decidir o multiplicador pela MESMA regra do `result`. Nenhuma chamada com a
  # quebra -> `nil`, o "nao sei" de `ttl_cache/2`.
  defp quebra_por_ttl(usos) do
    quebras = for %{"cache_creation" => %{} = quebra} <- usos, do: quebra

    if quebras != [] do
      %{
        "ephemeral_5m_input_tokens" => somar(quebras, &numero(&1["ephemeral_5m_input_tokens"])),
        "ephemeral_1h_input_tokens" => somar(quebras, &numero(&1["ephemeral_1h_input_tokens"]))
      }
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

  `--model` leva o ID traduzido por `modelo_cli/1`, nunca `requisicao.modelo` cru (T-084): o
  nome interno da fabrica nao e vocabulario do CLI. Modelo sem traducao devolve
  `{:erro, {:modelo_sem_traducao, nome}}` em vez de uma linha.

  `--setting-sources user` (T-085): sem ela, o `claude` le por conta propria o `CLAUDE.md` de
  TODO diretorio acima do projeto — e projeto criado por `mix fabrica.planejar` mora DENTRO da
  fabrica-mae, cujo `CLAUDE.md` raiz e a constituicao do ORQUESTRADOR (~9k tokens, papel
  contrario ao do agente). Medido no `claude` 2.1.287 (sonda da palavra secreta, Notas da
  T-085): sem a flag o agente conhece a palavra do `CLAUDE.md` pai; com ela, nao. So o nivel
  do usuario continua lido; `project` e `local` saem — permissao e ferramentas ja vem por flag
  (`--permission-mode`, `--tools`), entao nada da fabrica dependia deles. `--bare` NAO serve:
  exige `ANTHROPIC_API_KEY`, e a fabrica roda na cota da assinatura (OAuth).

  `--allowedTools "Bash"` (T-088) vem logo depois de `--tools`, e SO quando o `--tools` do
  papel ja contem `Bash`: sem ela, `acceptEdits` nao aprova comando de shell e todo `Bash`
  volta negado em `--print`. Nunca aprova outra ferramenta e nunca da Bash a quem nao o tem.
  O que ela deixa de confinar esta no `@moduledoc` ("Comando de shell aprovado"). As duas
  flags sao variadicas no CLI; cada uma leva UM argumento entre aspas e a seguinte comeca por
  `--`, entao nenhuma engole o que vem depois.

  `--settings "<json do sandbox>"` (T-090) vem logo antes de `--model`, pela MESMA regra da
  aprovacao: so quando o `--tools` do papel contem `Bash`, e sempre que contem. E o que prende
  a escrita do shell a raiz, e o que faz o `claude` recusar subir onde nao ha sandbox
  (`{:erro, :sandbox_indisponivel}`) — ver o `@moduledoc`, "O shell roda no sandbox". O JSON
  vai inline, entre aspas duplas com `\\"` (citacao em `sandbox_do_shell/1`).

  `requisicao.vocabulario`, quando presente, SUBSTITUI o vocabulario do `papel` (T-100): o
  `--tools` montado vem dele, e nao do catalogo. `aprovacao_do_shell/1` e `sandbox_do_shell/1`
  leem o resultado JA TRADUZIDO — nao o papel nem o vocabulario cru — entao a regra "Bash no
  `--tools` implica `--allowedTools` e o bloco de sandbox" continua valendo IGUAL para os dois
  caminhos, sem caminho novo que a furasse.
  """
  @spec linha(Requisicao.t()) :: {:ok, String.t()} | {:erro, {:modelo_sem_traducao, term()}}
  def linha(%Requisicao{} = requisicao) do
    with {:ok, modelo} <- modelo_cli(requisicao.modelo) do
      ferramentas = ferramentas_da_requisicao(requisicao)

      {:ok,
       ~s(#{executavel()} --print --verbose --output-format stream-json ) <>
         ~s(--permission-mode acceptEdits --tools "#{Enum.join(ferramentas, ",")}" ) <>
         aprovacao_do_shell(ferramentas) <>
         ~s(--max-turns #{requisicao.teto_de_voltas} ) <>
         ~s(--setting-sources user ) <>
         sandbox_do_shell(ferramentas) <>
         ~s(--model #{modelo})}
    end
  end

  # O vocabulario EXPLICITO (T-100), quando presente, substitui o do papel por inteiro —
  # nunca os dois juntos: um vocabulario pedido para ser MENOR nao pode voltar maior porque o
  # papel default tambem contribuiu.
  defp ferramentas_da_requisicao(%Requisicao{vocabulario: vocabulario})
       when is_list(vocabulario) do
    ferramentas_cli_do_vocabulario(vocabulario)
  end

  defp ferramentas_da_requisicao(%Requisicao{papel: papel}), do: ferramentas_cli(papel)

  # A aprovacao segue o VOCABULARIO, nunca o contrario: o nome vem da mesma traducao de
  # `ferramentas_cli/1`, e so aparece se o `--tools` do papel ja tem o shell (T-088).
  @shell_cli Map.fetch!(@vocabulario_cli, "rodar")

  defp aprovacao_do_shell(ferramentas) do
    if @shell_cli in ferramentas, do: ~s(--allowedTools "#{@shell_cli}" ), else: ""
  end

  # O SANDBOX do proprio `claude` (T-090, D-016) — o bloco medido pelo orquestrador em
  # 2026-10-02, sem chave nenhuma para desliga-lo: um confinamento que se desliga por
  # configuracao e o mesmo risco que fez o disparo da T-058 ser recusado. Vai INLINE, como JSON:
  # o `--settings` aceita arquivo ou JSON, e o inline mantem `linha/1` pura (sem temporario
  # para criar, apagar ou deixar para tras) e a linha constante.
  #
  # A citacao e `"..."` com cada aspa interna como `\"`, a unica forma que serve aos dois
  # shells de `Comando.escrever_script/4`: o `sh` desfaz `\"` dentro de aspas duplas, e no
  # Windows quem desfaz e o parser de argumentos do executavel (o `cmd` so alterna o estado de
  # aspas, e o JSON nao tem `& | < > ( ) ^ %` para isso importar). Aspas simples quebrariam no
  # `cmd`. O JSON nao carrega `$`, crase nem `\`, que o `sh` interpretaria entre aspas duplas.
  @sandbox_cli Jason.encode!(%{
                 "sandbox" => %{
                   "enabled" => true,
                   "failIfUnavailable" => true,
                   "autoAllowBashIfSandboxed" => true,
                   "allowUnsandboxedCommands" => false
                 }
               })

  defp sandbox_do_shell(ferramentas) do
    if @shell_cli in ferramentas,
      do: ~s(--settings "#{String.replace(@sandbox_cli, ~s("), ~s(\\"))}" ),
      else: ""
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

    if sandbox_indisponivel?(eventos, stderr) do
      avisar_sandbox(eventos, stderr)
      {:erro, :sandbox_indisponivel}
    else
      case cota(eventos, stdout <> stderr) do
        {:cota, reabre_em} -> {:erro, {:cota, reabre_em}}
        :nao -> montar(eventos, raiz)
      end
    end
  end

  # O `claude` que RECUSA SUBIR porque o sandbox exigido (`failIfUnavailable`, T-090) nao existe.
  # Saida REAL com a linha de `linha/1` (`--output-format stream-json`), capturada sem modelo em
  # 2026-10-02 no 2.1.287 (Linux sem `bwrap`/`socat`; fixture byte a byte no teste): rc=1; no
  # stdout UMA linha `result` de erro — `subtype: "error_during_execution"`, `is_error: true`,
  # `num_turns: 0`, custo 0, o motivo em `errors` ("Sandbox required but unavailable: <causa>") —
  # e, depois dela, no stderr "Error: sandbox required but unavailable: <causa> ...
  # sandbox.failIfUnavailable is set — refusing to start without a working sandbox.". Pelo
  # caminho normal esse `result` de erro sem bloco vira `:recusa`; por isso este reconhecimento
  # vem ANTES de tudo. E antes da cota: o processo nao chegou a falar com a API (nenhum
  # `rate_limit_event`), entao nao ha parede a ler.
  #
  # Duas condicoes, as duas:
  #
  #   * a sessao NAO SUBIU (`nao_subiu?/1`): o stdout so tem `result`, e de ZERO voltas. Uma
  #     sessao que subiu escreve `system/init` (e `assistant`/`user`) antes do `result`, e o
  #     `result` dela tem `num_turns >= 1`; ali o texto pode aparecer sem ser o CLI recusando — o
  #     agente le a tarefa que o cita, um comando o escreve no stderr, ou o `errors` de um
  #     `error_during_execution` de verdade o repete. Esse `error_during_execution` continua erro
  #     PROPRIO conhecido da T-087 (`@erros_proprios`) e segue para `cota/2`/`montar/2` como antes;
  #   * o texto do `failIfUnavailable` no stderr OU no `errors` desse `result` — os dois canais
  #     que o binario usa; basta um (o stderr pode se perder no caminho do disparo).
  #
  # A forma do Windows nativo (onde o sandbox nao e suportado) nao foi medida; no binario o caminho
  # de recusa e o mesmo para qualquer causa ("sandbox required but unavailable: ${causa}" + o
  # `result` de erro no stream-json).
  @sandbox_indisponivel ~r/sandbox required but unavailable|refusing to start without a working sandbox/i

  defp sandbox_indisponivel?(eventos, stderr) do
    nao_subiu?(eventos) and causa_sem_sandbox(eventos, stderr) != nil
  end

  # Tambem casa o stdout VAZIO (nenhum evento): e a forma do `--output-format json`, nao a desta
  # linha, mas e igualmente "nada subiu".
  defp nao_subiu?(eventos) do
    Enum.all?(eventos, &match?(%{"type" => "result", "num_turns" => 0}, &1))
  end

  # O texto que diz por que o sandbox falta (dependencia faltando, plataforma sem suporte): o
  # stderr primeiro (traz tambem o "refusing to start"), senao o `errors` do `result`.
  defp causa_sem_sandbox(eventos, stderr) do
    erros =
      for %{"type" => "result", "errors" => [_ | _] = lista} <- eventos,
          texto <- lista,
          is_binary(texto),
          do: texto

    textos = if is_binary(stderr), do: [stderr | erros], else: erros
    Enum.find(textos, &(&1 =~ @sandbox_indisponivel))
  end

  # A causa vai para o log, para quem for instalar `bubblewrap`/`socat` saber o que falta.
  defp avisar_sandbox(eventos, stderr) do
    Logger.warning(
      "o claude recusou subir: o papel tem Bash e o sandbox exigido nao esta disponivel " <>
        "(nenhum comando rodou, nada foi gasto). causa: " <>
        String.trim(causa_sem_sandbox(eventos, stderr))
    )
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
  #
  # E `rejected` tambem nao basta (T-087, D-015 adendo): o `rate_limit_event` e um AVISO sobre
  # a conta, e o VEREDITO da chamada e do `result`. Medido no `claude` 2.1.287 em 2026-10-01:
  # `status: "rejected"` (janela de 7 dias com utilizacao 1, `isUsingOverage: false`) seguido
  # de `result` success, `is_error: false`, resposta dada e `total_cost_usd` > 0. Ler o aviso
  # como parede jogava fora um trabalho ja feito e pago e punha o piloto para dormir ate o
  # `resetsAt`. Por isso o aviso so vira parede quando a chamada NAO foi atendida (ver
  # `atendida?/1`): sem `result`, ou `result` de erro POR LIMITE. Atendida — inclusive um
  # `result` de erro PROPRIO por outra causa, como o `error_max_turns` — ela segue o caminho que
  # seguiria sem o aviso, e o aviso vai para o log.
  #
  # O fallback por TEXTO nao passa por esse filtro: a mensagem de limite que o CLI escreve como
  # texto e o proprio sinal de nao-atendimento. Ele usa o MESMO reconhecedor do caminho com
  # aviso (`texto_de_limite?/1`) — eram duas listas ate o Ciclo 2 da T-087, e a parede de janela
  # ("You've hit your weekly limit") escapava das duas.
  defp cota(eventos, texto) do
    estruturado = Enum.find(eventos, &parede?/1)
    aviso_atendido = aviso?(estruturado) and atendida?(eventos)

    cond do
      estruturado != nil and not aviso_atendido ->
        {:cota, horario(reabre_em(estruturado))}

      texto_de_limite?(texto) ->
        {:cota, horario_no_texto(texto)}

      aviso_atendido ->
        avisar_limite(estruturado, eventos)
        :nao

      true ->
        :nao
    end
  end

  # So o `rate_limit_event` e aviso. Os formatos antigos (`subtype` `usage_limit`/`rate_limit`)
  # vem no proprio `result` ou no lugar dele: ali o aviso E o veredito, e continuam parede.
  defp aviso?(%{"type" => "rate_limit_event"}), do: true
  defp aviso?(_evento), do: false

  # Os erros PROPRIOS do CLI: o `subtype` diz a causa, e a causa nao e a cota. Medidos/lidos no
  # 2.1.287 — `error_max_turns` (o `--max-turns` da propria fabrica), `error_during_execution` e
  # `error_max_budget_usd`, estes dois com o motivo em `errors: [...]`.
  @erros_proprios ["error_max_turns", "error_during_execution", "error_max_budget_usd"]

  # A chamada foi ATENDIDA quando existe `result` e ele NAO diz que o limite a derrubou. So e
  # chamada com o aviso `rate_limit_event` nao-`allowed` presente (o `and` de `cota/2`):
  #
  #   * sem `result` (a chamada nao terminou) -> nao atendida: o aviso e a parede;
  #   * `result` de ERRO PROPRIO conhecido (`@erros_proprios`) -> atendida, a menos que o erro
  #     seja POR LIMITE (`erro_por_limite?/1`, trava (b)). Atendida, segue o caminho que seguiria
  #     sem o aviso (`montar/2`: `:teto_de_voltas` / `:recusa`, com o consumo). O caso medido
  #     (Revisao do Ciclo 1 da T-087, `claude` 2.1.287): `rejected` + `error_max_turns`,
  #     `is_error: true`, `result: null`, `num_turns: 2`, custo > 0 — duas voltas feitas e
  #     pagas, paradas pelo `--max-turns` da PROPRIA fabrica;
  #   * `result` de erro de QUALQUER OUTRO `subtype` -> nao atendida (trava (a), Ciclo 3). A
  #     parede do 2.1.287 chega exatamente assim — `subtype: "success"`, `is_error: true`, a
  #     mensagem no `result` — e a Revisao do Ciclo 2 mostrou que reconhecer so pelo texto deixa
  #     passar a forma que a lista nao previu ("You've hit your weekly limit" virava `:recusa`, e
  #     o piloto seguia despachando contra a cota fechada). Com o aviso na mao, o erro sem causa
  #     propria e lido como a parede; o custo do engano e sono, nao tentativas queimadas;
  #   * `result` SEM erro -> atendida se houve resposta (bloco de `assistant` ou texto no
  #     `result`). Um `result` sem resposta nenhuma nao prova que o modelo foi servido, e o teste
  #     de parede que ja existia ("status diferente de allowed E a parede") o fixa como parede.
  defp atendida?(eventos) do
    case Enum.find(eventos, &(&1["type"] == "result")) do
      nil ->
        false

      %{"is_error" => true, "subtype" => subtype} = resultado when subtype in @erros_proprios ->
        not erro_por_limite?(resultado)

      %{"is_error" => true} ->
        false

      resultado ->
        Enum.any?(eventos, &(blocos_do_evento(&1) != [])) or texto_no_resultado?(resultado)
    end
  end

  # O erro PROPRIO que e, na verdade, POR LIMITE — reconhecido por sinal POSITIVO no `result`:
  #
  #   * `api_error_status` 429 (Too Many Requests). O campo existe no `result` do 2.1.287 (vem
  #     `null` num despacho saudavel); o valor 429 nao foi medido, e a semantica HTTP do codigo;
  #   * a mensagem de limite (`texto_de_limite?/1`) no `result` ou em `errors` — o campo em que o
  #     2.1.287 poe o motivo de `error_during_execution`/`error_max_budget_usd`. So no `result`
  #     de ERRO: ali o texto e a mensagem do CLI, e nao a resposta do agente.
  defp erro_por_limite?(resultado) do
    resultado["api_error_status"] in [429, "429"] or
      Enum.any?(textos_do_erro(resultado), &texto_de_limite?/1)
  end

  defp textos_do_erro(resultado) do
    erros = if is_list(resultado["errors"]), do: resultado["errors"], else: []
    [resultado["result"] | erros]
  end

  # O RECONHECEDOR UNICO da mensagem de limite (trava (b) da T-087, Ciclo 3), usado pelo caminho
  # com aviso (`erro_por_limite?/1`) e pelo fallback por texto (`cota/2`). Formas:
  #
  #   * `hit your <qualquer nome> limit|budget` — o prefixo do proprio CLI. No executavel do
  #     2.1.287 a mensagem e `` `You've hit your ${janela}${...}` `` e o CLI a classifica por
  #     `startsWith("You've hit your " + janela)`, com five_hour "session limit", seven_day
  #     "weekly limit", seven_day_opus "Opus limit", seven_day_sonnet "Sonnet limit", overage
  #     "usage credit limit"; e ha os literais "monthly spend limit", "fast limit", "monthly
  #     limit" e "team's shared budget". O nome fica NO MEIO, e por isso a lista fechada do
  #     Ciclo 2 (`hit your (usage )?limit`) so pegava a forma generica. O meio nao cruza aspas
  #     nem quebra de linha, para nao emendar duas strings do JSON;
  #   * "monthly spend limit" sem o prefixo;
  #   * as formas antigas: "limit reached", "usage limit", `rate_limit_error`, "rate limit
  #     exceeded". `rate.?limit` SOLTO nao entra: o fallback le o stdout inteiro, e todo stream
  #     traz `rate_limit_event`/`rate_limit_info`/`rateLimitType` — seria parede em toda chamada.
  #     "context limit"/"max tokens" nao casam — sao erro de requisicao, nao de cota.
  @mensagem_de_limite ~r/hit your [^"\n]{0,60}?\b(?:limit|budget)\b|monthly spend limit|limit reached|usage limit|rate.?limit(?:_error|\s+exceeded)/i

  defp texto_de_limite?(texto) when is_binary(texto), do: texto =~ @mensagem_de_limite
  defp texto_de_limite?(_texto), do: false

  defp texto_no_resultado?(%{"result" => texto}) when is_binary(texto),
    do: String.trim(texto) != ""

  defp texto_no_resultado?(_resultado), do: false

  # O aviso nao some em silencio: quem olhar o log precisa saber que a conta esta no limite,
  # em qual janela e ate quando — e o que o piloto deixaria de ver sem a parede.
  defp avisar_limite(%{"rate_limit_info" => info} = evento, eventos) do
    reabre = horario(reabre_em(evento))
    resultado = Enum.find(eventos, &(&1["type"] == "result")) || %{}

    Logger.warning(
      "rate_limit_event #{info["status"]} com a chamada ATENDIDA (result #{resultado["subtype"]}, " <>
        "is_error: #{inspect(resultado["is_error"])}, nao por limite): " <>
        "nao e parede de cota. Janela: #{info["rateLimitType"] || "desconhecida"}; " <>
        "resetsAt: #{if reabre, do: DateTime.to_iso8601(reabre), else: "desconhecido"}; " <>
        "overageStatus: #{info["overageStatus"] || "-"}; " <>
        "isUsingOverage: #{inspect(info["isUsingOverage"])}; " <>
        "unifiedWindows: #{inspect(info["unifiedWindows"])}"
    )
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

  # O CONSUMO de um despacho real, lido do evento `result` (T-086). E este numero que vira
  # `gasto_usd` (`Agente.Laco` -> `Precos.estimar/2`), e o `Piloto.Servidor` o soma contra o
  # teto de gasto: errar para BAIXO aqui e gastar acima do teto sem freio nenhum.
  #
  # Duas leituras, medidas contra o `claude` 2.1.287 em 2026-10-01 (Notas da T-086):
  #
  #   * TOKENS do `modelUsage`, e nao do `usage`. O `usage` cobre so o laco principal; o
  #     `modelUsage` (de onde sai o `total_cost_usd`) conta tambem as chamadas auxiliares que o
  #     CLI faz por conta propria — na amostra da T-018b, +941 de entrada e +15 de saida, 4,6%
  #     do custo. Sem `modelUsage` (formato antigo, ou fixture), vale o `usage`, como antes.
  #   * TTL do `usage.cache_creation`. Ver `ttl_cache/2`.
  defp consumo(nil), do: %Consumo{}

  defp consumo(resultado) do
    uso = resultado["usage"] || %{}
    tokens = tokens(resultado["modelUsage"], uso)

    %Consumo{
      tokens_entrada: tokens.entrada,
      tokens_cache_escrita: tokens.escrita,
      tokens_cache_leitura: tokens.leitura,
      tokens_saida: tokens.saida,
      duracao_ms: numero(resultado["duration_ms"]),
      ttl_cache: ttl_cache(uso["cache_creation"], tokens.escrita)
    }
  end

  # Soma TODOS os modelos do `modelUsage`. O `Consumo` carrega um modelo so (o do despacho),
  # entao o auxiliar que rodar em outro modelo sai pelo preco do modelo do despacho — mais
  # caro que o real quando o auxiliar e o haiku sob sonnet/opus, que e o lado seguro para o
  # freio. Precificar cada modelo pelo seu exigiria um campo por modelo em
  # `Fabrica.Operario.Consumo` (Notas da T-086).
  defp tokens(%{} = por_modelo, _uso) when map_size(por_modelo) > 0 do
    por_modelo
    |> Map.values()
    |> Enum.reduce(%{entrada: 0, escrita: 0, leitura: 0, saida: 0}, fn modelo, soma ->
      %{
        entrada: soma.entrada + numero(modelo["inputTokens"]),
        escrita: soma.escrita + numero(modelo["cacheCreationInputTokens"]),
        leitura: soma.leitura + numero(modelo["cacheReadInputTokens"]),
        saida: soma.saida + numero(modelo["outputTokens"])
      }
    end)
  end

  defp tokens(_por_modelo, uso) do
    %{
      entrada: numero(uso["input_tokens"]),
      escrita: numero(uso["cache_creation_input_tokens"]),
      leitura: numero(uso["cache_read_input_tokens"]),
      saida: numero(uso["output_tokens"])
    }
  end

  # O TTL da escrita de cache, que decide o multiplicador (1,25x em 5 min, 2,0x em 1 h).
  #
  # O CLI nao deixa ESCOLHER o TTL (ver `@moduledoc`), mas INFORMA o que usou:
  # `usage.cache_creation.ephemeral_1h_input_tokens` / `ephemeral_5m_input_tokens`. Medido:
  # sob a assinatura ele escreve em 1 h (3 de 3 streams reais, 2.1.258 e 2.1.287).
  #
  #   * sem escrita nenhuma -> `:sem_cache` (o multiplicador nao multiplica nada);
  #   * sem a quebra por TTL -> `:sem_cache` ("nao sei"), como antes da T-086 — e avisa,
  #     porque ali a escrita sai a 0,0x;
  #   * so 5 min -> `:cinco_minutos`;
  #   * qualquer escrita de 1 h, ou escrita que so o `modelUsage` viu -> `:uma_hora`.
  #
  # Os DOIS no mesmo despacho (nunca visto, mas possivel: o TTL e por ponto de cache) nao cabem
  # num `ttl_cache` so. Cobra-se tudo a 2,0x — o teto, nunca abaixo do exato — e avisa: o
  # exato exige um campo a mais em `Fabrica.Operario.Consumo` (pedido nas Notas da T-086).
  defp ttl_cache(_quebra, 0), do: :sem_cache

  defp ttl_cache(%{} = quebra, escrita) do
    cinco_minutos = numero(quebra["ephemeral_5m_input_tokens"])
    uma_hora = numero(quebra["ephemeral_1h_input_tokens"])

    cond do
      cinco_minutos > 0 and uma_hora > 0 ->
        Logger.warning(
          "despacho com os dois TTLs de cache (5 min: #{cinco_minutos}, 1 h: #{uma_hora}); " <>
            "toda a escrita (#{escrita}) cobrada a 2,0x, acima do exato"
        )

        :uma_hora

      cinco_minutos > 0 and uma_hora == 0 and cinco_minutos >= escrita ->
        :cinco_minutos

      true ->
        :uma_hora
    end
  end

  defp ttl_cache(_sem_quebra, escrita) do
    Logger.warning(
      "resultado do CLI sem usage.cache_creation: #{escrita} tokens de escrita de cache " <>
        "sem TTL conhecido, cobrados a 0,0x"
    )

    :sem_cache
  end

  defp numero(valor) when is_integer(valor), do: valor
  defp numero(_), do: 0
end
