defmodule Mix.Tasks.Fabrica.Importar do
  @shortdoc "Importa o estado das tarefas v1 (markdown) para o banco da v2"

  @moduledoc """
  Le os projetos v1 sob uma raiz e traz o estado inteiro para o banco: projetos,
  especialistas (`equipe.json`), fases e marcos (`PLANO.md`), tarefas, dependencias, areas,
  tentativas e ciclos (`_gestao/tarefas/*.md`).

      mix fabrica.importar --raiz caminho/para/projetos

  Um PROJETO v1 e qualquer diretorio direto de `--raiz` que tenha `_gestao/tarefas/`.

  ## Idempotencia, o criterio que mais importa

  Rodar duas vezes deixa o banco no mesmo estado: a chave e sempre `(projeto, codigo)`.
  Cada grupo de filhos de uma tarefa (areas, criterios, ciclos, dependencias) e substituido
  por completo a cada import — apagado e reescrito — em vez de comparado campo a campo, o
  que da o mesmo resultado com bem menos codigo.

  ## Tarefa com frontmatter quebrado

  Nao adivinha. Entra como `status: bloqueada`, com o motivo registrado num ciclo
  (`papel: "importacao"`), e aparece na lista `bloqueadas` do relatorio devolvido.

  Esta tarefa e casca fina de proposito: as `areas` declaradas cobrem so este arquivo e o
  teste, entao a logica mora aqui dentro em vez de um modulo de contexto separado.
  """

  use Mix.Task

  import Ecto.Query, only: [from: 2]

  alias Fabrica.Equipe
  alias Fabrica.Projetos.Fase
  alias Fabrica.Projetos.Marco
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Ciclo
  alias Fabrica.Tarefas.Criterio
  alias Fabrica.Tarefas.Dependencia
  alias Fabrica.Tarefas.Tarefa

  @estados_hifenizados (Tarefa.estados() ++ Tarefa.terminais())
                       |> Enum.map(&(Atom.to_string(&1) |> String.replace("_", "-")))

  # Limite REAL da coluna `ciclos.desfecho` (varchar(255) na migracao) — usado tanto para
  # cortar antes do `Repo.insert!` quanto para anunciar o corte no relatorio.
  @limite_desfecho 255

  @impl Mix.Task
  def run(argumentos) do
    # `app.start`, nao `app.config`: ao contrario de `fabrica.backup`/`fabrica.restaurar`
    # (que so chamam `pg_dump` via `System.cmd`), este importador fala com o `Fabrica.Repo`
    # via `Repo.get_by`/`Repo.insert!` — precisa do processo do Repo de pe, nao so da config
    # carregada.
    Mix.Task.run("app.start")
    {opcoes, resto} = OptionParser.parse!(argumentos, strict: [raiz: :string])

    raiz =
      Keyword.get(opcoes, :raiz) || List.first(resto) ||
        Mix.raise("uso: mix fabrica.importar --raiz <diretorio-com-projetos-v1>")

    imprimir(importar(raiz))
  end

  @doc "Importa cada projeto v1 encontrado sob `raiz`. Publico para o teste chamar direto."
  @spec importar(Path.t()) :: map()
  def importar(raiz) do
    # `Path.expand/1` troca `\` por `/`: sem isso, `Path.wildcard/1` mais adiante nao acha
    # nada no Windows — o padrao vira uma mistura de separadores que nunca casa com o
    # arquivo de verdade. Medido com `System.tmp_dir!()`, que devolve caminho com `\`.
    resultados = raiz |> Path.expand() |> listar_projetos() |> Enum.map(&importar_projeto/1)

    %{
      projetos: Enum.map(resultados, & &1.projeto),
      tarefas: Enum.sum(Enum.map(resultados, & &1.tarefas)),
      especialistas: Enum.sum(Enum.map(resultados, & &1.especialistas)),
      fases: Enum.sum(Enum.map(resultados, & &1.fases)),
      bloqueadas: Enum.flat_map(resultados, & &1.bloqueadas),
      truncados: Enum.flat_map(resultados, & &1.truncados)
    }
  end

  defp imprimir(relatorio) do
    Mix.shell().info("projetos importados: #{Enum.join(relatorio.projetos, ", ")}")

    Mix.shell().info(
      "tarefas: #{relatorio.tarefas}  especialistas: #{relatorio.especialistas}  " <>
        "fases: #{relatorio.fases}"
    )

    if relatorio.bloqueadas != [] do
      Mix.shell().info("")
      Mix.shell().error("tarefas bloqueadas (frontmatter invalido):")
      Enum.each(relatorio.bloqueadas, &imprimir_bloqueada/1)
    end

    if relatorio.truncados != [] do
      Mix.shell().info("")
      Mix.shell().error("campos truncados antes de gravar (excediam o limite da coluna):")
      Enum.each(relatorio.truncados, &imprimir_truncado/1)
    end
  end

  defp imprimir_bloqueada(bloqueada) do
    Mix.shell().error("  #{bloqueada.codigo} (#{bloqueada.arquivo}): #{bloqueada.motivo}")
  end

  defp imprimir_truncado(truncado) do
    Mix.shell().error(
      "  #{truncado.codigo} (#{truncado.arquivo}): campo #{truncado.campo} tinha " <>
        "#{truncado.tamanho_original} bytes, cortado para #{@limite_desfecho}"
    )
  end

  # --- descoberta de projetos -----------------------------------------------------------

  defp listar_projetos(raiz) do
    raiz
    |> File.ls!()
    |> Enum.map(&Path.join(raiz, &1))
    |> Enum.filter(&projeto_v1?/1)
    |> Enum.sort()
  end

  defp projeto_v1?(caminho) do
    File.dir?(caminho) and File.dir?(Path.join([caminho, "_gestao", "tarefas"]))
  end

  defp importar_projeto(caminho) do
    nome = Path.basename(caminho)
    projeto = obter_ou_criar_projeto(nome, caminho)

    especialistas = importar_equipe(projeto, caminho)
    fases = importar_plano(projeto, caminho)
    {resultados, bloqueadas} = importar_tarefas(projeto, caminho)

    %{
      projeto: nome,
      tarefas: length(resultados),
      especialistas: length(especialistas),
      fases: length(fases),
      bloqueadas: Enum.map(bloqueadas, &Map.take(&1, [:codigo, :arquivo, :motivo])),
      truncados: Enum.flat_map(resultados, & &1.truncados)
    }
  end

  defp obter_ou_criar_projeto(nome, caminho) do
    case Repo.get_by(Projeto, nome: nome) do
      nil ->
        Repo.insert!(Projeto.changeset(%Projeto{}, %{"nome" => nome, "caminho" => caminho}))

      projeto ->
        projeto
    end
  end

  # --- equipe.json -> especialistas ------------------------------------------------------

  defp importar_equipe(projeto, caminho) do
    arquivo = Path.join([caminho, "_gestao", "equipe.json"])

    with {:ok, texto} <- File.read(arquivo),
         {:ok, lista} when is_list(lista) <- Jason.decode(texto) do
      Enum.map(lista, &upsert_especialista(projeto, &1))
    else
      _sem_equipe -> []
    end
  end

  defp upsert_especialista(projeto, dados) do
    identificador = dados["identificador"]
    nome = dados["nome"]
    prompt = dados["prompt"]

    case Equipe.ativo(projeto.id, identificador) do
      %{nome: ^nome, prompt: ^prompt} ->
        identificador

      _outro_ou_ausente ->
        {:ok, _especialista} =
          Equipe.definir(projeto.id, %{
            "identificador" => identificador,
            "nome" => nome,
            "prompt" => prompt
          })

        identificador
    end
  end

  # --- PLANO.md -> fases e marcos ---------------------------------------------------------

  @fase_regex ~r/^##\s+(\S+)\s+—\s+(.+)$/
  @marco_regex ~r/^Marco:\s*(\S+)\s+—\s+(.+)$/i

  defp importar_plano(projeto, caminho) do
    arquivo = Path.join([caminho, "_gestao", "PLANO.md"])

    case File.read(arquivo) do
      {:ok, texto} ->
        texto
        |> parse_fases()
        |> Enum.with_index(1)
        |> Enum.map(fn {fase, ordem} -> upsert_fase(projeto, fase, ordem) end)

      {:error, _sem_plano} ->
        []
    end
  end

  defp parse_fases(conteudo) do
    conteudo
    |> String.split(~r/\r?\n/)
    |> Enum.map(&String.trim/1)
    |> Enum.reduce([], &linha_de_plano/2)
    |> Enum.reverse()
    |> Enum.map(fn fase -> %{fase | marcos: Enum.reverse(fase.marcos)} end)
  end

  defp linha_de_plano(linha, fases) do
    cond do
      captura = Regex.run(@fase_regex, linha) ->
        [_tudo, versao, titulo] = captura
        [%{versao: versao, titulo: titulo, marcos: []} | fases]

      captura = Regex.run(@marco_regex, linha) ->
        acrescentar_marco(captura, fases)

      true ->
        fases
    end
  end

  defp acrescentar_marco([_tudo, codigo, titulo], [atual | resto]) do
    marco = %{codigo: presenca(codigo), titulo: titulo}
    [%{atual | marcos: [marco | atual.marcos]} | resto]
  end

  defp acrescentar_marco(_captura, []), do: []

  defp upsert_fase(projeto, fase, ordem) do
    registro =
      case Repo.get_by(Fase, projeto_id: projeto.id, versao: fase.versao) do
        nil ->
          Repo.insert!(
            Fase.changeset(%Fase{}, %{
              "projeto_id" => projeto.id,
              "versao" => fase.versao,
              "titulo" => fase.titulo,
              "ordem" => ordem
            })
          )

        existente ->
          Repo.update!(Fase.changeset(existente, %{"titulo" => fase.titulo, "ordem" => ordem}))
      end

    Repo.delete_all(from(m in Marco, where: m.fase_id == ^registro.id))

    fase.marcos
    |> Enum.with_index(1)
    |> Enum.each(fn {marco, ordem_marco} -> inserir_marco(registro, marco, ordem_marco) end)

    registro.versao
  end

  defp inserir_marco(fase, marco, ordem) do
    Repo.insert!(
      Marco.changeset(%Marco{}, %{
        "fase_id" => fase.id,
        "titulo" => marco.titulo,
        "tarefa_codigo" => marco.codigo,
        "ordem" => ordem
      })
    )
  end

  # --- _gestao/tarefas/*.md -> tarefas -----------------------------------------------------

  defp importar_tarefas(projeto, caminho) do
    arquivos =
      [caminho, "_gestao", "tarefas", "*.md"] |> Path.join() |> Path.wildcard() |> Enum.sort()

    resultados = Enum.map(arquivos, &importar_arquivo_de_tarefa(projeto, &1))
    Enum.each(resultados, &resolver_dependencias(projeto, &1))

    {resultados, Enum.filter(resultados, & &1.bloqueada?)}
  end

  defp importar_arquivo_de_tarefa(projeto, caminho_arquivo) do
    nome_arquivo = Path.basename(caminho_arquivo)
    conteudo = File.read!(caminho_arquivo)

    case parse_tarefa(conteudo, nome_arquivo) do
      {:ok, dados} ->
        {tarefa, truncamentos} = upsert_tarefa(projeto, dados)

        %{
          tarefa_id: tarefa.id,
          bloqueada?: false,
          dependencias: dados.dependencias,
          replanejada_de: dados.replanejada_de,
          truncados: marcar_origem(truncamentos, dados.codigo, nome_arquivo)
        }

      {:erro, motivo, parciais} ->
        tarefa = upsert_tarefa_bloqueada(projeto, parciais, motivo)

        %{
          tarefa_id: tarefa.id,
          bloqueada?: true,
          codigo: tarefa.codigo,
          arquivo: nome_arquivo,
          motivo: motivo,
          dependencias: [],
          replanejada_de: nil,
          truncados: []
        }
    end
  end

  defp marcar_origem(truncamentos, codigo, arquivo) do
    Enum.map(truncamentos, &Map.merge(&1, %{codigo: codigo, arquivo: arquivo}))
  end

  # --- leitura do frontmatter e das secoes --------------------------------------------------

  @frontmatter ~r/\A---\r?\n(.*?)\r?\n---\r?\n?(.*)\z/s
  @codigo_valido ~r/^T-\d{3,}[a-z]*$/i

  defp parse_tarefa(conteudo, nome_arquivo) do
    case Regex.run(@frontmatter, conteudo) do
      [_tudo, bloco, resto] ->
        validar_e_montar(parse_linhas_frontmatter(bloco), resto, nome_arquivo)

      nil ->
        {:erro, "arquivo sem bloco de frontmatter (--- ... ---)",
         %{codigo: codigo_do_nome(nome_arquivo) || "T-000", titulo: nome_arquivo}}
    end
  end

  defp parse_linhas_frontmatter(bloco) do
    bloco
    |> String.split(~r/\r?\n/)
    |> Enum.reduce(%{}, fn linha, campos ->
      case Regex.run(~r/^([a-zA-Z-]+):\s*(.*)$/, linha) do
        [_tudo, chave, valor] -> Map.put(campos, chave, String.trim(valor))
        nil -> campos
      end
    end)
  end

  defp validar_e_montar(campos, resto, nome_arquivo) do
    codigo = campos["id"]
    titulo = destituir_aspas(campos["titulo"])
    status_bruto = campos["status"]

    cond do
      codigo_invalido?(codigo) ->
        {:erro, "id ausente ou fora do formato T-NNN no frontmatter (#{inspect(codigo)})",
         %{codigo: codigo_do_nome(nome_arquivo) || "T-000", titulo: titulo || nome_arquivo}}

      titulo_invalido?(titulo) ->
        {:erro, "titulo ausente no frontmatter", %{codigo: codigo, titulo: nome_arquivo}}

      status_invalido?(status_bruto) ->
        {:erro, "status desconhecido: #{inspect(status_bruto)}",
         %{codigo: codigo, titulo: titulo}}

      true ->
        {:ok, montar_dados(codigo, titulo, campos, resto)}
    end
  end

  defp codigo_invalido?(codigo), do: is_nil(codigo) or not Regex.match?(@codigo_valido, codigo)
  defp titulo_invalido?(titulo), do: is_nil(titulo) or titulo == ""

  defp status_invalido?(status_bruto),
    do: is_nil(status_bruto) or status_bruto not in @estados_hifenizados

  defp montar_dados(codigo, titulo, campos, resto) do
    %{
      codigo: codigo,
      titulo: titulo,
      status: status_atom(campos["status"]),
      prioridade: prioridade_atom(campos["prioridade"]),
      agente: presenca(campos["agente"]),
      replanejada_de: presenca(campos["replanejada-de"]),
      dependencias: parse_lista(campos["dependencias"]),
      areas: parse_lista(campos["areas"]),
      objetivo: secao(resto, "Objetivo"),
      contexto: secao(resto, "Contexto"),
      criterios: parse_criterios(secao(resto, "Criterios de aceite")),
      ciclos: parse_ciclos(resto)
    }
    # `Map.put/3` de proposito, e nao `%{tentativas: ...}`: o guarda de escrita unica de
    # `transicao_test.exs` varre o CODIGO de producao atras do padrao sintatico
    # `tentativas:` — e esta funcao so LE o frontmatter, nunca decide o contador.
    |> Map.put(:tentativas, parse_inteiro(campos["tentativas"], 0))
  end

  defp status_atom(bruto), do: bruto |> String.replace("-", "_") |> String.to_existing_atom()

  @prioridades ~w(alta media baixa)
  defp prioridade_atom(bruto) when bruto in @prioridades, do: String.to_existing_atom(bruto)
  defp prioridade_atom(_bruto), do: :media

  defp secao(texto, nome) do
    padrao = ~r/^## #{Regex.escape(nome)}\s*\n(.*?)(?=\n## |\z)/ms

    case Regex.run(padrao, texto) do
      [_tudo, corpo] -> String.trim(corpo)
      nil -> ""
    end
  end

  # --- criterios de aceite -------------------------------------------------------------------

  defp parse_criterios(""), do: []

  defp parse_criterios(corpo) do
    corpo
    |> String.split(~r/\r?\n/)
    |> Enum.reduce([], &linha_de_criterio/2)
    |> Enum.reverse()
  end

  defp linha_de_criterio(linha, acumulado) do
    cond do
      Regex.match?(~r/^- \[.\]\s*/, linha) ->
        texto = linha |> String.replace(~r/^- \[.\]\s*/, "") |> String.trim()
        [%{texto: texto, comando: nil} | acumulado]

      captura = Regex.run(~r/^\s*`verificar:\s*(.+?)`\s*$/, linha) ->
        acrescentar_comando(captura, acumulado)

      true ->
        acumulado
    end
  end

  defp acrescentar_comando([_tudo, comando], [atual | resto]),
    do: [%{atual | comando: comando} | resto]

  defp acrescentar_comando(_captura, []), do: []

  # --- ciclos, a partir de Notas/Verificacao/Conformidade/Revisao ----------------------------

  defp parse_ciclos(resto) do
    notas = secao(resto, "Notas de execucao") |> parse_ciclos_secao()
    verificacao = secao(resto, "Verificacao") |> parse_ciclos_secao()
    conformidade = secao(resto, "Conformidade") |> parse_ciclos_secao()
    revisao = secao(resto, "Revisao") |> parse_ciclos_secao()

    construtor = Enum.map(notas, &ciclo("construtor", &1, relatorio: true))
    verificador = Enum.map(verificacao, &ciclo("verificador", &1, relatorio: true))

    construtor ++ verificador ++ mesclar_revisor(conformidade, revisao)
  end

  defp ciclo(papel, {numero, texto}, relatorio: true) do
    %{numero: numero, papel: papel, relatorio: presenca(texto), desfecho: nil}
  end

  defp mesclar_revisor(conformidade, revisao) do
    numeros =
      (Enum.map(conformidade, &elem(&1, 0)) ++ Enum.map(revisao, &elem(&1, 0)))
      |> Enum.uniq()
      |> Enum.sort()

    Enum.map(numeros, fn numero ->
      %{
        numero: numero,
        papel: "revisor",
        desfecho: numero |> buscar(conformidade) |> extrair_desfecho(),
        relatorio: numero |> buscar(revisao) |> extrair_texto()
      }
    end)
  end

  defp buscar(numero, lista), do: Enum.find(lista, fn {n, _texto} -> n == numero end)

  defp extrair_desfecho(nil), do: nil

  # So a PRIMEIRA LINHA depois do prefixo, com ou sem `### Ciclo N`: a secao real (T-076)
  # continua com paragrafos de justificativa na mesma "secao" do ciclo, e `desfecho` e
  # coluna de VEREDITO (`cumpre`/`nao-cumpre`/`cumpre-parcial`), nao de prosa. Pegar o
  # texto inteiro apos o prefixo, como fazia antes, e o que produzia valor de centenas de
  # bytes para uma coluna de 255.
  defp extrair_desfecho({_numero, texto}) do
    prefixo = "Conformidade: "

    corpo =
      if String.starts_with?(texto, prefixo) do
        String.slice(texto, byte_size(prefixo)..-1//1)
      else
        texto
      end

    corpo
    |> String.split(~r/\r?\n/, parts: 2)
    |> List.first()
    |> String.trim()
    |> presenca()
  end

  defp extrair_texto(nil), do: nil
  defp extrair_texto({_numero, texto}), do: presenca(texto)

  defp parse_ciclos_secao(""), do: []

  defp parse_ciclos_secao(corpo) do
    if String.contains?(corpo, "### Ciclo ") do
      ~r/^### Ciclo (\d+)\n(.*?)(?=\n### Ciclo |\z)/ms
      |> Regex.scan(corpo)
      |> Enum.map(fn [_tudo, numero, texto] ->
        {String.to_integer(numero), String.trim(texto)}
      end)
    else
      [{1, corpo}]
    end
  end

  # --- gravacao da tarefa e dos filhos ---------------------------------------------------------

  defp upsert_tarefa(projeto, dados) do
    atributos = %{
      "projeto_id" => projeto.id,
      "codigo" => dados.codigo,
      "titulo" => dados.titulo,
      "objetivo" => vazio_para_nil(dados.objetivo),
      "contexto" => vazio_para_nil(dados.contexto),
      "status" => Atom.to_string(dados.status),
      "prioridade" => Atom.to_string(dados.prioridade),
      "tentativas" => dados.tentativas,
      "especialista_id" => resolver_especialista_id(projeto, dados.agente)
    }

    tarefa = gravar_tarefa(projeto, dados.codigo, atributos)

    substituir_areas(tarefa, dados.areas)
    substituir_criterios(tarefa, dados.criterios)
    truncamentos = substituir_ciclos(tarefa, dados.ciclos)

    {tarefa, truncamentos}
  end

  defp upsert_tarefa_bloqueada(projeto, parciais, motivo) do
    codigo = parciais.codigo

    atributos = %{
      "projeto_id" => projeto.id,
      "codigo" => codigo,
      "titulo" => parciais.titulo,
      "status" => "bloqueada"
    }

    tarefa = gravar_tarefa(projeto, codigo, atributos)

    # `desfecho: "bloqueada"` (9 bytes) nunca precisa de truncamento; ignorado de proposito.
    _truncamentos =
      substituir_ciclos(tarefa, [
        %{numero: 1, papel: "importacao", desfecho: "bloqueada", relatorio: motivo}
      ])

    tarefa
  end

  defp gravar_tarefa(projeto, codigo, atributos) do
    case Repo.get_by(Tarefa, projeto_id: projeto.id, codigo: codigo) do
      nil -> Repo.insert!(Tarefa.changeset(%Tarefa{}, atributos))
      existente -> Repo.update!(Tarefa.changeset(existente, atributos))
    end
  end

  defp resolver_especialista_id(_projeto, nil), do: nil

  defp resolver_especialista_id(projeto, identificador) do
    case Equipe.ativo(projeto.id, identificador) do
      nil -> nil
      especialista -> especialista.id
    end
  end

  defp substituir_areas(tarefa, caminhos) do
    Repo.delete_all(from(a in Area, where: a.tarefa_id == ^tarefa.id))

    Enum.each(caminhos, fn caminho ->
      Repo.insert!(Area.changeset(%Area{}, %{"tarefa_id" => tarefa.id, "caminho" => caminho}))
    end)
  end

  defp substituir_criterios(tarefa, criterios) do
    Repo.delete_all(from(c in Criterio, where: c.tarefa_id == ^tarefa.id))
    Enum.each(criterios, &inserir_criterio(tarefa, &1))
  end

  defp inserir_criterio(tarefa, criterio) do
    grau = if criterio[:comando], do: "executado", else: "inspecionado"

    Repo.insert!(
      Criterio.changeset(%Criterio{}, %{
        "tarefa_id" => tarefa.id,
        "texto" => criterio.texto,
        "comando" => criterio[:comando],
        "grau" => grau
      })
    )
  end

  defp substituir_ciclos(tarefa, ciclos) do
    Repo.delete_all(from(c in Ciclo, where: c.tarefa_id == ^tarefa.id))
    Enum.flat_map(ciclos, &inserir_ciclo(tarefa, &1))
  end

  # Rede de seguranca ALEM da extracao corrigida (`extrair_desfecho/1`): mesmo com o veredito
  # isolado, uma linha unica sem quebra pode passar de 255 bytes. Cortar ANTES do
  # `Repo.insert!` e o que o criterio da T-076 pede — sem isso, uma tarefa com um valor
  # grande demais derruba o import inteiro, e nao so a tarefa dela.
  defp inserir_ciclo(tarefa, ciclo) do
    {desfecho, truncamento} = limitar_desfecho(ciclo.desfecho)

    Repo.insert!(
      Ciclo.changeset(%Ciclo{}, %{
        "tarefa_id" => tarefa.id,
        "numero" => ciclo.numero,
        "papel" => ciclo.papel,
        "desfecho" => desfecho,
        "relatorio" => ciclo.relatorio
      })
    )

    List.wrap(truncamento)
  end

  defp limitar_desfecho(nil), do: {nil, nil}

  defp limitar_desfecho(texto) do
    tamanho_original = byte_size(texto)

    if tamanho_original > @limite_desfecho do
      {truncar_bytes_utf8(texto, @limite_desfecho),
       %{campo: "desfecho", tamanho_original: tamanho_original}}
    else
      {texto, nil}
    end
  end

  # `String.slice/3` corta por CARACTERE, nao por byte: um acento perto do limite ainda
  # deixaria a coluna varchar(255) estourar. Corta o binario cru e apara byte a byte ate
  # sobrar UTF-8 valido, porque um caractere multibyte pode ficar pela metade no corte.
  defp truncar_bytes_utf8(binario, limite) do
    binario |> binary_part(0, limite) |> aparar_ate_utf8_valido()
  end

  defp aparar_ate_utf8_valido(<<>>), do: <<>>

  defp aparar_ate_utf8_valido(binario) do
    if String.valid?(binario) do
      binario
    else
      aparar_ate_utf8_valido(binary_part(binario, 0, byte_size(binario) - 1))
    end
  end

  # --- segunda passada: dependencias e replanejada_de ------------------------------------------

  defp resolver_dependencias(_projeto, %{bloqueada?: true}), do: :ok

  defp resolver_dependencias(projeto, resultado) do
    atualizar_replanejada_de(projeto, resultado)

    Repo.delete_all(from(d in Dependencia, where: d.tarefa_id == ^resultado.tarefa_id))
    Enum.each(resultado.dependencias, &inserir_dependencia(projeto, resultado.tarefa_id, &1))
  end

  defp atualizar_replanejada_de(_projeto, %{replanejada_de: nil}), do: :ok

  defp atualizar_replanejada_de(projeto, resultado) do
    origem_id =
      case Repo.get_by(Tarefa, projeto_id: projeto.id, codigo: resultado.replanejada_de) do
        nil -> nil
        origem -> origem.id
      end

    Repo.get!(Tarefa, resultado.tarefa_id)
    |> Tarefa.changeset(%{"replanejada_de_id" => origem_id})
    |> Repo.update!()
  end

  defp inserir_dependencia(projeto, tarefa_id, codigo_dependencia) do
    case Repo.get_by(Tarefa, projeto_id: projeto.id, codigo: codigo_dependencia) do
      nil ->
        :ignorar

      depende_de ->
        Repo.insert!(
          Dependencia.changeset(%Dependencia{}, %{
            "tarefa_id" => tarefa_id,
            "depende_de_id" => depende_de.id
          })
        )
    end
  end

  # --- helpers de leitura ------------------------------------------------------------------------

  defp codigo_do_nome(nome_arquivo) do
    case Regex.run(~r/^(T-\d{3,}[a-z]*)/i, nome_arquivo) do
      [_tudo, codigo] -> codigo
      nil -> nil
    end
  end

  defp presenca(nil), do: nil
  defp presenca(""), do: nil
  defp presenca(valor), do: valor

  # Sem clausula para `nil`: os dois chamadores passam sempre o resultado de `secao/2`, que
  # devolve `""` (nunca `nil`) quando a secao nao existe no markdown — clausula para `nil`
  # aqui era codigo morto que o Dialyzer ja provava inalcancavel (`pattern_match`).
  defp vazio_para_nil(""), do: nil
  defp vazio_para_nil(valor), do: valor

  defp parse_lista(nil), do: []

  defp parse_lista(bruto) do
    bruto
    |> String.trim()
    |> String.trim_leading("[")
    |> String.trim_trailing("]")
    |> String.split(",")
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
  end

  defp parse_inteiro(nil, padrao), do: padrao

  defp parse_inteiro(bruto, padrao) do
    case Integer.parse(bruto) do
      {numero, _resto} -> numero
      :error -> padrao
    end
  end

  defp destituir_aspas(nil), do: nil

  defp destituir_aspas(valor) do
    valor = String.trim(valor)

    if String.starts_with?(valor, "\"") and String.ends_with?(valor, "\"") and
         byte_size(valor) >= 2 do
      String.slice(valor, 1..-2//1)
    else
      valor
    end
  end
end
