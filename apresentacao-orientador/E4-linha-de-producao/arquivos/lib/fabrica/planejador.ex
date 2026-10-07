defmodule Fabrica.Planejador do
  @moduledoc """
  Traduz um pedido em linguagem natural num grafo de 8 a 12 tarefas, gravado no banco numa
  única transação — ou nada é gravado (T-058, D-006).

  ## O plano vem no TEXTO da última mensagem, não por `registrar_resultado`

  `Fabrica.Ferramentas.RegistrarResultado` aceita `resumo, arquivos, comandos, commit,
  impedimento` — campos pensados para um relatório de CONSTRUÇÃO, sem forma óbvia para "uma
  lista de tarefas com dependências". Em vez de ampliar esse contrato, o agente devolve o
  plano como um bloco de código ` ```json ` na ÚLTIMA mensagem da conversa
  (`priv/doutrina/planejador.md` define o formato exato); este módulo extrai e valida esse
  bloco DEPOIS que o operário responde, e só então grava.

  ## Por que `Fabrica.Operario.conversar/2` direto, e não `Fabrica.Agente.Laco.rodar/1`

  `Fabrica.Agente.Laco`, para a família `:agente_completo`, nunca anexa a resposta final ao
  estado (`tratar_resposta(:agente_completo, ...)` contabiliza e para, sem
  `Estado.anexar_turno/3`) — e `Estado.resumo/1` não expõe `blocos`. Ou seja, hoje não há
  caminho, pela API pública do `Laco`, para recuperar o texto onde o plano mora. Corrigir isso
  mudaria `lib/fabrica/agente/laco.ex`, fora das `areas` desta tarefa. Como planejar não
  precisa do laço de ferramentas da fábrica (a exploração roda inteira dentro de UMA sessão do
  adaptador `:agente_completo`, e um adaptador `:endpoint_de_modelo` como o `Falso` é
  exercitado com uma única resposta roteirizada), uma troca só com o operário basta.

  ## A transação

  Todas as `Fabrica.Tarefas.Tarefa`, `Fabrica.Tarefas.Area`, `Fabrica.Tarefas.Criterio` e
  `Fabrica.Tarefas.Dependencia` do plano entram no mesmo `Ecto.Multi`. Resposta sem JSON válido,
  contagem de tarefas fora de 8..12, área terminando em `/` (pasta) ou grafo de dependências
  com ciclo são recusados ANTES de tocar o banco — e uma falha de changeset no meio do `Multi`
  desfaz tudo. Nunca há tarefa parcial.

  ## Códigos são gerados pelo sistema, nunca pelo agente

  O JSON usa `id` (um inteiro local à própria lista, 1..N) só para expressar `dependencias`
  dentro do plano. O código real (`T-NNN`) é atribuído aqui, continuando a numeração que o
  projeto já tem — o agente não inventa `T-NNN`, pela mesma razão que ele não escreve
  `status`/`tentativas`: são campos do sistema.
  """

  import Ecto.Query, only: [from: 2]

  alias Ecto.Multi
  alias Fabrica.Equipe.Resolucao
  alias Fabrica.Ferramentas.Catalogo
  alias Fabrica.Indice.Mapa
  alias Fabrica.Operario
  alias Fabrica.Operario.Requisicao
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Prompt.Prefixo
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Area
  alias Fabrica.Tarefas.Criterio
  alias Fabrica.Tarefas.Dependencia
  alias Fabrica.Tarefas.Tarefa

  @papel "planejador"
  @modelo_padrao "sonnet-5"
  @teto_de_voltas_padrao 30
  @minimo_tarefas 8
  @maximo_tarefas 12
  @graus_validos ~w[executado inspecionado julgado]

  @doc """
  Planeja `pedido` para `projeto` (novo ou existente), despachando o papel `"planejador"`.

  `opcoes` aceita `:modelo` (padrão `#{inspect(@modelo_padrao)}`), `:teto_de_voltas` (padrão
  #{@teto_de_voltas_padrao}), `:agulha` (a agulha do `Fabrica.Operario.Falso`, obrigatória em
  teste) e `:raiz` (padrão `projeto.caminho`, repassada à auditoria de confinamento do
  `Fabrica.Operario.ClaudeCLI`).

  Devolve `{:ok, %{projeto: projeto, tarefas: [tarefa, ...]}}` com as tarefas já persistidas e
  pré-carregadas (`:areas`, `:criterios`, `:dependencias`), ou `{:erro, motivo}` sem ter
  gravado nada.
  """
  @spec planejar(String.t(), Projeto.t(), keyword()) :: {:ok, map()} | {:erro, term()}
  def planejar(pedido, %Projeto{} = projeto, opcoes \\ []) when is_binary(pedido) do
    with {:ok, resposta} <- consultar(pedido, projeto, opcoes),
         {:ok, bruto} <- extrair_json(resposta.blocos),
         {:ok, tarefas} <- validar_plano(bruto) do
      gravar(projeto, tarefas)
    end
  end

  # --- a troca com o operario -------------------------------------------------------------

  defp consultar(pedido, projeto, opcoes) do
    modelo = Keyword.get(opcoes, :modelo, @modelo_padrao)

    requisicao = %Requisicao{
      modelo: modelo,
      papel: @papel,
      prefixo: prefixo(projeto, modelo),
      mensagens: [%{papel: :usuario, conteudo: pedido}],
      ferramentas: ferramentas_do_papel(),
      teto_de_voltas: Keyword.get(opcoes, :teto_de_voltas, @teto_de_voltas_padrao)
    }

    opcoes_do_operario =
      opcoes
      |> Keyword.take([:agulha, :raiz])
      |> Keyword.put_new(:raiz, projeto.caminho)

    case Operario.conversar(requisicao, opcoes_do_operario) do
      {:ok, resposta} -> {:ok, resposta}
      {:erro, motivo} -> {:erro, {:operario, motivo}}
    end
  end

  defp ferramentas_do_papel do
    case Catalogo.do_papel(@papel) do
      {:ok, ferramentas} -> Map.keys(ferramentas)
      {:erro, _motivo} -> []
    end
  end

  # O planejador nao trabalha sobre uma Tarefa existente (Fabrica.Despacho pressupoe isso),
  # entao a doutrina e montada aqui: papel generico, sem especialista (nao ha tarefa da qual
  # ler tarefa.especialista), indice do projeto ALVO. O pedido em si NAO entra no prefixo —
  # ele muda a cada chamada, e vai como mensagem, igual a faixa `:tarefa` faria com uma tarefa.
  defp prefixo(projeto, modelo) do
    doutrina =
      :planejador
      |> Resolucao.resolver(nil, [])
      |> Resolucao.doutrina(doutrina_texto())

    indice = [raiz: projeto.caminho] |> Mapa.extrair() |> Mapa.render()

    modelo
    |> Prefixo.montar(ferramentas: ferramentas_do_papel(), doutrina: doutrina, indice: indice)
    |> Map.fetch!(:blocos)
    |> Enum.map(&operario_bloco/1)
  end

  defp operario_bloco(%Fabrica.Prompt.Bloco{texto: texto, ponto_de_cache: ponto_de_cache}) do
    %Fabrica.Operario.Bloco{texto: texto, ponto_de_cache: ponto_de_cache}
  end

  defp doutrina_texto do
    :fabrica
    |> Application.app_dir("priv")
    |> Path.join("doutrina/planejador.md")
    |> File.read!()
  end

  # --- extrair o JSON da ultima mensagem ---------------------------------------------------

  defp extrair_json(blocos) do
    texto =
      blocos
      |> Enum.filter(&(&1[:tipo] == :texto))
      |> Enum.map_join("\n", &(&1[:texto] || ""))

    case ultimo_bloco_json(texto) do
      nil ->
        {:erro, {:resposta_sem_json, texto}}

      corpo ->
        case Jason.decode(corpo) do
          {:ok, mapa} -> {:ok, mapa}
          {:error, motivo} -> {:erro, {:json_invalido, motivo}}
        end
    end
  end

  # O ULTIMO bloco cercado por ```json ... ``` — se o agente explorou o projeto e por acaso
  # topou com um outro trecho cercado por crase tripla no meio do caminho, e o final da
  # conversa que decide, nunca o primeiro.
  defp ultimo_bloco_json(texto) do
    ~r/```(?:json)?\s*\n(.*?)\n```/s
    |> Regex.scan(texto)
    |> List.last()
    |> case do
      [_, corpo] -> corpo
      _ -> nil
    end
  end

  # --- validar o plano, antes de tocar o banco -------------------------------------------

  defp validar_plano(%{"tarefas" => tarefas}) when is_list(tarefas) do
    cond do
      length(tarefas) not in @minimo_tarefas..@maximo_tarefas ->
        {:erro, {:quantidade_de_tarefas_fora_da_faixa, length(tarefas)}}

      (motivo = validar_tarefas(tarefas)) != :ok ->
        motivo

      (motivo = validar_dependencias(tarefas)) != :ok ->
        motivo

      true ->
        {:ok, normalizar(tarefas)}
    end
  end

  defp validar_plano(_outro), do: {:erro, {:plano_invalido, :campo_tarefas_ausente}}

  defp validar_tarefas(tarefas) do
    ids = Enum.map(tarefas, & &1["id"])

    cond do
      Enum.any?(tarefas, &tarefa_invalida?/1) -> {:erro, :tarefa_incompleta}
      Enum.uniq(ids) != ids -> {:erro, :id_duplicado}
      true -> :ok
    end
  end

  defp tarefa_invalida?(tarefa) do
    vazio?(tarefa["id"]) or vazio?(tarefa["titulo"]) or vazio?(tarefa["objetivo"]) or
      not areas_validas?(tarefa["areas"]) or not criterios_validos?(tarefa["criterios"])
  end

  defp vazio?(nil), do: true
  defp vazio?(valor) when is_binary(valor), do: String.trim(valor) == ""
  defp vazio?(_valor), do: false

  defp areas_validas?(areas) when is_list(areas) and areas != [],
    do: Enum.all?(areas, &area_valida?/1)

  defp areas_validas?(_areas), do: false

  # "Nunca pasta" (Fabrica.Tarefas.Area): recusa o que termina em separador de diretorio.
  defp area_valida?(area) do
    is_binary(area) and String.trim(area) != "" and not String.ends_with?(area, "/") and
      not String.ends_with?(area, "\\")
  end

  defp criterios_validos?(criterios) when is_list(criterios) and criterios != [],
    do: Enum.all?(criterios, &criterio_valido?/1)

  defp criterios_validos?(_criterios), do: false

  defp criterio_valido?(%{"texto" => texto} = criterio) do
    not vazio?(texto) and grau_valido?(criterio["grau"])
  end

  defp criterio_valido?(_criterio), do: false

  defp grau_valido?(nil), do: true
  defp grau_valido?(grau), do: grau in @graus_validos

  defp validar_dependencias(tarefas) do
    ids = MapSet.new(tarefas, & &1["id"])
    grafo = Map.new(tarefas, &{&1["id"], List.wrap(&1["dependencias"])})

    cond do
      Enum.any?(grafo, fn {_id, deps} -> Enum.any?(deps, &(&1 not in ids)) end) ->
        {:erro, :dependencia_desconhecida}

      grafo_com_ciclo?(grafo) ->
        {:erro, :dependencias_com_ciclo}

      true ->
        :ok
    end
  end

  # DFS com tres cores: :branco (nao visitado), :cinza (no caminho atual — achar um cinza de
  # novo E o ciclo), :preto (terminado, sem ciclo alcancavel a partir dele).
  defp grafo_com_ciclo?(grafo) do
    estado_inicial = Map.new(grafo, fn {no, _} -> {no, :branco} end)

    {_estado, ciclo?} =
      Enum.reduce(Map.keys(grafo), {estado_inicial, false}, &visitar(grafo, &1, &2))

    ciclo?
  end

  defp visitar(_grafo, _no, {_estado, true} = acumulado), do: acumulado

  defp visitar(grafo, no, {estado, false}) do
    case Map.fetch!(estado, no) do
      :preto ->
        {estado, false}

      :cinza ->
        {estado, true}

      :branco ->
        estado = Map.put(estado, no, :cinza)

        {estado, ciclo?} =
          Enum.reduce(Map.fetch!(grafo, no), {estado, false}, &visitar(grafo, &1, &2))

        {Map.put(estado, no, :preto), ciclo?}
    end
  end

  defp normalizar(tarefas), do: Enum.map(tarefas, &normalizar_tarefa/1)

  defp normalizar_tarefa(tarefa) do
    %{
      id: tarefa["id"],
      titulo: String.trim(tarefa["titulo"]),
      objetivo: String.trim(tarefa["objetivo"]),
      contexto: tarefa["contexto"] |> texto_ou_vazio() |> String.trim(),
      areas: Enum.map(tarefa["areas"], &String.trim/1),
      criterios: Enum.map(tarefa["criterios"], &normalizar_criterio/1),
      dependencias: List.wrap(tarefa["dependencias"])
    }
  end

  defp texto_ou_vazio(nil), do: ""
  defp texto_ou_vazio(texto), do: texto

  defp normalizar_criterio(criterio) do
    comando = comando_ou_nil(criterio["comando"])

    grau =
      cond do
        comando != nil -> :executado
        criterio["grau"] in @graus_validos -> String.to_existing_atom(criterio["grau"])
        true -> :inspecionado
      end

    %{texto: String.trim(criterio["texto"]), comando: comando, grau: grau}
  end

  defp comando_ou_nil(nil), do: nil

  defp comando_ou_nil(comando) do
    case String.trim(comando) do
      "" -> nil
      comando -> comando
    end
  end

  # --- gravar tudo numa transacao ----------------------------------------------------------

  defp gravar(projeto, tarefas) do
    proximo = proximo_numero(projeto)

    projeto
    |> montar_multi(tarefas, proximo)
    |> Repo.transaction()
    |> case do
      {:ok, mudancas} -> {:ok, %{projeto: projeto, tarefas: tarefas_gravadas(mudancas, tarefas)}}
      {:error, etapa, motivo, _mudancas} -> {:erro, {:falha_ao_gravar, etapa, motivo}}
    end
  end

  defp proximo_numero(projeto) do
    Tarefa
    |> from(where: [projeto_id: ^projeto.id], select: [:codigo])
    |> Repo.all()
    |> Enum.map(&numero_do_codigo(&1.codigo))
    |> Enum.max(fn -> 0 end)
    |> Kernel.+(1)
  end

  defp numero_do_codigo(codigo) do
    case Regex.run(~r/^T-(\d+)/i, codigo) do
      [_, numero] -> String.to_integer(numero)
      _outro -> 0
    end
  end

  defp codigo(numero), do: "T-#{numero |> Integer.to_string() |> String.pad_leading(3, "0")}"

  defp montar_multi(projeto, tarefas, proximo_numero) do
    tarefas
    |> Enum.with_index()
    |> Enum.reduce(Multi.new(), fn {tarefa, indice}, multi ->
      multi
      |> inserir_tarefa(projeto, tarefa, codigo(proximo_numero + indice))
      |> inserir_areas(tarefa)
      |> inserir_criterios(tarefa)
    end)
    |> inserir_dependencias(tarefas)
  end

  defp inserir_tarefa(multi, projeto, tarefa, codigo) do
    atributos = %{
      projeto_id: projeto.id,
      codigo: codigo,
      titulo: tarefa.titulo,
      objetivo: tarefa.objetivo,
      contexto: tarefa.contexto
    }

    Multi.insert(multi, {:tarefa, tarefa.id}, Tarefa.changeset(%Tarefa{}, atributos))
  end

  defp inserir_areas(multi, tarefa) do
    tarefa.areas
    |> Enum.with_index()
    |> Enum.reduce(multi, fn {caminho, indice}, multi ->
      Multi.insert(multi, {:area, tarefa.id, indice}, fn mudancas ->
        Area.changeset(%Area{}, %{
          tarefa_id: Map.fetch!(mudancas, {:tarefa, tarefa.id}).id,
          caminho: caminho
        })
      end)
    end)
  end

  defp inserir_criterios(multi, tarefa) do
    tarefa.criterios
    |> Enum.with_index()
    |> Enum.reduce(multi, fn {criterio, indice}, multi ->
      Multi.insert(multi, {:criterio, tarefa.id, indice}, fn mudancas ->
        Criterio.changeset(%Criterio{}, %{
          tarefa_id: Map.fetch!(mudancas, {:tarefa, tarefa.id}).id,
          texto: criterio.texto,
          comando: criterio.comando,
          grau: criterio.grau
        })
      end)
    end)
  end

  defp inserir_dependencias(multi, tarefas) do
    Enum.reduce(tarefas, multi, &inserir_dependencias_da_tarefa/2)
  end

  defp inserir_dependencias_da_tarefa(tarefa, multi) do
    tarefa.dependencias
    |> Enum.with_index()
    |> Enum.reduce(multi, fn {depende_de, indice}, multi ->
      Multi.insert(multi, {:dependencia, tarefa.id, indice}, fn mudancas ->
        Dependencia.changeset(%Dependencia{}, %{
          tarefa_id: Map.fetch!(mudancas, {:tarefa, tarefa.id}).id,
          depende_de_id: Map.fetch!(mudancas, {:tarefa, depende_de}).id
        })
      end)
    end)
  end

  defp tarefas_gravadas(mudancas, tarefas) do
    tarefas
    |> Enum.map(&Map.fetch!(mudancas, {:tarefa, &1.id}))
    |> Enum.map(&Repo.preload(&1, [:areas, :criterios, :dependencias]))
  end
end
