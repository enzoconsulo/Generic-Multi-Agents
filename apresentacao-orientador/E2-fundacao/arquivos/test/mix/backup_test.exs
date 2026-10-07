defmodule Fabrica.BackupTest do
  @moduledoc """
  Exercita o ciclo de backup CONTRA O BANCO DE VERDADE.

  `async: false` de proposito, e nao por descuido: a restauracao usa
  `pg_restore --clean --if-exists`, que DERRUBA e recria as tabelas do banco de teste. Rodar
  isso em paralelo com qualquer outro teste seria destruir a arvore embaixo dele.

  Pela mesma razao, as escritas que precisam ser vistas pelo `pg_dump` rodam
  `unboxed_run`: o sandbox do Ecto mantem tudo numa transacao nao commitada, e o `pg_dump`
  e outro processo — ele nao enxergaria nada, e o teste passaria restaurando um banco vazio
  sobre outro vazio. Um round trip que nao prova nada e pior que round trip nenhum.
  """

  use ExUnit.Case, async: false

  alias Ecto.Adapters.SQL.Sandbox
  alias Fabrica.Backup
  alias Fabrica.Projetos.Projeto
  alias Fabrica.Repo
  alias Fabrica.Tarefas.Tarefa

  @moduletag :precisa_pg_dump

  setup do
    destino = Path.join(System.tmp_dir!(), "fabrica-#{System.unique_integer([:positive])}.dump")

    on_exit(fn ->
      File.rm(destino)
      Sandbox.unboxed_run(Repo, fn -> Repo.delete_all(Projeto) end)
    end)

    {:ok, destino: destino}
  end

  defp semear(nome, codigo) do
    Sandbox.unboxed_run(Repo, fn ->
      projeto =
        Repo.insert!(Projeto.changeset(%Projeto{}, %{nome: nome, caminho: "C:/tmp/#{nome}"}))

      Repo.insert!(
        Tarefa.changeset(%Tarefa{}, %{
          projeto_id: projeto.id,
          codigo: codigo,
          titulo: "sobreviver ao dump",
          status: :em_teste,
          tentativas: 2
        })
      )
    end)
  end

  defp buscar(codigo) do
    Sandbox.unboxed_run(Repo, fn -> Repo.get_by(Tarefa, codigo: codigo) end)
  end

  # Sob o sandbox, `pg_restore --clean` recria o tipo `citext` com um oid NOVO e as conexoes
  # vivas ficam com o antigo em cache — a proxima consulta morre com
  # `cache lookup failed for type NNNNN`. Em dev e producao `Fabrica.Backup` resolve isso
  # derrubando as conexoes; o pool do sandbox nao atende esse pedido (ver o comentario em
  # `derrubar_conexoes/0`), entao aqui o Repo e reiniciado a mao.
  defp restaurar(destino) do
    # O log e CAPTURADO, e nao silenciado: sob o sandbox a restauracao avisa, com razao, que
    # nao conseguiu derrubar as conexoes. Deixar o aviso solto encheria a saida da suite de
    # texto que parece defeito; captura-lo transforma o ruido em cobertura do ramo de aviso.
    {resultado, registro} =
      ExUnit.CaptureLog.with_log(fn ->
        Backup.restaurar(destino)
      end)

    assert registro =~ "conexoes NAO foram derrubadas",
           "sob sandbox a restauracao TEM de avisar; sem o aviso, quem restaurar em " <>
             "producao fica com a aplicacao de pe e quebrada sem saber"

    Supervisor.terminate_child(Fabrica.Supervisor, Fabrica.Repo)
    Supervisor.restart_child(Fabrica.Supervisor, Fabrica.Repo)
    Sandbox.mode(Repo, :manual)

    resultado
  end

  defp apagar_tudo do
    Sandbox.unboxed_run(Repo, fn -> Repo.delete_all(Projeto) end)
  end

  describe "gravar" do
    test "grava um arquivo de dump e devolve o caminho", %{destino: destino} do
      semear("projeto-dump", "T-100")

      assert {:ok, ^destino} = Backup.gravar(destino: destino)
      assert File.exists?(destino)
      assert File.stat!(destino).size > 0
    end

    test "cria o diretorio de destino se ele nao existe" do
      caminho =
        System.tmp_dir!()
        |> Path.join("fabrica-novo-#{System.unique_integer([:positive])}")
        |> Path.join("dentro/do/nada.dump")

      on_exit(fn -> File.rm_rf(Path.dirname(Path.dirname(caminho))) end)

      assert {:ok, _} = Backup.gravar(destino: caminho)
      assert File.exists?(caminho)
    end

    test "sem destino, o nome carrega carimbo de data e hora" do
      # Nome com carimbo e o que impede um backup de sobrescrever o anterior — que seria
      # exatamente perder o que ele existe para guardar.
      {:ok, caminho} = Backup.gravar()
      on_exit(fn -> File.rm(caminho) end)

      assert Path.basename(caminho) =~ ~r/^\d{8}-\d{6}\.dump$/
      assert Path.dirname(caminho) == Backup.diretorio()
    end
  end

  describe "o ciclo completo: backup -> apagar -> restaurar" do
    test "devolve os mesmos dados", %{destino: destino} do
      semear("projeto-ciclo", "T-200")

      antes = buscar("T-200")
      assert antes.titulo == "sobreviver ao dump"
      assert antes.status == :em_teste
      assert antes.tentativas == 2

      assert {:ok, ^destino} = Backup.gravar(destino: destino)

      apagar_tudo()
      refute buscar("T-200"), "a tarefa precisa MESMO sumir, senao o round trip nao prova nada"

      assert {:ok, ^destino} = restaurar(destino)

      depois = buscar("T-200")
      assert depois, "a tarefa tinha de voltar"
      assert depois.codigo == "T-200"
      assert depois.titulo == "sobreviver ao dump"
      assert depois.status == :em_teste
      assert depois.tentativas == 2
    end

    test "restaurar duas vezes seguidas funciona (--clean --if-exists)", %{destino: destino} do
      semear("projeto-repetido", "T-201")
      {:ok, _} = Backup.gravar(destino: destino)

      assert {:ok, _} = restaurar(destino)
      assert {:ok, _} = restaurar(destino)

      assert buscar("T-201")
    end
  end

  describe "erros" do
    test "restaurar um dump inexistente devolve erro nomeado" do
      assert {:erro, {:dump_ausente, "nao/existe.dump"}} = Backup.restaurar("nao/existe.dump")
    end

    test "executavel ausente devolve erro nomeado, e nao excecao crua" do
      original = Application.get_env(:fabrica, :pg_bin)
      Application.put_env(:fabrica, :pg_bin, "C:/caminho/que/nao/existe")
      on_exit(fn -> Application.put_env(:fabrica, :pg_bin, original) end)

      assert {:erro, {:executavel_ausente, _, _}} = Backup.gravar(destino: "x.dump")
      refute Backup.disponivel?()
    end
  end

  describe "listagem" do
    test "lista os dumps do mais novo para o mais velho" do
      dir = Path.join(System.tmp_dir!(), "dumps-#{System.unique_integer([:positive])}")
      File.mkdir_p!(dir)
      original = Application.get_env(:fabrica, :diretorio_backups)
      Application.put_env(:fabrica, :diretorio_backups, dir)

      on_exit(fn ->
        # `delete_env` quando nao havia chave, e nao `put_env(nil)`: por `nil` explicito
        # DEIXA a chave presente valendo nil, e a leitura seguinte para de cair no padrao.
        # Foi assim que este bloco quebrou outro teste na primeira execucao.
        if original,
          do: Application.put_env(:fabrica, :diretorio_backups, original),
          else: Application.delete_env(:fabrica, :diretorio_backups)

        File.rm_rf(dir)
      end)

      for nome <- ["20260101-000000.dump", "20260828-120000.dump", "20260501-000000.dump"] do
        File.write!(Path.join(dir, nome), "x")
      end

      File.write!(Path.join(dir, "leia-me.txt"), "nao sou dump")

      assert Backup.listar() |> Enum.map(&Path.basename/1) == [
               "20260828-120000.dump",
               "20260501-000000.dump",
               "20260101-000000.dump"
             ]
    end

    test "diretorio inexistente lista vazio, sem quebrar" do
      original = Application.get_env(:fabrica, :diretorio_backups)
      Application.put_env(:fabrica, :diretorio_backups, "nao/existe")

      on_exit(fn ->
        if original,
          do: Application.put_env(:fabrica, :diretorio_backups, original),
          else: Application.delete_env(:fabrica, :diretorio_backups)
      end)

      assert Backup.listar() == []
    end
  end

  describe "configuracao" do
    test "o executavel vem de config, nunca do PATH" do
      original = Application.get_env(:fabrica, :pg_bin)
      Application.put_env(:fabrica, :pg_bin, "C:/pgsql/18/bin")
      on_exit(fn -> Application.put_env(:fabrica, :pg_bin, original) end)

      assert Backup.executavel("pg_dump") == "C:/pgsql/18/bin/pg_dump"
    end

    test "sem config, cai para o nome puro" do
      original = Application.get_env(:fabrica, :pg_bin)
      Application.delete_env(:fabrica, :pg_bin)
      on_exit(fn -> Application.put_env(:fabrica, :pg_bin, original) end)

      assert Backup.executavel("pg_dump") == "pg_dump"
    end
  end
end
