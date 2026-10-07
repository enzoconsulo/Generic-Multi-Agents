defmodule Fabrica.Ferramentas.Comando do
  @moduledoc """
  Executa um comando externo no diretorio do projeto, com prazo e morte da ARVORE.

  ## Tres coisas que este modulo garante, e cada uma nasceu de um estrago

  1. **O prazo mata a arvore, nao so o processo lancado.** Ver
     `Fabrica.Ferramentas.ArvoreProcessos`: oito `node.exe` orfaos na v1.
  2. **`stdout` e `stderr` voltam SEPARADOS.** Juntar os dois e o que faz o diagnostico da
     v0.3 nao conseguir distinguir "o comando esta quebrado" de "a entrega falhou" — e essa
     distincao vale 4 ciclos e US$ 12,90, que foi o preco dela na T-030 do banco-imobiliario.
  3. **O motivo do encerramento e explicito**: `:normal`, `:prazo` ou `:cancelado`. Prazo
     estourado NAO e teste reprovado, e a escada de resposta ao fracasso (T-030) depende de
     saber a diferenca. Um `exit_status` sozinho nao conta essa historia.

  ## Por que `Port` e nao `System.cmd`

  `System.cmd/3` e sincrono e nao devolve o PID do sistema operacional — sem PID nao ha como
  matar a arvore. Com `Port` e `:spawn_executable` da para pedir `:exit_status`, ler os dois
  fluxos e obter o PID via `:os_pid`.
  """

  require Logger

  alias Fabrica.Ferramentas.ArvoreProcessos
  alias Fabrica.Ferramentas.Confinamento

  @prazo_padrao 120_000

  @typedoc "Por que o comando terminou. E isto que a v0.3 le para decidir a politica."
  @type motivo :: :normal | :prazo | :cancelado

  @type resultado :: %{
          codigo: integer() | nil,
          stdout: String.t(),
          stderr: String.t(),
          duracao_ms: non_neg_integer(),
          motivo: motivo()
        }

  @doc "O prazo padrao, em milissegundos. Dois minutos."
  @spec prazo_padrao() :: pos_integer()
  def prazo_padrao, do: @prazo_padrao

  @doc """
  Roda `programa` com `argumentos` dentro de `raiz`.

  O diretorio de trabalho e SEMPRE a raiz do projeto, resolvida pelo confinamento — nunca a
  raiz da fabrica. Um comando que rode no lugar errado nao apenas falha: ele pode acertar,
  sobre os arquivos de outro projeto.
  """
  @spec rodar(Path.t(), String.t(), [String.t()], keyword()) ::
          {:ok, resultado()} | {:erro, term()}
  def rodar(raiz, programa, argumentos \\ [], opcoes \\ []) do
    prazo = Keyword.get(opcoes, :prazo, @prazo_padrao)

    with {:ok, diretorio} <- Confinamento.resolver(raiz, Keyword.get(opcoes, :dentro, ".")),
         {:ok, executavel} <- localizar(programa) do
      inicio = System.monotonic_time(:millisecond)

      porta =
        Port.open({:spawn_executable, executavel}, [
          :binary,
          :exit_status,
          :hide,
          :stderr_to_stdout,
          args: argumentos,
          cd: diretorio
        ])

      pid = pid_do_sistema(porta)
      colher(porta, pid, prazo, inicio, [])
    end
  end

  @typedoc """
  De onde vem o `stdin` do comando. `:vazio` (o padrao) mantem `< nul` / `< /dev/null` — a
  economia medida na T-018a. `{:arquivo, caminho}` redireciona daquele arquivo, sem
  interpolar o conteudo em lugar nenhum: e o que permite um texto com quebra de linha, aspas,
  `&`, `|`, crase e `%VAR%` chegar intacto (ver T-013a).
  """
  @type entrada :: :vazio | {:arquivo, Path.t()}

  @doc """
  Roda um comando capturando `stdout` e `stderr` em fluxos SEPARADOS.

  A separacao usa dois arquivos temporarios em vez de dois pipes: a `Port` da OTP nao expoe
  o `stderr` separadamente — ela so oferece `:stderr_to_stdout` ou o descarte. Redirecionar
  pelo shell e o unico caminho que preserva os dois, e preserva-los e requisito do
  diagnostico da v0.3.

  A opcao `entrada:` alimenta o `stdin` a partir de um arquivo (`{:arquivo, caminho}`) em vez
  do vazio padrao. Quem tem o texto em maos escreve o arquivo antes de chamar — este modulo
  nunca interpola o conteudo numa linha de comando.
  """
  @spec rodar_separado(Path.t(), String.t(), keyword()) :: {:ok, resultado()} | {:erro, term()}
  def rodar_separado(raiz, linha, opcoes \\ []) do
    entrada = Keyword.get(opcoes, :entrada, :vazio)

    with {:ok, diretorio} <- Confinamento.resolver(raiz, Keyword.get(opcoes, :dentro, ".")),
         :ok <- validar_entrada(entrada) do
      marca = System.unique_integer([:positive])
      saida = Path.join(System.tmp_dir!(), "cmd-out-#{marca}")
      erro = Path.join(System.tmp_dir!(), "cmd-err-#{marca}")
      script = escrever_script(marca, linha, saida, erro, entrada)

      {programa, prefixo} = shell()

      resposta =
        rodar_bruto(diretorio, programa, prefixo ++ [para_o_shell(script)], opcoes)

      apagar(script)

      case resposta do
        {:ok, parcial} ->
          {:ok, %{parcial | stdout: ler_e_apagar(saida), stderr: ler_e_apagar(erro)}}

        outro ->
          apagar(saida)
          apagar(erro)
          outro
      end
    end
  end

  defp validar_entrada(:vazio), do: :ok

  defp validar_entrada({:arquivo, caminho}) do
    if File.regular?(caminho) do
      :ok
    else
      {:erro, {:arquivo_entrada_ausente, caminho}}
    end
  end

  # POR QUE UM SCRIPT TEMPORARIO, e nao a linha passada direto ao shell.
  #
  # MEDIDO: o `Port.open` com `args:` ja CITA cada argumento que contenha espaco. Passar
  # `echo x > "caminho"` como um argumento so faz o Erlang envolve-lo em aspas de novo, e o
  # `cmd` engasga com as aspas aninhadas — o sintoma e "A sintaxe do nome do arquivo ... esta
  # incorreta", que nao fala de aspas nem de separador e manda procurar no lugar errado.
  # (Sem aspas funciona, mas ai qualquer caminho com espaco quebra: nao ha saida boa.)
  #
  # Num arquivo de script as aspas sao do arquivo, e ninguem as cita de novo. De quebra, o
  # agente pode mandar uma linha com pipes, `&&` e aspas — o que ele VAI fazer — sem que a
  # citacao de argumento a desmonte.
  defp escrever_script(marca, linha, saida, erro, entrada) do
    # O AGRUPAMENTO — `( ... )` no cmd, `{ ... ; }` no sh — nao e enfeite. Sem ele, uma
    # linha composta como `echo a & echo b 1>&2` faz o redirecionamento valer so para o
    # ULTIMO comando: o `&` separa, e `> saida` gruda no que vem imediatamente antes. O
    # sintoma foi stdout recebendo o texto do stderr, que e o oposto exato do que esta
    # tarefa existe para garantir.
    # O `stdin`, por padrao, VEM DO VAZIO. A fabrica nao e interativa: a maioria dos comandos
    # que ela roda nao tem de onde ler entrada, e um processo que ESPERA por ela fica parado
    # ate desistir. Medido no probe da T-018a: o `claude` perde **3 segundos por chamada** e
    # ainda suja o `stderr` com `Warning: no stdin data received in 3s` — e o `stderr` e o
    # que a classificacao de falha da T-026 le para decidir de quem e a culpa.
    #
    # `entrada: {:arquivo, caminho}` troca o vazio por aquele arquivo (T-013a): e o caminho
    # que evita interpolar texto arbitrario — quebra de linha, aspas, `&`, `%VAR%` — numa
    # linha de comando, onde nenhum escape e confiavel em dois shells diferentes.
    #
    # Fica aqui, e nao em cada adaptador, porque a afirmacao vale para TODO comando: quem
    # espera entrada de um pipeline sem terminal esperaria em vao de qualquer jeito.
    {extensao, conteudo} =
      case :os.type() do
        {:win32, _} ->
          origem = origem_stdin(entrada, "nul")

          {".bat",
           "@echo off\r\n(#{linha}) < #{origem} > \"#{para_o_shell(saida)}\" " <>
             "2> \"#{para_o_shell(erro)}\"\r\n"}

        _ ->
          origem = origem_stdin(entrada, "/dev/null")
          {".sh", "#!/bin/sh\n{ #{linha} ; } < #{origem} > \"#{saida}\" 2> \"#{erro}\"\n"}
      end

    caminho = Path.join(System.tmp_dir!(), "fabrica-cmd-#{marca}#{extensao}")
    File.write!(caminho, conteudo)
    caminho
  end

  defp origem_stdin(:vazio, vazio), do: vazio
  defp origem_stdin({:arquivo, caminho}, _vazio), do: "\"#{para_o_shell(caminho)}\""

  defp rodar_bruto(diretorio, programa, argumentos, opcoes) do
    prazo = Keyword.get(opcoes, :prazo, @prazo_padrao)

    with {:ok, executavel} <- localizar(programa) do
      inicio = System.monotonic_time(:millisecond)

      porta =
        Port.open({:spawn_executable, executavel}, [
          :binary,
          :exit_status,
          :hide,
          args: argumentos,
          cd: diretorio
        ])

      colher(porta, pid_do_sistema(porta), prazo, inicio, [])
    end
  end

  # O laco de coleta. Ele existe para que o PRAZO seja do sistema e nao do comando: um
  # comando travado nunca devolve `exit_status`, e sem o `after` a fabrica ficaria presa.
  #
  # Publico (mas `@doc false`, fora do indice) so para ser PROVAVEL: o defeito que esta
  # funcao corrige (T-013b) e uma ordem de mensagens na caixa do PROCESSO, e o unico jeito
  # de testar isso sem depender de corrida real e montar essa ordem a mao e chamar o laco
  # direto — a mesma tecnica de `Fabrica.Fila.Exclusao.todas_disjuntas?/1`.
  @doc false
  @spec colher(port() | reference(), integer() | nil, non_neg_integer(), integer(), [binary()]) ::
          {:ok, resultado()}
  def colher(porta, pid, prazo, inicio, pedacos) do
    receive do
      {^porta, {:data, dados}} ->
        colher(porta, pid, prazo, inicio, [dados | pedacos])

      {^porta, {:exit_status, codigo}} ->
        {:ok, montar(codigo, drenar(porta, pedacos), inicio, :normal)}
    after
      prazo ->
        pedacos = drenar(porta, pedacos)
        encerrar(porta, pid)
        {:ok, montar(nil, pedacos, inicio, :prazo)}
    end
  end

  # Janela de drenagem: MEDIDO (T-013b) que o driver da porta no Windows NAO garante que o
  # ultimo pedaco de dado preceda o `exit_status` — sob carga (120 rodadas, max_concurrency
  # 24) 9 execucoes (7,5%) voltaram com stdout vazio porque o `{:data, _}` chegou DEPOIS do
  # `{:exit_status, _}` e `colher/5` ja tinha retornado. A janela e curta (o dado, quando
  # existe, chega quase junto) e SEMPRE termina: sem mensagem nova dentro dela, para.
  @janela_drenagem_ms 50

  defp drenar(porta, pedacos) do
    receive do
      {^porta, {:data, dados}} ->
        drenar(porta, [dados | pedacos])
    after
      @janela_drenagem_ms -> pedacos
    end
  end

  defp encerrar(porta, pid) do
    # O retorno e descartado de proposito, e sem perda: `ArvoreProcessos.encerrar/1` ja
    # registra a propria falha em log. Aqui nao ha o que decidir com ela — o prazo estourou
    # e a porta vai fechar de um jeito ou de outro.
    _ = if pid, do: ArvoreProcessos.encerrar(pid)

    # Fechar a porta e o segundo passo, e nao o primeiro: fechar antes de matar a arvore
    # perderia o `os_pid` e deixaria os filhos exatamente como a v1 os deixava.
    if Port.info(porta), do: Port.close(porta)

    :ok
  rescue
    ArgumentError -> :ok
  end

  defp montar(codigo, pedacos, inicio, motivo) do
    %{
      codigo: codigo,
      stdout: pedacos |> Enum.reverse() |> IO.iodata_to_binary(),
      stderr: "",
      duracao_ms: System.monotonic_time(:millisecond) - inicio,
      motivo: motivo
    }
  end

  defp pid_do_sistema(porta) do
    case Port.info(porta, :os_pid) do
      {:os_pid, pid} -> pid
      _ -> nil
    end
  end

  defp localizar(programa) do
    case System.find_executable(programa) do
      nil -> {:erro, {:executavel_ausente, programa}}
      caminho -> {:ok, caminho}
    end
  end

  defp shell do
    case :os.type() do
      {:win32, _} -> {"cmd", ["/c"]}
      _ -> {"sh", ["-c"]}
    end
  end

  # ARMADILHA MEDIDA: o `cmd` do Windows NAO aceita `>` para um caminho com barra normal, e
  # `Path.join` produz caminho MISTO — `C:\Users\...\Temp/cmd-out-1`, backslash da raiz do
  # sistema e barra do que foi juntado. O sintoma e "A sintaxe do nome do arquivo ... esta
  # incorreta", que nao fala de separador nenhum e manda procurar no lugar errado.
  defp para_o_shell(caminho) do
    case :os.type() do
      {:win32, _} -> String.replace(caminho, "/", "\\")
      _ -> caminho
    end
  end

  # A limpeza de temporario e best-effort: o comando ja rodou e o resultado ja esta em maos,
  # entao falhar em apagar nao pode derrubar a chamada. Mas tambem nao pode sumir em silencio —
  # no Windows um antivirus segurando o handle deixa lixo em `System.tmp_dir!()` a CADA comando,
  # e vazamento invisivel so aparece quando o disco enche.
  #
  # O tipo de retorno e unico (`:ok`) de proposito: e o que permite descartar a chamada sem que
  # o Dialyzer acuse `unmatched_return`, e sem apagar a informacao com um `_ =` mudo.
  @spec apagar(Path.t()) :: :ok
  defp apagar(caminho) do
    case File.rm(caminho) do
      :ok ->
        :ok

      {:error, :enoent} ->
        :ok

      {:error, motivo} ->
        Logger.warning("nao consegui apagar o temporario #{caminho}: #{inspect(motivo)}")
    end
  end

  defp ler_e_apagar(caminho) do
    conteudo =
      case File.read(caminho) do
        {:ok, texto} -> texto
        _ -> ""
      end

    apagar(caminho)
    conteudo
  end
end
