defmodule Fabrica.Indice.MapaTest do
  @moduledoc """
  Trava o indice denso, e antes de tudo a propriedade que decide o custo da fabrica:
  **duas geracoes sobre a mesma arvore produzem bytes identicos.**

  Se essa propriedade cair, o prefixo de todo despacho seguinte deixa de bater no cache —
  sem erro, sem aviso, so a conta subindo. Foi exatamente o que o MAPA da v1 fazia com o
  hash do HEAD no cabecalho.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Indice.Mapa

  setup do
    raiz = Path.join(System.tmp_dir!(), "mapa-#{System.unique_integer([:positive])}")
    File.mkdir_p!(Path.join(raiz, "lib"))
    on_exit(fn -> File.rm_rf(raiz) end)
    {:ok, raiz: raiz}
  end

  defp fonte(raiz, nome, conteudo) do
    caminho = Path.join([raiz, "lib", nome])
    File.mkdir_p!(Path.dirname(caminho))
    File.write!(caminho, conteudo)
  end

  describe "determinismo — a propriedade que sustenta o cache" do
    test "duas geracoes seguidas produzem bytes IDENTICOS", %{raiz: raiz} do
      fonte(raiz, "exemplo.ex", """
      defmodule Exemplo do
        @moduledoc "Um exemplo."
        @doc "Soma dois numeros."
        def somar(a, b), do: a + b
      end
      """)

      {:ok, destino, _} = Mapa.gravar(raiz: raiz)
      primeira = File.read!(destino)

      {:ok, ^destino, _} = Mapa.gravar(raiz: raiz)
      segunda = File.read!(destino)

      assert primeira == segunda
    end

    test "o mapa nao contem data, hash nem contador", %{raiz: raiz} do
      fonte(raiz, "exemplo.ex", "defmodule Exemplo do\n  @moduledoc \"x\"\nend\n")

      {:ok, destino, _} = Mapa.gravar(raiz: raiz)
      conteudo = File.read!(destino)

      hoje = Date.utc_today() |> Date.to_iso8601()

      refute conteudo =~ hoje, "data no mapa invalida o cache de todo despacho seguinte"
      refute conteudo =~ ~r/\b[0-9a-f]{7,40}\b/, "hash de commit tem o mesmo efeito"
      refute conteudo =~ "gerado em"
    end

    test "a ordem NAO depende da ordem do sistema de arquivos", %{raiz: raiz} do
      # `Path.wildcard/1` nao promete ordem estavel entre maquinas. Ordem instavel seria o
      # cabecalho volatil de novo, so que espalhado pelo arquivo inteiro.
      fonte(raiz, "zeta.ex", "defmodule Zeta do\n  @moduledoc \"z\"\nend\n")
      fonte(raiz, "alfa.ex", "defmodule Alfa do\n  @moduledoc \"a\"\nend\n")

      {:ok, destino, _} = Mapa.gravar(raiz: raiz)
      conteudo = File.read!(destino)

      assert :binary.match(conteudo, "`Alfa`") < :binary.match(conteudo, "`Zeta`")
    end

    test "os simbolos de um modulo saem em ordem estavel", %{raiz: raiz} do
      fonte(raiz, "ordem.ex", """
      defmodule Ordem do
        @moduledoc "o"
        def zebra, do: :ok
        def abacaxi, do: :ok
        def meio(a), do: a
      end
      """)

      {:ok, destino, _} = Mapa.gravar(raiz: raiz)
      conteudo = File.read!(destino)

      assert :binary.match(conteudo, "abacaxi/0") < :binary.match(conteudo, "meio/1")
      assert :binary.match(conteudo, "meio/1") < :binary.match(conteudo, "zebra/0")
    end
  end

  describe "o que entra e o que fica de fora" do
    test "modulo com @moduledoc false NAO aparece", %{raiz: raiz} do
      fonte(raiz, "interno.ex", """
      defmodule Interno do
        @moduledoc false
        def escondido, do: :ok
      end
      """)

      fonte(raiz, "publico.ex", """
      defmodule Publico do
        @moduledoc "Este aparece."
        def visivel, do: :ok
      end
      """)

      {:ok, destino, _} = Mapa.gravar(raiz: raiz)
      conteudo = File.read!(destino)

      refute conteudo =~ "Interno"
      refute conteudo =~ "escondido"
      assert conteudo =~ "`Publico`"
      assert conteudo =~ "visivel/0"
    end

    test "funcao privada nao aparece", %{raiz: raiz} do
      fonte(raiz, "mix.ex", """
      defmodule Misto do
        @moduledoc "m"
        def publica, do: privada()
        defp privada, do: :ok
      end
      """)

      {:ok, destino, _} = Mapa.gravar(raiz: raiz)
      conteudo = File.read!(destino)

      assert conteudo =~ "publica/0"
      refute conteudo =~ "privada"
    end

    test "@doc false esconde a funcao, mesmo sendo def", %{raiz: raiz} do
      fonte(raiz, "docfalse.ex", """
      defmodule ComDocFalse do
        @moduledoc "d"
        @doc false
        def interna, do: :ok
        @doc "Esta aparece."
        def externa, do: :ok
      end
      """)

      {:ok, destino, _} = Mapa.gravar(raiz: raiz)
      conteudo = File.read!(destino)

      refute conteudo =~ "interna/0"
      assert conteudo =~ "externa/0"
    end
  end

  describe "aridade — onde o regex erraria" do
    test "a aridade sai correta para varias formas", %{raiz: raiz} do
      fonte(raiz, "aridades.ex", """
      defmodule Aridades do
        @moduledoc "a"
        def zero, do: :ok
        def um(a), do: a
        def tres(a, b, c), do: {a, b, c}
      end
      """)

      modulo = Mapa.extrair(raiz: raiz) |> hd()
      assinaturas = Enum.map(modulo.simbolos, &"#{&1.nome}/#{&1.aridade}")

      assert "zero/0" in assinaturas
      assert "um/1" in assinaturas
      assert "tres/3" in assinaturas
    end

    test "funcao COM GUARDA nao vira aridade 2", %{raiz: raiz} do
      # `when` embrulha o cabecalho numa tupla propria. Sem desembrulhar, toda funcao com
      # guarda sairia com aridade 2 — um indice que mente sobre a interface.
      fonte(raiz, "guarda.ex", """
      defmodule ComGuarda do
        @moduledoc "g"
        def valida(numero) when is_integer(numero) and numero > 0, do: :ok
        def par(a, b) when is_atom(a), do: {a, b}
      end
      """)

      modulo = Mapa.extrair(raiz: raiz) |> hd()
      assinaturas = Enum.map(modulo.simbolos, &"#{&1.nome}/#{&1.aridade}")

      assert "valida/1" in assinaturas
      assert "par/2" in assinaturas
    end

    test "def dentro de string nao vira simbolo", %{raiz: raiz} do
      # O caso classico em que regex acerta por acaso e erra quando importa.
      fonte(raiz, "string.ex", """
      defmodule ComString do
        @moduledoc "s"
        def real, do: "def fantasma(x), do: x"
      end
      """)

      modulo = Mapa.extrair(raiz: raiz) |> hd()
      assinaturas = Enum.map(modulo.simbolos, &to_string(&1.nome))

      assert "real" in assinaturas
      refute "fantasma" in assinaturas
    end

    test "clausulas multiplas contam como UM simbolo", %{raiz: raiz} do
      fonte(raiz, "clausulas.ex", """
      defmodule Clausulas do
        @moduledoc "c"
        def trata(:a), do: 1
        def trata(:b), do: 2
        def trata(_), do: 0
      end
      """)

      modulo = Mapa.extrair(raiz: raiz) |> hd()
      assert Enum.count(modulo.simbolos, &(&1.nome == :trata)) == 1
    end

    test "defmacro aparece marcado como macro", %{raiz: raiz} do
      fonte(raiz, "macro.ex", """
      defmodule ComMacro do
        @moduledoc "m"
        defmacro faz(x), do: x
      end
      """)

      {:ok, destino, _} = Mapa.gravar(raiz: raiz)
      assert File.read!(destino) =~ "faz/1` (macro)"
    end
  end

  describe "proposito" do
    test "a PRIMEIRA linha do @moduledoc e do @doc entra, e so ela", %{raiz: raiz} do
      fonte(raiz, "doc.ex", """
      defmodule ComDoc do
        @moduledoc \"\"\"
        A primeira linha do modulo.

        Esta segunda linha nao deve entrar no mapa.
        \"\"\"
        @doc \"\"\"
        Soma dois numeros.

        E este paragrafo tambem nao.
        \"\"\"
        def somar(a, b), do: a + b
      end
      """)

      {:ok, destino, _} = Mapa.gravar(raiz: raiz)
      conteudo = File.read!(destino)

      assert conteudo =~ "A primeira linha do modulo."
      assert conteudo =~ "Soma dois numeros."
      refute conteudo =~ "nao deve entrar"
      refute conteudo =~ "este paragrafo tambem nao"
    end

    test "modulo sem simbolo publico diz isso, em vez de sair vazio", %{raiz: raiz} do
      fonte(raiz, "vazio.ex", "defmodule Vazio do\n  @moduledoc \"v\"\nend\n")

      {:ok, destino, _} = Mapa.gravar(raiz: raiz)
      assert File.read!(destino) =~ "sem simbolos publicos"
    end
  end

  describe "robustez" do
    test "arquivo que nao compila e ignorado, sem derrubar a geracao", %{raiz: raiz} do
      fonte(raiz, "quebrado.ex", "defmodule Quebrado do\n  def sem_fim(")
      fonte(raiz, "bom.ex", "defmodule Bom do\n  @moduledoc \"b\"\n  def ok, do: :ok\nend\n")

      {:ok, destino, _} = Mapa.gravar(raiz: raiz)
      conteudo = File.read!(destino)

      assert conteudo =~ "`Bom`"
      refute conteudo =~ "Quebrado"
    end

    test "arvore sem fonte nenhum gera mapa valido, e nao erro", %{raiz: raiz} do
      {:ok, destino, bytes} = Mapa.gravar(raiz: raiz)

      assert bytes > 0
      assert File.read!(destino) =~ "# MAPA"
    end

    test "modulos aninhados aparecem", %{raiz: raiz} do
      # A v2 usa isso: os tipos de `Fabrica.Operario` moram dentro dele.
      fonte(raiz, "aninhado.ex", """
      defmodule Fora do
        @moduledoc "f"
        defmodule Dentro do
          @moduledoc "d"
          def util, do: :ok
        end
      end
      """)

      {:ok, destino, _} = Mapa.gravar(raiz: raiz)
      conteudo = File.read!(destino)

      assert conteudo =~ "`Fora`"
      assert conteudo =~ "`Dentro`"
    end
  end

  describe "tamanho" do
    test "o mapa e uma fracao pequena do fonte", %{raiz: raiz} do
      # O alvo declarado e ~5%. Aqui basta provar a ORDEM de grandeza: se o mapa chegar
      # perto do tamanho do fonte, ele parou de ser indice e virou copia.
      corpo =
        Enum.map_join(1..40, "\n", fn n ->
          "  def funcao_#{n}(a, b) do\n    resultado = a + b\n    resultado * #{n}\n  end"
        end)

      fonte(raiz, "grande.ex", "defmodule Grande do\n  @moduledoc \"g\"\n#{corpo}\nend\n")

      tamanho_fonte = File.stat!(Path.join([raiz, "lib", "grande.ex"])).size
      {:ok, _, bytes} = Mapa.gravar(raiz: raiz)

      assert bytes < tamanho_fonte / 2,
             "mapa com #{bytes} bytes para um fonte de #{tamanho_fonte} nao e indice denso"
    end
  end
end
