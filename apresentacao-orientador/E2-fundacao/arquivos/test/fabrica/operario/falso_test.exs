defmodule Fabrica.Operario.FalsoTest do
  @moduledoc """
  Trava o duble e, com ele, o marco da v0.1.

  O teste `nao referencia modulo de HTTP` e o mais importante do arquivo: ele nao verifica
  comportamento, verifica IMPOSSIBILIDADE. Enquanto ele passar, nenhuma suite desta fabrica
  consegue tocar a rede por engano pelo caminho do operario.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Operario
  alias Fabrica.Operario.Consumo
  alias Fabrica.Operario.Falso
  alias Fabrica.Operario.Requisicao
  alias Fabrica.Operario.Resposta

  defp requisicao(atributos \\ %{}) do
    struct(
      %Requisicao{modelo: "haiku-4.5", mensagens: [%{papel: :usuario, conteudo: "oi"}]},
      atributos
    )
  end

  describe "roteiro" do
    test "devolve as respostas na ordem declarada" do
      primeira = Falso.resposta(blocos: [%{tipo: :texto, texto: "um"}])
      segunda = Falso.resposta(blocos: [%{tipo: :texto, texto: "dois"}])

      {:ok, agulha} = Falso.iniciar(roteiro: [primeira, segunda])

      assert {:ok, %Resposta{blocos: [%{texto: "um"}]}} =
               Falso.conversar(requisicao(), agulha: agulha)

      assert {:ok, %Resposta{blocos: [%{texto: "dois"}]}} =
               Falso.conversar(requisicao(), agulha: agulha)
    end

    test "roteiro esgotado devolve {:erro, :roteiro_esgotado}, sem travar nem inventar" do
      {:ok, agulha} = Falso.iniciar(roteiro: [Falso.resposta()])

      assert {:ok, %Resposta{}} = Falso.conversar(requisicao(), agulha: agulha)
      assert {:erro, :roteiro_esgotado} = Falso.conversar(requisicao(), agulha: agulha)

      # e continua respondendo o mesmo erro, em vez de degradar de outra forma
      assert {:erro, :roteiro_esgotado} = Falso.conversar(requisicao(), agulha: agulha)
    end

    test "roteiro vazio ja comeca esgotado" do
      {:ok, agulha} = Falso.iniciar()
      assert {:erro, :roteiro_esgotado} = Falso.conversar(requisicao(), agulha: agulha)
    end

    test "sem agulha nenhuma, devolve erro em vez de adivinhar" do
      assert {:erro, :sem_roteiro} = Falso.conversar(requisicao(), [])
    end

    test "duas agulhas nao se atrapalham: cada teste tem a sua" do
      {:ok, uma} = Falso.iniciar(roteiro: [Falso.resposta(blocos: [%{texto: "A"}])])
      {:ok, outra} = Falso.iniciar(roteiro: [Falso.resposta(blocos: [%{texto: "B"}])])

      assert {:ok, %Resposta{blocos: [%{texto: "A"}]}} =
               Falso.conversar(requisicao(), agulha: uma)

      assert {:ok, %Resposta{blocos: [%{texto: "B"}]}} =
               Falso.conversar(requisicao(), agulha: outra)
    end

    test "guarda as requisicoes recebidas, para o teste conferir o que foi montado" do
      {:ok, agulha} = Falso.iniciar(roteiro: [Falso.resposta(), Falso.resposta()])

      Falso.conversar(requisicao(%{modelo: "opus-5"}), agulha: agulha)
      Falso.conversar(requisicao(%{modelo: "sonnet-5"}), agulha: agulha)

      assert [%Requisicao{modelo: "opus-5"}, %Requisicao{modelo: "sonnet-5"}] =
               Falso.vistas(agulha)
    end
  end

  describe "consumo" do
    test "devolve um Consumo por volta, com a reparticao de cache preenchida" do
      {:ok, agulha} = Falso.iniciar(roteiro: [Falso.resposta()])

      {:ok, %Resposta{consumo: consumo}} = Falso.conversar(requisicao(), agulha: agulha)

      assert %Consumo{} = consumo
      assert consumo.tokens_entrada > 0
      assert consumo.tokens_cache_leitura > 0
      assert consumo.tokens_saida > 0
      assert consumo.ttl_cache in [:sem_cache, :cinco_minutos, :uma_hora]
    end

    test "os numeros de cache sao ajustaveis pelo roteiro" do
      resposta =
        Falso.resposta(
          tokens_entrada: 10,
          tokens_cache_escrita: 5_000,
          tokens_cache_leitura: 0,
          tokens_saida: 7,
          ttl_cache: :cinco_minutos
        )

      {:ok, agulha} = Falso.iniciar(roteiro: [resposta])
      {:ok, %Resposta{consumo: consumo}} = Falso.conversar(requisicao(), agulha: agulha)

      assert consumo.tokens_cache_escrita == 5_000
      assert consumo.tokens_cache_leitura == 0
      assert consumo.ttl_cache == :cinco_minutos
    end

    test "motivo_parada acompanha o roteiro" do
      {:ok, agulha} =
        Falso.iniciar(roteiro: [Falso.resposta(motivo_parada: :uso_de_ferramenta)])

      assert {:ok, %Resposta{motivo_parada: :uso_de_ferramenta}} =
               Falso.conversar(requisicao(), agulha: agulha)
    end
  end

  describe "o contrato" do
    test "Falso implementa o behaviour Fabrica.Operario" do
      comportamentos =
        Falso.module_info(:attributes)
        |> Keyword.get_values(:behaviour)
        |> List.flatten()

      assert Fabrica.Operario in comportamentos
    end

    test "o behaviour declara conversar/2" do
      assert {:conversar, 2} in Fabrica.Operario.behaviour_info(:callbacks)
    end

    test "o operario configurado na suite e o Falso" do
      assert Operario.configurado() == Falso
    end
  end

  describe "sem rede — a garantia do marco da v0.1" do
    @proibidos ~w[
      httpc hackney gun ibrowse
      Req Finch Mint HTTPoison Tesla ssl inets
    ]

    test "o codigo do Falso nao referencia nenhum modulo de HTTP" do
      fonte = File.read!("lib/fabrica/operario/falso.ex")

      # PALAVRA INTEIRA, nao substring: a primeira versao deste teste usava
      # `String.contains?` e reprovou o arquivo por causa de `Requisicao`, que contem
      # "Req". Um teste que acusa o inocente e pior que teste nenhum — ninguem confia nele
      # na segunda vez.
      for proibido <- @proibidos do
        padrao = ~r/(?<![A-Za-z0-9_.])#{Regex.escape(proibido)}(?![A-Za-z0-9_])/

        refute Regex.match?(padrao, fonte),
               "Operario.Falso referencia #{proibido}. Ele existe justamente para NAO " <>
                 "tocar a rede: e disso que depende o marco da v0.1."
      end
    end

    test "o proprio detector reconhece uma referencia de verdade" do
      # Sem isto, o teste acima poderia estar sempre passando por um erro de padrao e
      # ninguem notaria — sensor que nunca dispara e indistinguivel de sensor quebrado.
      padrao = ~r/(?<![A-Za-z0-9_.])Req(?![A-Za-z0-9_])/

      assert Regex.match?(padrao, "Req.get!(url)")
      refute Regex.match?(padrao, "%Requisicao{}")
      refute Regex.match?(padrao, "alias Fabrica.Operario.Requisicao")
    end

    test "o Falso nao le nenhuma variavel de ambiente" do
      fonte = File.read!("lib/fabrica/operario/falso.ex")

      refute String.contains?(fonte, "System.get_env")
      refute String.contains?(fonte, "ANTHROPIC")
      refute String.contains?(fonte, "API_KEY")
    end

    test "nenhum modulo de HTTP esta carregado por causa do Falso" do
      {:ok, agulha} = Falso.iniciar(roteiro: [Falso.resposta()])
      Falso.conversar(requisicao(), agulha: agulha)

      # `Req` vem como dependencia so na T-019, e mesmo la o adaptador e outro.
      refute Code.ensure_loaded?(Req)
    end
  end
end
