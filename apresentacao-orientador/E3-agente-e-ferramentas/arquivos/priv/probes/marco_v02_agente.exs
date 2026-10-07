# Probe do MARCO 1 da v0.2 (T-020): um agente resolve uma tarefa real via `Agente.Laco`
# contra o `claude` DE VERDADE (`Operario.ClaudeCLI`), e o resultado e persistido por
# `Tarefas.Transicao.aplicar/3`.
#
#     mix run priv/probes/marco_v02_agente.exs
#
# CONSOME COTA DA ASSINATURA. Nao gera fatura.
#
# Ate onde se sabe NAO existe funcao que ligue o `Laco` a `Transicao` — este probe faz essa
# ligacao explicitamente, criando um projeto e uma tarefa de mentira so para a medicao.
#
# Tres afirmacoes independentes, cada uma com evidencia propria:
#   1. o agente REALMENTE resolveu a tarefa (o arquivo mudou no disco como pedido);
#   2. ha exatamente UMA linha em `consumos`, no BANCO, POR VOLTA do laco;
#   3. a SOMA dos tokens das linhas gravadas bate com a soma que o ESTADO do laco acumulou.
#
# Sob a familia `:agente_completo` (T-003a) a afirmacao 2 muda de FORCA, nao de forma: o
# `ClaudeCLI` roda o proprio laco de ferramentas, entao UMA volta do `Agente.Laco` e uma
# SESSAO inteira do CLI, com quantos turnos internos o modelo tiver precisado. "uma linha por
# volta" continua verdade com N=1 — so nao prova, sozinha, que o agente so precisou de um
# turno. O relatorio abaixo imprime os dois numeros lado a lado (voltas do laco X chamadas de
# ferramenta da sessao, que e como `Estado`/`Laco` — T-017b — contam os blocos
# `:uso_de_ferramenta` da sessao inteira) para que essa diferenca apareca, em vez de ficar
# escondida atras de "uma linha por volta".

alias Fabrica.Agente.Laco
alias Fabrica.Ferramentas.Comando
alias Fabrica.Operario.ClaudeCLI
alias Fabrica.Projetos.Projeto
alias Fabrica.Repo
alias Fabrica.Tarefas.Tarefa
alias Fabrica.Tarefas.Transicao

Application.put_env(:fabrica, :operario, ClaudeCLI)

# NAO USE `System.tmp_dir!()` aqui — achado NOVO deste ciclo, medido contra o `claude` real:
# nesta maquina ele devolve a forma curta 8.3 do caminho ("C:\Users\ENZOCO~1\...\Temp"), e o
# proprio CLI recusa Write E o fallback por Bash sob esse padrao, com
# `decision_reason_type: "safetyCheck"` e a mensagem "...which contains a suspicious Windows
# path pattern that requires manual approval" — MESMO com `--permission-mode acceptEdits`.
# `acceptEdits` nao cobre essa checagem; so cobre a aprovacao comum de edicao. `raiz` construida
# a partir de `System.user_home!()` (que devolve a forma LONGA nesta maquina) evita o padrao e
# a escrita passa de primeira — confirmado no probe `priv/probes/_scratch/diag_raw.exs`
# (descartavel, fora do controle de versao). Registrado no GUIA.md, Armadilhas conhecidas.
raiz =
  Path.join([
    System.user_home!(),
    "AppData",
    "Local",
    "Temp",
    "marco-v02-#{System.unique_integer([:positive])}"
  ])

File.mkdir_p!(raiz)

# O projeto de mentira: 3 arquivos, como o despacho pede.
File.write!(Path.join(raiz, "README.md"), "# projeto de mentira para o marco da v0.2\n")
File.write!(Path.join(raiz, "a.txt"), "um\n")
File.write!(Path.join(raiz, "b.txt"), "dois\n")

senha = "MARCO-V02-#{System.unique_integer([:positive])}"
alvo = Path.join(raiz, "resultado.txt")

# Prompt de tarefa REAL, MULTI-LINHA, com aspas duplas e um `&` — exatamente o que o marco
# enuncia ("um agente resolve uma tarefa real") e o que a T-020 (ciclo 3) mediu que quebrava:
# `ClaudeCLI.linha/1` montava o comando por interpolacao de string, sem escapar newline, e o
# .bat gerado por `Comando.escrever_script/4` desmontava (exit 255, stdout e stderr vazios,
# `:saida_ininteligivel`). A T-018d moveu o texto do prompt para `stdin`, a partir de um
# arquivo (ver `ClaudeCLI.escrever_prompt/1` e `Comando.rodar_separado/3` com
# `entrada: {:arquivo, ...}`) — e e essa mudanca que este prompt exercita de proposito, em
# vez de continuar contornando o defeito ja corrigido.
prompt = """
Esta e uma tarefa real de "faxina" num projeto de mentira: nao mexa no "README.md" nem no
"a.txt" & "b.txt" que ja existem aqui — eles sao so contexto, e nao precisam ser lidos.

O que voce precisa fazer, numa unica etapa: crie um arquivo chamado "resultado.txt" nesta
pasta, contendo apenas esta linha, exatamente:

#{senha}

Depois responda apenas a palavra "feito".
"""

medir_cota = fn rotulo ->
  linha =
    ~s(#{ClaudeCLI.executavel()} --print --verbose --output-format stream-json --model haiku "responda apenas: ping")

  case Comando.rodar_separado(raiz, linha, prazo: 60_000) do
    {:ok, %{stdout: stdout}} ->
      janelas = ClaudeCLI.janelas_de_cota(stdout)
      IO.puts("  janelas de cota (#{rotulo}): #{inspect(janelas)}")
      janelas

    outro ->
      IO.puts("  nao consegui medir a cota (#{rotulo}): #{inspect(outro)}")
      nil
  end
end

IO.puts("=== raiz do projeto de mentira: #{raiz} ===")
IO.puts("=== janela de cota ANTES ===")
medir_cota.("antes")

IO.puts("\n=== chamando o claude de verdade via o Laco (consome cota) ===\n")

{:ok, resumo} =
  Laco.rodar(
    raiz: raiz,
    modelo: "haiku",
    teto_de_voltas: 10,
    mensagens: [%{papel: :usuario, conteudo: prompt}],
    ferramentas: %{}
  )

IO.puts("desfecho ...... #{inspect(resumo.desfecho)}")
IO.puts("gasto_usd ..... #{resumo.gasto_usd}")
IO.puts("consumos ...... #{length(resumo.consumos)} linha(s) no ESTADO do laco")

IO.puts(
  "\n=== voltas do LACO x turnos internos da SESSAO do CLI (nao confundir um com o outro) ==="
)

IO.puts("  voltas do Agente.Laco ................ #{resumo.voltas}")

IO.puts(
  "  chamadas_de_ferramenta da sessao (T-017b): #{resumo.chamadas_de_ferramenta} " <>
    "(blocos :uso_de_ferramenta da SESSAO inteira do CLI — sob :agente_completo, o laco faz " <>
    "1 volta = 1 sessao, e este numero e quem mostra quantos turnos internos ela teve por " <>
    "dentro; \"uma linha de consumo por volta\" nao e o mesmo que \"uma linha por turno\")"
)

Enum.each(Enum.with_index(resumo.consumos, 1), fn {consumo, indice} ->
  IO.puts(
    "  volta #{indice}: entrada=#{consumo.tokens_entrada} " <>
      "cache_leitura=#{consumo.tokens_cache_leitura} " <>
      "cache_escrita=#{consumo.tokens_cache_escrita} saida=#{consumo.tokens_saida}"
  )
end)

IO.puts("\n=== janela de cota DEPOIS ===")
medir_cota.("depois")

# AFIRMACAO 1: a tarefa foi REALMENTE resolvida — o arquivo mudou no disco como pedido.
conteudo_do_arquivo =
  case File.read(alvo) do
    {:ok, texto} -> String.trim(texto)
    {:error, motivo} -> {:erro, motivo}
  end

afirmacao_1 =
  case conteudo_do_arquivo do
    texto when is_binary(texto) -> String.contains?(texto, senha)
    _ -> false
  end

IO.puts("\n=== AFIRMACAO 1: a tarefa foi resolvida de verdade (arquivo no disco) ===")
IO.puts("  arquivo esperado ... #{alvo}")
IO.puts("  conteudo lido ...... #{inspect(conteudo_do_arquivo)}")
IO.puts("  senha esperada ..... #{senha}")
IO.puts("  [#{if afirmacao_1, do: "ok", else: "FALHOU"}] o arquivo contem a senha")

# Ligacao explicita Laco -> Transicao: persiste despacho + consumos como o motor faria.
{:ok, projeto} =
  %Projeto{}
  |> Projeto.changeset(%{
    nome: "marco-v02-probe-#{System.unique_integer([:positive])}",
    caminho: raiz
  })
  |> Repo.insert()

{:ok, tarefa} =
  %Tarefa{}
  |> Tarefa.changeset(%{
    projeto_id: projeto.id,
    codigo: "T-999",
    titulo: "escrever resultado.txt com a senha (probe do marco v0.2)",
    status: :backlog
  })
  |> Repo.insert()

{:ok, tarefa} = Transicao.aplicar(tarefa, :pronta)
{:ok, tarefa} = Transicao.aplicar(tarefa, :em_execucao)

consumos_para_gravar =
  Enum.map(resumo.consumos, fn consumo ->
    %{
      tokens_entrada: consumo.tokens_entrada,
      tokens_cache_escrita: consumo.tokens_cache_escrita,
      tokens_cache_leitura: consumo.tokens_cache_leitura,
      tokens_saida: consumo.tokens_saida,
      duracao_ms: consumo.duracao_ms
    }
  end)

resultado_persistencia =
  Transicao.aplicar(tarefa, :em_teste,
    papel: "construtor",
    desfecho: to_string(resumo.desfecho),
    relatorio: "probe do marco v0.2 (T-020) — #{resumo.voltas} volta(s)",
    despacho: %{operario: "ClaudeCLI", modelo: "haiku", voltas: resumo.voltas},
    consumos: consumos_para_gravar
  )

case resultado_persistencia do
  {:ok, tarefa_final} ->
    tarefa_com_dados =
      Fabrica.Tarefas.Tarefa
      |> Repo.get!(tarefa_final.id)
      |> Repo.preload(ciclos: [despachos: :consumos])

    [ciclo] = tarefa_com_dados.ciclos
    [despacho] = ciclo.despachos
    consumos_no_banco = despacho.consumos

    IO.puts("\n=== AFIRMACAO 2: uma linha em `consumos`, no BANCO, POR VOLTA ===")
    IO.puts("  voltas do laco ......... #{resumo.voltas}")
    IO.puts("  linhas gravadas ........ #{length(consumos_no_banco)}")

    IO.puts(
      "  voltas gravadas (:volta) #{inspect(Enum.map(consumos_no_banco, & &1.volta) |> Enum.sort())}"
    )

    afirmacao_2 =
      length(consumos_no_banco) == resumo.voltas and
        Enum.map(consumos_no_banco, & &1.volta) |> Enum.sort() == Enum.to_list(1..resumo.voltas)

    IO.puts(
      "  [#{if afirmacao_2, do: "ok", else: "FALHOU"}] uma linha por volta, numeradas 1..#{resumo.voltas}"
    )

    campo = fn c ->
      c.tokens_entrada + c.tokens_cache_leitura + c.tokens_cache_escrita + c.tokens_saida
    end

    soma_no_estado =
      resumo.consumos
      |> Enum.map(
        &(&1.tokens_entrada + &1.tokens_cache_leitura + &1.tokens_cache_escrita + &1.tokens_saida)
      )
      |> Enum.sum()

    soma_no_banco = consumos_no_banco |> Enum.map(campo) |> Enum.sum()

    IO.puts(
      "\n=== AFIRMACAO 3: a soma das linhas gravadas bate com o total no ESTADO do laco ==="
    )

    IO.puts("  soma de tokens no ESTADO (resumo.consumos) .... #{soma_no_estado}")
    IO.puts("  soma de tokens no BANCO (consumos gravados) ... #{soma_no_banco}")

    afirmacao_3 = soma_no_estado == soma_no_banco and soma_no_estado > 0

    IO.puts("  [#{if afirmacao_3, do: "ok", else: "FALHOU"}] soma bate, e e maior que zero")

    IO.puts("\n=== RESUMO ===")

    IO.puts(
      "  [#{if afirmacao_1, do: "ok", else: "FALHOU"}] afirmacao 1 — tarefa resolvida de verdade"
    )

    IO.puts(
      "  [#{if afirmacao_2, do: "ok", else: "FALHOU"}] afirmacao 2 — uma linha por volta no banco"
    )

    IO.puts(
      "  [#{if afirmacao_3, do: "ok", else: "FALHOU"}] afirmacao 3 — soma bate com o total do estado"
    )

    if afirmacao_1 and afirmacao_2 and afirmacao_3 do
      IO.puts("\nPROBE OK — marco 1 confirmado contra o claude real")
    else
      IO.puts("\nPROBE REPROVOU")
      System.halt(1)
    end

  {:erro, motivo} ->
    IO.puts("\nERRO ao persistir via Transicao.aplicar/3: #{inspect(motivo)}")
    IO.puts("[FALHOU] nao foi possivel provar as afirmacoes 2 e 3 — a persistencia falhou")
    System.halt(1)
end
