# Probe do `Embedder.Ollama` contra o servico de verdade.
#
#     mix run priv/probes/ollama_real.exs
#
# POR QUE ISTO EXISTE.
#
# O `Embedder.Ollama` tem teste verde e o corpo da requisicao inteiro roda sob `Req.Test` — o
# JSON `{"model", "input", "truncate", "keep_alive"}` veio de um script Python (o bench da
# D-004), nunca de uma chamada deste codigo. E a mesma lacuna que custou uma tarefa inteira ao
# `Operario.ClaudeCLI` (26 testes verdes montando uma linha de comando que o CLI rejeitava —
# ver `priv/probes/cli_real.exs`). Este probe e o disparo real: confere o AMBIENTE (embedder
# configurado, dimensao da coluna), vetoriza pelas duas portas, prova que ha semantica de
# verdade do outro lado (cosseno, nao inspecao visual) e mede o throughput contra a D-004.
#
# CUSTO ZERO: o Ollama e local (127.0.0.1:11434), sem chave, sem fatura.
#
# Nao pode virar teste da suite: a suite roda sem rede, e isso e o marco da v0.1.

alias Fabrica.Embedder
alias Fabrica.Memoria.Dimensao

confere = fn rotulo, condicao ->
  IO.puts("  [#{if condicao, do: "ok", else: "FALHOU"}] #{rotulo}")
  condicao
end

parar = fn mensagem ->
  IO.puts("\nPROBE REPROVOU")
  IO.puts(mensagem)
  System.halt(1)
end

tratar_erro_de_rede = fn motivo ->
  mensagem =
    case motivo do
      %{reason: razao} when razao in [:econnrefused, :nxdomain, :timeout, :closed] ->
        "O Ollama nao respondeu (#{inspect(razao)}).\n" <>
          "Suba o servico com `ollama serve` (ou confira se o processo ja esta rodando) " <>
          "e rode o probe de novo."

      outro ->
        "Erro inesperado ao falar com o Ollama: #{inspect(outro)}"
    end

  parar.(mensagem)
end

# ============================================================================
IO.puts(String.duplicate("=", 78))
IO.puts("SECAO A: o ambiente esta correto antes de medir qualquer coisa")
IO.puts(String.duplicate("=", 78))
# ============================================================================

embedder = Embedder.configurado()

unless embedder == Fabrica.Embedder.Ollama do
  parar.(
    "embedder configurado e #{inspect(embedder)}, esperava Fabrica.Embedder.Ollama.\n" <>
      "Confira `config :fabrica, :embedder` em config/dev.exs, e rode com `mix run` " <>
      "(ambiente dev, nao test)."
  )
end

IO.puts("  [ok] embedder configurado: #{inspect(embedder)}")

secao_a? =
  case Dimensao.conferir() do
    :ok ->
      confere.("Dimensao.conferir/0 == :ok (coluna e embedder combinam)", true)

    {:erro, {:dimensao_divergente, coluna, embedder_dim}} ->
      parar.(
        "trechos.embedding tem #{coluna} posicoes, o embedder configurado tem #{embedder_dim}.\n" <>
          "Alinhe com: mix run -e \"Fabrica.Memoria.Dimensao.alinhar!()\""
      )
  end

# ============================================================================
IO.puts("\n" <> String.duplicate("=", 78))
IO.puts("SECAO B: vetorizar um lote pequeno pelas DUAS portas, e conferir a dimensao")
IO.puts(String.duplicate("=", 78))
# ============================================================================

documentos = [
  "O gato dormiu o dia inteiro em cima do sofa da sala.",
  "A receita de pao de queijo leva polvilho azedo e queijo minas.",
  "O Postgres grava o vetor numa coluna do tipo vector, indexada por HNSW.",
  "Chuva forte alagou a avenida principal da cidade ontem a noite.",
  "A fabrica despacha uma tarefa por vez para o agente executor."
]

consultas = [
  "como o banco de dados guarda os vetores de embedding?",
  "qual e o ingrediente principal do pao de queijo?"
]

{tempo_carga_us, resultado_carga} = :timer.tc(fn -> Embedder.vetorizar([hd(documentos)]) end)

vetor_carga =
  case resultado_carga do
    {:ok, [vetor]} -> vetor
    {:erro, motivo} -> tratar_erro_de_rede.(motivo)
  end

secao_b1? =
  confere.(
    "vetor de carga (vetorizar/1) tem #{Embedder.dimensoes()} posicoes",
    length(vetor_carga) == Embedder.dimensoes()
  )

{tempo_documentos_us, resultado_documentos} = :timer.tc(fn -> Embedder.vetorizar(documentos) end)

vetores_documentos =
  case resultado_documentos do
    {:ok, vetores} -> vetores
    {:erro, motivo} -> tratar_erro_de_rede.(motivo)
  end

secao_b2? =
  confere.(
    "os #{length(documentos)} documentos (vetorizar/1) vieram com #{Embedder.dimensoes()} posicoes",
    Enum.all?(vetores_documentos, &(length(&1) == Embedder.dimensoes()))
  )

{tempo_consultas_us, resultado_consultas} =
  :timer.tc(fn -> Embedder.vetorizar_consulta(consultas) end)

vetores_consultas =
  case resultado_consultas do
    {:ok, vetores} -> vetores
    {:erro, motivo} -> tratar_erro_de_rede.(motivo)
  end

secao_b3? =
  confere.(
    "as #{length(consultas)} consultas (vetorizar_consulta/1) vieram com #{Embedder.dimensoes()} posicoes",
    Enum.all?(vetores_consultas, &(length(&1) == Embedder.dimensoes()))
  )

# ============================================================================
IO.puts("\n" <> String.duplicate("=", 78))
IO.puts("SECAO C: ha semantica de verdade do outro lado (cosseno, nao inspecao visual)")
IO.puts(String.duplicate("=", 78))
# ============================================================================

cosseno = fn a, b ->
  norma = fn v -> :math.sqrt(Enum.reduce(v, 0.0, fn x, acc -> acc + x * x end)) end
  produto = Enum.zip_reduce(a, b, 0.0, fn x, y, acc -> acc + x * y end)
  produto / (norma.(a) * norma.(b))
end

consulta_banco = Enum.at(vetores_consultas, 0)
doc_certo = Enum.at(vetores_documentos, 2)
doc_errado = Enum.at(vetores_documentos, 3)

sim_certo = cosseno.(consulta_banco, doc_certo)
sim_errado = cosseno.(consulta_banco, doc_errado)

IO.puts("  consulta: #{inspect(Enum.at(consultas, 0))}")
IO.puts("  cosseno(consulta, documento sobre Postgres/vetor) . #{Float.round(sim_certo, 4)}")
IO.puts("  cosseno(consulta, documento sobre chuva) ......... #{Float.round(sim_errado, 4)}")

secao_c? =
  confere.(
    "o documento que responde a consulta e mais proximo dela do que o sem relacao",
    sim_certo > sim_errado
  )

# ============================================================================
IO.puts("\n" <> String.duplicate("=", 78))
IO.puts("SECAO D: medicao — referencia D-004 (embeddinggemma, GPU): 7,2 trechos/s")
IO.puts(String.duplicate("=", 78))
# ============================================================================

tempo_carga_s = tempo_carga_us / 1_000_000
tempo_lote_s = (tempo_documentos_us + tempo_consultas_us) / 1_000_000
total_no_lote = length(documentos) + length(consultas)
trechos_por_segundo = total_no_lote / tempo_lote_s

IO.puts("  tempo de carga (1o texto, aquece o modelo) ... #{Float.round(tempo_carga_s, 3)} s")

IO.puts(
  "  tempo do lote (#{total_no_lote} textos) ...................... #{Float.round(tempo_lote_s, 3)} s"
)

IO.puts(
  "  trechos/segundo ............................... #{Float.round(trechos_por_segundo, 2)}"
)

IO.puts("  referencia D-004 (embeddinggemma, GPU) ........ 7,2 trechos/s")

# ============================================================================
IO.puts("\n" <> String.duplicate("=", 78))

if Enum.all?([secao_a?, secao_b1?, secao_b2?, secao_b3?, secao_c?]) do
  IO.puts("PROBE OK")
else
  IO.puts("PROBE REPROVOU")
  System.halt(1)
end
