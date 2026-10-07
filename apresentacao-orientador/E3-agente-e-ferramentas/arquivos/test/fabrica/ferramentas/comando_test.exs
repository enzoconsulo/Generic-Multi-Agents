defmodule Fabrica.Ferramentas.ComandoTest do
  @moduledoc """
  A ferramenta de comando, e principalmente a morte da ARVORE.

  O teste do neto e o que importa: na v1, matar o processo lancado deixou oito `node.exe`
  orfaos, e nada acusou. Um teste que so confira "o comando terminou" reproduziria o mesmo
  ponto cego.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Ferramentas.ArvoreProcessos
  alias Fabrica.Ferramentas.Comando

  @moduletag :capture_log

  setup do
    raiz =
      Path.join([
        File.cwd!(),
        "_build",
        "test",
        "tmp",
        "cmd-#{System.unique_integer([:positive])}"
      ])

    File.mkdir_p!(Path.join(raiz, "sub"))
    on_exit(fn -> File.rm_rf(raiz) end)
    {:ok, raiz: raiz}
  end

  defp windows?, do: ArvoreProcessos.plataforma() == :windows

  # O comando que so imprime, em cada plataforma.
  defp eco(texto) do
    if windows?(), do: "echo #{texto}", else: "echo '#{texto}'"
  end

  describe "o basico" do
    test "roda um comando e devolve a saida", %{raiz: raiz} do
      assert {:ok, resultado} = Comando.rodar_separado(raiz, eco("ola"))

      assert resultado.motivo == :normal
      assert resultado.codigo == 0
      assert resultado.stdout =~ "ola"
    end

    test "devolve a duracao", %{raiz: raiz} do
      assert {:ok, %{duracao_ms: duracao}} = Comando.rodar_separado(raiz, eco("x"))
      assert is_integer(duracao) and duracao >= 0
    end

    test "codigo de saida diferente de zero volta como esta", %{raiz: raiz} do
      linha = if windows?(), do: "exit 3", else: "exit 3"

      assert {:ok, %{codigo: 3, motivo: :normal}} = Comando.rodar_separado(raiz, linha)
    end

    test "executavel ausente devolve erro nomeado", %{raiz: raiz} do
      assert {:erro, {:executavel_ausente, "programa-que-nao-existe"}} =
               Comando.rodar(raiz, "programa-que-nao-existe", [])
    end
  end

  describe "stdout e stderr SEPARADOS" do
    test "um comando que escreve nos dois devolve os dois, separados", %{raiz: raiz} do
      # Juntar os dois e o que faz o diagnostico da v0.3 nao distinguir "o comando esta
      # quebrado" de "a entrega falhou". Essa distincao custou 4 ciclos na v1.
      linha =
        if windows?() do
          "echo saida-normal & echo saida-de-erro 1>&2"
        else
          "echo saida-normal; echo saida-de-erro 1>&2"
        end

      assert {:ok, resultado} = Comando.rodar_separado(raiz, linha)

      assert resultado.stdout =~ "saida-normal"
      refute resultado.stdout =~ "saida-de-erro"

      assert resultado.stderr =~ "saida-de-erro"
      refute resultado.stderr =~ "saida-normal"
    end

    test "comando que so escreve em stderr deixa stdout vazio", %{raiz: raiz} do
      linha =
        if windows?(), do: "echo apenas-erro 1>&2", else: "echo apenas-erro 1>&2"

      assert {:ok, resultado} = Comando.rodar_separado(raiz, linha)

      assert String.trim(resultado.stdout) == ""
      assert resultado.stderr =~ "apenas-erro"
    end
  end

  describe "entrada por arquivo (stdin)" do
    # `copiar_stdin/1` copia o stdin recebido para o stdout, byte a byte, sem passar por
    # nenhuma API de texto (que poderia converter quebra de linha). No Windows isso exige um
    # script `.ps1` proprio com fluxos brutos (`OpenStandardInput`/`OpenStandardOutput`); no
    # Unix, `cat` ja faz exatamente isso.
    defp copiar_stdin(raiz) do
      if windows?() do
        script = Path.join(raiz, "copiar-#{System.unique_integer([:positive])}.ps1")

        File.write!(script, """
        $in = [Console]::OpenStandardInput()
        $out = [Console]::OpenStandardOutput()
        $in.CopyTo($out)
        $out.Flush()
        """)

        ~s(powershell -NoProfile -ExecutionPolicy Bypass -File "#{String.replace(script, "/", "\\")}")
      else
        "cat"
      end
    end

    # Mesma copia, mas escrevendo tambem uma linha fixa em stderr — para provar que a
    # separacao de fluxos (T-013) nao regride quando ha entrada por arquivo.
    defp copiar_stdin_com_erro(raiz) do
      if windows?() do
        script = Path.join(raiz, "copiar-erro-#{System.unique_integer([:positive])}.ps1")

        File.write!(script, """
        $in = [Console]::OpenStandardInput()
        $out = [Console]::OpenStandardOutput()
        $in.CopyTo($out)
        $out.Flush()
        [Console]::Error.WriteLine('erro-fixo')
        """)

        ~s(powershell -NoProfile -ExecutionPolicy Bypass -File "#{String.replace(script, "/", "\\")}")
      else
        "cat; echo erro-fixo 1>&2"
      end
    end

    test "um texto com quebras de linha, aspas, & | crase e %VAR% chega INTEGRO ao stdin", %{
      raiz: raiz
    } do
      conteudo =
        "linha um\nlinha dois com \"aspas\"\ncom & e | e `crase` e %VAR%\nfim sem quebra"

      arquivo = Path.join(raiz, "entrada.txt")
      File.write!(arquivo, conteudo)

      linha = copiar_stdin(raiz)

      assert {:ok, resultado} =
               Comando.rodar_separado(raiz, linha, entrada: {:arquivo, arquivo})

      assert resultado.motivo == :normal
      assert resultado.stdout == conteudo, "o stdin nao chegou byte a byte igual ao arquivo"
    end

    test "sem a opcao entrada, o padrao continua vazio (nao espera por dados)", %{raiz: raiz} do
      # Se o `< nul` / `< /dev/null` sumir, este comando fica esperando o stdin nunca chegar
      # e so devolve pelo prazo — motivo :prazo, e nao :normal. E o defeito que o comentario
      # de `escrever_script/4` documenta (3s perdidos por chamada do `claude`).
      linha = copiar_stdin(raiz)

      assert {:ok, resultado} = Comando.rodar_separado(raiz, linha, prazo: 3_000)

      assert resultado.motivo == :normal
      assert resultado.stdout == ""
    end

    test "stdout e stderr continuam SEPARADOS quando ha entrada por arquivo", %{raiz: raiz} do
      conteudo = "conteudo-da-entrada"
      arquivo = Path.join(raiz, "entrada2.txt")
      File.write!(arquivo, conteudo)

      linha = copiar_stdin_com_erro(raiz)

      assert {:ok, resultado} =
               Comando.rodar_separado(raiz, linha, entrada: {:arquivo, arquivo})

      assert resultado.stdout == conteudo
      refute resultado.stdout =~ "erro-fixo"

      assert resultado.stderr =~ "erro-fixo"
      refute resultado.stderr =~ "conteudo-da-entrada"
    end

    test "arquivo de entrada inexistente devolve erro nomeado", %{raiz: raiz} do
      ausente = Path.join(raiz, "nao-existe.txt")

      assert {:erro, {:arquivo_entrada_ausente, ^ausente}} =
               Comando.rodar_separado(raiz, eco("x"), entrada: {:arquivo, ausente})
    end
  end

  describe "o coletor drena o que chega DEPOIS do exit_status (T-013b)" do
    # `Comando.colher/5` e publico so por isto (`@doc false`, fora do indice, mesma tecnica
    # de `Fabrica.Fila.Exclusao.todas_disjuntas?/1`): o defeito e uma ORDEM de mensagens na
    # caixa do processo, e reproduzi-la de verdade dependeria de uma corrida real com o
    # driver da porta no Windows. Montando a ordem a mao o teste fica DETERMINISTICO — sem
    # depender de sorte para provar o que era intermitente.
    defp inicio_ficticio, do: System.monotonic_time(:millisecond)

    test "um {:data, _} que chega DEPOIS do {:exit_status, _} nao se perde" do
      porta = make_ref()
      send(self(), {porta, {:exit_status, 0}})
      send(self(), {porta, {:data, "saida-atrasada"}})

      assert {:ok, resultado} = Comando.colher(porta, nil, 5_000, inicio_ficticio(), [])

      assert resultado.motivo == :normal
      assert resultado.codigo == 0
      assert resultado.stdout == "saida-atrasada"
    end

    test "varios pedacos atrasados chegam completos e NA ORDEM" do
      porta = make_ref()
      send(self(), {porta, {:data, "primeiro-"}})
      send(self(), {porta, {:exit_status, 0}})
      send(self(), {porta, {:data, "segundo-"}})
      send(self(), {porta, {:data, "terceiro"}})

      assert {:ok, resultado} = Comando.colher(porta, nil, 5_000, inicio_ficticio(), [])

      assert resultado.stdout == "primeiro-segundo-terceiro"
    end

    test "sem dado atrasado nenhum, o resultado continua correto" do
      porta = make_ref()
      send(self(), {porta, {:data, "unico"}})
      send(self(), {porta, {:exit_status, 0}})

      assert {:ok, resultado} = Comando.colher(porta, nil, 5_000, inicio_ficticio(), [])

      assert resultado.stdout == "unico"
    end
  end

  describe "sob concorrencia real (T-013b) — a saida nunca some" do
    # MEDIDO no diagnostico da tarefa: 120 rodadas de `git log --opcao-invalida` com
    # `max_concurrency: 24` perderam a saida em 9 (7,5%) antes do conserto. Este teste roda
    # o mesmo cenario e afirma ZERO perdas — e o teste que teria acusado o defeito original.
    test "git log com opcao invalida, 100 vezes em paralelo, nunca volta com saida vazia", %{
      raiz: raiz
    } do
      # `git log --opcao-invalida` so chega a reclamar da OPCAO se o repositorio ja tiver
      # pelo menos um commit; num repo vazio ele reclama da falta de commit antes de olhar
      # para os argumentos, e o cenario que esta tarefa mede nunca chega a se repetir.
      {_, 0} = System.cmd("git", ["init", "--quiet"], cd: raiz)
      {_, 0} = System.cmd("git", ["config", "user.email", "teste@example.com"], cd: raiz)
      {_, 0} = System.cmd("git", ["config", "user.name", "Teste"], cd: raiz)

      {_, 0} =
        System.cmd("git", ["commit", "--allow-empty", "-m", "inicial", "--quiet"], cd: raiz)

      resultados =
        1..100
        |> Task.async_stream(
          fn _ -> Comando.rodar_separado(raiz, "git log --opcao-invalida") end,
          max_concurrency: 24,
          timeout: 30_000
        )
        |> Enum.map(fn {:ok, resultado} -> resultado end)

      vazios =
        Enum.filter(resultados, fn {:ok, resultado} ->
          String.trim(resultado.stdout <> resultado.stderr) == ""
        end)

      assert vazios == [],
             "#{length(vazios)} de 100 execucoes voltaram com saida vazia — a perda que a " <>
               "T-013b existe para consertar"

      assert Enum.all?(resultados, fn {:ok, resultado} ->
               resultado.stdout <> resultado.stderr =~ "unrecognized argument"
             end)
    end
  end

  describe "prazo" do
    test "comando que passa do prazo devolve motivo :prazo, e nao :normal", %{raiz: raiz} do
      # A distincao e o ponto: prazo estourado NAO e teste reprovado, e a escada de resposta
      # ao fracasso (T-030) decide coisas diferentes para cada um.
      linha = if windows?(), do: "ping -n 30 127.0.0.1", else: "sleep 30"

      assert {:ok, resultado} = Comando.rodar_separado(raiz, linha, prazo: 800)

      assert resultado.motivo == :prazo
      assert resultado.codigo == nil, "sem codigo de saida: o comando nao chegou a terminar"
    end

    test "comando rapido nao dispara o prazo", %{raiz: raiz} do
      assert {:ok, %{motivo: :normal}} =
               Comando.rodar_separado(raiz, eco("rapido"), prazo: 10_000)
    end

    test "o prazo padrao e de dois minutos" do
      assert Comando.prazo_padrao() == 120_000
    end

    test "prazo estourado nao perde o que ja tinha sido escrito antes de matar a arvore" do
      # T-013b: a drenagem entra tambem no caminho do prazo. O que ja foi coletado antes do
      # `after` disparar precisa sobreviver ao encerramento — nao e so o exit_status normal
      # que corre esse risco.
      porta = make_ref()
      send(self(), {porta, {:data, "ja-escrito-antes-do-prazo"}})

      assert {:ok, resultado} =
               Comando.colher(porta, nil, 50, System.monotonic_time(:millisecond), [])

      assert resultado.motivo == :prazo
      assert resultado.codigo == nil
      assert resultado.stdout == "ja-escrito-antes-do-prazo"
    end
  end

  describe "a arvore de processos — o teste do NETO" do
    test "encerrar por prazo mata TAMBEM o filho", %{raiz: raiz} do
      # O comando lanca um FILHO que grava o proprio PID e dorme muito. Se so o processo
      # lancado morrer, o filho continua vivo — que e exatamente o que acontecia na v1.
      #
      # O filho mora num script proprio em vez de numa linha unica: montar `powershell -Command
      # "..."` dentro de um `.bat` dentro de um argumento citado pelo Erlang e tres niveis de
      # aspas, e a primeira versao deste teste morreu neles (codigo 255, motivo :normal).
      pidfile = Path.join(raiz, "neto.pid")
      filho = Path.join(raiz, if(windows?(), do: "filho.ps1", else: "filho.sh"))

      if windows?() do
        File.write!(
          filho,
          "$PID | Out-File -Encoding ascii '#{pidfile}'\nStart-Sleep -Seconds 30\n"
        )
      else
        File.write!(filho, "#!/bin/sh\necho $$ > \"#{pidfile}\"\nsleep 30\n")
        File.chmod!(filho, 0o755)
      end

      linha =
        if windows?() do
          ~s(start /b powershell -NoProfile -ExecutionPolicy Bypass -File "#{String.replace(filho, "/", "\\")}" & ping -n 30 127.0.0.1)
        else
          ~s(sh "#{filho}" & sleep 30)
        end

      assert {:ok, %{motivo: :prazo}} = Comando.rodar_separado(raiz, linha, prazo: 4_000)

      neto = ler_pid(pidfile)

      if neto do
        # Da um instante para o taskkill /T propagar.
        Process.sleep(500)

        refute sobreviveu?(neto),
               "o neto (pid #{neto}) sobreviveu ao prazo. E exatamente o defeito da v1: " <>
                 "oito node.exe orfaos, sem nada acusando."
      else
        flunk("""
        o filho nao chegou a gravar o PID, entao este teste nao provou nada.
        Sem o PID do neto, ele so confirmaria que o comando terminou — que e o ponto cego
        que este teste existe para cobrir.
        """)
      end
    end

    test "encerrar um pid que ja morreu nao e erro" do
      # A corrida entre o prazo e o fim natural do comando e normal, e tratar isso como erro
      # encheria o log de ruido a cada verificacao.
      assert :ok = ArvoreProcessos.encerrar(999_999)
    end

    test "pid invalido e recusado" do
      assert {:erro, :pid_invalido} = ArvoreProcessos.encerrar(0)
      assert {:erro, :pid_invalido} = ArvoreProcessos.encerrar(-1)
    end

    test "vivo? reconhece o proprio processo do runtime" do
      # `os_getpid` devolve o PID do proprio BEAM, que obviamente esta vivo. Sem este teste,
      # `vivo?` podendo devolver sempre `false` faria o teste do neto passar por vazio.
      meu_pid = :os.getpid() |> List.to_string() |> String.to_integer()

      assert ArvoreProcessos.vivo?(meu_pid)
    end

    test "vivo? devolve false para pid inexistente" do
      refute ArvoreProcessos.vivo?(999_998)
    end
  end

  describe "diretorio de trabalho" do
    test "roda na raiz do projeto, nunca na raiz da fabrica", %{raiz: raiz} do
      # Um comando que rode no lugar errado nao apenas falha: ele pode ACERTAR, sobre os
      # arquivos de outro projeto.
      marca = "marca-#{System.unique_integer([:positive])}"
      File.write!(Path.join(raiz, "#{marca}.txt"), "x")

      linha = if windows?(), do: "dir /b", else: "ls"

      assert {:ok, resultado} = Comando.rodar_separado(raiz, linha)
      assert resultado.stdout =~ marca
    end

    test "pode rodar num subdiretorio do projeto", %{raiz: raiz} do
      File.write!(Path.join([raiz, "sub", "dentro-do-sub.txt"]), "x")

      linha = if windows?(), do: "dir /b", else: "ls"

      assert {:ok, resultado} = Comando.rodar_separado(raiz, linha, dentro: "sub")
      assert resultado.stdout =~ "dentro-do-sub"
    end

    test "recusa rodar FORA do confinamento", %{raiz: raiz} do
      assert {:erro, :fora_do_confinamento} =
               Comando.rodar_separado(raiz, "dir", dentro: "../..")
    end
  end

  describe "plataforma" do
    test "a plataforma e reconhecida" do
      assert ArvoreProcessos.plataforma() in [:windows, :unix]
    end

    test "esta execucao exercitou o caminho desta maquina", %{raiz: raiz} do
      # A tarefa manda testar o caminho da maquina atual e deixar o outro para pular. Este
      # teste torna VISIVEL qual dos dois foi exercitado, em vez de deixar implicito.
      #
      # Ate a T-079 ele afirmava `:windows` incondicionalmente — o que so passava porque o
      # projeto nunca tinha rodado fora do Windows. Agora afirma o caminho DESTA maquina, e
      # nao so pela deteccao (que sairia tautologica): o script que o shell leu tem de ser o
      # desta plataforma — `.bat` no Windows, `.sh` no unix.
      esperado = if match?({:win32, _}, :os.type()), do: :windows, else: :unix

      assert ArvoreProcessos.plataforma() == esperado,
             "a deteccao de plataforma (#{ArvoreProcessos.plataforma()}) nao bate com o SO " <>
               "(#{inspect(:os.type())})"

      {linha, extensao} =
        if windows?(), do: {"echo %~x0", ".bat"}, else: {~s(echo "$0"), ".sh"}

      assert {:ok, %{codigo: 0, stdout: stdout}} = Comando.rodar_separado(raiz, linha)

      assert String.ends_with?(String.trim(stdout), extensao),
             "o script que rodou nao e o #{extensao} desta plataforma: #{inspect(stdout)}"
    end
  end

  describe "o script temporario (T-079)" do
    test "roda sem depender do bit de execucao do arquivo", %{raiz: raiz} do
      # MEDIDO na primeira bateria em Linux: o script era passado a `sh -c`, que tenta
      # EXECUTAR o caminho — e `File.write!/2` grava sem bit de execucao. Todo comando saia
      # com 126 (`Permission denied`) antes de chegar ao programa. O teste prova as DUAS
      # metades: o comando rodou (codigo 0, saida presente) E o arquivo que o shell leu nao
      # era executavel. Um `chmod` no temporario faria a primeira passar e esta falhar.
      if windows?() do
        # No Windows nao existe bit de execucao: `cmd /c arquivo.bat` decide pela extensao.
        assert {:ok, %{codigo: 0, stdout: stdout}} = Comando.rodar_separado(raiz, eco("sem-bit"))
        assert stdout =~ "sem-bit"
      else
        linha = ~s(if [ -x "$0" ]; then echo com-bit; else echo sem-bit; fi)

        assert {:ok, %{codigo: 0, stdout: "sem-bit\n"}} = Comando.rodar_separado(raiz, linha)
      end
    end
  end

  # O neto SOBREVIVEU se ainda roda — e um ZUMBI nao roda. MEDIDO no Linux (T-079): o grupo
  # inteiro morre ao `kill -TERM -<pgid>`, mas o neto, orfao, e adotado pelo PID 1 e fica
  # `<defunct>` ate ser colhido. Num conteiner cujo PID 1 colhe preguicosamente (aqui,
  # alguns segundos), `kill -0` — que e o que `ArvoreProcessos.vivo?/1` usa — ainda acha o
  # zumbi, e o teste acusava sobrevivencia de um processo que ja tinha terminado. Zumbi nao
  # segura arquivo, porta nem CPU: e so a entrada na tabela esperando o `wait()` do pai.
  # Um neto que de fato escapou do prazo esta `S`/`R`, nunca `Z`, e continua reprovando.
  defp sobreviveu?(pid), do: ArvoreProcessos.vivo?(pid) and not zumbi?(pid)

  defp zumbi?(pid) do
    if windows?() do
      false
    else
      case System.cmd("ps", ["-o", "stat=", "-p", to_string(pid)], stderr_to_stdout: true) do
        {estado, 0} -> String.starts_with?(String.trim(estado), "Z")
        _ -> false
      end
    end
  end

  defp ler_pid(caminho) do
    with {:ok, texto} <- File.read(caminho),
         {pid, _} <- texto |> String.trim() |> Integer.parse() do
      pid
    else
      _ -> nil
    end
  end
end
