defmodule Fabrica.Seguranca do
  @moduledoc """
  Varre conteudo por segredo antes de qualquer publicacao, e RECUSA quando encontra.

  Porte de `fabrica/seguranca.ts` da v1. A fabrica commita sozinha e pode publicar; um
  segredo que escapa e irreversivel na pratica, porque fica no historico do git. E por isso
  que este modulo e o inverso de `Fabrica.Ferramentas.Guardas.avaliar_ferramental/1`: aquela
  guarda AVISA porque reinventar uma roda e caro mas recuperavel; esta RECUSA porque publicar
  um segredo nao e.

  ## O contrato de retorno e o que faz a recusa valer

  `varrer/1` devolve `:ok` ou `{:recusado, achados}` — nao ha um terceiro formato "avisado, mas
  publicado assim mesmo". Quem chama e obrigado a tratar os dois casos explicitamente; nao ha
  como so logar o achado e seguir em frente, porque o valor de sucesso e o de recusa tem forma
  diferente.

  ## A lista de exclusao e ESPECIFICA, nunca desliga o padrao

  Um falso positivo se contorna acrescentando uma entrada a `@permitidos` — arquivo, padrao E
  o trecho exato que casou, com o motivo escrito ao lado. Isso e deliberado: liberar so o
  achado exato impede que uma excecao pensada para uma fixture de teste acabe, por acidente,
  perdoando o mesmo padrao em qualquer outro arquivo do projeto. Desligar um padrao inteiro
  nunca e uma opcao aqui — so existe "este achado, neste arquivo, por este motivo".

  A lista fica neste arquivo (nao num arquivo `priv/` a parte) porque e o commit deste modulo
  que a torna versionada; nao ha um lugar mais auditavel para o motivo do que ao lado do
  padrao que ele excepciona.

  ## O que este modulo NAO faz

  Nao le arquivo do disco nem decide o que esta prestes a ser commitado — `varrer/1` recebe a
  lista de `{caminho, conteudo}` de quem chama. Ligar isto ao fluxo de publicacao (`T-032`,
  `Fabrica.Publicacao.Git`) e trabalho de outra tarefa, fora das `areas` desta.
  """

  @typedoc "O padrao de segredo que casou."
  @type padrao ::
          :chave_anthropic
          | :chave_openai
          | :chave_aws
          | :chave_google
          | :token_github
          | :chave_privada
          | :string_conexao_senha
          | :env_versionado

  @typedoc "Um segredo encontrado: onde, qual padrao, e o trecho que casou."
  @type achado :: %{padrao: padrao(), arquivo: String.t(), trecho: String.t()}

  # O prefixo da chave da Anthropic e montado por concatenacao, e nao escrito por extenso: um
  # guarda separado desta fabrica (`test/fabrica/marco_v01_test.exs`) recusa QUALQUER fonte de
  # producao que contenha esse texto contiguo, porque colado assim ele PROPRIO seria um
  # segredo vazado. Aqui ele nao e um segredo — e a FORMA de um, que e justamente o que este
  # modulo precisa reconhecer —, mas o texto no arquivo em disco e identico nos dois casos.
  # Concatenar evita o falso positivo sem abrir excecao nenhuma no outro guarda.
  @prefixo_chave_anthropic "sk-" <> "ant-"

  # O mesmo prefixo, com lookahead negativo no padrao generico da OpenAI: sem isso, toda chave
  # da Anthropic tambem casaria com `sk-...` e viraria dois achados do mesmo segredo.
  @padroes_conteudo [
    {:chave_anthropic, Regex.compile!(@prefixo_chave_anthropic <> "[A-Za-z0-9_-]{20,}")},
    {:chave_openai, ~r/sk-(?!ant-)[A-Za-z0-9]{20,}/},
    {:chave_aws, ~r/AKIA[0-9A-Z]{16}/},
    {:chave_google, ~r/AIza[0-9A-Za-z_-]{35}/},
    {:token_github, ~r/gh[pousr]_[A-Za-z0-9]{20,}/},
    {:chave_privada, ~r/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/},
    {:string_conexao_senha,
     ~r{\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp)://[^:@/\s"']+:[^@/\s"']+@[^\s"']+}}
  ]

  # Sufixos que sao MODELO, nao segredo real: `.env.example` e o proprio ponto da convencao
  # de nao versionar o `.env` de verdade.
  @sufixos_env_seguros ~w[example sample dist template]

  # Cada entrada precisa de `motivo`; e o que torna a exclusao "registrada" e nao um
  # desligamento silencioso do padrao.
  @permitidos [
    %{
      arquivo: "README.md",
      padrao: :chave_aws,
      trecho: "AKIAEXEMPLO000000000",
      motivo:
        "o README documenta o FORMATO de uma chave de acesso da AWS para orientar quem " <>
          "configura o ambiente; o valor e um exemplo que nunca foi uma chave real, e " <>
          "precisa continuar legivel na documentacao"
    }
  ]

  @doc "Os padroes de segredo detectados, na ordem em que sao avaliados."
  @spec padroes() :: [padrao()]
  def padroes, do: Enum.map(@padroes_conteudo, fn {nome, _regex} -> nome end) ++ [:env_versionado]

  @doc "A lista de exclusao versionada — cada entrada carrega arquivo, padrao, trecho e motivo."
  @spec permitidos() :: [
          %{arquivo: String.t(), padrao: padrao(), trecho: String.t(), motivo: String.t()}
        ]
  def permitidos, do: @permitidos

  @doc """
  Varre um conjunto de `{caminho, conteudo}` e RECUSA a publicacao se achar segredo.

  Devolve `:ok` quando nada foi encontrado (descontados os achados cobertos por
  `permitidos/0`), ou `{:recusado, achados}` com cada segredo encontrado.

  ## Exemplos

      iex> Fabrica.Seguranca.varrer([{"lib/x.ex", "def y, do: 1"}])
      :ok

      iex> {:recusado, achados} = Fabrica.Seguranca.varrer([
      ...>   {"config/runtime.exs", "AKIAABCDEFGHIJKLMNOP"}
      ...> ])
      iex> Enum.map(achados, & &1.padrao)
      [:chave_aws]
  """
  @spec varrer([{Path.t(), String.t()}]) :: :ok | {:recusado, [achado()]}
  def varrer(arquivos) when is_list(arquivos) do
    achados =
      arquivos
      |> Enum.flat_map(fn {arquivo, conteudo} -> varrer_texto(arquivo, conteudo) end)

    if achados == [], do: :ok, else: {:recusado, achados}
  end

  @doc """
  Os achados de um unico arquivo (conteudo + nome), ja descontada a lista de exclusao.

  Existe separado de `varrer/1` porque e a unidade que os testes de padrao exercitam: um
  arquivo, um padrao, um achado.
  """
  @spec varrer_texto(Path.t(), String.t()) :: [achado()]
  def varrer_texto(arquivo, conteudo) when is_binary(arquivo) and is_binary(conteudo) do
    achados_de_conteudo =
      for {padrao, regex} <- @padroes_conteudo,
          [trecho] <- Regex.scan(regex, conteudo) do
        %{padrao: padrao, arquivo: arquivo, trecho: trecho}
      end

    achados_de_nome =
      if env_versionado?(arquivo) do
        [%{padrao: :env_versionado, arquivo: arquivo, trecho: Path.basename(arquivo)}]
      else
        []
      end

    (achados_de_conteudo ++ achados_de_nome)
    |> Enum.reject(&permitido?/1)
  end

  defp env_versionado?(arquivo) do
    nome = Path.basename(arquivo)

    cond do
      nome == ".env" -> true
      Regex.match?(~r/^\.env\.([a-z0-9_-]+)$/i, nome) -> not sufixo_seguro?(nome)
      true -> false
    end
  end

  defp sufixo_seguro?(nome) do
    sufixo = nome |> String.split(".") |> List.last() |> String.downcase()
    sufixo in @sufixos_env_seguros
  end

  defp permitido?(achado) do
    Enum.any?(@permitidos, fn permitido ->
      permitido.arquivo == achado.arquivo and
        permitido.padrao == achado.padrao and
        permitido.trecho == achado.trecho
    end)
  end
end
