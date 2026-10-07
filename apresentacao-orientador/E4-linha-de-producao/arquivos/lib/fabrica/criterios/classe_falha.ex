defmodule Fabrica.Criterios.ClasseFalha do
  @moduledoc """
  Quando um criterio nao passa: o problema e o COMANDO ou a ENTREGA? **Puro.**

  E o mecanismo mais caro que a v1 aprendeu, e ele nao esta em documento nenhum do TCC. Sem
  ele ha dois desfechos — passou e falhou — e tudo que nao passa volta ao construtor. Isso
  trata *"o teste reprovou"* e *"o comando nao existe"* como a mesma coisa.

  Medido: a **T-030 do banco-imobiliario gastou 4 ciclos e US$ 12,90** com o deliverable
  CORRETO desde o primeiro, porque o criterio dizia `node --test tests` — forma que o Node 22
  nao aceita — e o construtor, que **por contrato nao pode alterar criterio**, era despachado
  de novo a cada volta para consertar algo que ja estava certo.

  Nenhum construtor conserta um comando quebrado, e nenhum modelo mais forte faz uma maquina
  sem memoria parar de derrubar processo.

  ## As tres classes, e as consequencias OPOSTAS

  | classe | o que houve | consequencia |
  |---|---|---|
  | `:ferramenta_quebrada` | o comando nao avaliou NADA | **nao conta ciclo** — vai ao orquestrador corrigir o CRITERIO |
  | `:ambiente` | a maquina atrapalhou | **reexecuta UMA vez**; nao conta ciclo |
  | `:entrega` | rodou e o resultado esta errado | **conta ciclo** — volta ao construtor |

  Duas delas nao gastam uma das tres fichas da tarefa, e a ficha e o recurso escasso: na
  terceira a tarefa bloqueia.

  ## O caso dificil, e e ele que quase fez esta funcao nascer errada

  *"Nao achei o alvo"* tem exatamente a mesma cara nos dois cenarios opostos:

      node --test tests              -> Cannot find module '.../tests'
      node --test tests/turno.test.js -> Cannot find module '.../tests/turno.test.js'

  No primeiro o diretorio **existe** e o runner e que nao sabe consumi-lo naquela forma: o
  CRITERIO esta quebrado. No segundo o arquivo **nao existe** porque a tarefa deveria te-lo
  criado e nao criou: a ENTREGA falhou.

  **O discriminador nao e a mensagem, e o disco.** Alvo que existe e nao carrega e ferramenta;
  alvo que nao existe e falha de verdade. Casar so o nome do argumento — que foi a primeira
  tentativa da v1 — teria transformado toda tarefa que esquece de criar o proprio arquivo de
  teste num "criterio suspeito", e o portao pararia de pegar justamente o defeito comum.

  E ha um segundo filtro no mesmo ponto: o alvo so conta quando e **argumento do proprio
  comando**. Um modulo qualquer que um teste nao conseguiu importar e falha da tarefa, nao do
  criterio.

  ## Na duvida, `:entrega`

  Errar para o lado de reprovar gasta no maximo um ciclo. Errar para o lado de nao reprovar
  deixa defeito passar — e um portao que deixa passar nao e portao. Por isso `:entrega` e o
  padrao, e cada desvio dele precisa de sinal explicito.
  """

  @typedoc "Por que o comando nao passou."
  @type t :: :ferramenta_quebrada | :ambiente | :entrega

  @typedoc """
  O que se sabe sobre a execucao que falhou.

  `existe_no_disco` e uma funcao, e nao uma lista: quem chama sabe resolver caminho contra a
  raiz do projeto, e este modulo nao pode tocar disco sem deixar de ser puro.
  """
  @type contexto :: %{
          optional(:sinal) => String.t() | nil,
          optional(:existe_no_disco) => (String.t() -> boolean()),
          argv: [String.t()],
          saida: String.t(),
          codigo: integer() | String.t() | nil,
          estourou_prazo: boolean()
        }

  # Codigos que dizem "nao consegui nem comecar", SEMPRE amarrados ao binario — fora de
  # contexto eles nao significam nada, porque um programa qualquer pode sair com 9 querendo
  # dizer outra coisa. 127 e 9009 sao do interpretador de comandos e nao do programa, e por
  # isso valem para qualquer binario.
  @uso_indevido %{
    "*" => [127, 9009],
    "node" => [9],
    "git" => [129]
  }

  # Crash nativo no Windows chega como NTSTATUS de erro no codigo de saida: qualquer valor a
  # partir de 0xC0000000. Cobre de uma vez o 0xC0000409 (stack buffer overrun) e o 0xC0000005
  # (access violation), que aparecem sempre que a suite roda com a maquina sem memoria.
  @piso_ntstatus 0xC0000000

  # A maquina atrapalhou. EBUSY e EPERM entram porque repositorio sob sincronizacao de nuvem
  # trava arquivo no meio da leitura.
  @sinais_de_ambiente [
    ~r/\bENOMEM\b/,
    ~r/\bEMFILE\b/,
    ~r/\bENFILE\b/,
    ~r/\bEAGAIN\b/,
    ~r/\bEADDRINUSE\b/,
    ~r/\bECONNRESET\b/,
    ~r/\bETIMEDOUT\b/,
    ~r/\bEBUSY\b/,
    ~r/\bEPERM\b/,
    ~r/JavaScript heap out of memory/i,
    ~r/runtime: out of memory/i,
    ~r/\bMemoryError\b/,
    ~r/\berlang.*out of memory\b/i
  ]

  # O binario nao existe. E mensagem do SHELL, nao do programa — vale para qualquer stack.
  @sinais_de_binario_ausente [
    ~r/\bcommand not found\b/i,
    ~r/is not recognized as an internal or external command/i,
    ~r/n[aã]o [eé] reconhecido como um comando/i,
    ~r/\bspawn\b[^\n]*\bENOENT\b/i
  ]

  # O binario existe, mas nao entendeu o que se pediu.
  #
  # `argument` esta aqui ao lado de `option` porque o `git` real diz
  # `fatal: unrecognized argument: --x`, e nao "option" — descoberto rodando o comando de
  # verdade, depois de a lista ter sido portada da v1 achando-se completa. Um sinal que falta
  # aqui nao falha ruidosamente: ele classifica o criterio quebrado como `:entrega` e devolve
  # a tarefa ao construtor, que e exatamente o laco de 4 ciclos da T-030.
  @sinais_de_opcao_invalida [
    ~r/\bbad option\b/i,
    ~r/\bunknown option\b/i,
    ~r/\bunrecognized option\b/i,
    ~r/\binvalid option\b/i,
    ~r/\bunknown argument\b/i,
    ~r/\bunrecognized argument\b/i,
    ~r/\bunknown switch\b/i,
    ~r/\bMissing script\b/i,
    ~r/\bThe task .* could not be found\b/i,
    ~r/\bunknown flag\b/i
  ]

  # O ALVO que o comando nao conseguiu abrir, quando o erro nomeia um. Um padrao por
  # ecossistema: reconhecer so o do Node repetiria, num arquivo novo, um defeito que a v1 ja
  # corrigiu duas vezes.
  @padroes_de_alvo [
    ~r/Cannot find module ['"]([^'"]+)['"]/,
    ~r/Cannot find package ['"]([^'"]+)['"]/,
    ~r/can't open file ['"]([^'"]+)['"]/i,
    ~r/No such file or directory: ['"]([^'"]+)['"]/i,
    ~r/no Go files in (\S+)/,
    ~r/Could not find file ['"]([^'"]+)['"]/i,
    ~r/MSB1009[^\n]*?([^\s"']+\.(?:sln|csproj|fsproj|vbproj))/i
  ]

  @doc """
  Classifica por que o comando nao passou.

  A ordem das checagens e parte da regra, e nao arrumacao: ambiente inequivoco vem primeiro
  (nada ali e opiniao), e o esgotamento de RECURSO vem por ultimo — a mensagem pode aparecer
  dentro da saida de uma suite que rodou inteira e reprovou por outro motivo, e ai quem manda
  e a reprovacao.
  """
  @spec classificar(contexto()) :: t()
  def classificar(contexto) do
    contexto = Map.put_new(contexto, :existe_no_disco, fn _caminho -> false end)

    cond do
      ambiente_inequivoco?(contexto) -> :ambiente
      binario_ausente?(contexto) -> :ferramenta_quebrada
      uso_indevido?(contexto) -> :ferramenta_quebrada
      opcao_invalida?(contexto) -> :ferramenta_quebrada
      alvo_existe_e_nao_carrega?(contexto) -> :ferramenta_quebrada
      recurso_esgotado?(contexto) -> :ambiente
      true -> :entrega
    end
  end

  # Nada aqui e opiniao: o prazo e NOSSO, o sinal matou o processo, e o NTSTATUS de erro e
  # crash nativo. Por isso vem primeiro, antes de qualquer leitura de texto.
  defp ambiente_inequivoco?(contexto) do
    contexto.estourou_prazo or
      (Map.get(contexto, :sinal) || "") != "" or
      (is_integer(contexto.codigo) and contexto.codigo >= @piso_ntstatus)
  end

  defp binario_ausente?(contexto) do
    contexto.codigo == "ENOENT" or casa_algum?(contexto.saida, @sinais_de_binario_ausente)
  end

  defp uso_indevido?(%{codigo: codigo} = contexto) when is_integer(codigo) do
    binario = binario_de(contexto.argv)

    codigo in Map.get(@uso_indevido, "*", []) or
      (codigo in Map.get(@uso_indevido, binario, []) and
         casa_algum?(contexto.saida, @sinais_de_opcao_invalida))
  end

  defp uso_indevido?(_contexto), do: false

  defp opcao_invalida?(contexto), do: casa_algum?(contexto.saida, @sinais_de_opcao_invalida)

  defp recurso_esgotado?(contexto), do: casa_algum?(contexto.saida, @sinais_de_ambiente)

  # O caso dificil: o alvo existe no disco e mesmo assim nao carregou. E so vale quando o alvo
  # e ARGUMENTO do proprio comando — um modulo qualquer que um teste nao conseguiu importar e
  # falha da tarefa, nao do criterio.
  defp alvo_existe_e_nao_carrega?(contexto) do
    case primeiro_alvo(contexto.saida) do
      nil -> false
      alvo -> argumento?(alvo, contexto.argv) and contexto.existe_no_disco.(alvo)
    end
  end

  defp primeiro_alvo(saida) do
    Enum.find_value(@padroes_de_alvo, fn padrao ->
      case Regex.run(padrao, saida || "") do
        [_inteiro, alvo] -> vazio_vira_nil(String.trim(alvo))
        _sem_captura -> nil
      end
    end)
  end

  defp vazio_vira_nil(""), do: nil
  defp vazio_vira_nil(texto), do: texto

  defp argumento?(alvo, argv) do
    normalizado = normalizar_caminho(alvo)

    argv
    |> Enum.drop(1)
    |> Enum.reject(&String.starts_with?(&1, "-"))
    |> Enum.map(&normalizar_caminho/1)
    |> Enum.any?(fn arg ->
      arg != "" and (normalizado == arg or String.ends_with?(normalizado, "/" <> arg))
    end)
  end

  defp normalizar_caminho(bruto) do
    bruto |> String.replace("\\", "/") |> String.replace(~r{/+$}, "")
  end

  defp binario_de([programa | _]) do
    programa |> String.downcase() |> String.replace(~r/\.(exe|cmd|bat)$/, "")
  end

  defp binario_de([]), do: ""

  defp casa_algum?(saida, padroes) do
    texto = saida || ""
    Enum.any?(padroes, &Regex.match?(&1, texto))
  end

  @doc """
  Esta classe gasta uma das tres fichas da tarefa?

  So `:entrega`. As outras duas nao sao culpa de quem construiu, e queimar ficha por elas
  aproxima o bloqueio sem que ninguem tenha errado — foi o que custou 4 ciclos na T-030.

  ## Exemplos

      iex> Fabrica.Criterios.ClasseFalha.conta_ciclo?(:entrega)
      true

      iex> Fabrica.Criterios.ClasseFalha.conta_ciclo?(:ferramenta_quebrada)
      false
  """
  @spec conta_ciclo?(t()) :: boolean()
  def conta_ciclo?(:entrega), do: true
  def conta_ciclo?(_classe), do: false

  @doc """
  Vale reexecutar o comando uma vez?

  So `:ambiente`, e a troca e assimetrica em ordens de grandeza: a reexecucao custa segundos
  de CPU e **zero token**, enquanto uma reprovacao falsa custa um despacho inteiro **mais uma
  das tres fichas** da tarefa.

  Regressao real falha as DUAS vezes; crash por contencao de recurso normalmente nao.
  """
  @spec reexecuta?(t()) :: boolean()
  def reexecuta?(:ambiente), do: true
  def reexecuta?(_classe), do: false

  @doc """
  Quem precisa agir, e sobre o que.

  E a traducao da classe em acao, e ela existe para que ninguem precise reconstruir a tabela
  a partir de `conta_ciclo?/1` e `reexecuta?/1`.
  """
  @spec quem_conserta(t()) :: :orquestrador_corrige_criterio | :maquina | :construtor
  def quem_conserta(:ferramenta_quebrada), do: :orquestrador_corrige_criterio
  def quem_conserta(:ambiente), do: :maquina
  def quem_conserta(:entrega), do: :construtor

  @doc "Uma linha explicando a classe, para o relatorio."
  @spec explicar(t()) :: String.t()
  def explicar(:ferramenta_quebrada) do
    "o comando do criterio nao executou — **o criterio e que precisa de conserto**"
  end

  def explicar(:ambiente) do
    "a maquina atrapalhou (processo morto, crash nativo, prazo ou recurso esgotado)"
  end

  def explicar(:entrega), do: "o comando rodou e o resultado esta errado"
end
