defmodule Fabrica.Agente.Ferramentas do
  @moduledoc """
  O mapa de ferramentas DE VERDADE que um agente real recebe — a peca que faltava desde a
  T-070 (ver `Fabrica.Fila.Trabalho` @moduledoc e D-009/D-010 em `_gestao/DECISOES.md`): sem
  ela, `Agente.Laco.rodar/1` sobe um agente que so produz prosa ate o teto de voltas, sem ler
  nem editar um arquivo sequer.

  ## O que este modulo FAZ, e o que ele NAO decide

  `Fabrica.Ferramentas.Catalogo.do_papel/1` ja decide QUAIS nomes cada papel recebe — essa
  allowlist nao muda aqui. Este modulo so liga cada nome ao `fn/2` que o laco de fato chama
  (`Fabrica.Ferramentas.Arquivo`/`Fabrica.Ferramentas.Comando`), no formato que
  `Fabrica.Agente.Laco` exige: `%{"nome" => fn argumentos, raiz -> resultado end}` — provado
  em `test/fabrica/agente/laco_test.exs`.

  `registrar_resultado` (T-074) e a unica ferramenta aqui que NAO fecha `raiz`: fecha um
  `coletor` (`Fabrica.Ferramentas.RegistrarResultado.iniciar_coletor/0`), porque o `ciclo_id`
  de verdade so nasce ao FIM do despacho (`Fabrica.Tarefas.Transicao`). Quem chama `montar/4`
  (`Fabrica.Fila.Trabalho`) precisa ler `RegistrarResultado.relatos/1` do MESMO coletor depois
  que o laco termina — e so ai persistir, na mesma transacao do ciclo. Ver o @moduledoc de
  `RegistrarResultado` para o motivo do timing.

  ## `raiz` e fechado no momento do MONTAR, nao reconferido a cada chamada

  O laco chama cada ferramenta com `funcao.(argumentos, estado.raiz)` — o segundo argumento e
  sempre o MESMO `raiz` que `montar/4` ja recebeu (`Fabrica.Fila.Trabalho.rodar_agente/2` usa
  `tarefa.projeto.caminho` nos dois lugares). As closures aqui ignoram esse segundo argumento
  e usam o `raiz` fechado em `montar/4`: e o mesmo valor, e fecha-lo uma vez so evita
  reconferir a cada chamada de ferramenta.

  ## Confinamento de escrita: `areas` nao e opcional aqui

  `escrever` e `editar` recebem as `areas` da tarefa e recusam qualquer caminho fora delas —
  a mesma regra que `Fabrica.Ferramentas.Arquivo` ja impoe
  (`Fabrica.Fila.Exclusao.permitir?/2`, momento 2 da T-038). Este modulo so preenche o
  parametro; a regra continua vivendo la.

  ## `rodar` e `git` cru — o risco que D-010 registrou, decidido aqui

  Uma vez que `rodar` executa qualquer programa, um agente construtor pode chamar `git add
  -A`/`git commit` DIRETO, por fora de `Fabrica.Publicacao.Git.commitar/3` e do confinamento
  de `areas` que ela impoe (`Git.commitar/3` so protege quem passa por ELA). A decisao aqui:
  NAO restringir `rodar` por lista de programas — a T-073 nao pede uma allowlist de comandos,
  e criar uma so para bloquear `git` seria meia medida (o agente ainda poderia chamar `git`
  via `sh -c`/`cmd /c` por outro programa). O commit administrativo continua sendo so do
  SISTEMA, a partir do que os portoes decidem; isto e um risco operacional CONHECIDO, nao
  resolvido por esta tarefa — ver D-010 em `_gestao/DECISOES.md`.
  """

  alias Fabrica.Ferramentas.Arquivo
  alias Fabrica.Ferramentas.Catalogo
  alias Fabrica.Ferramentas.Comando
  alias Fabrica.Ferramentas.RegistrarResultado
  alias Fabrica.Tarefas.Area

  @typedoc "Uma ferramenta pronta para `Fabrica.Agente.Laco.rodar(ferramentas: ...)`."
  @type ferramenta :: (map(), Path.t() -> term())

  @doc """
  Monta `%{"nome" => ferramenta}` para o `papel` dado, confinado a `raiz` e `areas`.

  `coletor` e o pid de `Fabrica.Ferramentas.RegistrarResultado.iniciar_coletor/0` — quem
  chama precisa dele para ler `RegistrarResultado.relatos/1` DEPOIS que o laco terminar (ver
  @moduledoc, "T-074").

  Papel desconhecido no catalogo propaga `{:erro, :papel_desconhecido}` — nunca um mapa
  vazio: mapa vazio e um agente sem ferramenta nenhuma rodando em silencio ate estourar o
  teto de voltas, o mesmo defeito que esta tarefa existe para fechar.
  """
  @spec montar(String.t(), Path.t(), [Area.t()], pid()) ::
          {:ok, %{String.t() => ferramenta()}} | {:erro, :papel_desconhecido}
  def montar(papel, raiz, areas, coletor) do
    with {:ok, ferramentas_do_papel} <- Catalogo.do_papel(papel) do
      mapa =
        ferramentas_do_papel
        |> Map.keys()
        |> Map.new(&{&1, construir(&1, raiz, areas, coletor)})

      {:ok, mapa}
    end
  end

  defp construir("ler", raiz, _areas, _coletor) do
    fn argumentos, _raiz -> Arquivo.ler(raiz, buscar(argumentos, "caminho")) end
  end

  defp construir("listar", raiz, _areas, _coletor) do
    fn argumentos, _raiz -> Arquivo.listar(raiz, buscar(argumentos, "padrao", "**/*")) end
  end

  defp construir("buscar", raiz, _areas, _coletor) do
    fn argumentos, _raiz ->
      opcoes = [
        padrao: buscar(argumentos, "padrao", "**/*"),
        limite: buscar(argumentos, "limite", 200)
      ]

      Arquivo.buscar(raiz, buscar(argumentos, "texto"), opcoes)
    end
  end

  defp construir("escrever", raiz, areas, _coletor) do
    fn argumentos, _raiz ->
      Arquivo.escrever(
        raiz,
        buscar(argumentos, "caminho"),
        buscar(argumentos, "conteudo", ""),
        areas
      )
    end
  end

  defp construir("editar", raiz, areas, _coletor) do
    fn argumentos, _raiz ->
      Arquivo.editar(
        raiz,
        buscar(argumentos, "caminho"),
        buscar(argumentos, "alvo"),
        buscar(argumentos, "novo", ""),
        areas
      )
    end
  end

  defp construir("rodar", raiz, _areas, _coletor) do
    fn argumentos, _raiz ->
      Comando.rodar(raiz, buscar(argumentos, "programa"), buscar(argumentos, "args", []))
    end
  end

  defp construir("registrar_resultado", _raiz, _areas, coletor) do
    fn argumentos, _raiz -> RegistrarResultado.anexar(coletor, argumentos) end
  end

  defp buscar(argumentos, chave, padrao \\ nil)

  defp buscar(argumentos, chave, padrao) when is_map(argumentos),
    do: Map.get(argumentos, chave, padrao)

  defp buscar(_argumentos, _chave, padrao), do: padrao
end
