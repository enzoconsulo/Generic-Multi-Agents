defmodule Fabrica.Ferramentas.ArquivoTest do
  @moduledoc """
  As ferramentas de arquivo, com atencao especial ao `editar`.

  `editar` recusar zero ou multiplas ocorrencias nao e rigor gratuito: a edicao que "quase"
  acerta corrompe o arquivo em silencio, e silencio e o que a v2 existe para eliminar.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Ferramentas.Arquivo
  alias Fabrica.Tarefas.Area

  setup do
    raiz = Path.join(System.tmp_dir!(), "arq-#{System.unique_integer([:positive])}")
    File.mkdir_p!(Path.join(raiz, "lib"))
    on_exit(fn -> File.rm_rf(raiz) end)
    {:ok, raiz: raiz}
  end

  defp criar(raiz, caminho, conteudo) do
    completo = Path.join(raiz, caminho)
    File.mkdir_p!(Path.dirname(completo))
    File.write!(completo, conteudo)
  end

  describe "ler" do
    test "le um arquivo do projeto", %{raiz: raiz} do
      criar(raiz, "lib/x.ex", "conteudo")
      assert {:ok, "conteudo"} = Arquivo.ler(raiz, "lib/x.ex")
    end

    test "arquivo ausente devolve erro nomeado", %{raiz: raiz} do
      assert {:erro, :arquivo_ausente} = Arquivo.ler(raiz, "nao/existe.ex")
    end

    test "diretorio nao e arquivo", %{raiz: raiz} do
      assert {:erro, :nao_e_arquivo} = Arquivo.ler(raiz, "lib")
    end

    test "recusa ler fora do confinamento", %{raiz: raiz} do
      assert {:erro, :fora_do_confinamento} = Arquivo.ler(raiz, "../../etc/passwd")
    end

    test "arquivo grande demais e recusado, e nao lido pela metade", %{raiz: raiz} do
      # Ler 50 MB para o contexto de um agente nao e leitura: e um estouro de janela com o
      # custo ja pago.
      criar(raiz, "enorme.txt", String.duplicate("x", 2_000_001))
      assert {:erro, :arquivo_grande_demais} = Arquivo.ler(raiz, "enorme.txt")
    end
  end

  describe "escrever" do
    test "escreve e cria os diretorios que faltarem", %{raiz: raiz} do
      assert {:ok, _} = Arquivo.escrever(raiz, "novo/fundo/x.ex", "oi", [])
      assert {:ok, "oi"} = Arquivo.ler(raiz, "novo/fundo/x.ex")
    end

    test "sobrescreve arquivo existente", %{raiz: raiz} do
      criar(raiz, "x.ex", "velho")
      assert {:ok, _} = Arquivo.escrever(raiz, "x.ex", "novo", [])
      assert {:ok, "novo"} = Arquivo.ler(raiz, "x.ex")
    end

    test "recusa escrever fora do confinamento", %{raiz: raiz} do
      assert {:erro, :fora_do_confinamento} =
               Arquivo.escrever(raiz, "../fora.txt", "nao deveria", [])

      refute File.exists?(Path.join(Path.dirname(raiz), "fora.txt"))
    end

    test "recusa escrever em dispositivo", %{raiz: raiz} do
      assert {:erro, :dispositivo} = Arquivo.escrever(raiz, "NUL", "engolido", [])
    end

    test "recusa escrever caminho fora das areas da tarefa, e nao cria o arquivo", %{raiz: raiz} do
      # Momento 2 da T-038: a ferramenta de escrita, nao um aviso no prompt, e quem recusa.
      areas = [%Area{caminho: "lib/permitido.ex"}]

      assert {:erro, :fora_das_areas} =
               Arquivo.escrever(raiz, "lib/proibido.ex", "nao deveria", areas)

      refute File.exists?(Path.join(raiz, "lib/proibido.ex"))
    end

    test "permite escrever caminho declarado nas areas da tarefa", %{raiz: raiz} do
      areas = [%Area{caminho: "lib/permitido.ex"}]

      assert {:ok, _} = Arquivo.escrever(raiz, "lib/permitido.ex", "conteudo", areas)
      assert {:ok, "conteudo"} = Arquivo.ler(raiz, "lib/permitido.ex")
    end
  end

  describe "editar — substituicao EXATA" do
    test "troca uma ocorrencia unica", %{raiz: raiz} do
      criar(raiz, "x.ex", "antes do alvo depois")

      assert {:ok, _} = Arquivo.editar(raiz, "x.ex", "alvo", "trocado", [])
      assert {:ok, "antes do trocado depois"} = Arquivo.ler(raiz, "x.ex")
    end

    test "recusa quando o alvo aparece ZERO vezes", %{raiz: raiz} do
      criar(raiz, "x.ex", "conteudo qualquer")

      assert {:erro, :alvo_ausente} = Arquivo.editar(raiz, "x.ex", "nao esta aqui", "novo", [])
    end

    test "zero ocorrencias NAO altera o arquivo", %{raiz: raiz} do
      criar(raiz, "x.ex", "original")
      Arquivo.editar(raiz, "x.ex", "ausente", "novo", [])

      assert {:ok, "original"} = Arquivo.ler(raiz, "x.ex")
    end

    test "recusa quando o alvo aparece MAIS DE UMA vez", %{raiz: raiz} do
      criar(raiz, "x.ex", "repete repete")

      assert {:erro, :alvo_ambiguo} = Arquivo.editar(raiz, "x.ex", "repete", "trocado", [])
    end

    test "alvo ambiguo NAO altera o arquivo", %{raiz: raiz} do
      # E o caso que importa: substituir "a primeira" silenciosamente corromperia o arquivo,
      # e o agente seguiria acreditando que acertou.
      criar(raiz, "x.ex", "def somar\ndef somar")
      Arquivo.editar(raiz, "x.ex", "def somar", "def subtrair", [])

      assert {:ok, "def somar\ndef somar"} = Arquivo.ler(raiz, "x.ex")
    end

    test "conta ocorrencias que se sobrepoem no texto", %{raiz: raiz} do
      criar(raiz, "x.ex", "aaa")
      assert {:erro, :alvo_ambiguo} = Arquivo.editar(raiz, "x.ex", "a", "b", [])
    end

    test "alvo multilinha funciona", %{raiz: raiz} do
      criar(raiz, "x.ex", "linha1\nlinha2\nlinha3")

      assert {:ok, _} = Arquivo.editar(raiz, "x.ex", "linha1\nlinha2", "trocado", [])
      assert {:ok, "trocado\nlinha3"} = Arquivo.ler(raiz, "x.ex")
    end

    test "editar arquivo ausente devolve erro do arquivo, nao do alvo", %{raiz: raiz} do
      assert {:erro, :arquivo_ausente} = Arquivo.editar(raiz, "nao-existe.ex", "a", "b", [])
    end

    test "recusa editar fora do confinamento", %{raiz: raiz} do
      assert {:erro, :fora_do_confinamento} = Arquivo.editar(raiz, "../x.ex", "a", "b", [])
    end

    test "recusa editar caminho fora das areas da tarefa, e nao altera o arquivo", %{raiz: raiz} do
      # Momento 2 da T-038: mesmo com o alvo presente, a escrita e recusada por estar fora das
      # areas — e o arquivo fica intocado.
      criar(raiz, "lib/proibido.ex", "antes do alvo depois")
      areas = [%Area{caminho: "lib/permitido.ex"}]

      assert {:erro, :fora_das_areas} =
               Arquivo.editar(raiz, "lib/proibido.ex", "alvo", "trocado", areas)

      assert {:ok, "antes do alvo depois"} = Arquivo.ler(raiz, "lib/proibido.ex")
    end
  end

  describe "listar" do
    test "lista os arquivos do projeto, em ordem determinista", %{raiz: raiz} do
      criar(raiz, "lib/zeta.ex", "z")
      criar(raiz, "lib/alfa.ex", "a")
      criar(raiz, "readme.md", "r")

      assert {:ok, arquivos} = Arquivo.listar(raiz)

      assert arquivos == Enum.sort(arquivos)
      assert "lib/alfa.ex" in arquivos
      assert "lib/zeta.ex" in arquivos
      assert "readme.md" in arquivos
    end

    test "duas listagens seguidas dao a mesma ordem", %{raiz: raiz} do
      for n <- 1..10, do: criar(raiz, "lib/a#{n}.ex", "x")

      {:ok, uma} = Arquivo.listar(raiz)
      {:ok, outra} = Arquivo.listar(raiz)

      assert uma == outra
    end

    test "aceita padrao", %{raiz: raiz} do
      criar(raiz, "lib/x.ex", "x")
      criar(raiz, "readme.md", "r")

      assert {:ok, ["lib/x.ex"]} = Arquivo.listar(raiz, "lib/*.ex")
    end

    test "nao lista diretorio, so arquivo", %{raiz: raiz} do
      criar(raiz, "lib/sub/x.ex", "x")

      {:ok, arquivos} = Arquivo.listar(raiz)
      refute "lib/sub" in arquivos
    end
  end

  describe "buscar" do
    test "acha o texto com caminho e numero da linha", %{raiz: raiz} do
      criar(raiz, "lib/x.ex", "primeira\nsegunda com alvo\nterceira")

      assert {:ok, [{"lib/x.ex", 2, "segunda com alvo"}]} = Arquivo.buscar(raiz, "alvo")
    end

    test "acha em varios arquivos", %{raiz: raiz} do
      criar(raiz, "lib/a.ex", "tem alvo")
      criar(raiz, "lib/b.ex", "tambem tem alvo")

      {:ok, achados} = Arquivo.buscar(raiz, "alvo")
      assert length(achados) == 2
    end

    test "texto ausente devolve lista vazia, e nao erro", %{raiz: raiz} do
      criar(raiz, "lib/x.ex", "nada aqui")
      assert {:ok, []} = Arquivo.buscar(raiz, "inexistente")
    end

    test "busca e literal, e nao regex", %{raiz: raiz} do
      # O agente pede o que quer achar, nao um padrao. Um regex mal formado dele viraria
      # erro em vez de resultado vazio.
      criar(raiz, "lib/x.ex", "custo * 2")

      assert {:ok, [{_, _, "custo * 2"}]} = Arquivo.buscar(raiz, "custo * 2")
      assert {:ok, []} = Arquivo.buscar(raiz, ".*")
    end

    test "respeita o limite de achados", %{raiz: raiz} do
      criar(raiz, "lib/x.ex", Enum.map_join(1..100, "\n", fn _ -> "alvo" end))

      {:ok, achados} = Arquivo.buscar(raiz, "alvo", limite: 5)
      assert length(achados) == 5
    end
  end
end
