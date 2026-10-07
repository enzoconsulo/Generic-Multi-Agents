defmodule Fabrica.Fonte do
  @moduledoc """
  Le um fonte deixando **so o codigo** — sem docstring e sem comentario.

  ## Por que isto existe, e por que num lugar so

  Varios testes desta suite afirmam coisas da forma *"exatamente um modulo faz X"*: um le
  credencial (marco da v0.1), um escreve `tentativas` (T-022), um fala HTTP. Todos eles
  varrem o fonte procurando um padrao — e **todos** ja acusaram documentacao pelo menos uma
  vez, porque prosa que ENUNCIA a regra contem as mesmas palavras que o codigo que a quebra.

  Aconteceu cinco vezes ate aqui:

  | onde | o falso positivo |
  |---|---|
  | T-014 | o nome da biblioteca de HTTP citado no `@moduledoc` |
  | T-016 | `tarefas.status` citado ao dizer que a ferramenta nao existe |
  | T-018 | `ANTHROPIC_API_KEY` citada para dizer que o `ClaudeCLI` NAO a usa |
  | T-022 | quatro modulos citando `tentativas` em prosa |
  | T-030 | um doctest com `%{tentativas: 1}` |

  Na T-030 eu estava prestes a escrever a **segunda copia** do removedor de docstring. Este
  modulo e ela, uma vez so — e e o que a secao "ja existe — nao reinvente" do GUIA existe
  para forcar.

  ## O que conta como codigo

  Docstring (`@doc`, `@moduledoc`, `@typedoc`) e comentario saem. O resto fica, **incluindo
  `@type` e `@spec`** — quem quiser distinguir declaracao de atribuicao faz isso no proprio
  padrao, porque ai a regra fica ao lado da afirmacao que ela sustenta.
  """

  @docstring ~r/@(module|type)?doc\s+(""".*?"""|"[^"]*")/s
  @comentario ~r/^\s*#.*$/m

  @doc """
  Remove docstring e comentario de um trecho de codigo.

  ## Exemplos

      iex> Fabrica.Fonte.limpar(~s|@moduledoc "usa API_KEY"\\nx = 1|)
      "\\nx = 1"

      iex> Fabrica.Fonte.limpar("# API_KEY aqui\\nx = 1")
      "\\nx = 1"
  """
  @spec limpar(String.t()) :: String.t()
  def limpar(texto) do
    texto
    |> String.replace(@docstring, "")
    |> String.replace(@comentario, "")
  end

  @doc "Le o arquivo e devolve so o codigo dele."
  @spec so_codigo(Path.t()) :: String.t()
  def so_codigo(arquivo), do: arquivo |> File.read!() |> limpar()

  @doc """
  Os fontes de producao cujo CODIGO casa com o padrao.

  E a forma canonica das afirmacoes *"exatamente um modulo faz X"*.
  """
  @spec producao_que_casa(Regex.t(), String.t()) :: [String.t()]
  def producao_que_casa(padrao, glob \\ "lib/**/*.ex") do
    glob
    |> Path.wildcard()
    |> Enum.filter(&(so_codigo(&1) =~ padrao))
  end
end
