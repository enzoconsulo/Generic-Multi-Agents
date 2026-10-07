defmodule Fabrica.Telemetria do
  @moduledoc """
  A cola entre `:telemetry` e o Phoenix.PubSub: anexa UM handler a todos os eventos de
  `Fabrica.Eventos` e repassa cada um, tal e qual, para quem assinou o barramento.

  Existe separado de `Fabrica.Eventos` porque emitir e assinar sao chamadas de qualquer
  lugar do motor, sem efeito colateral nenhum; ANEXAR o handler e um passo de
  inicializacao — acontece uma vez, no boot da aplicacao (`Fabrica.Application`), e nunca
  mais.
  """

  alias Fabrica.Eventos

  @id "fabrica-telemetria-pubsub"

  @eventos [
    [:fabrica, :despacho, :inicio],
    [:fabrica, :despacho, :volta],
    [:fabrica, :despacho, :fim],
    [:fabrica, :tarefa, :transicao],
    [:fabrica, :cota, :parede],
    [:fabrica, :cota, :rearme]
  ]

  @doc "Os eventos que este modulo repassa ao Phoenix.PubSub."
  @spec eventos() :: [Eventos.nome()]
  def eventos, do: @eventos

  @doc """
  Anexa o handler que repassa todo evento de `eventos/0` ao topico de `Fabrica.Eventos`.

  Idempotente: chamar de novo (ex.: uma suite que sobe a aplicacao mais de uma vez no mesmo
  no) confirma que o handler ja esta de pe em vez de levantar `already_exists`.
  """
  @spec anexar() :: :ok
  def anexar do
    case :telemetry.attach_many(@id, @eventos, &__MODULE__.repassar/4, nil) do
      :ok -> :ok
      {:error, :already_exists} -> :ok
    end
  end

  @doc false
  @spec repassar(Eventos.nome(), map(), map(), term()) :: :ok
  def repassar(nome, medidas, metadados, _config) do
    Phoenix.PubSub.broadcast(
      Fabrica.PubSub,
      Eventos.topico(),
      {:fabrica, nome, medidas, metadados}
    )
  end
end
