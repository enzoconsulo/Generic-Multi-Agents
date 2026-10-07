defmodule Fabrica.Memoria.Busca do
  @moduledoc """
  Responde "isto ja foi resolvido aqui, e o que foi decidido na epoca?" recuperando os trechos
  mais relevantes da historia do projeto. Tem TRES modos, escolhidos por `opts[:modo]`:

    * `:vetor`   — so proximidade semantica (`embedding <=> consulta`);
    * `:textual` — so busca textual (`ts_rank_cd` sobre `plainto_tsquery`);
    * `:hibrido` — funde os dois por posto reciproco (Reciprocal Rank Fusion), com `opts[:k]`.

  POR QUE AS DUAS BUSCAS EXISTEM: o vetor perde nome proprio (uma pergunta sobre uma opcao
  chamada `--exigir` nao tem como o vetor saber o que aquilo e) e a busca textual perde
  sinonimo. Uma cobre o buraco da outra. O modo `:hibrido` roda as duas; os modos puros rodam
  UMA so — e a metade que nao conta nao custa nem consulta (o modo `:textual` nem sequer chama
  o embedder).

  ## O padrao vem de configuracao, e foi ESCOLHIDO por medicao

  `modo_padrao/0` cai em `:hibrido` — sobreponivel por `config :fabrica, :busca_modo` (mesma
  tecnica de `Fabrica.Embedder.configurado/0`: default no codigo, sobreposicao por config).
  Continua sendo a fusao com `k=60` da T-044, mas nao mais como UNICO comportamento fixo: agora
  e um dos tres modos medidos, escolhido por ter GANHO a medicao desta maquina, e reversivel por
  config se um vetor melhor um dia mudar o veredito.

  Medido nesta arvore (`embeddinggemma` via Ollama local, corpus real de `_gestao/`, gabarito de
  21 perguntas da T-047 — reproduzivel com `mix run priv/probes/_scratch/t065_medicao.exs`;
  evidencia em `_gestao/evidencias/T-065-medicao-reexec.log`, 1255 trechos):

      modo       recall@8   recall@1   MRR
      hibrido    0,667      0,143      0,341
      vetor      0,619      0,143      0,317
      textual    0,048      0,048      0,048

  Os TRES conjuntos ficam aqui, nao so o do vencedor: e o que permite reabrir a decisao com
  numero novo, como a D-004 promete. O achado da D-004 (vetor puro ganharia o recall@1: 0,391 x
  0,261 do hibrido, medido no bench Python) NAO se reproduz nesta arvore: aqui vetor e hibrido
  EMPATAM no recall@1 (0,143), e o hibrido ainda ganha recall@8 e MRR — entao o hibrido vence, e
  o numero local manda sobre o do bench (ver as Notas da T-065). Os valores absolutos oscilam
  entre corridas (o corpus cresce e a sequencia de id do Postgres acumula), mas a ORDEM e o
  vencedor sao estaveis: duas medicoes seguidas deram hibrido > vetor > textual em recall@8 e
  MRR, com recall@1 empatado. **A metade textual NAO foi apagada** mesmo sendo a pior: a razao
  dela existir (nome proprio que o vetor nao acha) continua valida, e ela segue viva como modo
  `:textual` e como metade do `:hibrido`.

  ## Uma unica instrucao SQL, por modo

  Cada modo faz UMA UNICA ida ao banco (`Fabrica.Repo`, o mesmo que guarda `tarefas`): o
  `:hibrido` num `WITH` encadeado (as duas candidatas, a fusao e a leitura dos `trechos`
  inteiros), os puros num `SELECT` direto. Nao ha uma metade do calculo enxergando um estado do
  banco e a outra outro.

  `projeto_id` filtra desde o inicio de toda consulta: um trecho de outro projeto nunca entra
  nem como candidato, em modo nenhum.

  ## Documento x consulta (T-063)

  `termo` e vetorizado como CONSULTA (`Fabrica.Embedder.vetorizar_consulta/2`), nao como
  documento — quem ingere a historia do projeto (`Fabrica.Memoria.Ingestao`) chama o caminho
  de documento, e este modulo chama o de consulta. Para adaptadores sem prefixo por tipo
  (`Falso`, `Servico`, `Local`) os dois caminhos coincidem; para `Embedder.Ollama`, nao — sem
  o prefixo certo a qualidade medida na D-004 nao se reproduz.
  """

  alias Ecto.Adapters.SQL
  alias Fabrica.Memoria.Trecho
  alias Fabrica.Repo

  @limite_candidatos 40
  @k_rrf 60
  @limite_resultado 8

  # O modo padrao — o que ganhou a medicao desta maquina (ver a tabela do @moduledoc).
  # Sobreponivel por `config :fabrica, :busca_modo`.
  @modo_padrao :hibrido

  @modos [:hibrido, :vetor, :textual]

  @doc "Os tres modos de recuperacao aceitos por `buscar/3`."
  @spec modos() :: [:hibrido | :vetor | :textual]
  def modos, do: @modos

  @doc """
  O modo padrao: `config :fabrica, :busca_modo`, ou `#{inspect(@modo_padrao)}` (o vencedor da
  medicao desta maquina) quando nao configurado.
  """
  @spec modo_padrao() :: :hibrido | :vetor | :textual
  def modo_padrao, do: Application.get_env(:fabrica, :busca_modo, @modo_padrao)

  @doc """
  Busca `termo` dentro do `projeto_id`, devolvendo ate #{@limite_resultado}
  `Fabrica.Memoria.Trecho`, do mais para o menos relevante.

    * `opts[:modo]` — `:hibrido`, `:vetor` ou `:textual` (o padrao e `modo_padrao/0`). Cada modo
      devolve o que o nome diz; o `:vetor` nao executa a metade textual e o `:textual` nao
      executa (nem vetoriza) a metade semantica.
    * `opts[:k]` — a constante do RRF no modo `:hibrido` (o padrao e #{@k_rrf}); ignorada nos
      modos puros, que nao fazem fusao.
    * `opts[:embedder]` — troca o adaptador de vetorizacao (o padrao e
      `Fabrica.Embedder.configurado/0`); so importa nos modos que vetorizam (`:vetor`,
      `:hibrido`).

  `termo` e vetorizado pelo caminho de CONSULTA (`Fabrica.Embedder.vetorizar_consulta/2`), nao
  pelo de documento — ver a secao "Documento x consulta" do `@moduledoc`. Se o embedder devolver
  `{:erro, motivo}`, a busca devolve `{:erro, {:vetorizacao_da_consulta, motivo}}` em vez de
  deixar o `MatchError` derrubar quem chamou. O modo `:textual` nao vetoriza, entao nunca falha
  por embedder.
  """
  @spec buscar(pos_integer(), String.t(), keyword()) :: [Trecho.t()] | {:erro, term()}
  def buscar(projeto_id, termo, opts \\ []) when is_binary(termo) do
    modo = Keyword.get(opts, :modo, modo_padrao())
    k = Keyword.get(opts, :k, @k_rrf)

    case modo do
      :textual ->
        buscar_textual(projeto_id, termo)

      _vetorizado ->
        embedder = Keyword.get(opts, :embedder, Fabrica.Embedder.configurado())

        case Fabrica.Embedder.vetorizar_consulta([termo], embedder) do
          {:ok, [vetor]} -> buscar_com_vetor(projeto_id, termo, vetor, modo, k)
          {:erro, motivo} -> {:erro, {:vetorizacao_da_consulta, motivo}}
        end
    end
  end

  # O literal do vetor entra COLADO no texto do SQL, nunca como parametro `$N`: o Postgrex
  # nao tem extensao para o tipo `vector` do pgvector (mesma razao documentada em
  # `Fabrica.Memoria.Ingestao.definir_embedding/2`). Colar e seguro porque `vetor` so
  # contem `float()` que O PROPRIO EMBEDDER gerou (nunca texto vindo de fora), e
  # `Float.to_string/1` nunca produz aspas, ponto-e-virgula ou qualquer caractere que
  # escape do array `[...]`. `k` idem: e sempre um inteiro (guarda abaixo), nunca texto.
  defp buscar_com_vetor(projeto_id, _termo, vetor, :vetor, _k) do
    literal = literal(vetor)

    sql = """
    SELECT t.id, t.projeto_id, t.fonte, t.corpo, t.hash
      FROM trechos t
     WHERE t.projeto_id = $1
     ORDER BY t.embedding <=> '#{literal}'::vector
     LIMIT $2
    """

    executar(sql, [projeto_id, @limite_resultado])
  end

  defp buscar_com_vetor(projeto_id, termo, vetor, :hibrido, k) when is_integer(k) do
    literal = literal(vetor)

    # `plainto_tsquery` entra como CHAMADA dentro do SQL, com `termo` passado como parametro
    # de texto comum ($2): o Postgrex tambem nao tem extensao para o tipo `tsquery`, e
    # construir a tsquery no Postgres evita ter que serializar esse tipo em Elixir.
    sql = """
    WITH semantico AS (
      SELECT id, RANK() OVER (ORDER BY embedding <=> '#{literal}'::vector) AS pos
        FROM trechos
       WHERE projeto_id = $1
       ORDER BY embedding <=> '#{literal}'::vector
       LIMIT #{@limite_candidatos}
    ),
    textual AS (
      SELECT id, RANK() OVER (ORDER BY ts_rank_cd(busca, plainto_tsquery('portuguese', $2)) DESC) AS pos
        FROM trechos
       WHERE projeto_id = $1 AND busca @@ plainto_tsquery('portuguese', $2)
       LIMIT #{@limite_candidatos}
    ),
    fundido AS (
      SELECT id,
             COALESCE(1.0 / (#{k} + semantico.pos), 0)
               + COALESCE(1.0 / (#{k} + textual.pos), 0) AS escore
        FROM semantico
        FULL OUTER JOIN textual USING (id)
    )
    SELECT t.id, t.projeto_id, t.fonte, t.corpo, t.hash
      FROM fundido f
      JOIN trechos t ON t.id = f.id
     ORDER BY f.escore DESC
     LIMIT $3
    """

    executar(sql, [projeto_id, termo, @limite_resultado])
  end

  # Modo `:textual` — so a metade textual, sem vetorizar a consulta nem tocar em `embedding`.
  # Mesma forma da metade textual do `:hibrido` (e do PISO de `Fabrica.Memoria.Avaliacao`).
  defp buscar_textual(projeto_id, termo) do
    sql = """
    SELECT id, projeto_id, fonte, corpo, hash
      FROM trechos
     WHERE projeto_id = $1 AND busca @@ plainto_tsquery('portuguese', $2)
     ORDER BY ts_rank_cd(busca, plainto_tsquery('portuguese', $2)) DESC
     LIMIT $3
    """

    executar(sql, [projeto_id, termo, @limite_resultado])
  end

  defp literal(vetor), do: "[" <> Enum.map_join(vetor, ",", &Float.to_string/1) <> "]"

  defp executar(sql, params) do
    %{rows: linhas} = SQL.query!(Repo, sql, params)

    Enum.map(linhas, fn [id, projeto_id, fonte, corpo, hash] ->
      %Trecho{id: id, projeto_id: projeto_id, fonte: fonte, corpo: corpo, hash: hash}
    end)
  end
end
