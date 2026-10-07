defmodule Fabrica.Despacho do
  @moduledoc """
  Monta a mensagem inicial de um agente: as quatro faixas do `Fabrica.Prompt.Prefixo`,
  na ordem que ele exige, a partir de uma tarefa real e de um papel.

  E a peca que faltava entre o que ja existia pronto e testado isoladamente —
  `Fabrica.Prompt.Prefixo`/`Fabrica.Prompt.Bloco` (montam blocos e sabem a ordem),
  `Fabrica.Equipe.Resolucao` (monta a faixa de doutrina a partir de um `texto_do_papel`
  recebido de fora), `Fabrica.Ferramentas.Catalogo` (as ferramentas de cada papel) e
  `Fabrica.Indice.Mapa` (o indice denso, T-010) — e o fato de que ninguem antes desta
  tarefa chamava as quatro juntas para uma tarefa de verdade (T-058, D-006).

  ## Puro no que importa: sem rede, sem operario

  Este modulo nao chama o operario (nenhuma requisicao ao modelo) e nao faz I/O de rede.
  Ele LE o projeto no disco (`Fabrica.Indice.Mapa`, a mesma leitura que `mix fabrica.mapa`
  ja faz) para montar a faixa `:indice` — essa leitura e local, determinista e sem custo de
  modelo, a mesma classe de "quase gratis" que justifica o indice denso existir.

  Quem chama e responsavel por pre-carregar as associacoes da `tarefa` (`:projeto`,
  `:especialista`, `:areas`, `:criterios`) — sem isso o Ecto devolve
  `%Ecto.Association.NotLoaded{}` e a montagem estoura, de proposito: um prefixo montado
  parcialmente e pior que um erro na hora (mesma doutrina de `Fabrica.Publicacao.Markdown`).

  ## O especialista NAO e resolvido contra o banco

  A resolucao usa so o que a `tarefa` ja carrega: `tarefa.especialista` (a associacao
  pre-carregada) e nada mais. Isto e deliberado — subir ate a versao ATIVA mais recente do
  especialista (o que `Fabrica.Equipe.resolver/2` faz, com uma consulta) e papel de quem
  monta a tarefa para despacho, nao deste modulo. Um especialista pre-carregado que nao
  esta mais ativo cai no generico e registra o defeito, exatamente como
  `Fabrica.Equipe.Resolucao.resolver/3` ja faz.
  """

  alias Fabrica.Equipe.Resolucao
  alias Fabrica.Ferramentas.Catalogo
  alias Fabrica.Indice.Mapa
  alias Fabrica.Prompt.Prefixo
  alias Fabrica.Tarefas.Tarefa

  @modelo_padrao "sonnet-5"

  @doc """
  Monta o prefixo pronto para `Fabrica.Agente.Estado.novo/1`.

  `papel` e um dos papeis do `Fabrica.Ferramentas.Catalogo` (`:construtor`, `:verificador`,
  `:revisor`, `:planejador`, ...). `texto_do_papel` e a doutrina fixa do papel, recebida de
  fora — o mesmo motivo que `Fabrica.Equipe.Resolucao.doutrina/2` ja recebe de fora: testavel
  sem arrastar o catalogo de doutrina inteiro para dentro do teste.

  `opcoes[:modelo]` escolhe o modelo para o qual o prefixo e avaliado (padrao
  `"#{@modelo_padrao}"`) — so importa para o aviso de minimo cacheavel do
  `Fabrica.Prompt.Prefixo`.

  Papel desconhecido devolve `{:erro, :papel_desconhecido}`, nunca ferramentas vazias em
  silencio (mesma doutrina de `Fabrica.Ferramentas.Catalogo.do_papel/1`).
  """
  @spec montar(Tarefa.t(), atom(), String.t(), keyword()) ::
          {:ok, Prefixo.t()} | {:erro, :papel_desconhecido}
  def montar(%Tarefa{} = tarefa, papel, texto_do_papel, opcoes \\ []) when is_atom(papel) do
    case Catalogo.do_papel(Atom.to_string(papel)) do
      {:erro, motivo} ->
        {:erro, motivo}

      {:ok, ferramentas} ->
        modelo = Keyword.get(opcoes, :modelo, @modelo_padrao)

        prefixo =
          Prefixo.montar(modelo,
            ferramentas: ferramentas,
            doutrina: doutrina(tarefa, papel, texto_do_papel),
            indice: indice(tarefa),
            tarefa: faixa_da_tarefa(tarefa)
          )

        {:ok, prefixo}
    end
  end

  defp doutrina(tarefa, papel, texto_do_papel) do
    referencia = tarefa.especialista && tarefa.especialista.identificador
    ativos = List.wrap(tarefa.especialista)

    papel
    |> Resolucao.resolver(referencia, ativos)
    |> Resolucao.doutrina(texto_do_papel)
  end

  defp indice(tarefa) do
    [raiz: tarefa.projeto.caminho]
    |> Mapa.extrair()
    |> Mapa.render()
  end

  defp faixa_da_tarefa(tarefa) do
    [
      "#{tarefa.codigo}: #{tarefa.titulo}",
      "",
      "## Objetivo",
      texto(tarefa.objetivo),
      "",
      "## Contexto",
      texto(tarefa.contexto),
      "",
      "## Areas",
      areas(tarefa.areas),
      "",
      "## Criterios de aceite",
      criterios(tarefa.criterios)
    ]
    |> Enum.join("\n")
  end

  defp areas([]), do: "_nenhuma declarada._"

  defp areas(areas) do
    areas
    |> Enum.map(& &1.caminho)
    |> Enum.sort()
    |> Enum.map_join("\n", &"- #{&1}")
  end

  defp criterios([]), do: "_nenhum declarado._"

  defp criterios(criterios) do
    criterios
    |> Enum.sort_by(& &1.id)
    |> Enum.map_join("\n", &criterio/1)
  end

  defp criterio(%{comando: nil} = criterio), do: "- [ ] #{criterio.texto}"

  defp criterio(criterio) do
    "- [ ] #{criterio.texto}\n      `verificar: #{criterio.comando}`"
  end

  defp texto(nil), do: ""
  defp texto(valor), do: String.trim(valor)
end
