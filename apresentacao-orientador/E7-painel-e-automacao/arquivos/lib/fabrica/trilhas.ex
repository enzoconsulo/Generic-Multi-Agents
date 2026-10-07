defmodule Fabrica.Trilhas do
  @moduledoc """
  Qual trilha um projeto percorre, decidida por um unico fato: o `dominio`.

  A fabrica constroi qualquer artefato; software e o mais calibrado, nao o unico. O eixo
  que separa os dois casos nao e "e codigo?", e sim **como se prova que ficou pronto** — em
  software a prova mecanica vem de graca (roda, e o programa passa ou quebra); fora dele nao
  vem, e e ai que o desenho degeneraria se o verificador virasse um segundo revisor, com dois
  julgamentos subjetivos custando em dobro.

  `dominio` ausente (`nil`) ou `"software"` -> trilha `:software`, SEMPRE. Qualquer outro
  valor -> `:generica`. Doutrina completa em `_sistema/BIBLIOTECAS.md` (software) e
  `_sistema/DOMINIOS.md` (generica) — **nenhum agente de software le a segunda**: a
  generalizacao nao pode passar pelo caminho quente, que esta calibrado e medido.

  `Fabrica.Tarefas.Fila` ja usa `:construtor`, `:verificador` e `:revisor` como os PAPEIS do
  pipeline, iguais nas duas trilhas — o que muda com a trilha e qual agente atende cada um
  (`agente/2`), nao a forma da fila.
  """

  @typedoc "As duas trilhas que a fabrica conhece."
  @type t :: :software | :generica

  @typedoc "Os tres papeis do pipeline, os mesmos nas duas trilhas."
  @type papel :: :construtor | :verificador | :revisor

  @software "software"

  # A tabela e a de `_sistema/DOMINIOS.md`: software constroi com o `executor` e verifica
  # com o `testador`; a trilha generica usa os nomes genericos do proprio pipeline.
  @agentes %{
    software: %{construtor: "executor", verificador: "testador", revisor: "revisor"},
    generica: %{construtor: "construtor", verificador: "conferente", revisor: "revisor-generico"}
  }

  @doc """
  A trilha deste `dominio`. Ausente (`nil`) ou `"software"` -> `:software`; qualquer outro
  valor -> `:generica`.

  ## Exemplos

      iex> Fabrica.Trilhas.de(nil)
      :software

      iex> Fabrica.Trilhas.de("software")
      :software

      iex> Fabrica.Trilhas.de("apresentacao")
      :generica
  """
  @spec de(String.t() | nil) :: t()
  def de(nil), do: :software
  def de(@software), do: :software
  def de(_outro), do: :generica

  @doc """
  O nome do agente que atende este papel, nesta trilha.

  ## Exemplos

      iex> Fabrica.Trilhas.agente(:software, :verificador)
      "testador"

      iex> Fabrica.Trilhas.agente(:generica, :verificador)
      "conferente"
  """
  @spec agente(t(), papel()) :: String.t()
  def agente(trilha, papel), do: @agentes |> Map.fetch!(trilha) |> Map.fetch!(papel)

  @doc """
  A doutrina que rege esta trilha — o arquivo que quem constroi nela precisa ler.

  ## Exemplos

      iex> Fabrica.Trilhas.doutrina(:software)
      "_sistema/BIBLIOTECAS.md"
  """
  @spec doutrina(t()) :: String.t()
  def doutrina(:software), do: "_sistema/BIBLIOTECAS.md"
  def doutrina(:generica), do: "_sistema/DOMINIOS.md"
end
