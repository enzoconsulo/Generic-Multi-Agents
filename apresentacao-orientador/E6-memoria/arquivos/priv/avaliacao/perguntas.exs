defmodule Fabrica.Memoria.Avaliacao do
  @moduledoc """
  Mede a qualidade da recuperacao (`Fabrica.Memoria.Busca`) contra um gabarito de perguntas com
  resposta CONHECIDA, e e o ATUADOR que desliga o bloco de contexto quando a medicao piora —
  nao so um numero relatado (T-047).

  ## O corpus e o gabarito

  As perguntas de `gabarito/0` vem da historia REAL desta propria fabrica-v2
  (`_gestao/tarefas/*.md`, `DECISOES.md`, `GUIA.md`, `PROGRESSO.md`) — a mesma fonte que a D-004
  usou (`_gestao/pesquisas/2026-09-13-ollama-embedding-bench.py`), e que a D-007 confirmou como
  corpus valido ("a fabrica v1 e este repositorio"). Cada par e `{pergunta, frase_alvo}`, com
  `frase_alvo` um trecho LITERAL que so aparece na resposta certa — e com vocabulario DIFERENTE
  do da pergunta, de proposito: e o caso em que busca por palavra sozinha erra e a semantica
  acerta (ou, medido aqui com `Embedder.Falso`, o caso em que nenhuma das duas tem semantica de
  verdade e o piso textual manda).

  ## Por que a linha de base e a busca por PALAVRA, e nao um numero congelado

  A medicao da D-004 achou que fundir com um vetor FRACO deixa o hibrido ABAIXO do BM25 sozinho
  (D-005, item 4). Por isso `linha_de_base/2` nao guarda um numero histórico (que apodreceria a
  cada trecho novo no corpus, o mesmo defeito que a D-007 corrigiu na T-034b): ela CALCULA, na
  hora, o recall so-por-palavra do MESMO corpus e do MESMO gabarito — o piso que a fusao hibrida
  precisa, no minimo, igualar. "Gravada" e "comparada a cada execucao" (criterio 2) quer dizer
  isto: o piso e reproduzivel a qualquer momento, contra o estado REAL do banco, nunca uma
  constante que fica errada sozinha.

  ## Por que a suite mede isto com `Embedder.Falso`, e o que isso prova

  A suite roda sem rede (marco da v0.1) — `priv/probes/ollama_real.exs` (T-064) e quem mede
  contra o Ollama de verdade, fora do `mix test`. Aqui, com `Embedder.Falso` (vetor sem
  semantica), a fusao hibrida quase sempre fica ABAIXO do piso textual — exatamente o cenario da
  D-005, item 4, reproduzido de verdade nesta arvore. E o caso mais honesto para provar o
  ATUADOR: um embedder ruim (por configuracao errada, ou por regressao) DESLIGA o bloco, em vez
  de so aparecer num relatorio que ninguem le.

  ## O atuador (`montar_contexto_seguro/3`)

  Ninguem em `lib/` chama `Fabrica.Memoria.Contexto.montar/3` ainda — a integracao com o
  despacho de verdade e trabalho das tarefas T-066 a T-070 (D-006). Esta funcao e o PONTO que
  essas tarefas devem chamar no lugar de `Contexto.montar/3` direto: ela roda a avaliacao
  completa (todo o gabarito) e so monta o bloco quando a recuperacao bate ou supera a linha de
  base; do contrario devolve `nil`, e a fabrica roda sem o bloco ate a indexacao ser corrigida.
  Rodar o gabarito inteiro a cada chamada e caro para uso por DESPACHO (uma consulta por par do
  gabarito) — cache/memoizacao do veredito fica para quem ligar isto ao despacho de verdade; esta
  tarefa entrega o instrumento e o atuador provados, nao a otimizacao de uso em producao.
  """

  alias Ecto.Adapters.SQL
  alias Fabrica.Memoria.Busca
  alias Fabrica.Memoria.Contexto
  alias Fabrica.Memoria.Trecho
  alias Fabrica.Repo

  @limite_resultado 8

  @gabarito [
    {"Por que o modelo de vetores que roda dentro do Elixir não funciona nesta máquina Windows?",
     "no precompiled XLA archive available for this target"},
    {"Antes da D-004 trazer o Ollama, qual adaptador de embedding a D-001 declarou como padrão da fábrica?",
     "é o adaptador padrão desta fábrica"},
    {"Quantos trechos da história desta fábrica já estavam indexados no banco quando a D-001 mediu?",
     "Não há corpus real nesta máquina ainda"},
    {"`mix test` falha com conexão recusada no banco. O que costuma estar errado?",
     "o banco não está no ar"},
    {"O check de estilo reclama de uma marcação de pendência numa frase que fala de \"todos\" ou \"todo o\"?",
     "Found a TODO tag"},
    {"O lint reclama do fim de linha depois de eu editar um arquivo no Windows. Do que se trata?",
     "File is using windows line endings"},
    {"O script diz que o banco não subiu, mas o processo aparece sozinho pouco depois. O que está acontecendo?",
     "syncing data directory"},
    {"Por que uma chamada ao `claude` ficava alguns segundos parada sem fazer nada?",
     "esperando entrada que nunca vem"},
    {"Um teste que roda a suíte de dentro da própria suíte trava até quando?",
     "até o timeout do ExUnit"},
    {"Faz diferença escrever `localhost` em vez do endereço IP para conectar no banco?",
     "o cliente cai para o IPv4 sozinho"},
    {"A compilação mostra um aviso de permissão negada ao tentar criar um link. Do que se trata?",
     "colocated assets"},
    {"Por que é preciso testar o adaptador do CLI contra o programa de verdade, e não só com eventos fabricados?",
     "faltava `--verbose`"},
    {"Por que o painel de custo não pode olhar só a última execução de uma tarefa?",
     "subestimava a tarefa inteira em quatro vezes"},
    {"Se um humano interrompe um agente manualmente pela tela, isso conta como reprovação da tarefa?",
     "reprovacao da tarefa"},
    {"Por que a tarefa de abertura da v0.4 foi barrada antes mesmo de começar a rodar?",
     "FORA DO CONFINAMENTO"},
    {"O que travava a importação das tarefas antigas, antes de a D-007 mudar o critério?",
     "cópia manual do Enzo"},
    {"Por que todo `insert` de projeto batia em id nulo num ciclo antigo da suite?",
     "o banco de TESTE\nestava obsoleto"},
    {"O problema de quebra de linha CRLF era do repositório, ou só apareceu numa cópia local?",
     "O CRLF existia so na copia de"},
    {"Por que o probe do marco usava um prompt de uma linha só, em vez de várias?",
     "multi-linha quebrava o `.bat`"},
    {"O modelo local conseguiu vetorizar mil trechos num tempo aceitável?",
     "abortado após mais de 9 minutos de parede"},
    {"Quantos agentes cabem ao mesmo tempo numa máquina de 8 GB de RAM?",
     "construtor: 2, verificador: 1, revisor: 1"}
  ]

  @typedoc "Um par do gabarito: a pergunta e uma frase LITERAL da resposta certa."
  @type par :: {pergunta :: String.t(), frase_alvo :: String.t()}

  @typedoc """
  As metricas de uma medicao contra o gabarito:

    * `recall_at_8` — fracao de perguntas cujo trecho certo apareceu no top 8;
    * `recall_at_1` — fracao cujo trecho certo veio em 1o lugar (o que mais importa num bloco de
      contexto: a D-004 mediu vetor puro ganhando aqui do hibrido, 0,391 x 0,261);
    * `mrr` — Mean Reciprocal Rank: a media de `1/posicao` (0 quando nao achou), a metrica que
      resume "quao no topo" o trecho certo cai;
    * `posicao_media` — a posicao media do trecho certo (`nil` quando nenhuma pergunta o achou).
  """
  @type metricas :: %{
          perguntas: pos_integer(),
          recall_at_8: float(),
          recall_at_1: float(),
          mrr: float(),
          posicao_media: float() | nil
        }

  @doc "O gabarito: #{length(@gabarito)} pares extraidos da historia REAL desta fabrica."
  @spec gabarito() :: [par()]
  def gabarito, do: @gabarito

  @doc """
  Roda o gabarito inteiro (ou `opts[:gabarito]`) contra `opts[:buscador]` (o padrao e
  `Fabrica.Memoria.Busca.buscar/2`) e devolve recall@8 e a posicao media do trecho certo.

  `buscador` tem a mesma forma que `Fabrica.Memoria.Contexto.montar/3` ja espera
  (`fn projeto_id, termo -> [Trecho.t()] end`) — a mesma convencao usada em todo o modulo
  `Fabrica.Memoria`, para poder trocar o buscador sem tocar em configuracao global. Se o
  `buscador` devolver `{:erro, motivo}` (contrato de `Fabrica.Memoria.Busca.buscar/3` quando o
  embedder falha — ex.: Ollama fora do ar) a pergunta conta como NAO encontrada, em vez de
  derrubar o processo chamador com `Protocol.UndefinedError`.
  """
  @spec medir(pos_integer(), keyword()) :: metricas()
  def medir(projeto_id, opts \\ []) do
    buscador = Keyword.get(opts, :buscador, &Busca.buscar/2)
    pares = Keyword.get(opts, :gabarito, @gabarito)

    posicoes =
      Enum.map(pares, fn {pergunta, frase_alvo} ->
        projeto_id
        |> buscador.(pergunta)
        |> posicao_do_alvo(frase_alvo)
      end)

    achadas = Enum.reject(posicoes, &is_nil/1)

    %{
      perguntas: length(pares),
      recall_at_8: length(achadas) / length(pares),
      recall_at_1: Enum.count(posicoes, &(&1 == 1)) / length(pares),
      mrr: reciproco_medio(posicoes),
      posicao_media: media(achadas)
    }
  end

  @doc """
  Roda o gabarito nos TRES modos de `Fabrica.Memoria.Busca` (`:hibrido`, `:vetor`, `:textual`) e
  devolve as metricas (recall@8, recall@1, MRR, posicao media) de CADA um, num mapa por modo. E o
  instrumento que a T-065 usa para escolher o modo padrao com numero, nao com opiniao.

  Rode com o embedder REAL configurado (`mix run priv/probes/_scratch/t065_medicao.exs`): a suite
  roda com `Embedder.Falso` (sem semantica), e o vetor puro so mede algo com um embedder de
  verdade. `opts` (por exemplo `:gabarito`) e repassado a `medir/2` em cada modo.
  """
  @spec medir_todos_modos(pos_integer(), keyword()) ::
          %{(:hibrido | :vetor | :textual) => metricas()}
  def medir_todos_modos(projeto_id, opts \\ []) do
    Map.new(Busca.modos(), fn modo ->
      buscador = fn projeto_id, termo -> Busca.buscar(projeto_id, termo, modo: modo) end
      {modo, medir(projeto_id, Keyword.put(opts, :buscador, buscador))}
    end)
  end

  @doc """
  A linha de base: as mesmas metricas de `medir/2`, mas usando SOMENTE busca por PALAVRA
  (`ts_rank_cd`, sem vetor nenhum) — o piso que a recuperacao hibrida precisa, no minimo,
  igualar (ver a secao do `@moduledoc` sobre por que o piso e vivo, nao congelado).
  """
  @spec linha_de_base(pos_integer(), keyword()) :: metricas()
  def linha_de_base(projeto_id, opts \\ []) do
    medir(projeto_id, Keyword.put(opts, :buscador, &buscar_so_texto/2))
  end

  @doc "`true` quando `atuais` fica ABAIXO de `piso` no recall@8 — o gatilho do desligamento."
  @spec abaixo_da_linha_de_base?(metricas(), metricas()) :: boolean()
  def abaixo_da_linha_de_base?(atuais, piso), do: atuais.recall_at_8 < piso.recall_at_8

  @doc """
  O ATUADOR. Mede `opts[:buscador]` (o padrao e `Busca.buscar/2`) contra o gabarito, mede a
  linha de base (busca por palavra) no MESMO projeto, e:

    * se a recuperacao ficar ABAIXO da linha de base, devolve `nil` — a fabrica roda SEM o
      bloco de contexto, em vez de so avisar (criterio de aceite da T-047);
    * senao, monta o bloco de verdade com `Fabrica.Memoria.Contexto.montar/3`, passando o
      mesmo `buscador` que foi medido.
  """
  @spec montar_contexto_seguro(pos_integer(), String.t(), keyword()) :: Contexto.t()
  def montar_contexto_seguro(projeto_id, termo, opts \\ []) do
    buscador = Keyword.get(opts, :buscador, &Busca.buscar/2)
    atuais = medir(projeto_id, Keyword.put(opts, :buscador, buscador))
    piso = linha_de_base(projeto_id, opts)

    if abaixo_da_linha_de_base?(atuais, piso) do
      nil
    else
      Contexto.montar(projeto_id, termo, buscador: blindar(buscador))
    end
  end

  # `Contexto.montar/3` (em `lib/`, fora das `areas` desta tarefa) repassa o retorno do buscador
  # direto para `Contexto.formatar/1`, que roda `Enum.take/2` — e quebra com
  # `Protocol.UndefinedError` se o buscador devolver `{:erro, motivo}` (embedder fora do ar). O
  # ramo `else` acima so e alcancado quando a recuperacao NAO ficou abaixo do piso; mas quando o
  # piso TAMBEM e zero (projeto sem corpus indexado, `0.0 < 0.0` e falso) o buscador que erra
  # chega ate aqui. A correcao do Ciclo 2 tratou o erro so dentro de `medir/2`; esta trata a
  # segunda via. Blindar traduz `{:erro, _}` em `[]` (bloco vazio -> `nil`), honrando o contrato
  # "roda sem o bloco, nunca quebra quem chamou" sem precisar tocar em `lib/`.
  defp blindar(buscador) do
    fn projeto_id, termo ->
      case buscador.(projeto_id, termo) do
        {:erro, _motivo} -> []
        trechos -> trechos
      end
    end
  end

  # `Busca.buscar/3` documenta que devolve `{:erro, {:vetorizacao_da_consulta, motivo}}` (nunca
  # deixa o `MatchError` subir) quando o embedder falha — ex.: Ollama fora do ar. Tratar como
  # "pergunta nao encontrada" (em vez de repassar a tupla para `Enum.find_index/2`, que levanta
  # `Protocol.UndefinedError`) deriva o recall dela para baixo, deixando o ATUADOR desligar o
  # bloco quando a recuperacao falha — em vez de quebrar o processo chamador.
  defp posicao_do_alvo({:erro, _motivo}, _frase_alvo), do: nil

  defp posicao_do_alvo(trechos, frase_alvo) do
    alvo = normalizar(frase_alvo)

    case Enum.find_index(trechos, &String.contains?(normalizar(&1.corpo), alvo)) do
      nil -> nil
      indice -> indice + 1
    end
  end

  defp normalizar(texto) do
    texto |> String.downcase() |> String.replace(~r/\s+/, " ") |> String.trim()
  end

  defp media([]), do: nil
  defp media(posicoes), do: Enum.sum(posicoes) / length(posicoes)

  # MRR: a media de `1/posicao` sobre TODAS as perguntas (nao so as achadas) — pergunta cujo
  # trecho certo nao apareceu no top 8 conta 0. E por isso que percorre `posicoes` inteiro, com
  # `nil` virando 0.0, em vez de so as achadas.
  defp reciproco_medio(posicoes) do
    soma =
      Enum.reduce(posicoes, 0.0, fn
        nil, acc -> acc
        posicao, acc -> acc + 1.0 / posicao
      end)

    soma / length(posicoes)
  end

  # Mesma forma da metade textual de `Fabrica.Memoria.Busca.buscar/3` — usada como PISO, sem a
  # metade semantica. `projeto_id` filtra a consulta, como em toda busca desta fabrica.
  defp buscar_so_texto(projeto_id, termo) do
    sql = """
    SELECT id, projeto_id, fonte, corpo, hash
      FROM trechos
     WHERE projeto_id = $1 AND busca @@ plainto_tsquery('portuguese', $2)
     ORDER BY ts_rank_cd(busca, plainto_tsquery('portuguese', $2)) DESC
     LIMIT $3
    """

    %{rows: linhas} = SQL.query!(Repo, sql, [projeto_id, termo, @limite_resultado])

    Enum.map(linhas, fn [id, projeto_id, fonte, corpo, hash] ->
      %Trecho{id: id, projeto_id: projeto_id, fonte: fonte, corpo: corpo, hash: hash}
    end)
  end
end
