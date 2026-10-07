defmodule Fabrica.MarcoV01Test do
  @moduledoc """
  A PROVA do marco da v0.1: a suite inteira roda sem rede, sem cota e sem chave de API.

  Este arquivo nao testa uma funcionalidade — ele testa uma **impossibilidade**, e por isso
  precisa continuar existindo depois que o marco foi dado por atingido. Um marco provado uma
  vez e esquecido volta a ser falso na primeira dependencia nova.

  ## Qual metodo de prova foi usado, e por que

  A T-009 admite dois: derrubar o adaptador de rede (`Disable-NetAdapter`) ou um teste que
  falhe se a suite tocar a rede. **Foi usado o segundo**, porque `Disable-NetAdapter` exige
  privilegio de administrador, que a sessao que construiu esta versao nao tem. E ele tem uma
  vantagem que o primeiro nao tem: **roda em toda verificacao**, para sempre.

  ## A PROVA MUDOU NA T-019, e o marco NAO

  Ate a T-018 este arquivo provava a ausencia de rede da forma mais simples possivel:
  **nenhum cliente HTTP era sequer carregavel**. Funcionava porque nao havia nenhum.

  A T-019 trouxe o `Operario.MessagesAPI`, que **precisa** de um cliente HTTP para existir —
  ele e a peca que persegue os ~50% da conta de entrada que a escrita de prefixo carrega. Com
  ele vieram `Req` e, por baixo, `Finch` e `Mint`.

  **O marco nunca foi "nao existe biblioteca de HTTP".** Ele e, e sempre foi, *"a suite roda
  sem tocar a rede e sem gastar cota"*. O proprio texto da versao anterior deste arquivo ja
  previa a mudanca: *"se ele entrou como dependencia, o adaptador que o usa (T-019) precisa
  mante-lo fora do caminho da suite"*.

  Entao a prova ficou **mais forte e mais especifica**, e nao mais fraca:

  | antes | agora |
  |---|---|
  | nenhum cliente HTTP e carregavel | nenhuma requisicao SAI da maquina — o `Req` roda com duble que LEVANTA |
  | nenhum arquivo cita credencial | exatamente UM modulo le credencial, e a variavel nem esta definida |

  A diferenca pratica: a versao antiga passaria mesmo que alguem escrevesse um cliente HTTP a
  mao com `:gen_tcp`. Esta nao.

  ## A PROVA MUDOU DE NOVO NA T-045 (D-001), e o marco NAO

  A T-045 trouxe `Embedder.Servico`, o adaptador de embedding por HTTP. A D-001 (medicao da
  T-042) o tornou o adaptador PADRAO — `Embedder.Local` (Bumblebee/EXLA) e inviavel no perfil
  de 8 GB e nao tem binario XLA para Windows. Com isso a rede ganhou um SEGUNDO dono legitimo,
  ao lado de `Operario.MessagesAPI`.

  Como na T-019, a prova ficou mais especifica, nao mais fraca: quem pode FALAR HTTP virou uma
  LISTA (`@donos_da_rede`), mas quem pode LER CREDENCIAL segue sendo um so (`@dono_da_rede`) —
  `Servico` le configuracao (`Application.get_env`), nunca `System.get_env`. E "Bearer " deixou
  de ser tratado como segredo literal NOS donos da rede, porque montar `"Bearer " <> chave` a
  partir de uma chave configurada e o trabalho de um adaptador HTTP, nao um vazamento.

  ## A PROVA MUDOU DE NOVO NA T-062 (D-004), e o marco NAO

  A T-062 trouxe `Embedder.Ollama`, o adaptador do modelo local decidido na D-004
  (`embeddinggemma` pelo Ollama). Ele fala HTTP com `127.0.0.1:11434` — local, sem chave, sem
  fatura — e por isso e o TERCEIRO dono legitimo da rede, ao lado de `Operario.MessagesAPI` e
  `Embedder.Servico`. A D-002 continua valendo: `Ollama` nao le `System.get_env` nenhuma, porque
  nao tem credencial para ler — a exclusividade de `@dono_da_rede` continua intacta.
  """

  use ExUnit.Case, async: true

  doctest Fabrica.Fonte

  alias Fabrica.Embedder
  alias Fabrica.Operario

  # Clientes HTTP INDEPENDENTES — nenhum adaptador desta fabrica usa nenhum deles. `Finch` e
  # `Mint` sairam desta lista porque sao o TRANSPORTE do `Req`, e nao alternativas a ele:
  # exigir que sumam seria exigir que o `Req` sumisse junto.
  @clientes_alheios [HTTPoison, Tesla]
  @aplicacoes_alheias [:hackney, :gun, :ibrowse, :httpoison, :tesla]

  # O modulo autorizado a ler CREDENCIAL — exclusivo, e a exclusividade E a garantia:
  # credencial lida em varios lugares e credencial que alguem vai ler sem querer. `Servico`
  # (um dono da rede, abaixo) fala HTTP mas NAO le credencial (usa `Application.get_env`, e
  # nao `System.get_env`), por isso a leitura de credencial continua num lugar so.
  @dono_da_rede "lib/fabrica/operario/messages_api.ex"

  # Os modulos autorizados a FALAR HTTP (referenciar `Req`). Eram um so ate a D-001 (T-042)
  # tornar `Embedder.Servico` o adaptador de embedding PADRAO — medido que `Embedder.Local`
  # (Bumblebee/EXLA) e inviavel no perfil de 8 GB / Windows sem binario XLA. Servico e, por
  # isso, um SEGUNDO dono legitimo da rede: roda sob o mesmo duble que LEVANTA, entao a
  # garantia "nada SAI da maquina durante a suite" vale igual para os dois. `Embedder.Ollama`
  # (T-062, D-004) e o TERCEIRO — fala com o Ollama local. Ver "A PROVA MUDOU DE NOVO NA
  # T-045" e "A PROVA MUDOU DE NOVO NA T-062" no moduledoc.
  @donos_da_rede [
    @dono_da_rede,
    "lib/fabrica/embedder/servico.ex",
    "lib/fabrica/embedder/ollama.ex"
  ]

  defp fontes_de_producao, do: Path.wildcard("lib/**/*.ex")

  # Remove docstring e comentario, deixando so o CODIGO. Nome de variavel de ambiente so tem
  # efeito quando executado; citado em prosa, ele DOCUMENTA — e o `@moduledoc` do
  # `Operario.ClaudeCLI` cita `ANTHROPIC_API_KEY` justamente para dizer que nao a usa.
  #
  # Morava aqui ate a T-030, quando a T-022 precisou da mesma limpeza e o segundo uso pediu
  # um lugar so. Ver `Fabrica.Fonte`, que lista os cinco falsos positivos que a motivaram.
  defdelegate limpar(texto), to: Fabrica.Fonte
  defdelegate so_codigo(arquivo), to: Fabrica.Fonte

  describe "sem rede: nada SAI da maquina" do
    test "o Req roda com duble durante a suite inteira" do
      # Esta e a prova central, e ela substituiu "o modulo nao e carregavel". Nao afirma que
      # a rede e inalcancavel em teoria: afirma que nada sai na pratica, porque o adaptador
      # de teste responde no lugar do de rede.
      assert Code.ensure_loaded?(Req), "o Req entrou na T-019 e deveria estar disponivel"

      assert Application.get_env(:req, :default_options)[:plug] == Fabrica.SemRede,
             """
             o Req nao esta em modo de teste. Sem isso, um adaptador mal configurado faria
             chamada REAL durante `mix test` — gastando dinheiro e derrubando este marco sem
             que nada acusasse.
             """
    end

    test "o duble global LEVANTA em vez de responder" do
      # Responder algo plausivel esconderia a requisicao esquecida; levantar a mostra.
      assert_raise RuntimeError, ~r/tentou SAIR durante a suite/, fn ->
        Req.get!(url: "https://api.anthropic.com/v1/messages")
      end
    end

    test "nenhum cliente HTTP ALHEIO e carregavel" do
      for modulo <- @clientes_alheios do
        refute Code.ensure_loaded?(modulo),
               "#{inspect(modulo)} esta disponivel, e nenhum adaptador desta fabrica o usa."
      end
    end

    test "nenhuma aplicacao de cliente HTTP alheio esta rodando" do
      rodando = Enum.map(Application.started_applications(), fn {nome, _, _} -> nome end)

      for aplicacao <- @aplicacoes_alheias do
        refute aplicacao in rodando, "a aplicacao #{aplicacao} esta rodando durante a suite."
      end
    end

    test "so o adaptador de HTTP referencia o Req" do
      # O Req ganhou dono. Se ele aparecer em qualquer outro fonte, alguem abriu um segundo
      # caminho ate a rede — e o duble protege um caminho de cada vez.
      padrao = ~r/(?<![A-Za-z0-9_.])Req(?![A-Za-z0-9_])/

      for arquivo <- fontes_de_producao(), arquivo not in @donos_da_rede do
        refute Regex.match?(padrao, File.read!(arquivo)),
               "#{arquivo} referencia Req. So os donos da rede podem: #{inspect(@donos_da_rede)}."
      end
    end

    test "nenhum fonte de producao abre socket a mao" do
      # A versao antiga desta prova passaria se alguem escrevesse um cliente HTTP com
      # `:gen_tcp`. Esta nao.
      for arquivo <- fontes_de_producao(), proibido <- ~w[gen_tcp httpc inets] do
        refute Regex.match?(~r/:#{proibido}\b/, so_codigo(arquivo)),
               "#{arquivo} usa :#{proibido}"
      end
    end

    test "o detector de referencia funciona, e nao passa por vazio" do
      padrao = ~r/(?<![A-Za-z0-9_.])Req(?![A-Za-z0-9_])/

      assert Regex.match?(padrao, "Req.post!(url)")
      refute Regex.match?(padrao, "%Requisicao{}")
      assert fontes_de_producao() != [], "a lista de fontes nao pode estar vazia"
    end
  end

  describe "sem cota e sem chave de API" do
    test "EXATAMENTE UM modulo le variavel de ambiente" do
      # A exclusividade e a garantia. A T-019 exige que a credencial seja lida — e exige que
      # seja num lugar so. Um segundo leitor e um segundo caminho ate a cota.
      leem = Enum.filter(fontes_de_producao(), &(so_codigo(&1) =~ "System.get_env"))

      assert leem == [@dono_da_rede],
             "leitura de variavel de ambiente fora do adaptador de rede: #{inspect(leem)}"
    end

    test "EXATAMENTE UM modulo cita ANTHROPIC_API_KEY em codigo" do
      leem = Enum.filter(fontes_de_producao(), &(so_codigo(&1) =~ "ANTHROPIC_API_KEY"))

      assert leem == [@dono_da_rede]
    end

    test "nenhum fonte de producao contem um segredo literal" do
      # "sk-ant-" e a FORMA de uma chave da Anthropic: um valor assim colado no fonte E o
      # segredo. Procurado no arquivo INTEIRO, docstring inclusive — uma chave num comentario
      # vaza igual. Vale para TODO fonte, sem excecao.
      for arquivo <- fontes_de_producao() do
        refute File.read!(arquivo) =~ "sk-ant-", "#{arquivo} contem um segredo literal (sk-ant-)"
      end

      # "Bearer " e o ESQUEMA de um cabecalho Authorization, nao um segredo. Um dono da rede
      # o monta a partir de uma chave CONFIGURADA (`"Bearer " <> chave`), nunca de um literal —
      # e e exatamente o que `Embedder.Servico` faz. Por isso os donos da rede sao isentos
      # DESTA forma, e so dela; em qualquer outro fonte, "Bearer " continua proibido.
      for arquivo <- fontes_de_producao(), arquivo not in @donos_da_rede do
        refute File.read!(arquivo) =~ "Bearer ", "#{arquivo} contem um segredo literal (Bearer )"
      end
    end

    test "as variaveis de credencial nao estao definidas no ambiente da suite" do
      # Nao basta o codigo ler num lugar so: o ambiente nao pode ter o que dar.
      for variavel <- ~w[ANTHROPIC_API_KEY OPENAI_API_KEY] do
        assert System.get_env(variavel) == nil,
               "#{variavel} esta definida. A suite nao pode nem ter como gastar cota."
      end
    end

    test "o filtro de docstring funciona, e nao passa por vazio" do
      com_codigo = "defmodule X do\n  System.get_env(\"API_KEY\")\nend"
      so_prosa = "defmodule X do\n  @moduledoc \"\"\"\n  roda sem API_KEY\n  \"\"\"\nend"

      assert limpar(com_codigo) =~ "API_KEY"
      refute limpar(so_prosa) =~ "API_KEY"
    end
  end

  describe "os adaptadores da suite sao os dubles" do
    test "o operario configurado e o Falso" do
      assert Operario.configurado() == Fabrica.Operario.Falso
    end

    test "o embedder configurado e o Falso" do
      assert Embedder.configurado() == Fabrica.Embedder.Falso
    end

    test "nenhuma versao anterior a v0.5 carrega modelo de embedding" do
      for modulo <- [Bumblebee, Nx, EXLA, Axon] do
        refute Code.ensure_loaded?(modulo),
               "#{inspect(modulo)} esta disponivel. O perfil alvo da v2 e 8 GB de RAM, e o " <>
                 "modelo local so entra na v0.5, decidido por medicao na T-042."
      end
    end
  end
end
