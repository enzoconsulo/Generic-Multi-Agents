defmodule Fabrica.Ferramentas.ArvoreProcessos do
  @moduledoc """
  Encerra um processo externo E OS FILHOS DELE.

  ## A armadilha medida na v1

  Matar o processo lancado **nao mata os filhos**. Uma suite de projeto Node deixou **oito
  `node.exe` orfaos** por estouro de prazo, numa maquina com 1,3 GB livres. Cada orfao
  segurava memoria ate alguem notar — e ninguem notava, porque nada acusava.

  O detalhe que torna isso inevitavel: a fabrica quase nunca lanca o processo que importa.
  Ela lanca `mix`, que lanca o `erl`; ou `cmd`, que lanca `npm`, que lanca `node`. Matar o
  primeiro deixa a arvore inteira de pe.

  ## Como cada plataforma faz

  | plataforma | como | por que assim |
  |---|---|---|
  | Windows | `taskkill /PID <pid> /T /F` | o `/T` e a arvore; sem ele, so o primeiro morre |
  | Unix | `kill -TERM -<pgid>`, depois `-KILL` | o sinal para o GRUPO (pid negativo) alcanca os filhos |

  No Unix ha ainda a gentileza de mandar `TERM` antes de `KILL`: o processo tem chance de
  fechar arquivo e liberar porta. No Windows o `taskkill /F` nao oferece esse meio-termo.
  """

  require Logger

  @doc "A plataforma, para o teste saber qual caminho esta exercitando."
  @spec plataforma() :: :windows | :unix
  def plataforma do
    case :os.type() do
      {:win32, _} -> :windows
      _ -> :unix
    end
  end

  @doc """
  Encerra o processo e toda a arvore abaixo dele.

  Devolve `:ok` mesmo quando o processo ja morreu sozinho — encerrar o que ja acabou nao e
  erro, e tratar como erro encheria o log de ruido na corrida normal entre o prazo e o fim
  do comando.
  """
  @spec encerrar(pos_integer()) :: :ok | {:erro, term()}
  def encerrar(pid) when is_integer(pid) and pid > 0 do
    case plataforma() do
      :windows -> encerrar_windows(pid)
      :unix -> encerrar_unix(pid)
    end
  end

  def encerrar(_pid), do: {:erro, :pid_invalido}

  defp encerrar_windows(pid) do
    case System.cmd("taskkill", ["/PID", to_string(pid), "/T", "/F"], stderr_to_stdout: true) do
      {_saida, 0} ->
        :ok

      # 128 e "processo nao encontrado": ele ja morreu, e isso e desfecho normal.
      {_saida, 128} ->
        :ok

      {saida, codigo} ->
        Logger.warning("taskkill do pid #{pid} devolveu #{codigo}: #{String.trim(saida)}")
        {:erro, {:taskkill, codigo}}
    end
  rescue
    erro -> {:erro, {:taskkill_indisponivel, erro}}
  end

  defp encerrar_unix(pid) do
    # O sinal vai para o GRUPO (pid negativo). Sem isso, so o lider morre e os filhos ficam.
    _ = System.cmd("kill", ["-TERM", "--", "-#{pid}"], stderr_to_stdout: true)
    Process.sleep(100)
    _ = System.cmd("kill", ["-KILL", "--", "-#{pid}"], stderr_to_stdout: true)
    :ok
  rescue
    erro -> {:erro, {:kill_indisponivel, erro}}
  end

  @doc """
  Diz se um processo do sistema ainda esta vivo. E o que permite ao teste conferir o NETO.

  Sem esta funcao, o teste da arvore so poderia afirmar que o comando terminou — que e
  justamente o que acontecia na v1 enquanto oito orfaos seguiam de pe.
  """
  @spec vivo?(pos_integer()) :: boolean()
  def vivo?(pid) when is_integer(pid) and pid > 0 do
    case plataforma() do
      :windows -> vivo_windows?(pid)
      :unix -> match?({_, 0}, System.cmd("kill", ["-0", to_string(pid)], stderr_to_stdout: true))
    end
  rescue
    _ -> false
  end

  def vivo?(_pid), do: false

  defp vivo_windows?(pid) do
    {saida, _codigo} =
      System.cmd("tasklist", ["/FI", "PID eq #{pid}", "/NH"], stderr_to_stdout: true)

    # `tasklist` sai com 0 mesmo sem achar nada, dizendo "No tasks are running...". O
    # veredito, portanto, e a presenca do PID na saida — nao o codigo de saida.
    String.contains?(saida, to_string(pid))
  end
end
