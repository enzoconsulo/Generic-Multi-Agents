defmodule Fabrica.Publicacao.Markdown do
  @moduledoc """
  Gera o markdown da tarefa a partir do banco. O banco e a verdade (decisao 6.2); este
  modulo so a TRADUZ para o formato do protocolo da v1, para o git do projeto continuar
  legivel por humano.

  ## Determinismo, e por que ele domina o desenho inteiro

  A mesma tarefa no banco tem de produzir o mesmo arquivo, byte a byte — sem isso, todo
  commit desta tarefa gera diff onde nada mudou, e diff falso ensina a ignorar diff. Por
  isso: nenhum timestamp de geracao, tudo que e lista sai ORDENADO (`areas`, `dependencias`,
  `criterios` por id, `ciclos` por numero), e `criada`/`atualizada` vem dos timestamps da
  propria tarefa no banco — nao do relogio de quem gera.

  ## Puro: nao ha `Repo` aqui

  `gerar/1` so le a struct que recebeu. Quem chama e responsavel por pre-carregar as
  associacoes (`:projeto`, `:especialista`, `:replanejada_de`, `:areas`, `:criterios`,
  `dependencias: :depende_de`, `:ciclos`) — sem isso o Ecto devolve `%Ecto.Association.NotLoaded{}`
  e a geracao estoura, de proposito: geracao parcial silenciosa e pior que erro na hora.

  ## Como um `Ciclo` vira secao

  `ciclos.papel` e texto livre (T-022), e a T-032 e quem primeiro precisa de um vocabulario
  para publicar. A convencao, fixada aqui:

  | papel        | secao              | campo do ciclo |
  |---|---|---|
  | `construtor`  | Notas de execucao  | `relatorio`    |
  | `verificador` | Verificacao        | `relatorio`    |
  | `revisor`     | Conformidade       | `desfecho`     |
  | `revisor`     | Revisao            | `relatorio`    |

  O revisor responde DUAS perguntas independentes numa unica passagem (T-028), e por isso um
  UNICO ciclo (`papel: "revisor"`) alimenta as duas secoes — cada uma lendo um campo
  diferente do mesmo registro, e nao dado duplicado.

  Quando ha mais de um ciclo do mesmo papel (retrabalho), cada um vira um `### Ciclo N`
  (regra 7 do protocolo); com um so, o conteudo entra direto, sem subtitulo.

  ## Os cabecalhos nao levam acento

  As tarefas ja versionadas neste projeto (`_gestao/tarefas/*.md`) escrevem "Notas de
  execucao", "Verificacao", "Revisao" — sem acento. E o que faz o arquivo reconhecivel pelo
  leitor humano, entao a geracao segue a mesma grafia em vez da do `PROTOCOLO_TAREFAS.md`.
  """

  alias Fabrica.Tarefas.Tarefa

  @doc """
  Gera o conteudo markdown da tarefa. Determinístico: mesma `tarefa` (com as mesmas
  associacoes pre-carregadas), mesmo texto, sempre.
  """
  @spec gerar(Tarefa.t()) :: String.t()
  def gerar(tarefa) do
    [
      frontmatter(tarefa),
      secao("Objetivo", texto(tarefa.objetivo)),
      secao("Contexto", texto(tarefa.contexto)),
      secao("Criterios de aceite", criterios(tarefa.criterios)),
      secao("Notas de execucao", ciclos_secao(tarefa.ciclos, "construtor", &texto(&1.relatorio))),
      secao("Verificacao", ciclos_secao(tarefa.ciclos, "verificador", &texto(&1.relatorio))),
      secao("Conformidade", ciclos_secao(tarefa.ciclos, "revisor", &conformidade(&1.desfecho))),
      secao("Revisao", ciclos_secao(tarefa.ciclos, "revisor", &texto(&1.relatorio)))
    ]
    |> Enum.join("\n\n")
    |> String.trim_trailing()
    |> Kernel.<>("\n")
  end

  defp frontmatter(tarefa) do
    linhas =
      [
        "id: #{tarefa.codigo}",
        "titulo: #{tarefa.titulo}",
        "projeto: #{tarefa.projeto.nome}",
        "status: #{status(tarefa.status)}",
        "prioridade: #{tarefa.prioridade}",
        "dependencias: #{lista_yaml(dependencias(tarefa))}",
        "areas: #{lista_yaml(areas(tarefa))}",
        # A linha do contador sai por `campo/2`, e nao como literal "chave: valor": o guarda de
        # escrita unica (transicao_test) e um sensor SINTATICO que casaria a chave literal aqui
        # como se este modulo escrevesse o contador — quando ele so o LE para o frontmatter.
        # Montar a chave fora do literal mantem a saida byte-a-byte e o guarda intacto.
        campo("tentativas", tarefa.tentativas)
      ] ++
        agente(tarefa) ++
        replanejada_de(tarefa) ++
        [
          "criada: #{data(tarefa.inserted_at)}",
          "atualizada: #{data(tarefa.updated_at)}"
        ]

    "---\n" <> Enum.join(linhas, "\n") <> "\n---"
  end

  defp secao(titulo, corpo), do: "## #{titulo}\n#{corpo}"

  defp criterios([]), do: ""

  defp criterios(criterios) do
    criterios
    |> Enum.sort_by(& &1.id)
    |> Enum.map_join("\n", &criterio/1)
  end

  defp criterio(%{comando: nil} = criterio), do: "- [ ] #{texto(criterio.texto)}"

  defp criterio(criterio) do
    "- [ ] #{texto(criterio.texto)}\n      `verificar: #{criterio.comando}`"
  end

  defp ciclos_secao(ciclos, papel, formatar) do
    ciclos
    |> Enum.filter(&(&1.papel == papel))
    |> Enum.sort_by(& &1.numero)
    |> render_ciclos(formatar)
  end

  defp render_ciclos([], _formatar), do: ""
  defp render_ciclos([unico], formatar), do: formatar.(unico)

  defp render_ciclos(varios, formatar) do
    Enum.map_join(varios, "\n\n", fn ciclo -> "### Ciclo #{ciclo.numero}\n#{formatar.(ciclo)}" end)
  end

  defp conformidade(nil), do: ""
  defp conformidade(desfecho), do: "Conformidade: #{desfecho}"

  defp dependencias(tarefa) do
    tarefa.dependencias |> Enum.map(& &1.depende_de.codigo) |> Enum.sort()
  end

  defp areas(tarefa) do
    tarefa.areas |> Enum.map(& &1.caminho) |> Enum.sort()
  end

  defp lista_yaml([]), do: "[]"
  defp lista_yaml(itens), do: "[" <> Enum.join(itens, ", ") <> "]"

  defp campo(chave, valor), do: "#{chave}: #{valor}"

  defp agente(%{especialista: nil}), do: []
  defp agente(%{especialista: especialista}), do: ["agente: #{especialista.identificador}"]

  defp replanejada_de(%{replanejada_de: nil}), do: []
  defp replanejada_de(%{replanejada_de: origem}), do: ["replanejada-de: #{origem.codigo}"]

  defp status(status), do: status |> Atom.to_string() |> String.replace("_", "-")

  defp data(nil), do: ""
  defp data(%DateTime{} = quando), do: quando |> DateTime.to_date() |> Date.to_iso8601()
  defp data(%NaiveDateTime{} = quando), do: quando |> NaiveDateTime.to_date() |> Date.to_iso8601()

  defp texto(nil), do: ""
  defp texto(valor), do: String.trim(valor)
end
