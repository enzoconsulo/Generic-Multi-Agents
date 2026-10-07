defmodule Fabrica.Ferramentas.Confinamento do
  @moduledoc """
  O confinamento como PROPRIEDADE do codigo, e nao como frase no prompt.

  E a tese do TCC numa funcao: *uma regra que o sistema pede e uma regra opcional; uma regra
  que a estrutura garante e uma propriedade.* Na v1 o confinamento era uma linha no despacho
  — "nao toque em NADA fora de `projetos/<nome>/`". Aqui ele e uma funcao que **recusa**, e
  nenhuma ferramenta de arquivo tem como chegar ao disco sem passar por ela.

  ## O que precisa ser barrado, e por que cada um e diferente

  | forma | por que ela escapa |
  |---|---|
  | absoluto (`C:/Windows/...`) | o mais obvio, e o unico que uma checagem ingenua pega |
  | travessia (`../../..`) | so aparece **depois** de normalizar; comparar o texto cru nao ve |
  | link simbolico | o caminho esta dentro, o **destino** nao. Exige resolver o link real |
  | UNC (`\\\\servidor\\share`) | nao tem raiz local nenhuma para comparar |
  | dispositivo (`CON`, `NUL`, `COM1`) | nao e arquivo: escrever nele fala com o hardware |

  ## Barra invertida e separador — em QUALQUER plataforma

  E contrato de ENTRADA do agente, nao propriedade do sistema de arquivos: a doutrina e os
  exemplos da fabrica nasceram no Windows, e um agente que escreva `lib\\foo.ex` no Linux quer
  `lib/foo.ex`, nao um arquivo chamado literalmente `lib\\foo.ex`. Por isso `\\` vira `/`
  tanto no julgamento (`normalizar/1`) quanto no caminho devolvido por `resolver/2`.

  ## Caixa alta e caixa baixa — segue o SO

  A comparacao e case-insensitive no Windows, porque o sistema de arquivos e. Uma comparacao
  sensivel a caixa deixaria `..\\PROJETO` passar por nao bater com `..\\projeto` — o mesmo
  diretorio, escrito de outro jeito.

  Fora do Windows e o contrario, e pela mesma razao: no Linux `/x/PROJETO` e `/x/projeto` sao
  diretorios DIFERENTES, e comparar sem caixa ali deixaria um irmao de mesmo nome em outra
  caixa passar por "dentro" (D-014).

  ## Limitacao conhecida: nomes curtos 8.3 do Windows

  `C:\\Users\\ENZOCO~1` e `C:\\Users\\enzoconsulo` sao o MESMO diretorio, e este modulo os
  trata como diferentes. Medido: `:file.read_link_all/1` devolve sempre a forma longa,
  enquanto `System.tmp_dir!/0` devolve a curta — entao um link legitimo para dentro da raiz,
  quando a raiz foi dada na forma curta, e recusado.

  **A falha e para o lado seguro**: ela NEGA acesso legitimo, nunca permite acesso indevido.
  Nao ha caminho em que o nome curto faca um destino de fora parecer de dentro.

  Nao esta corrigido de proposito. Resolver 8.3 para a forma longa exige `GetLongPathName`,
  que a OTP nao expoe, ou um subprocesso por resolucao — caro num caminho que roda a cada
  chamada de ferramenta. E as raizes de projeto reais vem de configuracao na forma longa
  (`projetos/<nome>`); a forma curta so aparece em diretorio temporario. Se um dia uma raiz
  8.3 for real, isto vira tarefa — e o sintoma sera "o agente nao consegue ler um arquivo que
  existe", nao um vazamento.
  """

  # Nomes reservados do DOS que sobrevivem no Windows ate hoje. Abrir qualquer um deles nao
  # abre arquivo: fala com um dispositivo. `NUL` engole a escrita, `CON` le do teclado, e
  # `COM1` conversa com a porta serial — travando o agente sem erro.
  @dispositivos ~w[con prn aux nul com1 com2 com3 com4 com5 com6 com7 com8 com9
                   lpt1 lpt2 lpt3 lpt4 lpt5 lpt6 lpt7 lpt8 lpt9]

  @typedoc "Por que um caminho foi recusado. Nomeado, para o relatorio poder dizer qual foi."
  @type motivo :: :fora_do_confinamento | :dispositivo | :caminho_unc | :caminho_invalido

  @doc """
  Resolve um caminho relativo a raiz, ou recusa dizendo por que.

  Devolve sempre um caminho ABSOLUTO e normalizado, para que quem chamou nao precise
  normalizar de novo — normalizar duas vezes em lugares diferentes e como ter duas versoes
  da regra.
  """
  @spec resolver(Path.t(), Path.t()) :: {:ok, Path.t()} | {:erro, motivo()}
  def resolver(raiz, caminho) when is_binary(raiz) and is_binary(caminho) do
    with :ok <- recusar_unc(caminho),
         :ok <- recusar_dispositivo(caminho),
         {:ok, absoluto} <- juntar(raiz, caminho),
         :ok <- dentro?(raiz, absoluto) do
      {:ok, absoluto}
    end
  end

  def resolver(_raiz, _caminho), do: {:erro, :caminho_invalido}

  @doc """
  Diz se o caminho ja resolvido esta sob a raiz. Usa a forma real, seguindo links.

  Um ciclo de links (`a -> b -> a`) nao tem forma real: e recusado como fora do
  confinamento, porque nao ha como provar que ele fica dentro.
  """
  @spec dentro?(Path.t(), Path.t()) :: :ok | {:erro, motivo()}
  def dentro?(raiz, absoluto) do
    raiz_real = real(normalizar(Path.expand(raiz)))
    alvo_real = real(absoluto)

    if sob?(raiz_real, alvo_real) do
      :ok
    else
      {:erro, :fora_do_confinamento}
    end
  catch
    :ciclo_de_links -> {:erro, :fora_do_confinamento}
  end

  @doc """
  Normaliza para comparacao: barras para a frente, sem barra final, minusculas no Windows.

  A minuscula e o detalhe que decide: o sistema de arquivos do Windows e case-insensitive, e
  sem ela `..\\PROJETO` nao bateria com `projeto` e passaria pelo confinamento. Fora do
  Windows a caixa e PRESERVADA — la ela distingue diretorios.

  A raiz do sistema unix e a excecao a "sem barra final": `/` continua `/`. Sem a barra ela
  viraria `""`, e `Path.join("", "home")` da `"home"` — RELATIVO. Todo caminho resolvido a
  partir dela perderia a raiz (no Windows `C:/` vira `c:` e a juncao acerta por acaso).
  """
  @spec normalizar(Path.t()) :: String.t()
  def normalizar(caminho) do
    normalizado =
      caminho
      |> String.replace("\\", "/")
      |> String.trim_trailing("/")
      |> preservar_raiz(caminho)

    if windows?(), do: String.downcase(normalizado), else: normalizado
  end

  # Texto NAO vazio que vira vazio depois de tirar as barras finais era so barra: a raiz.
  defp preservar_raiz("", original) when original != "", do: "/"
  defp preservar_raiz(normalizado, _original), do: normalizado

  @doc "Os nomes de dispositivo reservados do Windows."
  @spec dispositivos() :: [String.t()]
  def dispositivos, do: @dispositivos

  # Barra invertida vira barra ANTES de expandir, em toda plataforma — a mesma troca de
  # `normalizar/1`. Sem ela, no Linux `..\fora\x` expandia para UM nome so dentro da raiz,
  # `dentro?/2` julgava a forma normalizada (`../fora/x`) e o modulo devolvia a outra: julgava
  # um caminho e entregava outro (D-014).
  defp juntar(raiz, caminho) do
    caminho = String.replace(caminho, "\\", "/")

    absoluto =
      if absoluto?(caminho) do
        Path.expand(caminho)
      else
        raiz |> Path.expand() |> Path.join(caminho) |> Path.expand()
      end

    {:ok, absoluto}
  end

  # `Path.type/1` nao reconhece `C:/x` como absoluto em todas as plataformas, e o agente pode
  # mandar qualquer forma. A checagem cobre as tres: raiz unix, letra de unidade e UNC.
  defp absoluto?(caminho) do
    Path.type(caminho) != :relative or
      String.match?(caminho, ~r{^[a-zA-Z]:[\\/]}) or
      String.starts_with?(caminho, ["/", "\\"])
  end

  # UNC nao tem raiz local para comparar: `\\servidor\share` sai da maquina inteira, e
  # `Path.expand` nao tem o que fazer com ele. Recusa antes de tentar resolver — e antes de
  # QUALQUER acesso ao disco: no Windows, `real/1` faria `read_link_all` no servidor (SMB, com
  # credencial NTLM oferecida a ele).
  #
  # O prefixo e julgado DEPOIS de `\` virar `/`, o mesmo contrato de `juntar/2` (D-014). Olhar
  # o texto cru so via as formas homogeneas: `\/servidor` e `/\servidor` sao o mesmo `//`
  # para o Windows e passavam (T-083). Uma barra so (`/home`, `\lib`) nao e prefixo de rede.
  defp recusar_unc(caminho) do
    if caminho |> String.replace("\\", "/") |> String.starts_with?("//") do
      {:erro, :caminho_unc}
    else
      :ok
    end
  end

  # O nome do dispositivo vale em QUALQUER diretorio e com qualquer extensao: `pasta/nul.txt`
  # ainda e o dispositivo nulo. Por isso a checagem olha cada segmento, sem a extensao.
  defp recusar_dispositivo(caminho) do
    reservado? =
      caminho
      |> String.replace("\\", "/")
      |> String.split("/")
      |> Enum.any?(fn segmento ->
        segmento
        |> String.split(".")
        |> List.first()
        |> Kernel.||("")
        |> String.downcase()
        |> Kernel.in(@dispositivos)
      end)

    if reservado?, do: {:erro, :dispositivo}, else: :ok
  end

  # O caminho REAL, seguindo link simbolico. Um link pode estar dentro da raiz e apontar
  # para fora dela — o caminho textual passaria, e o acesso sairia do confinamento.
  #
  # Anda componente a componente a partir da raiz do sistema, como o kernel: `prefixo` e
  # sempre REAL (nenhum pedaco dele e link). Cada componente e juntado ao prefixo e, se for
  # link, troca de lugar com o destino. Tres regras saem disso, e cada uma ja foi uma fuga:
  #
  # - Destino RELATIVO parte do diretorio onde o link ESTA de verdade — o prefixo real —, e
  #   nao do `dirname` do texto. Com `d2/atalho -> /tmp` e `/tmp/l -> ../../x`, o texto de
  #   `d2/atalho/l` da `d1/x` (dentro); o kernel vai a `/x` (fora) (T-082).
  # - `..` so e resolvido DEPOIS dos links que vem antes dele: o pai de um link e o pai do
  #   destino, nao o do texto. `Path.expand/2` anularia `atalho/..` antes de seguir o link.
  # - Componente ausente nao e link (`read_link_all` falha) e so e anexado; a caminhada nao
  #   para nele. O alvo pode nao existir ainda (`escrever` cria arquivo e diretorios), e
  #   parar no primeiro ausente julgaria o TEXTO: `atalho-para-fora/novo/arq` esta inteiro
  #   dentro da raiz, mas o `mkdir_p` de `escrever` atravessa o link e cria fora (T-080).
  #
  # `saltos` conta os links seguidos na resolucao INTEIRA, como o kernel conta — e nao por
  # ramo. Um ciclo (`a -> b -> a`) nao termina sozinho, e links que se multiplicam
  # (`n1 -> n2/n2`, `n2 -> n3/n3`...) pediriam 2^n saltos a quem contasse por ramo. O teto e
  # o `MAXSYMLINKS` do Linux; estourou, e `:ciclo_de_links`.
  @max_saltos 40

  defp real(caminho) do
    [raiz_do_sistema | componentes] = Path.split(caminho)
    raiz_do_sistema |> andar(componentes, 0) |> normalizar()
  end

  defp andar(prefixo, [], _saltos), do: prefixo
  defp andar(prefixo, ["." | resto], saltos), do: andar(prefixo, resto, saltos)
  defp andar(prefixo, [".." | resto], saltos), do: andar(Path.dirname(prefixo), resto, saltos)

  defp andar(prefixo, [componente | resto], saltos) do
    candidato = Path.join(prefixo, componente)

    case :file.read_link_all(String.to_charlist(candidato)) do
      {:ok, _destino} when saltos >= @max_saltos ->
        throw(:ciclo_de_links)

      {:ok, destino} ->
        {partida, do_destino} = partir_destino(prefixo, List.to_string(destino))
        andar(partida, do_destino ++ resto, saltos + 1)

      {:error, _} ->
        andar(candidato, resto, saltos)
    end
  end

  # Relativo: continua do prefixo real, com os componentes do destino CRUS (`..` incluido).
  # Absoluto: recomeca da raiz dele. `Path.absname/2`, e nao `expand`, para nao anular `..`
  # no texto — e para o destino `\x` do Windows (relativo ao volume) herdar a unidade do
  # prefixo, nao a do diretorio corrente.
  defp partir_destino(prefixo, destino) do
    if Path.type(destino) == :relative do
      {prefixo, Path.split(destino)}
    else
      [raiz_do_sistema | componentes] = destino |> Path.absname(prefixo) |> Path.split()
      {raiz_do_sistema, componentes}
    end
  end

  # Prefixo com a BARRA incluida, sempre. Sem ela, `/projeto-outro` passaria por estar sob
  # `/projeto` — o comeco do texto bate, o diretorio nao e o mesmo. A raiz `/` ja termina na
  # barra: tudo que e absoluto esta sob ela.
  defp sob?(raiz, alvo), do: alvo == raiz or String.starts_with?(alvo, com_barra(raiz))

  defp com_barra(raiz), do: if(String.ends_with?(raiz, "/"), do: raiz, else: raiz <> "/")

  defp windows?, do: match?({:win32, _}, :os.type())
end
