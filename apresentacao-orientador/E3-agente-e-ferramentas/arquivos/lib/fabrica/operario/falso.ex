defmodule Fabrica.Operario.Falso do
  @moduledoc """
  O duble deterministico. Responde a partir de um ROTEIRO declarado no teste.

  Ele e o que torna o marco da v0.1 possivel: a suite inteira roda sem tocar a rede, sem
  gastar cota e sem chave de API. Por isso ele nao tem — e nao pode ganhar — nenhum caminho
  que chegue a rede ou leia credencial. Ha um teste que falha se este arquivo referenciar
  qualquer modulo de HTTP; e paranoia barata, e protege o marco de uma versao inteira.

  O roteiro e uma lista de `Resposta`, entregues na ordem. Esgotado, devolve
  `{:erro, :roteiro_esgotado}` — nunca trava, nunca inventa resposta. Inventar seria pior
  que falhar: um teste passaria por acaso.

      {:ok, agulha} = Falso.iniciar(roteiro: [resposta_a, resposta_b])
      {:ok, resposta} = Falso.conversar(requisicao, agulha: agulha)
  """

  @behaviour Fabrica.Operario

  alias Fabrica.Operario.Consumo
  alias Fabrica.Operario.Requisicao
  alias Fabrica.Operario.Resposta

  use Agent

  @doc """
  Inicia um roteiro. Devolve a agulha que aponta para a proxima resposta.

  Cada teste tem a sua, entao testes assincronos nao disputam estado.
  """
  @spec iniciar(keyword()) :: {:ok, pid()}
  def iniciar(opcoes \\ []) do
    roteiro = Keyword.get(opcoes, :roteiro, [])
    Agent.start_link(fn -> %{roteiro: roteiro, vistas: [], opcoes_vistas: []} end)
  end

  @doc "As requisicoes que o duble recebeu, na ordem — para o teste conferir o que foi montado."
  @spec vistas(pid()) :: [Requisicao.t()]
  def vistas(agulha) do
    Agent.get(agulha, fn estado -> Enum.reverse(estado.vistas) end)
  end

  @doc """
  As OPCOES de cada chamada, na mesma ordem de `vistas/1` — para o teste conferir o que foi
  REPASSADO por fora da requisicao (como `raiz`), e nao so o que foi montado dentro dela.

  Uma opcao que nunca chega e indistinguivel de uma que chega se o duble a descarta: e por
  isso que ela precisa ser gravada, e nao so a requisicao.
  """
  @spec opcoes_vistas(pid()) :: [keyword()]
  def opcoes_vistas(agulha) do
    Agent.get(agulha, fn estado -> Enum.reverse(estado.opcoes_vistas) end)
  end

  @doc """
  Monta uma `Resposta` plausivel, com consumo que exercita a reparticao de cache.

  O consumo importa: sem numeros de cache aqui, os testes de contabilidade da T-005 nao
  teriam o que exercitar.
  """
  @spec resposta(keyword()) :: Resposta.t()
  def resposta(opcoes \\ []) do
    %Resposta{
      blocos: Keyword.get(opcoes, :blocos, [%{tipo: :texto, texto: "pronto"}]),
      motivo_parada: Keyword.get(opcoes, :motivo_parada, :fim_do_turno),
      consumo: %Consumo{
        tokens_entrada: Keyword.get(opcoes, :tokens_entrada, 120),
        tokens_cache_escrita: Keyword.get(opcoes, :tokens_cache_escrita, 0),
        tokens_cache_leitura: Keyword.get(opcoes, :tokens_cache_leitura, 4_800),
        tokens_saida: Keyword.get(opcoes, :tokens_saida, 210),
        duracao_ms: Keyword.get(opcoes, :duracao_ms, 42),
        ttl_cache: Keyword.get(opcoes, :ttl_cache, :uma_hora)
      }
    }
  end

  # SEM argumento default aqui, de proposito: um default geraria tambem `conversar/1`, que
  # nao e callback nenhum, e o `@impl` acusaria. O default mora no atalho publico
  # `Fabrica.Operario.conversar/2`, que e onde ele serve.
  @impl Fabrica.Operario
  def conversar(%Requisicao{} = requisicao, opcoes) do
    case Keyword.fetch(opcoes, :agulha) do
      {:ok, agulha} -> proxima(agulha, requisicao, opcoes)
      :error -> {:erro, :sem_roteiro}
    end
  end

  defp proxima(agulha, requisicao, opcoes) do
    Agent.get_and_update(agulha, fn estado ->
      estado = %{
        estado
        | vistas: [requisicao | estado.vistas],
          opcoes_vistas: [opcoes | estado.opcoes_vistas]
      }

      case estado.roteiro do
        [%Resposta{} = proxima | resto] -> {{:ok, proxima}, %{estado | roteiro: resto}}
        [] -> {{:erro, :roteiro_esgotado}, estado}
      end
    end)
  end
end
