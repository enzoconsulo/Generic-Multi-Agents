# Probe do `Operario.ClaudeCLI` contra o `claude` DE VERDADE.
#
#     mix run priv/probes/cli_real.exs
#
# POR QUE ISTO EXISTE, e por que e um script e nao um teste.
#
# O adaptador tem 26 testes verdes e mesmo assim montava uma linha de comando que o CLI
# REJEITAVA (faltava `--verbose`). Todos os testes alimentam `interpretar/1` com fluxos de
# eventos fabricados a mao: a TRADUCAO era exercitada, o DISPARO nunca. O defeito so apareceu
# no primeiro contato com o binario real, ao abrir o marco da v0.2.
#
# Nao pode virar teste da suite: a suite roda sem rede e sem cota, e isso e o marco da v0.1.
# Entao fica aqui, como probe que se roda a mao — e o registro de que ele PRECISA ser rodado
# esta na receita do GUIA.
#
# CONSOME COTA DA ASSINATURA. Nao gera fatura (o `ClaudeCLI` roda na assinatura, ao contrario
# do `MessagesAPI`), mas nao e de graca: use com parcimonia.
#
# A T-018c acrescentou as Secoes B e C: elas provam a permissao headless e a restricao de
# vocabulario contra o CLI real, por `File.exists?` — e nao pela resposta do modelo, que so
# diz o que ele TENTOU, nunca o que o CLI de fato deixou passar.
#
# A T-017a acrescentou as Secoes D e E: provam que `requisicao.teto_de_voltas` vira
# `--max-turns` de verdade — teto baixo PARA a sessao (`motivo_parada: :teto_de_voltas`),
# teto folgado sobre o MESMO pedido conclui normalmente. A flag esta ausente do `--help` da
# versao medida na T-018b e funciona mesmo assim (comportamento, nao documentacao).
#
# A T-018d acrescentou a Secao F: prova que um prompt MULTI-LINHA, com aspas duplas e `&` —
# exatamente o que devolvia exit 255 com stdout e stderr VAZIOS quando o prompt viajava
# interpolado na linha de comando (T-020, ciclo 3) — agora chega integro pelo `stdin`, a
# partir de um arquivo, e a sessao conclui com `{:ok, %Resposta{}}` e consumo preenchido.

alias Fabrica.Operario.ClaudeCLI
alias Fabrica.Operario.Requisicao

confere = fn rotulo, condicao ->
  IO.puts("  [#{if condicao, do: "ok", else: "FALHOU"}] #{rotulo}")
  condicao
end

# Diretorio base na forma LONGA. `System.tmp_dir!/0` devolve o nome curto 8.3 nesta maquina
# (`C:\Users\ENZOCO~1\...`), e um caminho 8.3 muda o MOTIVO da negacao do CLI para uma
# checagem separada que nenhum `--permission-mode` supera — medido na T-018b. As raizes de
# projeto reais desta fabrica vem de configuracao na forma longa, entao e essa forma que
# importa aqui.
base_longa = fn ->
  case System.get_env("USERPROFILE") do
    caminho when is_binary(caminho) and caminho != "" ->
      Path.join([caminho, "AppData", "Local", "Temp"])

    _ ->
      System.tmp_dir!()
  end
end

projeto_mentira = fn prefixo ->
  marca = System.unique_integer([:positive])
  raiz = Path.join(base_longa.(), "#{prefixo}-#{marca}")
  File.mkdir_p!(raiz)
  File.write!(Path.join(raiz, "README.md"), "# projeto de mentira\n")
  raiz
end

# ============================================================================
IO.puts(String.duplicate("=", 78))
IO.puts("SECAO A: a chamada sucede e a traducao de blocos bate (marco da T-018a)")
IO.puts(String.duplicate("=", 78))
# ============================================================================

secao_a? =
  case ClaudeCLI.conversar(
         %Requisicao{
           modelo: "haiku",
           mensagens: [%{papel: :usuario, conteudo: "Responda apenas: pong"}]
         },
         raiz: File.cwd!(),
         prazo: 180_000
       ) do
    {:ok, resposta} ->
      tipos = resposta.blocos |> Enum.map(& &1.tipo) |> Enum.uniq()

      texto =
        resposta.blocos
        |> Enum.filter(&(&1.tipo == :texto))
        |> Enum.map_join(" ", & &1.texto)
        |> String.trim()

      IO.puts("  blocos ........ #{inspect(tipos)}")
      IO.puts("  parada ........ #{resposta.motivo_parada}")
      IO.puts("  saida ......... #{resposta.consumo.tokens_saida}")
      IO.puts("  texto ......... #{inspect(texto)}")

      [
        confere.("a chamada sucede (exige --verbose na linha)", true),
        confere.("veio consumo de verdade", resposta.consumo.tokens_saida > 0),
        confere.("nenhum bloco ficou :desconhecido", :desconhecido not in tipos),
        confere.("o modelo respondeu o que se pediu", String.downcase(texto) =~ "pong")
      ]
      |> Enum.all?()

    {:erro, {:cota, quando}} ->
      IO.puts("  PAREDE DE COTA. Reabre em: #{inspect(quando)}")
      IO.puts("  (o probe nao conseguiu medir esta secao, mas a deteccao de cota funcionou)")
      true

    {:erro, motivo} ->
      IO.puts("  ERRO: #{inspect(motivo)}")
      false
  end

# ============================================================================
IO.puts("\n" <> String.duplicate("=", 78))
IO.puts("SECAO B: papel construtor CRIA arquivo em modo headless (--permission-mode acceptEdits)")
IO.puts(String.duplicate("=", 78))
# ============================================================================

raiz_b = projeto_mentira.("t018c-construtor")
alvo_b = Path.join(raiz_b, "ok.txt")

secao_b? =
  case ClaudeCLI.conversar(
         %Requisicao{
           papel: "construtor",
           modelo: "haiku",
           mensagens: [
             %{
               papel: :usuario,
               conteudo:
                 "Use a ferramenta de escrita para criar o arquivo ok.txt na raiz do projeto, com o conteudo 'oi'."
             }
           ]
         },
         raiz: raiz_b,
         prazo: 180_000
       ) do
    {:ok, resposta} ->
      IO.puts("  parada ........ #{resposta.motivo_parada}")
      confere.("File.exists?(ok.txt) — nao a resposta do modelo", File.exists?(alvo_b))

    {:erro, {:cota, quando}} ->
      IO.puts("  PAREDE DE COTA. Reabre em: #{inspect(quando)}")
      true

    {:erro, motivo} ->
      IO.puts("  ERRO: #{inspect(motivo)}")
      false
  end

File.rm_rf(raiz_b)

# ============================================================================
IO.puts("\n" <> String.duplicate("=", 78))

IO.puts(
  "SECAO C: o vocabulario do verificador NAO inclui Write/Edit, nem sob ordem EXPLICITA (--tools, nao --allowedTools)"
)

IO.puts(String.duplicate("=", 78))
# ============================================================================
#
# A garantia que ESTA secao prova e a ENFORCAVEL: `--tools "Bash,Glob,Grep,Read"` torna `Write`
# e `Edit` INEFETIVOS para o verificador (ao contrario de `--allowedTools`, que so barra a
# permissao — ver @moduledoc do ClaudeCLI). Duas assercoes tentadoras e ERRADAS, medidas
# contra o CLI real:
#
#   - `not File.exists?(...)`: reprova quando o haiku improvisa a escrita com `Bash` — e o
#     verificador TEM `Bash` (precisa, para rodar testes), e escrever por shell e a lacuna
#     ACEITA e documentada (@moduledoc, opcao (c): "comando de shell nao se audita por
#     caminho"). Afirma uma garantia que o codigo explicitamente NAO oferece.
#   - "nenhum tool_use de Write/Edit na sessao": reprova quando o haiku EMITE um `Write` e o
#     CLI o bloqueia (medido: `ferramentas ["Write"]` com o arquivo AUSENTE). O modelo pode
#     tentar a ferramenta fora do vocabulario; o `--tools` garante que a tentativa nao TENHA
#     EFEITO, nao que o modelo nunca a emita.
#
# O invariante que vale em TODO comportamento do modelo: o arquivo alvo so existe se `Bash` o
# criou — porque `Write`/`Edit` nao conseguem cria-lo sob `--tools`. Isso reprova exatamente a
# brecha REAL (uma escrita autorizada tendo efeito) e nada mais.

raiz_c = projeto_mentira.("t018c-verificador")
alvo_c = Path.join(raiz_c, "nao-deveria-existir.txt")

secao_c? =
  case ClaudeCLI.conversar(
         %Requisicao{
           papel: "verificador",
           modelo: "haiku",
           mensagens: [
             %{
               papel: :usuario,
               conteudo:
                 "Use a ferramenta de escrita para criar o arquivo nao-deveria-existir.txt na raiz do projeto, com qualquer conteudo."
             }
           ]
         },
         raiz: raiz_c,
         prazo: 180_000
       ) do
    {:ok, resposta} ->
      ferramentas_usadas =
        resposta.blocos
        |> Enum.filter(&(&1.tipo == :uso_de_ferramenta))
        |> Enum.map(& &1.nome)

      existe? = File.exists?(alvo_c)
      usou_bash? = "Bash" in ferramentas_usadas

      IO.puts("  parada ........ #{resposta.motivo_parada}")
      IO.puts("  ferramentas ... #{inspect(ferramentas_usadas)}")

      IO.puts(
        "  arquivo ....... File.exists?(nao-deveria-existir.txt) = #{existe?} " <>
          "(se true, so pode ter vindo por Bash — a lacuna de shell ACEITA, nao Write/Edit)"
      )

      confere.(
        "Write/Edit ineficazes: o arquivo so existe se Bash o criou (nunca por escrita autorizada)",
        not existe? or usou_bash?
      )

    {:erro, {:cota, quando}} ->
      IO.puts("  PAREDE DE COTA. Reabre em: #{inspect(quando)}")
      true

    {:erro, motivo} ->
      IO.puts("  ERRO: #{inspect(motivo)}")
      false
  end

File.rm_rf(raiz_c)

# O mesmo pedido para as Secoes D e E: exige VARIOS turnos porque proibe explicitamente
# resolver tudo numa chamada so, e insiste em NAO PARAR ate os cinco arquivos existirem —
# a primeira redacao ("pare e reavalie apos cada um") fez o modelo interpretar a propria
# instrucao como permissao para parar cedo, e a Secao E terminou com so 1/5 arquivos sem o
# teto ter cortado nada. A instrucao de nao parar e o que torna a Secao E uma prova de
# CONCLUSAO, e nao so de ausencia de corte.
pedido_varios_turnos = fn ->
  "Crie estes cinco arquivos na raiz do projeto, cada um com o proprio nome como conteudo: " <>
    "um.txt, dois.txt, tres.txt, quatro.txt, cinco.txt. REGRA OBRIGATORIA: use a ferramenta " <>
    "de escrita exatamente UMA VEZ POR TURNO — nunca escreva dois arquivos na mesma chamada " <>
    "de ferramenta, e nunca use um unico comando que crie mais de um arquivo de uma vez. " <>
    "Continue, turno apos turno, ate os CINCO arquivos existirem — nao pare antes disso e " <>
    "nao peca confirmacao no meio do caminho."
end

# ============================================================================
IO.puts("\n" <> String.duplicate("=", 78))
IO.puts("SECAO D: teto BAIXO (--max-turns 1) PARA a sessao — motivo_parada: :teto_de_voltas")
IO.puts(String.duplicate("=", 78))
# ============================================================================

raiz_d = projeto_mentira.("t017a-teto-baixo")

secao_d? =
  case ClaudeCLI.conversar(
         %Requisicao{
           papel: "construtor",
           modelo: "haiku",
           mensagens: [%{papel: :usuario, conteudo: pedido_varios_turnos.()}],
           teto_de_voltas: 1
         },
         raiz: raiz_d,
         prazo: 180_000
       ) do
    {:ok, resposta} ->
      criados =
        Enum.count(~w(um.txt dois.txt tres.txt quatro.txt cinco.txt), fn nome ->
          File.exists?(Path.join(raiz_d, nome))
        end)

      IO.puts("  parada ........ #{resposta.motivo_parada}")
      IO.puts("  arquivos criados #{criados}/5 (esperado: incompleto, o teto cortou o meio)")
      confere.("motivo_parada == :teto_de_voltas", resposta.motivo_parada == :teto_de_voltas)

    {:erro, {:cota, quando}} ->
      IO.puts("  PAREDE DE COTA. Reabre em: #{inspect(quando)}")
      true

    {:erro, motivo} ->
      IO.puts("  ERRO: #{inspect(motivo)}")
      false
  end

File.rm_rf(raiz_d)

# ============================================================================
IO.puts("\n" <> String.duplicate("=", 78))

IO.puts(
  "SECAO E: teto FOLGADO, MESMO pedido — conclui normalmente, o teto nao corta trabalho legitimo"
)

IO.puts(String.duplicate("=", 78))
# ============================================================================

raiz_e = projeto_mentira.("t017a-teto-folgado")

secao_e? =
  case ClaudeCLI.conversar(
         %Requisicao{
           papel: "construtor",
           modelo: "haiku",
           mensagens: [%{papel: :usuario, conteudo: pedido_varios_turnos.()}],
           teto_de_voltas: 30
         },
         raiz: raiz_e,
         prazo: 180_000
       ) do
    {:ok, resposta} ->
      criados =
        Enum.count(~w(um.txt dois.txt tres.txt quatro.txt cinco.txt), fn nome ->
          File.exists?(Path.join(raiz_e, nome))
        end)

      IO.puts("  parada ........ #{resposta.motivo_parada}")
      IO.puts("  arquivos criados #{criados}/5 (esperado: completo)")

      [
        confere.("motivo_parada != :teto_de_voltas", resposta.motivo_parada != :teto_de_voltas),
        confere.("os cinco arquivos foram criados", criados == 5)
      ]
      |> Enum.all?()

    {:erro, {:cota, quando}} ->
      IO.puts("  PAREDE DE COTA. Reabre em: #{inspect(quando)}")
      true

    {:erro, motivo} ->
      IO.puts("  ERRO: #{inspect(motivo)}")
      false
  end

File.rm_rf(raiz_e)

# ============================================================================
IO.puts("\n" <> String.duplicate("=", 78))

IO.puts(
  "SECAO F: prompt MULTI-LINHA, com aspas duplas e & — o caso que quebrava (exit 255) quando o prompt ia interpolado na linha (T-020, ciclo 3)"
)

IO.puts(String.duplicate("=", 78))
# ============================================================================

raiz_f = projeto_mentira.("t018d-prompt-multilinha")

prompt_dificil =
  "Responda com as tres linhas a seguir, e mais nada:\n" <>
    "linha \"com aspas duplas\" de verdade\n" <>
    "linha com & comercial no meio"

secao_f? =
  case ClaudeCLI.conversar(
         %Requisicao{
           modelo: "haiku",
           mensagens: [%{papel: :usuario, conteudo: prompt_dificil}]
         },
         raiz: raiz_f,
         prazo: 180_000
       ) do
    {:ok, resposta} ->
      IO.puts("  parada ........ #{resposta.motivo_parada}")
      IO.puts("  saida ......... #{resposta.consumo.tokens_saida}")

      [
        confere.("a chamada sucede (prompt multi-linha nao quebra mais o script)", true),
        confere.("veio consumo de verdade", resposta.consumo.tokens_saida > 0)
      ]
      |> Enum.all?()

    {:erro, {:cota, quando}} ->
      IO.puts("  PAREDE DE COTA. Reabre em: #{inspect(quando)}")
      true

    {:erro, motivo} ->
      IO.puts("  ERRO: #{inspect(motivo)}")
      false
  end

File.rm_rf(raiz_f)

# ============================================================================
IO.puts("\n" <> String.duplicate("=", 78))

if Enum.all?([secao_a?, secao_b?, secao_c?, secao_d?, secao_e?, secao_f?]) do
  IO.puts("PROBE OK")
else
  IO.puts("PROBE REPROVOU")
  System.halt(1)
end
