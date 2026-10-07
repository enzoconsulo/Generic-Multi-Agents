defmodule Fabrica.Criterios.Suite do
  @moduledoc """
  A suite do projeto roda em TODA verificacao, **sem estar escrita em tarefa nenhuma**.

  E a razao de o template de tarefa da v1 dizer, em maiusculas, *"NAO escreva 'a suite continua
  passando' como criterio"*: a fabrica ja roda a suite sozinha, e escreve-la a mao so cria uma
  **segunda chance de errar o comando** — e errar o comando de um criterio e a unica coisa que
  o construtor nao pode consertar, porque por contrato ele nao altera criterio.

  Foi assim que a T-030 do banco-imobiliario gastou 4 ciclos e US$ 12,90: alguem escreveu
  `node --test tests` a mao, e a fabrica ja teria rodado a suite certa sozinha.

  ## Declaracao vence palpite

  A ordem e sempre esta:

  1. **`_gestao/ci.json`**, estagio `testes` — e uma DECLARACAO, escrita por quem conhece o
     projeto;
  2. **deteccao por arquivo-marcador** (`Fabrica.Ecossistemas`) — e um palpite, util quando
     ninguem declarou nada;
  3. **nada** — e o projeto roda sem criterio implicito, o que nao e erro.

  O `ci.json` vencer nao e cortesia: um projeto pode ter `mix.exs` e mesmo assim rodar a suite
  por um alias proprio (`mix verificar`, `mix fabrica.ci`), e o palpite nunca saberia disso.

  ## O criterio nasce marcado como IMPLICITO

  Ele entra na lista com `implicito: true` e aparece no relatorio com essa marca. E deliberado:
  quem le o relatorio precisa distinguir *"a fabrica rodou isto sozinha"* de *"alguem pediu
  isto"* — sem a marca, o criterio parece ter sido escrito por alguem, e o proximo planejador
  o escreve de novo por achar que sumiu.

  ## Deduplicacao cuida do resto

  Se a tarefa **ja declara** o comando da suite, a passada mecanica roda uma vez so: a chave de
  comando de `Fabrica.Criterios` faz o segundo virar espelho. Entao acrescentar o implicito
  nunca custa uma execucao a mais.
  """

  alias Fabrica.Ecossistemas

  @typedoc "De onde veio o comando da suite."
  @type origem :: :declarado | {:detectado, atom()}

  @arquivo_ci "_gestao/ci.json"
  @estagio_de_testes "testes"

  @doc """
  O comando da suite deste projeto, e de onde ele veio.

  ## Exemplos

      iex> Fabrica.Criterios.Suite.comando("caminho/que/nao/existe")
      {:erro, :sem_ecossistema}
  """
  @spec comando(Path.t()) :: {:ok, String.t(), origem()} | {:erro, :sem_ecossistema}
  def comando(raiz) do
    case declarado(raiz) do
      nil -> detectado(raiz)
      comando -> {:ok, comando, :declarado}
    end
  end

  defp detectado(raiz) do
    case Ecossistemas.detectar(raiz) do
      nil -> {:erro, :sem_ecossistema}
      ecossistema -> {:ok, ecossistema.testes, {:detectado, ecossistema.id}}
    end
  end

  # Leitura TOLERANTE de ponta a ponta: arquivo ausente, JSON quebrado ou estagio sem comando
  # devolvem `nil` e caem na deteccao. Um `ci.json` malformado nao pode impedir a suite de
  # rodar — seria trocar "o palpite talvez erre o comando" por "ninguem roda a suite".
  defp declarado(raiz) do
    with {:ok, texto} <- File.read(Path.join(raiz, @arquivo_ci)),
         {:ok, %{"estagios" => estagios}} when is_list(estagios) <- Jason.decode(texto),
         %{"comando" => comando} when is_binary(comando) <- estagio_de_testes(estagios) do
      vazio_vira_nil(String.trim(comando))
    else
      _nao_declarado -> nil
    end
  end

  defp estagio_de_testes(estagios) do
    Enum.find(estagios, fn
      %{"nome" => nome} -> nome == @estagio_de_testes
      _outro -> false
    end)
  end

  defp vazio_vira_nil(""), do: nil
  defp vazio_vira_nil(comando), do: comando

  @doc """
  O criterio implicito da suite, ou `nil` quando o projeto nao tem ecossistema reconhecido.

  O texto diz de onde o comando veio, porque quem le o relatorio precisa saber se confia num
  arquivo declarado ou num palpite.
  """
  @spec criterio(Path.t()) :: map() | nil
  def criterio(raiz) do
    case comando(raiz) do
      {:erro, :sem_ecossistema} ->
        nil

      {:ok, comando, origem} ->
        %{
          texto: "A suite do projeto passa (#{explicar_origem(origem)}).",
          comando: comando,
          marcado: false,
          implicito: true
        }
    end
  end

  defp explicar_origem(:declarado), do: "declarado em #{@arquivo_ci}"

  defp explicar_origem({:detectado, id}) do
    rotulo = Ecossistemas.por_id(id).rotulo
    "detectado: #{rotulo}"
  end

  @doc """
  Acrescenta o criterio implicito ao fim da lista lida da tarefa.

  Vai no FIM de proposito: os criterios que alguem escreveu vem primeiro no relatorio, porque
  sao eles que descrevem o que a tarefa pediu. Projeto sem ecossistema reconhecido devolve a
  lista intacta — **e essa e a resposta certa**, nao um erro.
  """
  @spec acrescentar([map()], Path.t()) :: [map()]
  def acrescentar(criterios, raiz) do
    case criterio(raiz) do
      nil -> criterios
      implicito -> criterios ++ [implicito]
    end
  end
end
