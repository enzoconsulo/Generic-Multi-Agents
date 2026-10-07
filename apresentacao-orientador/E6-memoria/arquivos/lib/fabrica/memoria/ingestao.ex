defmodule Fabrica.Memoria.Ingestao do
  @moduledoc """
  Corta e indexa a HISTORIA do projeto ao commitar — decisoes com motivo, achados de
  revisao, relatorios de verificacao, tarefas concluidas. O corpus indexado NAO e o codigo:
  disso o indice denso (T-010) ja da conta, de graca e com exatidao.

  ## Corte por estrutura, nunca por contagem cega

  `cortar/1` corta um markdown por SECAO (cada cabecalho `#`..`######` abre um trecho novo) e
  nunca no meio de um bloco de codigo cercado (```` ``` ````), mesmo que uma linha dentro dele
  se pareca com cabecalho. O texto antes do primeiro cabecalho, se houver, vira o trecho
  `"(preambulo)"`.

  ## Incremental por trecho, nao por arquivo inteiro

  Cada trecho carrega o sha256 do proprio corpo (`Fabrica.Memoria.Trecho.hash/1`).
  `processar/3` compara esse hash com o que ja esta gravado: so os trechos NOVOS ou com hash
  DIFERENTE sao vetorizados e escritos; os identicos nao sao retocados. A granularidade e o
  TRECHO, nao o commit inteiro — mais precisa que guardar so o ultimo commit indexado (basta
  reprocessar o arquivo mudado, mesmo que so uma secao dele tenha mudado de fato), e mais
  simples de testar sem subir um repositorio git de mentira. Escolher QUAIS arquivos entram
  em `fontes` (por exemplo, so os que o `git diff` do commit aponta) e responsabilidade de
  quem chama — este modulo nao conhece git.

  ## Uma unica chamada ao embedder

  `Fabrica.Embedder.vetorizar/1` ja recebe LISTA (ver o `@moduledoc` do behaviour): esta
  ingestao respeita isso ate o fim — todo o lote de trechos novos/alterados de UMA passada de
  `processar/3` vira uma UNICA chamada, nunca uma por trecho. Rodar fora do caminho quente (ao
  commitar, nao no despacho) e existir batching sao a mesma economia, medida em
  `Fabrica.Embedder`: a diferenca entre uma chamada de rede e mil.
  """

  import Ecto.Query

  alias Ecto.Adapters.SQL
  alias Fabrica.Memoria.Dimensao
  alias Fabrica.Memoria.Trecho
  alias Fabrica.Repo

  @typedoc "Uma fonte a indexar: caminho do arquivo e o conteudo INTEIRO e atual dele."
  @type fonte :: %{caminho: String.t(), conteudo: String.t()}

  @typedoc "O resultado de uma passada de ingestao."
  @type resultado :: %{
          inseridos: non_neg_integer(),
          atualizados: non_neg_integer(),
          inalterados: non_neg_integer(),
          chamadas_embedder: non_neg_integer()
        }

  @typedoc """
  O erro da guarda de dimensao (T-061): a coluna `trechos.embedding` e o embedder em uso nesta
  chamada tem numero de posicoes diferente. `processar/3` devolve isto SEM chamar
  `embedder.vetorizar/1` — o desencontro para de aparecer so na hora do `UPDATE ... ::vector`.
  """
  @type erro_dimensao :: {:erro, {:dimensao_divergente, pos_integer(), pos_integer()}}

  @doc """
  Corta `conteudo` em trechos por estrutura. Devolve `[{identificador, corpo}]`, na ordem em
  que aparecem no arquivo. `identificador` e o titulo do cabecalho (sem o `#`) ou
  `"(preambulo)"`; um titulo repetido no mesmo arquivo ganha sufixo numerico
  (`"Notas#1"`, `"Notas#2"`, ...) para que a `fonte` de cada trecho continue unica.
  """
  @spec cortar(String.t()) :: [{String.t(), String.t()}]
  def cortar(conteudo) do
    conteudo
    |> String.split(~r/\r?\n/)
    |> agrupar_por_secao()
    |> Enum.map(&Enum.join(&1, "\n"))
    |> Enum.map(&String.trim_trailing/1)
    |> Enum.reject(&(&1 == ""))
    |> identificar()
  end

  @doc """
  Indexa `fontes` do `projeto_id`. `opts[:embedder]` troca o adaptador (o padrao e
  `Fabrica.Embedder.configurado/0`) — e o que permite um teste contar quantas vezes o
  embedder foi chamado, sem tocar em config de aplicacao global.

  Antes de montar qualquer lote, confere se a coluna `trechos.embedding` e o embedder em uso
  tem a mesma dimensao (T-061). Se nao tiverem, devolve `erro_dimensao/0` sem chamar
  `embedder.vetorizar/1` nenhuma vez.
  """
  @spec processar(pos_integer(), [fonte()], keyword()) :: resultado() | erro_dimensao()
  def processar(projeto_id, fontes, opts \\ []) do
    embedder = Keyword.get(opts, :embedder, Fabrica.Embedder.configurado())

    case conferir_dimensao(embedder) do
      :ok ->
        candidatos =
          Enum.flat_map(fontes, fn %{caminho: caminho, conteudo: conteudo} ->
            montar_candidatos(caminho, conteudo)
          end)

        existentes = carregar_hashes(projeto_id, Enum.map(candidatos, & &1.fonte))

        {a_gravar, inalterados} =
          Enum.split_with(candidatos, &(Map.get(existentes, &1.fonte) != &1.hash))

        novos = Enum.count(a_gravar, &(not Map.has_key?(existentes, &1.fonte)))

        chamadas_embedder = gravar_lote(projeto_id, a_gravar, embedder)

        %{
          inseridos: novos,
          atualizados: length(a_gravar) - novos,
          inalterados: length(inalterados),
          chamadas_embedder: chamadas_embedder
        }

      erro ->
        erro
    end
  end

  # `Dimensao.conferir/0` so enxerga o embedder GLOBALMENTE configurado; aqui a checagem precisa
  # do embedder que esta REALMENTE em uso nesta chamada, que pode vir de `opts[:embedder]` — o
  # mesmo padrao que o resto deste modulo ja segue (para um teste trocar o adaptador sem tocar em
  # config de aplicacao). Reaproveita o sensor (`Dimensao.atual/0`, a leitura do catalogo do
  # Postgres) em vez de duplicar a consulta SQL.
  @spec conferir_dimensao(module()) :: :ok | erro_dimensao()
  defp conferir_dimensao(embedder) do
    coluna = Dimensao.atual()
    dimensao_embedder = embedder.dimensoes()

    if coluna == dimensao_embedder do
      :ok
    else
      {:erro, {:dimensao_divergente, coluna, dimensao_embedder}}
    end
  end

  defp montar_candidatos(caminho, conteudo) do
    conteudo
    |> cortar()
    |> Enum.map(fn {identificador, corpo} ->
      %{fonte: "#{caminho}##{identificador}", corpo: corpo, hash: Trecho.hash(corpo)}
    end)
  end

  defp carregar_hashes(_projeto_id, []), do: %{}

  defp carregar_hashes(projeto_id, fontes) do
    Trecho
    |> where([t], t.projeto_id == ^projeto_id and t.fonte in ^fontes)
    |> select([t], {t.fonte, t.hash})
    |> Repo.all()
    |> Map.new()
  end

  defp gravar_lote(_projeto_id, [], _embedder), do: 0

  defp gravar_lote(projeto_id, a_gravar, embedder) do
    {:ok, vetores} = embedder.vetorizar(Enum.map(a_gravar, & &1.corpo))

    a_gravar
    |> Enum.zip(vetores)
    |> Enum.each(fn {candidato, vetor} -> gravar(projeto_id, candidato, vetor) end)

    1
  end

  # Gravar o trecho e gravar o embedding sao UMA transacao. Sem ela, o `insert!` ja fixaria
  # `hash` no corpo atual, e uma falha no `UPDATE` do embedding em seguida (timeout, deadlock,
  # concorrencia) deixaria o trecho com `hash` batendo e `embedding` NULL — e a passada
  # seguinte de `processar/3` o trataria como `inalterado` e nunca mais o vetorizaria, fora da
  # busca por similaridade para sempre. Atomico: ou o par (hash, embedding) fica consistente,
  # ou o `hash` antigo permanece e a proxima passada tenta de novo.
  defp gravar(projeto_id, candidato, vetor) do
    {:ok, :ok} =
      Repo.transaction(fn ->
        trecho =
          %Trecho{}
          |> Trecho.changeset(%{
            projeto_id: projeto_id,
            fonte: candidato.fonte,
            corpo: candidato.corpo,
            hash: candidato.hash
          })
          |> Repo.insert!(
            on_conflict: {:replace, [:corpo, :hash, :updated_at]},
            conflict_target: [:projeto_id, :fonte],
            returning: [:id]
          )

        definir_embedding(trecho.id, vetor)
      end)

    :ok
  end

  # O literal do vetor entra COLADO no texto do SQL, nunca como parametro `$N`: o Postgrex
  # nao tem extensao para o tipo `vector` do pgvector, entao um parametro `$N::vector` faria
  # o driver tentar codificar o valor para um OID que ele nao conhece. Colar e seguro porque
  # `vetor` so contem `float()` que ESTE MODULO gerou (nunca texto vindo de fora), e
  # `Float.to_string/1` nunca produz aspas, ponto-e-virgula ou qualquer caractere que escape
  # do array `[...]`.
  @spec definir_embedding(pos_integer(), [float()]) :: :ok
  defp definir_embedding(id, vetor) do
    literal = "[" <> Enum.map_join(vetor, ",", &Float.to_string/1) <> "]"

    _ =
      SQL.query!(
        Repo,
        "UPDATE trechos SET embedding = '#{literal}'::vector WHERE id = $1",
        [id]
      )

    :ok
  end

  # -- corte estrutural --

  defp agrupar_por_secao(linhas) do
    {secoes, atual, _dentro_bloco} = Enum.reduce(linhas, {[], [], false}, &empilhar_linha/2)
    Enum.reverse([Enum.reverse(atual) | secoes])
  end

  defp empilhar_linha(linha, {secoes, atual, dentro_bloco}) do
    cerca? = cerca?(linha)
    abre_secao_nova? = not dentro_bloco and not cerca? and cabecalho?(linha) and atual != []

    cond do
      abre_secao_nova? -> {[Enum.reverse(atual) | secoes], [linha], dentro_bloco}
      cerca? -> {secoes, [linha | atual], not dentro_bloco}
      true -> {secoes, [linha | atual], dentro_bloco}
    end
  end

  defp cerca?(linha), do: linha |> String.trim_leading() |> String.starts_with?("```")

  defp cabecalho?(linha), do: Regex.match?(~r/^\#{1,6}[ \t]+\S/, linha)

  defp identificar(secoes) do
    titulos = Enum.map(secoes, &titulo/1)

    {identificadores, _contagem} =
      Enum.map_reduce(titulos, %{}, fn titulo, contagem ->
        vistas = Map.get(contagem, titulo, 0)
        identificador = if vistas == 0, do: titulo, else: "#{titulo}##{vistas}"
        {identificador, Map.put(contagem, titulo, vistas + 1)}
      end)

    Enum.zip(identificadores, secoes)
  end

  defp titulo(corpo) do
    primeira_linha = corpo |> String.split(~r/\r?\n/, parts: 2) |> List.first()

    if cabecalho?(primeira_linha) do
      primeira_linha |> String.trim_leading("#") |> String.trim()
    else
      "(preambulo)"
    end
  end
end
