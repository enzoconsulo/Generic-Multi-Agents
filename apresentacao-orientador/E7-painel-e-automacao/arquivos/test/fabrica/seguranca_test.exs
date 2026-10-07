defmodule Fabrica.SegurancaTest do
  @moduledoc """
  Um teste por padrao (criterio 1), e depois os dois pontos que fazem a tarefa: recusa em vez
  de aviso (criterio 2) e a lista de exclusao versionada com motivo (criterio 3).
  """

  use ExUnit.Case, async: true

  alias Fabrica.Seguranca

  describe "cada padrao de segredo e detectado" do
    test "chave da Anthropic (sk-ant-)" do
      achados =
        Seguranca.varrer_texto(
          "lib/x.ex",
          "chave = \"sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789\""
        )

      assert [%{padrao: :chave_anthropic}] = achados
    end

    test "chave da OpenAI (sk-...) sem casar com a da Anthropic" do
      achados =
        Seguranca.varrer_texto("lib/x.ex", "chave = \"sk-abcdefghijklmnopqrstuvwxyz012345\"")

      assert [%{padrao: :chave_openai}] = achados
    end

    test "token de nuvem — AWS (AKIA...)" do
      achados =
        Seguranca.varrer_texto(
          "terraform/main.tf",
          "aws_access_key_id = \"AKIAABCDEFGHIJKLMNOP\""
        )

      assert [%{padrao: :chave_aws}] = achados
    end

    test "token de nuvem — Google (AIza...)" do
      achados =
        Seguranca.varrer_texto(
          "config/dev.exs",
          "google_api_key: \"AIzaSyAbcdefghijklmnopqrstuvwxyz0123456\""
        )

      assert [%{padrao: :chave_google}] = achados
    end

    test "token de nuvem — GitHub (ghp_...)" do
      achados =
        Seguranca.varrer_texto(
          ".github/workflows/ci.yml",
          "GITHUB_TOKEN: ghp_abcdefghijklmnopqrstuvwxyz0123456789"
        )

      assert [%{padrao: :token_github}] = achados
    end

    test "chave privada (-----BEGIN ... PRIVATE KEY-----)" do
      conteudo = """
      -----BEGIN RSA PRIVATE KEY-----
      MIIEowIBAAKCAQEAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
      -----END RSA PRIVATE KEY-----
      """

      achados = Seguranca.varrer_texto("chaves/servidor.pem", conteudo)

      assert [%{padrao: :chave_privada}] = achados
    end

    test "string de conexao com senha" do
      achados =
        Seguranca.varrer_texto(
          "config/runtime.exs",
          "url: \"postgres://fabrica:senha_secreta@db.exemplo.com:5432/fabrica\""
        )

      assert [%{padrao: :string_conexao_senha}] = achados
    end

    test ".env versionado" do
      achados = Seguranca.varrer_texto(".env", "SECRET_KEY_BASE=qualquercoisa")

      assert [%{padrao: :env_versionado}] = achados
    end

    test ".env.example NAO e .env versionado — e o arquivo de modelo, sem segredo real" do
      assert Seguranca.varrer_texto(".env.example", "SECRET_KEY_BASE=troque-me") == []
    end

    test "texto sem nenhum padrao nao produz achado" do
      assert Seguranca.varrer_texto("lib/normal.ex", "defmodule X do\n  def y, do: 1\nend\n") ==
               []
    end
  end

  describe "segredo encontrado RECUSA a publicacao, nao apenas avisa" do
    test "varrer/1 devolve {:recusado, achados} quando ha segredo, e :ok quando nao ha" do
      limpo = [{"lib/x.ex", "def y, do: 1"}]

      com_segredo = [
        {"config/runtime.exs", "chave = \"sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789\""}
      ]

      assert Seguranca.varrer(limpo) == :ok
      assert {:recusado, [%{padrao: :chave_anthropic}]} = Seguranca.varrer(com_segredo)
    end

    test "o retorno OBRIGA o chamador a tratar o caso — nao existe forma de so logar e seguir" do
      # :ok e {:recusado, _} sao os dois unicos formatos; nao ha terceiro estado "avisado".
      resultado = Seguranca.varrer([{".env", "X=1"}])

      assert match?({:recusado, _}, resultado)
    end

    test "varios arquivos, varios achados, um por segredo encontrado" do
      arquivos = [
        {"a.ex", "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789"},
        {"b.ex", "AKIAABCDEFGHIJKLMNOP"},
        {"c.ex", "nada aqui"}
      ]

      assert {:recusado, achados} = Seguranca.varrer(arquivos)
      assert length(achados) == 2
      assert Enum.map(achados, & &1.padrao) |> Enum.sort() == [:chave_anthropic, :chave_aws]
    end
  end

  describe "falso positivo e contornavel por lista de exclusao versionada, com o motivo" do
    test "um achado listado em permitidos/0 nao entra na recusa" do
      [permitido | _] = Seguranca.permitidos()

      # A propria lista de exclusao precisa trazer o motivo — sem isso, nao e "registrado".
      assert is_binary(permitido.motivo)
      assert String.trim(permitido.motivo) != ""

      assert Seguranca.varrer([{permitido.arquivo, permitido.trecho}]) == :ok
    end

    test "a exclusao e ESPECIFICA (arquivo + padrao + trecho), nao desliga o padrao inteiro" do
      [permitido | _] = Seguranca.permitidos()

      # O mesmo padrao, em outro arquivo, continua sendo recusado — a lista libera UM achado
      # exato, nunca a deteccao do padrao inteiro.
      outro_arquivo = "outro/#{Path.basename(permitido.arquivo)}"

      assert {:recusado, [%{padrao: padrao}]} =
               Seguranca.varrer([{outro_arquivo, permitido.trecho}])

      assert padrao == permitido.padrao
    end
  end
end
