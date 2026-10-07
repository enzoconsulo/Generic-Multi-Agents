defmodule Fabrica.Ferramentas.ConfinamentoTest do
  @moduledoc """
  Uma forma de escapar por teste. Este arquivo e a prova de que o confinamento e uma
  propriedade do codigo, e nao um pedido no prompt.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Ferramentas.Confinamento

  # O temporario e sob `_build`, e NAO `System.tmp_dir!/0`, por um motivo medido: no Windows
  # o temporario vem na forma CURTA 8.3 (`ENZOCO~1`) enquanto `:file.read_link_all/1`
  # devolve sempre a LONGA (`enzoconsulo`). Sao o mesmo diretorio com textos diferentes, e o
  # teste de link para DENTRO falharia pela limitacao 8.3 ja documentada em `Confinamento`
  # (que erra para o lado seguro) em vez de falhar pelo que ele quer provar.
  #
  # `File.cwd!/0` da a raiz do projeto, que e caminho longo. Sem subprocesso, sem truque.
  defp base_temporaria do
    Path.join([File.cwd!(), "_build", "test", "tmp"])
  end

  setup do
    base = Path.join(base_temporaria(), "conf-#{System.unique_integer([:positive])}")
    raiz = Path.join(base, "projeto")
    fora = Path.join(base, "fora")

    File.mkdir_p!(Path.join(raiz, "sub"))
    File.mkdir_p!(fora)
    File.write!(Path.join(raiz, "dentro.txt"), "dentro")
    File.write!(Path.join(fora, "segredo.txt"), "segredo")

    on_exit(fn -> File.rm_rf(base) end)
    {:ok, raiz: raiz, fora: fora, base: base}
  end

  describe "o que passa" do
    test "caminho relativo simples", %{raiz: raiz} do
      assert {:ok, absoluto} = Confinamento.resolver(raiz, "dentro.txt")
      assert String.ends_with?(String.replace(absoluto, "\\", "/"), "projeto/dentro.txt")
    end

    test "caminho em subdiretorio", %{raiz: raiz} do
      assert {:ok, _} = Confinamento.resolver(raiz, "sub/arquivo.ex")
    end

    test "arquivo que ainda NAO existe (escrever cria)", %{raiz: raiz} do
      assert {:ok, _} = Confinamento.resolver(raiz, "novo/caminho/ainda-nao.ex")
    end

    test "a propria raiz", %{raiz: raiz} do
      assert {:ok, _} = Confinamento.resolver(raiz, ".")
    end

    test "travessia que volta para dentro", %{raiz: raiz} do
      # `sub/../dentro.txt` sai e volta: o resultado esta dentro, e tem de passar.
      assert {:ok, _} = Confinamento.resolver(raiz, "sub/../dentro.txt")
    end

    test "caminho absoluto que aponta para DENTRO", %{raiz: raiz} do
      assert {:ok, _} = Confinamento.resolver(raiz, Path.join(raiz, "dentro.txt"))
    end
  end

  describe "escape 1: caminho absoluto para fora" do
    test "recusa caminho absoluto do sistema", %{raiz: raiz} do
      assert {:erro, :fora_do_confinamento} =
               Confinamento.resolver(raiz, "C:/Windows/System32/drivers/etc/hosts")
    end

    test "recusa caminho absoluto estilo unix", %{raiz: raiz} do
      assert {:erro, :fora_do_confinamento} = Confinamento.resolver(raiz, "/etc/passwd")
    end

    test "recusa absoluto para o irmao do projeto", %{raiz: raiz, fora: fora} do
      assert {:erro, :fora_do_confinamento} =
               Confinamento.resolver(raiz, Path.join(fora, "segredo.txt"))
    end
  end

  describe "escape 2: travessia" do
    test "recusa ../ que sai da raiz", %{raiz: raiz} do
      assert {:erro, :fora_do_confinamento} =
               Confinamento.resolver(raiz, "../fora/segredo.txt")
    end

    test "recusa travessia profunda", %{raiz: raiz} do
      assert {:erro, :fora_do_confinamento} =
               Confinamento.resolver(raiz, "../../../../../../Windows/win.ini")
    end

    test "recusa travessia que so aparece DEPOIS de normalizar", %{raiz: raiz} do
      # O texto cru comeca com `sub/`, que parece seguro. So `Path.expand` revela a saida.
      assert {:erro, :fora_do_confinamento} =
               Confinamento.resolver(raiz, "sub/../../fora/segredo.txt")
    end

    test "recusa travessia com barra invertida", %{raiz: raiz} do
      assert {:erro, :fora_do_confinamento} = Confinamento.resolver(raiz, "..\\fora\\segredo.txt")
    end

    test "diretorio irmao com nome PREFIXO nao passa", %{base: base} do
      # `/projeto-outro` comeca com `/projeto`. Sem a barra na comparacao de prefixo, ele
      # passaria por estar "sob" a raiz — e e outro diretorio.
      raiz = Path.join(base, "projeto")
      vizinho = Path.join(base, "projeto-outro")
      File.mkdir_p!(vizinho)

      assert {:erro, :fora_do_confinamento} =
               Confinamento.resolver(raiz, Path.join(vizinho, "x.txt"))
    end
  end

  describe "escape 3: link que aponta para fora" do
    # `File.ln_s/2` devolve `:eperm` no Windows sem privilegio de administrador — medido
    # nesta maquina. Mas a JUNCAO de diretorio (`mklink /J`) e criavel por qualquer usuario,
    # e o `:file.read_link_all/1` a resolve igual. Entao o caso E exercitado de verdade aqui,
    # em vez de virar um teste que passa por vazio dizendo "nao deu para testar".
    defp criar_link(destino, atalho) do
      case File.ln_s(destino, atalho) do
        :ok ->
          :ok

        {:error, _} ->
          {_saida, codigo} =
            System.cmd(
              "cmd",
              [
                "/c",
                "mklink",
                "/J",
                String.replace(atalho, "/", "\\"),
                String.replace(destino, "/", "\\")
              ],
              stderr_to_stdout: true
            )

          if codigo == 0, do: :ok, else: {:error, :sem_link}
      end
    end

    test "recusa link cujo DESTINO esta fora", %{raiz: raiz, fora: fora} do
      atalho = Path.join(raiz, "atalho")

      assert :ok = criar_link(fora, atalho),
             "sem conseguir criar link, este teste nao prova nada — e ele e um criterio"

      # O caminho textual esta INTEIRO dentro da raiz. So resolver o destino real denuncia
      # a saida: e por isso que comparar texto nao basta.
      assert {:erro, :fora_do_confinamento} = Confinamento.resolver(raiz, "atalho/segredo.txt")
    end

    test "link que aponta para DENTRO continua passando", %{raiz: raiz} do
      # O confinamento barra o destino de fora, e nao o link em si. Recusar todo link
      # tornaria a ferramenta inutil em projeto que usa link legitimamente.
      alvo = Path.join(raiz, "sub")
      atalho = Path.join(raiz, "atalho-interno")

      assert :ok = criar_link(alvo, atalho)
      assert {:ok, _} = Confinamento.resolver(raiz, "atalho-interno/arquivo.txt")
    end

    test "o resolvedor segue link mesmo quando o alvo nao existe", %{raiz: raiz} do
      # Garante que a resolucao nao explode quando o caminho e novo — `escrever` cria.
      assert {:ok, _} = Confinamento.resolver(raiz, "sub/novo/arquivo.txt")
    end
  end

  describe "escape 4: caminho UNC" do
    test "recusa \\\\servidor\\share", %{raiz: raiz} do
      assert {:erro, :caminho_unc} = Confinamento.resolver(raiz, "\\\\servidor\\share\\x.txt")
    end

    test "recusa //servidor/share", %{raiz: raiz} do
      assert {:erro, :caminho_unc} = Confinamento.resolver(raiz, "//servidor/share/x.txt")
    end
  end

  describe "escape 5: nome de dispositivo" do
    test "recusa cada dispositivo reservado", %{raiz: raiz} do
      for nome <- ~w[CON PRN AUX NUL COM1 LPT1] do
        assert {:erro, :dispositivo} = Confinamento.resolver(raiz, nome),
               "#{nome} tinha de ser recusado: nao e arquivo, e um dispositivo"
      end
    end

    test "recusa dispositivo COM EXTENSAO", %{raiz: raiz} do
      # `nul.txt` ainda e o dispositivo nulo — a extensao nao muda isso.
      assert {:erro, :dispositivo} = Confinamento.resolver(raiz, "nul.txt")
    end

    test "recusa dispositivo em subdiretorio", %{raiz: raiz} do
      # O nome reservado vale em QUALQUER diretorio.
      assert {:erro, :dispositivo} = Confinamento.resolver(raiz, "sub/con")
    end

    test "recusa em qualquer caixa", %{raiz: raiz} do
      assert {:erro, :dispositivo} = Confinamento.resolver(raiz, "NuL")
    end

    test "nome que apenas COMECA com o dispositivo passa", %{raiz: raiz} do
      # `console.ex` nao e `con`. Recusar aqui seria barrar arquivo legitimo.
      assert {:ok, _} = Confinamento.resolver(raiz, "console.ex")
      assert {:ok, _} = Confinamento.resolver(raiz, "nulo.txt")
    end
  end

  describe "caixa alta e caixa baixa" do
    test "a comparacao e case-insensitive no Windows", %{raiz: raiz, fora: fora} do
      # O sistema de arquivos do Windows e case-insensitive. Uma comparacao sensivel a caixa
      # deixaria `..\PROJETO` passar por nao bater com `projeto`.
      assert {:erro, :fora_do_confinamento} =
               Confinamento.resolver(raiz, "..\\FORA\\SEGREDO.TXT")

      assert {:erro, :fora_do_confinamento} =
               Confinamento.resolver(raiz, String.upcase(Path.join(fora, "segredo.txt")))
    end

    test "o mesmo diretorio em maiusculas continua DENTRO", %{raiz: raiz} do
      if match?({:win32, _}, :os.type()) do
        assert {:ok, _} = Confinamento.resolver(raiz, String.upcase("dentro.txt"))
      end
    end

    test "normalizar deixa tudo comparavel" do
      # Barra invertida e separador em QUALQUER plataforma (contrato de entrada do agente);
      # a caixa segue o sistema de arquivos (D-014). Asserção nos DOIS ramos.
      if match?({:win32, _}, :os.type()) do
        assert Confinamento.normalizar("C:\\Pasta\\Sub\\") ==
                 Confinamento.normalizar("C:/pasta/sub")
      else
        # No Linux `Pasta` e `pasta` sao diretorios DIFERENTES: a barra e normalizada, a caixa
        # e PRESERVADA — igualar as duas aqui abriria fuga por um irmao em outra caixa.
        assert Confinamento.normalizar("C:\\Pasta\\Sub\\") == "C:/Pasta/Sub"

        refute Confinamento.normalizar("C:\\Pasta\\Sub\\") ==
                 Confinamento.normalizar("C:/pasta/sub")
      end
    end
  end

  describe "entradas malformadas" do
    test "argumento que nao e string e recusado", %{raiz: raiz} do
      assert {:erro, :caminho_invalido} = Confinamento.resolver(raiz, nil)
      assert {:erro, :caminho_invalido} = Confinamento.resolver(raiz, 42)
    end

    test "string vazia resolve para a propria raiz", %{raiz: raiz} do
      assert {:ok, _} = Confinamento.resolver(raiz, "")
    end
  end

  # Os testes da T-080 ficam no FIM do arquivo de proposito: a linha de base da bateria na
  # nuvem (`_gestao/evidencias/linha-de-base-nuvem-2026-10-01.txt`) identifica as falhas da
  # T-081 por NUMERO DE LINHA (:97, :208, :224), e inserir teste acima delas as deslocaria.
  describe "diretorio novo e a raiz do sistema (T-080)" do
    test "dois niveis de diretorio inexistentes: aceito, e volta ABSOLUTO", %{raiz: raiz} do
      # No Linux, `normalizar("/")` dava `""`: a raiz real virava RELATIVA (`home/...`) e o
      # alvo com pai inexistente saia ABSOLUTO — relativo contra absoluto, tudo "fora".
      assert {:ok, absoluto} = Confinamento.resolver(raiz, "nivel1/nivel2/arquivo.txt")
      assert Path.type(absoluto) == :absolute
      assert absoluto == Path.join([Path.expand(raiz), "nivel1", "nivel2", "arquivo.txt"])
    end

    test "normalizar preserva a raiz do sistema" do
      assert Confinamento.normalizar("/") == "/"
    end

    test "normalizar devolve o mesmo de antes para o que NAO e a raiz" do
      # A mudanca e so na raiz. `Fabrica.Fila.Exclusao` usa `normalizar/1` para comparar
      # `areas`, e nenhum desses casos pode mudar.
      assert Confinamento.normalizar("") == ""
      assert Confinamento.normalizar("a/b") == "a/b"
      assert Confinamento.normalizar("a/b/") == "a/b"
      assert Confinamento.normalizar("/home/x/") == "/home/x"
      assert Confinamento.normalizar("/home/x") == "/home/x"
    end
  end

  describe "escape 6: diretorio novo DEPOIS de um link (T-080)" do
    test "link para fora seguido de diretorios que ainda nao existem e recusado",
         %{raiz: raiz, fora: fora} do
      # O pai (`atalho/novo/mais`) nao existe, entao a resolucao parava ali e julgava o TEXTO
      # — que esta inteiro dentro da raiz. Mas `escrever` faz `mkdir_p` atraves do link e o
      # arquivo nasceria em `fora/novo/mais/`. A subida tem de ir ate o link e segui-lo.
      atalho = Path.join(raiz, "atalho-fora")
      assert :ok = criar_link(fora, atalho)

      assert {:erro, :fora_do_confinamento} =
               Confinamento.resolver(raiz, "atalho-fora/novo/mais/arquivo.txt")
    end

    test "link para dentro seguido de diretorios novos continua passando", %{raiz: raiz} do
      atalho = Path.join(raiz, "atalho-sub")
      assert :ok = criar_link(Path.join(raiz, "sub"), atalho)

      assert {:ok, _} = Confinamento.resolver(raiz, "atalho-sub/novo/mais/arquivo.txt")
    end

    @tag timeout: 10_000
    test "ciclo de links e recusado, sem travar a resolucao", %{raiz: raiz} do
      # `a -> b` e `b -> a`: seguir o link sem limite e um laco infinito. O agente cria isso
      # com dois `ln -s`, e a proxima chamada de ferramenta prenderia o processo para sempre.
      a = Path.join(raiz, "ciclo-a")
      b = Path.join(raiz, "ciclo-b")
      assert :ok = criar_link(b, a)
      assert :ok = criar_link(a, b)

      assert {:erro, :fora_do_confinamento} = Confinamento.resolver(raiz, "ciclo-a/x/y.txt")
      assert {:erro, :fora_do_confinamento} = Confinamento.resolver(raiz, "ciclo-a")
    end
  end

  describe "semantica de caminho por SO (T-081, D-014)" do
    # Duas regras de naturezas diferentes. Barra invertida e separador em QUALQUER plataforma:
    # e contrato de ENTRADA do agente (a doutrina da fabrica nasceu no Windows). A caixa segue
    # o sistema de arquivos: ignorada no Windows, significativa no Linux.

    test "barra invertida e separador: resolver devolve a MESMA forma que julgou",
         %{raiz: raiz} do
      # Antes, no Linux, `sub\novo.txt` virava um arquivo chamado literalmente `sub\novo.txt`
      # na raiz, enquanto o julgamento olhava `sub/novo.txt`.
      assert {:ok, absoluto} = Confinamento.resolver(raiz, "sub\\novo.txt")
      assert absoluto == Path.expand(Path.join(raiz, "sub/novo.txt"))
      refute String.contains?(absoluto, "\\")
    end

    test "a raiz escrita em OUTRA caixa: mesmo diretorio no Windows, irmao FORA no Linux",
         %{raiz: raiz, base: base} do
      outra_caixa = Path.join(base, "PROJETO")

      if match?({:win32, _}, :os.type()) do
        # `PROJETO` e `projeto` sao o mesmo diretorio: continua dentro.
        assert {:ok, _} = Confinamento.resolver(raiz, Path.join(outra_caixa, "dentro.txt"))
      else
        # No Linux e um IRMAO. Comparar sem caixa aqui deixaria o agente escrever nele.
        File.mkdir_p!(outra_caixa)
        File.write!(Path.join(outra_caixa, "segredo.txt"), "segredo")

        assert {:erro, :fora_do_confinamento} =
                 Confinamento.resolver(raiz, Path.join(outra_caixa, "segredo.txt"))

        assert {:erro, :fora_do_confinamento} =
                 Confinamento.resolver(raiz, "..\\PROJETO\\segredo.txt")
      end
    end
  end

  # Destino RELATIVO exige link SIMBOLICO de verdade: a juncao (`mklink /J`), que o
  # `criar_link/2` usa no Windows sem privilegio, so aceita destino absoluto. Sem privilegio
  # para `File.ln_s/2` o agente tambem nao cria esse link — a fuga nao existe ali —, e os
  # testes abaixo saem como PULADOS, com o motivo, em vez de aprovados por vazio.
  @sem_link_relativo (fn ->
                        sonda =
                          Path.join([
                            File.cwd!(),
                            "_build",
                            "test",
                            "tmp",
                            "sonda-ln-#{System.unique_integer([:positive])}"
                          ])

                        File.mkdir_p!(Path.dirname(sonda))
                        resultado = File.ln_s("destino-relativo", sonda)
                        File.rm(sonda)

                        if resultado != :ok,
                          do: "sem privilegio para link simbolico: #{inspect(resultado)}"
                      end).()

  describe "escape 7: destino RELATIVO de link e resolvido no diretorio REAL (T-082)" do
    # O kernel resolve o destino relativo de um link a partir do diretorio onde o link ESTA de
    # verdade. Quando um diretorio do meio do caminho ja e link, esse diretorio nao e o do
    # texto: resolver `../..` contra o texto julga um lugar, e o acesso vai a outro.
    @describetag skip: @sem_link_relativo

    test "link relativo DEPOIS de um link para fora: `../..` sobe a partir do diretorio real",
         %{raiz: raiz, fora: fora, base: base} do
      # `d1/d2/atalho -> fora/alvo` e, dentro do alvo, `l -> ../../x`. Pelo TEXTO, `l` mora em
      # `projeto/d1/d2/atalho/` e `../../x` cai em `projeto/d1/x` — dentro. Pelo kernel, `l`
      # mora em `fora/alvo/`, e `../../x` cai em `<base>/x` — fora.
      alvo = Path.join(fora, "alvo")
      x = Path.join(base, "x")
      File.mkdir_p!(alvo)
      File.mkdir_p!(x)
      File.write!(Path.join(x, "segredo.txt"), "segredo de x")
      File.mkdir_p!(Path.join(raiz, "d1/d2"))

      assert :ok = criar_link(alvo, Path.join(raiz, "d1/d2/atalho"))
      assert :ok = File.ln_s("../../x", Path.join(alvo, "l"))

      # O sistema operacional sai da raiz de fato: e isto que o confinamento tem de enxergar.
      assert File.read!(Path.join(raiz, "d1/d2/atalho/l/segredo.txt")) == "segredo de x"

      assert {:erro, :fora_do_confinamento} =
               Confinamento.resolver(raiz, "d1/d2/atalho/l/segredo.txt")

      assert {:erro, :fora_do_confinamento} = Confinamento.resolver(raiz, "d1/d2/atalho/l")

      assert {:erro, :fora_do_confinamento} =
               Confinamento.resolver(raiz, "d1/d2/atalho/l/novo/arquivo.txt")
    end

    test "`..` DENTRO do destino relativo, depois de um link, tambem sobe pelo diretorio real",
         %{raiz: raiz, fora: fora} do
      # `l -> atalho/../z`, com `atalho -> fora/alvo`. Pelo texto, `atalho/..` se anula e `l`
      # vira `projeto/z`. Pelo kernel, `..` e o pai de `fora/alvo`: `l` vira `fora/z`.
      alvo = Path.join(fora, "alvo")
      z = Path.join(fora, "z")
      File.mkdir_p!(alvo)
      File.mkdir_p!(z)
      File.write!(Path.join(z, "segredo.txt"), "segredo de z")

      assert :ok = criar_link(alvo, Path.join(raiz, "atalho"))
      assert :ok = File.ln_s("atalho/../z", Path.join(raiz, "l"))

      assert File.read!(Path.join(raiz, "l/segredo.txt")) == "segredo de z"
      assert {:erro, :fora_do_confinamento} = Confinamento.resolver(raiz, "l/segredo.txt")
    end

    test "link relativo que, pelo diretorio real, fica DENTRO continua aceito", %{raiz: raiz} do
      # O conserto nao pode virar recusa em massa. Dois casos: o link relativo simples, e o
      # que o TEXTO mandaria para fora mas o diretorio real mantem dentro — `atalho-fundo ->
      # sub/a/b` e `sub/a/b/volta -> ../../alvo`. Pelo texto, `volta` mora em
      # `projeto/atalho-fundo/` e `../../alvo` sairia da raiz; de verdade cai em `sub/alvo`.
      File.write!(Path.join(raiz, "sub/aqui.txt"), "aqui")
      assert :ok = File.ln_s("sub", Path.join(raiz, "rel"))
      assert {:ok, _} = Confinamento.resolver(raiz, "rel/aqui.txt")
      assert {:ok, _} = Confinamento.resolver(raiz, "rel/novo/arquivo.txt")

      fundo = Path.join(raiz, "sub/a/b")
      File.mkdir_p!(fundo)
      File.mkdir_p!(Path.join(raiz, "sub/alvo"))
      File.write!(Path.join(raiz, "sub/alvo/arq.txt"), "no alvo")
      assert :ok = criar_link(fundo, Path.join(raiz, "atalho-fundo"))
      assert :ok = File.ln_s("../../alvo", Path.join(fundo, "volta"))

      assert File.read!(Path.join(raiz, "atalho-fundo/volta/arq.txt")) == "no alvo"
      assert {:ok, _} = Confinamento.resolver(raiz, "atalho-fundo/volta/arq.txt")
      assert {:ok, _} = Confinamento.resolver(raiz, "atalho-fundo/volta/novo/arquivo.txt")
    end

    @tag timeout: 10_000
    test "o teto de 40 saltos vale para a resolucao INTEIRA, nao por ramo", %{raiz: raiz} do
      # `n1 -> n2/n2`, `n2 -> n3/n3`, ..., `n25 -> .`: resolver `n1` exige 2^24 saltos. O
      # kernel recusa no 41o (ELOOP). Contar os saltos por ramo, e nao no total, deixaria a
      # resolucao explorar a arvore inteira — e uma chamada de ferramenta prenderia o processo.
      arvore = Path.join(raiz, "arvore")
      File.mkdir_p!(arvore)

      for k <- 1..24 do
        assert :ok = File.ln_s("n#{k + 1}/n#{k + 1}", Path.join(arvore, "n#{k}"))
      end

      assert :ok = File.ln_s(".", Path.join(arvore, "n25"))

      assert {:error, _} = File.read(Path.join(arvore, "n1/arq.txt"))
      assert {:erro, :fora_do_confinamento} = Confinamento.resolver(raiz, "arvore/n1/arq.txt")
    end
  end

  describe "escape 8: UNC com barras MISTAS no prefixo (T-083)" do
    # `\` e separador em toda plataforma (D-014), entao `\/servidor` e `/\servidor` sao o
    # MESMO `//servidor` que o Windows abre como caminho de rede. Antes, a recusa so via o
    # prefixo homogeneo (`\\` ou `//`): as formas mistas seguiam ate `real/1`, que no Windows
    # faz `read_link_all` no servidor — conexao SMB (e credencial NTLM oferecida) antes de
    # qualquer recusa.
    #
    # Por que `:caminho_unc` prova "antes do disco": so `recusar_unc/1` produz esse motivo, e
    # ela e o PRIMEIRO passo do `with` de `resolver/2`, sem tocar o sistema de arquivos. Se o
    # caminho chegasse a `dentro?/2` (onde mora `real/1`), o motivo seria outro.

    test "as quatro formas de prefixo de rede sao recusadas como UNC", %{raiz: raiz} do
      formas = ["\\/srv/share/x", "/\\srv\\share\\x", "\\\\srv\\share\\x", "//srv/share/x"]

      # Mapa forma -> resultado: a falha mostra QUAL forma escapou, e nao so a primeira.
      assert Map.new(formas, &{&1, Confinamento.resolver(raiz, &1)}) ==
               Map.new(formas, &{&1, {:erro, :caminho_unc}})
    end

    test "absoluto unix comum e barra invertida UNICA nao viram UNC", %{raiz: raiz} do
      # A raiz do teste e um `/home/...`-like legitimo: absoluto unix dentro dela passa.
      assert {:ok, _} = Confinamento.resolver(raiz, Path.join(raiz, "dentro.txt"))

      # Fora dela, o motivo e o confinamento, nao rede: uma barra so nao e prefixo UNC.
      for caminho <- ["/home/x/arq.txt", "\\lib\\foo.ex"] do
        assert {:erro, motivo} = Confinamento.resolver(raiz, caminho)
        refute motivo == :caminho_unc, "#{caminho} virou :caminho_unc"
      end
    end
  end
end
