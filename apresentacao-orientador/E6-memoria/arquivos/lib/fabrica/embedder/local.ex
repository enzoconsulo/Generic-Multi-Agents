defmodule Fabrica.Embedder.Local do
  @moduledoc """
  Embedding local via Bumblebee — sem rede e sem custo por chamada, ao preco de manter o
  modelo inteiro residente em memoria.

  ## Por que atras de dependencia OPCIONAL

  Bumblebee, Nx e EXLA somados passam de 1 GB, e o perfil alvo da v2 e 8 GB de RAM (ver
  `Fabrica.Embedder`). `mix.exs` so lista os tres quando `FABRICA_EMBEDDER_LOCAL=1` esta no
  ambiente NO MOMENTO de `mix deps.get` — sem essa variavel, a lista e vazia e `mix deps.get`
  nunca ve os tres nomes. **Nao e `optional: true`**: medido nesta mesma tarefa, marcar uma
  dependencia do PROPRIO app como `optional: true` nao impede `mix deps.get` de baixa-la —
  esse sinalizador so importa quando e OUTRO pacote quem declara a dependencia. Quem nao vai
  usar `Local` nao roda essa variavel e nao paga o download nem o disco.

  Por isso, TODA chamada a `Bumblebee`, `Nx` ou `Bumblebee.Text` aqui passa por `apply/3`, e
  nao por `Bumblebee.load_model(...)` direto: uma chamada remota resolvida em tempo de
  compilacao faz o compilador avisar "modulo indisponivel" quando o pacote nao esta instalado,
  e `mix compile --warnings-as-errors` (o segundo estagio de `mix verificar`) reprovaria o
  projeto INTEIRO so por este arquivo existir — mesmo que ninguem jamais use `Local`. `apply/3`
  resolve o modulo em tempo de EXECUCAO, entao o compilador nao tem o que avisar.

  ## Consumo residente — MEDIDO na T-042 (D-001)

  O marco da v0.1 (`test/fabrica/marco_v01_test.exs`) trava que `Bumblebee`, `Nx`, `EXLA` e
  `Axon` **nao sao carregaveis** durante a suite desta fabrica — por isso a medicao NAO roda
  aqui: ela foi o OBJETO da T-042, fora da suite, numa maquina separada, e os numeros estao em
  `_gestao/DECISOES.md` (D-001). O modelo medido foi `sentence-transformers/all-MiniLM-L6-v2`
  (384 dimensoes, o `@dimensoes` deste modulo):

  - **disco do checkpoint:** 87,13 MB (pesos + tokenizer, 12 arquivos, no cache do Bumblebee)
  - **memoria residente do BEAM so com o modelo carregado:** ~220 MB de working set
  - **tempo de carga do modelo:** 15,7 s a 30,6 s (1a vs 2a carga, variando por cache de disco)
  - **tempo para vetorizar em lote:** 10 trechos (a meta era 1.000) **nao terminaram** apos
    mais de 9 min de parede e mais de 500 s de CPU acumulados — abortado. Nao e "lento": e
    ordens de grandeza inviavel para o uso pretendido (vetorizar ao commitar, T-043).

  O ultimo numero nao e limite de RAM (a maquina da medicao tinha 15,98 GB) — e a PLATAFORMA:
  **EXLA nao tem binario precompilado para `x86_64-windows-cpu`** (so darwin/linux-gnu/tpu).
  Sem EXLA, o unico backend e o `Nx.Defn.Evaluator` interpretado, sem JIT, e e ELE que nao
  completa nem 10 trechos; em Windows o unico caminho seria `XLA_BUILD=true` (compilar o XLA
  do Google com Bazel, horas). Por isso a D-001 tornou `Embedder.Servico` o adaptador PADRAO,
  e este (`Local`) segue existindo para Linux/macOS — onde EXLA tem binario pronto — ou para
  quem estiver disposto a compilar o XLA a mao.

  ## Um processo so, carregado uma vez

  Carregar o modelo por chamada seria proibitivo — o carregamento custa segundos, o vetorizar
  custa milissegundos. Por isso `Local` e um `GenServer` supervisionado: `start_link/1` sobe o
  processo, `handle_continue/2` carrega o modelo UMA vez fora do `init/1` (para nao bloquear
  quem espera o supervisor), e `vetorizar/1` serve cada lote contra o modelo ja residente.

  Este modulo NAO entra na arvore de supervisao padrao da aplicacao, e NAO e o embedder
  configurado em nenhum ambiente — ver `Fabrica.Embedder.configurado/0`. Subi-lo e escolha de
  quem for de fato usar `Local`.
  """

  use GenServer

  @behaviour Fabrica.Embedder

  @dimensoes 384
  @modelo_padrao "sentence-transformers/all-MiniLM-L6-v2"

  @doc "As dependencias opcionais deste adaptador — presentes so se alguem as instalou."
  @spec dependencias() :: [module()]
  def dependencias, do: [Nx, Bumblebee]

  @doc "Se as dependencias opcionais estao instaladas e carregaveis nesta build."
  @spec disponivel?() :: boolean()
  def disponivel?, do: Enum.all?(dependencias(), &Code.ensure_loaded?/1)

  @impl Fabrica.Embedder
  def dimensoes, do: @dimensoes

  @impl Fabrica.Embedder
  def vetorizar(textos) when is_list(textos) do
    if disponivel?() do
      GenServer.call(__MODULE__, {:vetorizar, textos}, :infinity)
    else
      {:erro, :bumblebee_indisponivel}
    end
  end

  def vetorizar(_outro), do: {:erro, :esperava_lista}

  @doc "Sobe o processo e comeca a carregar o modelo. So funciona com as dependencias opcionais instaladas."
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opcoes \\ []) do
    GenServer.start_link(__MODULE__, opcoes, name: __MODULE__)
  end

  @impl GenServer
  def init(opcoes) do
    if disponivel?() do
      modelo = Keyword.get(opcoes, :modelo, @modelo_padrao)
      {:ok, %{servico: nil}, {:continue, {:carregar, modelo}}}
    else
      {:stop, :bumblebee_indisponivel}
    end
  end

  # `apply/3` em vez de `Bumblebee.load_model(...)` direto e proposital, no modulo inteiro: uma
  # chamada remota resolvida em tempo de compilacao faz o Credo e o compilador avisarem
  # "modulo indisponivel" quando o pacote nao esta instalado — e e assim mesmo quando ninguem
  # nunca chama esta funcao. Ver a secao "Por que atras de dependencia OPCIONAL" no moduledoc.
  @impl GenServer
  def handle_continue({:carregar, modelo}, estado) do
    # credo:disable-for-next-line Credo.Check.Refactor.Apply
    {:ok, modelo_info} = apply(Bumblebee, :load_model, [{:hf, modelo}])
    # credo:disable-for-next-line Credo.Check.Refactor.Apply
    {:ok, tokenizer} = apply(Bumblebee, :load_tokenizer, [{:hf, modelo}])

    {:noreply, %{estado | servico: carregar_servico(modelo_info, tokenizer)}}
  end

  defp carregar_servico(modelo_info, tokenizer) do
    opcoes = [output_attribute: :embedding, embedding_processor: :l2_norm]
    # credo:disable-for-next-line Credo.Check.Refactor.Apply
    apply(Bumblebee.Text, :text_embedding, [modelo_info, tokenizer, opcoes])
  end

  @impl GenServer
  def handle_call({:vetorizar, textos}, _de, %{servico: servico} = estado) do
    # credo:disable-for-next-line Credo.Check.Refactor.Apply
    resultados = apply(Nx.Serving, :run, [servico, textos])
    vetores = Enum.map(resultados, &tensor_para_lista(&1.embedding))

    {:reply, {:ok, vetores}, estado}
  end

  # credo:disable-for-next-line Credo.Check.Refactor.Apply
  defp tensor_para_lista(tensor), do: apply(Nx, :to_flat_list, [tensor])
end
