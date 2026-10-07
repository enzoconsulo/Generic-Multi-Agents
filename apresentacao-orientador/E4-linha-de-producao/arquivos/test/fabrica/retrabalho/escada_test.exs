defmodule Fabrica.Retrabalho.EscadaTest do
  @moduledoc """
  Um teste por degrau, e — mais importante — um teste por degrau que **nao** deve disparar.

  Escada que sobe cedo demais gasta modelo caro em tarefa facil; escada que sobe tarde demais
  queima as tres fichas repetindo a aposta que ja falhou. Os dois erros custam, e sao erros
  opostos, entao cada degrau precisa das duas metades.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Retrabalho.Escada

  doctest Fabrica.Retrabalho.Escada

  defp situacao(atributos), do: Map.new(atributos)

  describe "degrau 1 — sobe de modelo na 1a reprovacao" do
    test "uma execucao reprovada sobe para o reforcado" do
      assert {:ok, decisao} = Escada.proximo(situacao(tentativas: 1))

      assert decisao.degrau == :sobe_de_modelo
      assert decisao.modelo == :reforcado
      assert decisao.especialista == :manter
      assert decisao.motivo =~ "paga o ciclo inteiro de novo"
    end

    test "NAO sobe antes de haver reprovacao" do
      # Zero tentativas e a primeira execucao: nao ha fato registrado para justificar modelo
      # caro, e subir aqui seria palpite sobre dificuldade.
      assert {:ok, decisao} = Escada.proximo(situacao(tentativas: 0))

      assert decisao.modelo == :do_disparo
      assert decisao.motivo =~ "primeira execucao"
    end

    test "sobe de modelo tambem quando NAO ha especialista para trocar" do
      # Tarefa sem especialista ja roda no generico: nao ha o que trocar, entao o degrau 2
      # nao se aplica e ela continua no degrau 1.
      assert {:ok, %{degrau: :sobe_de_modelo}} =
               Escada.proximo(situacao(tentativas: 2, especialistas_usados: [nil, nil]))
    end
  end

  describe "degrau 2 — troca de especialista na 2a sob o MESMO" do
    test "duas execucoes com o mesmo especialista trocam para o generico reforcado" do
      assert {:ok, decisao} =
               Escada.proximo(
                 situacao(tentativas: 2, especialistas_usados: ["frontend", "frontend"])
               )

      assert decisao.degrau == :troca_de_especialista
      assert decisao.especialista == :generico_reforcado
      assert decisao.modelo == :reforcado
    end

    test "a troca e REGISTRADA com o motivo, e o motivo nomeia o especialista" do
      # Decisao sem registro vira folclore: daqui a um mes ninguem sabe por que a tarefa saiu
      # do especialista.
      {:ok, decisao} =
        Escada.proximo(situacao(tentativas: 2, especialistas_usados: ["banco", "banco"]))

      assert decisao.motivo =~ "banco"
      assert decisao.motivo =~ "antes de se saber onde a tarefa iria falhar"
      assert decisao.motivo =~ "vies"
    end

    test "NAO troca na primeira reprovacao, mesmo com especialista" do
      assert {:ok, %{degrau: :sobe_de_modelo}} =
               Escada.proximo(situacao(tentativas: 1, especialistas_usados: ["frontend"]))
    end

    test "NAO troca se os dois ciclos ja foram com especialistas DIFERENTES" do
      # A evidencia do degrau 2 e "o mesmo prompt de dominio falhou duas vezes". Com dois
      # prompts diferentes essa evidencia nao existe.
      assert {:ok, %{degrau: :sobe_de_modelo}} =
               Escada.proximo(
                 situacao(tentativas: 2, especialistas_usados: ["frontend", "banco"])
               )
    end

    test "lista de especialistas com um item so nao caracteriza 'duas vezes'" do
      assert {:ok, %{degrau: :sobe_de_modelo}} =
               Escada.proximo(situacao(tentativas: 2, especialistas_usados: ["frontend"]))
    end
  end

  describe "degrau 3 — replaneja quando os 3 ciclos esgotam" do
    test "esgotou os ciclos e vai para replanejamento" do
      assert {:ok, decisao} = Escada.proximo(situacao(tentativas: 3))

      assert decisao.degrau == :replaneja
      assert decisao.motivo =~ "DIMENSIONAMENTO"
    end

    test "NAO replaneja antes de esgotar" do
      for tentativas <- 0..2 do
        assert {:ok, decisao} = Escada.proximo(situacao(tentativas: tentativas))
        refute decisao.degrau == :replaneja, "tentativas=#{tentativas} nao deveria replanejar"
      end
    end

    test "esgotar vence a troca de especialista" do
      # Com 3 tentativas e o mesmo especialista as duas condicoes valem; o que manda e o
      # esgotamento, porque nao ha ficha para gastar com outro construtor.
      assert {:ok, %{degrau: :replaneja}} =
               Escada.proximo(
                 situacao(tentativas: 3, especialistas_usados: ["frontend", "frontend"])
               )
    end

    test "o limite e 3, e ele esta declarado num lugar so" do
      assert Escada.max_tentativas() == 3

      assert {:ok, %{degrau: :sobe_de_modelo}} =
               Escada.proximo(situacao(tentativas: Escada.max_tentativas() - 1))

      assert {:ok, %{degrau: :replaneja}} =
               Escada.proximo(situacao(tentativas: Escada.max_tentativas()))
    end
  end

  describe "degrau 4 — bloqueia quando ja e fruto de replanejamento" do
    test "tarefa com replanejada_de bloqueia em vez de replanejar de novo" do
      # Autocorrecao vale UMA vez por linhagem. Sem esse limite, uma tarefa impossivel gera
      # substitutas para sempre.
      assert {:parar, {:bloqueada, motivo}} =
               Escada.proximo(situacao(tentativas: 3, replanejada_de: 42))

      assert motivo =~ "uma vez por linhagem"
    end

    test "replanejada_de nulo ou vazio NAO bloqueia" do
      for valor <- [nil, ""] do
        assert {:ok, %{degrau: :replaneja}} =
                 Escada.proximo(situacao(tentativas: 3, replanejada_de: valor)),
               "replanejada_de=#{inspect(valor)} nao deveria bloquear"
      end
    end

    test "tarefa replanejada com ciclo sobrando ainda trabalha" do
      # Ser fruto de replanejamento nao a torna suspeita: ela so perde a segunda chance de
      # ser replanejada.
      assert {:ok, %{degrau: :sobe_de_modelo}} =
               Escada.proximo(situacao(tentativas: 1, replanejada_de: 42))
    end
  end

  describe "o teto de despachos por rodada — defesa em profundidade" do
    test "corta MESMO com tentativas correto e ciclo sobrando" do
      # E o ponto do teto: ele nao confia na escada, nao confia no contador e nao confia em
      # quem os escreveu. Na v1, sem ele, uma rodada mediu 41 despachos e US$ 22,55.
      assert {:parar, :teto_de_despachos} =
               Escada.proximo(
                 situacao(tentativas: 1, despachos_na_rodada: Escada.teto_de_despachos())
               )
    end

    test "o teto vem ANTES de qualquer outra decisao, inclusive do bloqueio" do
      assert {:parar, :teto_de_despachos} =
               Escada.proximo(
                 situacao(
                   tentativas: 3,
                   replanejada_de: 42,
                   despachos_na_rodada: Escada.teto_de_despachos() + 5
                 )
               )
    end

    test "abaixo do teto nao corta" do
      assert {:ok, _decisao} =
               Escada.proximo(
                 situacao(tentativas: 1, despachos_na_rodada: Escada.teto_de_despachos() - 1)
               )
    end

    test "o teto NAO bloqueia a tarefa: ele so a tira desta rodada" do
      # A diferenca importa. Bloqueada espera o usuario; cortada pelo teto volta sozinha na
      # rodada seguinte, porque o teto e sobre a RODADA e nao sobre a tarefa.
      assert {:parar, motivo} =
               Escada.proximo(situacao(tentativas: 1, despachos_na_rodada: 99))

      assert motivo == :teto_de_despachos
      refute match?({:bloqueada, _}, motivo)
    end

    test "o teto cabe o pior caso legitimo, com folga" do
      # 3 ciclos x 3 papeis = 9 despachos legitimos. Um teto abaixo disso cortaria trabalho
      # correto; muito acima nao cortaria nada.
      assert Escada.teto_de_despachos() > Escada.max_tentativas() * 3
    end

    test "sem despachos_na_rodada declarado, assume zero" do
      assert {:ok, _decisao} = Escada.proximo(situacao(tentativas: 1))
    end
  end

  describe "a escada inteira, percorrida" do
    test "uma tarefa sem especialista sobe de modelo, replaneja e para de replanejar" do
      caminho =
        for tentativas <- 0..3 do
          case Escada.proximo(situacao(tentativas: tentativas)) do
            {:ok, decisao} -> decisao.degrau
            {:parar, motivo} -> motivo
          end
        end

      assert caminho == [:sobe_de_modelo, :sobe_de_modelo, :sobe_de_modelo, :replaneja]
    end

    test "uma tarefa COM especialista passa pelos quatro degraus" do
      degraus =
        [
          %{tentativas: 1, especialistas_usados: ["frontend"]},
          %{tentativas: 2, especialistas_usados: ["frontend", "frontend"]},
          %{tentativas: 3, especialistas_usados: ["frontend", "frontend", nil]},
          %{tentativas: 3, especialistas_usados: ["frontend"], replanejada_de: 7}
        ]
        |> Enum.map(fn situacao ->
          case Escada.proximo(situacao) do
            {:ok, decisao} -> decisao.degrau
            {:parar, {:bloqueada, _motivo}} -> :bloqueia
          end
        end)

      assert degraus == [:sobe_de_modelo, :troca_de_especialista, :replaneja, :bloqueia]
    end

    test "cada decisao carrega um motivo escrito, sempre" do
      situacoes = [
        %{tentativas: 0},
        %{tentativas: 1},
        %{tentativas: 2, especialistas_usados: ["a", "a"]},
        %{tentativas: 3}
      ]

      for s <- situacoes do
        assert {:ok, decisao} = Escada.proximo(s)
        assert is_binary(decisao.motivo) and decisao.motivo != ""
      end
    end
  end
end
