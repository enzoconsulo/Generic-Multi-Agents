defmodule Fabrica.Cota do
  @moduledoc """
  A parede de cota (T-039): reconhecer, dormir e rearmar sozinho, sem perder o que ja esta
  na fila.

  **ESTE MECANISMO ESTA AUSENTE DE TODA A DOCUMENTACAO DO TCC**, e e estrutural sob
  assinatura: a fabrica nao paga por token, consome cota, e bater a parede sem um mecanismo
  proprio simplesmente derruba a rodada.

  Tres partes, cada uma um pedaco deste modulo:

  1. **Reconhecer.** `Fabrica.Operario.ClaudeCLI` e `Fabrica.Operario.MessagesAPI` ja
     traduzem a resposta do provedor para `{:erro, {:cota, reabre_em}}` — o formato
     estrutural (`rate_limit_event.resetsAt`, epoch Unix) e o ISO 8601 do 429 da Messages
     API ja chegam aqui como `DateTime.t()` ou `nil`. O que este modulo acrescenta e
     tolerancia ao que os dois adaptadores NAO sabem interpretar: um horario em formato
     humano ("5:30pm (America/Sao_Paulo)"), que e o que o texto solto de um bloqueio pode
     trazer quando o evento estruturado nao veio. `parede/2` vira o ESTADO DO SISTEMA — nao
     erro de UM despacho — e `horario_de_reabertura/1` e o parser tolerante.
  2. **Dormir.** `parede/2` pausa as filas do Oban (`pausar.()`, `Oban.pause_all_queues/0`
     por padrao) sem tocar em nenhuma linha de `oban_jobs`. O trabalho enfileirado fica
     exatamente onde estava; so nao sai. Nunca cancela, nunca descarta — cancelar pagaria a
     cota ja gasta e nao entregaria nada, a mesma doutrina de `Fabrica.Orcamento` (o teto
     impede COMECAR, nunca interrompe o que esta em voo).
  3. **Rearmar.** Um `Process.send_after/3` agenda a volta para o horario informado, com
     `folga/0` de tolerancia a relogio dessincronizado entre esta maquina e o provedor. Sem
     horario legivel, cai em recuo exponencial com teto (`recuo_exponencial/3`) em vez de
     travar — nunca ficar mudo so porque uma string nao bateu com o formato esperado.

  E a consulta de estado (`estado/1`) responde exatamente a pergunta que a v1.0 precisa
  mostrar na tela: *a cota esta batida agora? ate quando?* — e o que evita o usuario achar
  que a fabrica travou.

  ## Por que closures (`:pausar`/`:retomar`), e nao um modulo

  A acao real e `Oban.pause_all_queues/0` e `Oban.resume_all_queues/0` — mas fixar isso
  como chamada direta obrigaria todo teste deste modulo a subir um Oban de verdade so para
  provar que o RECUO e a PARSE funcionam, que nao tem nada a ver com fila. Injetar as duas
  funcoes como closures (com valor padrao apontando para o Oban real) permite ao teste que
  precisa da fila usa-la de verdade — `Oban.pause_all_queues/0` so precisa do `Notifier` do
  Oban de pe, que sobe mesmo sob `testing: :manual` (config de teste desta fabrica) — e ao
  teste que so quer provar recuo/parse trocar por uma funcao que registra a chamada, sem
  Postgres no meio.

  ## Por que nao uma biblioteca de fuso horario

  O formato humano que este modulo tolera nao pede a correcao de um `Calendar.TimeZoneDatabase`
  (deslocamento historico, horario de verao por regiao) — pede so "nao travar por causa de uma
  string, e chegar perto o suficiente para dormir e acordar na janela certa". Um mapa fixo de
  poucos fusos (`America/Sao_Paulo` e afins) mais tolerancia (`folga/0`) cobre isso em menos de
  50 linhas; trazer `tz`/`tzdata` para isto seria dependencia nova para um problema que a
  doutrina da fabrica (`_sistema/BIBLIOTECAS.md`) ja aponta como NAO justificando adocao.
  """

  use GenServer

  alias Fabrica.Eventos

  @typedoc "O que se sabe sobre a parede agora: se esta batida, e ate quando."
  @type estado :: %{
          batida?: boolean(),
          reabre_em: DateTime.t() | nil,
          proxima_tentativa_em: non_neg_integer() | nil
        }

  @folga_padrao :timer.minutes(2)
  @recuo_inicial_padrao :timer.minutes(1)
  @teto_de_recuo_padrao :timer.hours(1)

  # Poucos fusos, de proposito (ver @moduledoc): so os que aparecem nos textos que este
  # modulo precisa tolerar. Fuso desconhecido cai em UTC (deslocamento zero) em vez de
  # travar — "nao sei o fuso" e melhor resolvido acordando um pouco mais cedo que nunca
  # acordando.
  @fusos_conhecidos %{
    "UTC" => 0,
    "GMT" => 0,
    "America/Sao_Paulo" => -3 * 3600,
    "America/New_York" => -4 * 3600,
    "America/Los_Angeles" => -7 * 3600,
    "Europe/London" => 0,
    "Asia/Tokyo" => 9 * 3600
  }

  @regex_horario_humano ~r/(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?\s*(?:\(([^)]+)\))?/

  defstruct [
    :timer,
    pausar: &Oban.pause_all_queues/0,
    retomar: &Oban.resume_all_queues/0,
    reabre_em: nil,
    proxima_tentativa_em: nil,
    batida?: false,
    tentativa: 0,
    folga: @folga_padrao,
    recuo_inicial: @recuo_inicial_padrao,
    teto_de_recuo: @teto_de_recuo_padrao
  ]

  ## API publica

  @doc """
  Sobe o processo que guarda o estado da parede.

  `opcoes` aceita `:name` (padrao `#{inspect(__MODULE__)}`), e as chaves da struct —
  `:pausar`, `:retomar`, `:folga`, `:recuo_inicial`, `:teto_de_recuo` — para o teste
  substituir sem tocar em Oban nenhum.
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opcoes \\ []) do
    {nome, opcoes} = Keyword.pop(opcoes, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opcoes, name: nome)
  end

  @doc """
  A cota bateu (ou foi anunciada perto de bater). Aceita o formato que os operarios ja
  devolvem — `{:erro, {:cota, reabre_em}}` ou `{:cota, reabre_em}` — ou o `reabre_em` cru
  (`DateTime.t()`, epoch inteiro, ISO 8601, texto humano, ou `nil`).

  Pausa as filas na PRIMEIRA chamada (transicao para batida); chamadas subsequentes so
  reagendam o rearme, sem pausar de novo nem emitir `[:fabrica, :cota, :parede]` outra vez.
  """
  @spec parede(GenServer.server(), term()) :: :ok
  def parede(servidor \\ __MODULE__, sinal)
  def parede(servidor, {:erro, {:cota, reabre_em}}), do: parede(servidor, reabre_em)
  def parede(servidor, {:cota, reabre_em}), do: parede(servidor, reabre_em)
  def parede(servidor, reabre_em), do: GenServer.call(servidor, {:parede, reabre_em})

  @doc "A cota esta batida agora, e ate quando — a pergunta que a tela precisa responder."
  @spec estado(GenServer.server()) :: estado()
  def estado(servidor \\ __MODULE__), do: GenServer.call(servidor, :estado)

  @doc "Atalho para `estado/1`.batida?."
  @spec batida?(GenServer.server()) :: boolean()
  def batida?(servidor \\ __MODULE__), do: estado(servidor).batida?

  @doc """
  Rearma agora, sem esperar o timer. Retoma as filas e emite
  `[:fabrica, :cota, :rearme]`. Sem efeito se a parede nao estiver batida.
  """
  @spec rearmar(GenServer.server()) :: :ok
  def rearmar(servidor \\ __MODULE__), do: GenServer.call(servidor, :rearmar)

  @doc "A folga aplicada ao horario informado, para tolerar relogio dessincronizado."
  @spec folga() :: pos_integer()
  def folga, do: @folga_padrao

  @doc """
  Interpreta `valor` como o horario de reabertura, com tolerancia. Devolve `nil` quando nao
  da para entender — nunca levanta.

  Aceita, nesta ordem: `DateTime.t()` (passa direto), `nil`, epoch Unix (inteiro), ISO 8601
  e, por ultimo, formato humano tolerante (`"5:30pm (America/Sao_Paulo)"`,
  `"17:30 (UTC)"`, e a hora cheia sem minutos — `"9am (America/Sao_Paulo)"`,
  `"12pm (America/Sao_Paulo)"`). Sem data explicita no formato humano, assume HOJE no fuso
  informado e empurra para amanha se o horario resultante ja tiver passado — o reset de
  cota e sempre no futuro.
  """
  @spec horario_de_reabertura(term()) :: DateTime.t() | nil
  def horario_de_reabertura(%DateTime{} = valor), do: valor
  def horario_de_reabertura(nil), do: nil

  def horario_de_reabertura(valor) when is_integer(valor) do
    case DateTime.from_unix(valor) do
      {:ok, quando} -> quando
      _ -> nil
    end
  end

  def horario_de_reabertura(valor) when is_binary(valor) do
    case DateTime.from_iso8601(valor) do
      {:ok, quando, _} -> quando
      _ -> horario_humano(valor)
    end
  end

  def horario_de_reabertura(_valor), do: nil

  @doc """
  O recuo exponencial para a tentativa `n` (a partir de 0), com teto.

  `2^n * inicial`, nunca acima de `teto`. E o que evita travar quando o horario de
  reabertura nao pode ser lido de jeito nenhum.
  """
  @spec recuo_exponencial(non_neg_integer(), pos_integer(), pos_integer()) :: pos_integer()
  def recuo_exponencial(
        tentativa,
        inicial \\ @recuo_inicial_padrao,
        teto \\ @teto_de_recuo_padrao
      )
      when tentativa >= 0 do
    (inicial * :math.pow(2, tentativa))
    |> round()
    |> min(teto)
  end

  ## Parse tolerante do formato humano

  defp horario_humano(texto) do
    case Regex.run(@regex_horario_humano, texto) do
      [_completo, hora, minuto, meridiano, fuso] ->
        montar_horario_humano(
          hora,
          minuto_ou_zero(minuto),
          vazio_para_nil(meridiano),
          vazio_para_nil(fuso)
        )

      _sem_match ->
        nil
    end
  end

  # Hora cheia ("9am", "12pm") nao traz o grupo de minutos — o `?` do regex casa vazio, nao
  # nil. "0" no lugar de "" e o que faz `Integer.parse/1` aceitar em vez de devolver nil.
  defp minuto_ou_zero(""), do: "0"
  defp minuto_ou_zero(minuto), do: minuto

  defp vazio_para_nil(""), do: nil
  defp vazio_para_nil(valor), do: valor

  defp montar_horario_humano(hora_texto, minuto_texto, meridiano, fuso) do
    with {hora, ""} <- Integer.parse(hora_texto),
         {minuto, ""} <- Integer.parse(minuto_texto),
         hora24 when not is_nil(hora24) <- hora_24(hora, meridiano),
         {:ok, hora_do_dia} <- Time.new(hora24, minuto, 0) do
      deslocamento = Map.get(@fusos_conhecidos, fuso && String.trim(fuso), 0)
      no_futuro(hora_do_dia, deslocamento)
    else
      _ -> nil
    end
  end

  defp hora_24(12, meridiano) when is_binary(meridiano) do
    case String.downcase(meridiano) do
      "am" -> 0
      "pm" -> 12
      _ -> nil
    end
  end

  defp hora_24(hora, meridiano) when is_binary(meridiano) and hora in 1..11 do
    case String.downcase(meridiano) do
      "am" -> hora
      "pm" -> hora + 12
      _ -> nil
    end
  end

  defp hora_24(hora, nil) when hora in 0..23, do: hora
  defp hora_24(_hora, _meridiano), do: nil

  # So a HORA vem no texto — a data e sempre "a proxima vez que esse horario acontecer no
  # fuso informado", porque um reset de cota so faz sentido no futuro.
  defp no_futuro(hora_do_dia, deslocamento_segundos) do
    agora = DateTime.utc_now()
    data_local = agora |> DateTime.add(deslocamento_segundos, :second) |> DateTime.to_date()

    {:ok, ingenuo} = NaiveDateTime.new(data_local, hora_do_dia)

    alvo =
      ingenuo |> DateTime.from_naive!("Etc/UTC") |> DateTime.add(-deslocamento_segundos, :second)

    if DateTime.compare(alvo, agora) == :lt do
      DateTime.add(alvo, 86_400, :second)
    else
      alvo
    end
  end

  ## GenServer

  @impl GenServer
  def init(opcoes), do: {:ok, struct!(__MODULE__, opcoes)}

  @impl GenServer
  def handle_call({:parede, sinal}, _from, estado) do
    quando = horario_de_reabertura(sinal)
    cancelar_timer(estado.timer)

    if not estado.batida? do
      estado.pausar.()
      Eventos.cota_parede(%{reabre_em: quando})
    end

    novo =
      case quando do
        nil -> agendar_recuo(estado)
        data -> agendar_para(estado, data)
      end

    {:reply, :ok, %{novo | batida?: true, reabre_em: quando}}
  end

  @impl GenServer
  def handle_call(:estado, _from, estado) do
    resposta = %{
      batida?: estado.batida?,
      reabre_em: estado.reabre_em,
      proxima_tentativa_em: estado.proxima_tentativa_em
    }

    {:reply, resposta, estado}
  end

  @impl GenServer
  def handle_call(:rearmar, _from, estado), do: {:reply, :ok, rearmar_estado(estado)}

  @impl GenServer
  def handle_info(:rearmar, estado), do: {:noreply, rearmar_estado(estado)}

  @impl GenServer
  def terminate(_motivo, estado) do
    cancelar_timer(estado.timer)
    :ok
  end

  defp rearmar_estado(%__MODULE__{batida?: false} = estado), do: estado

  defp rearmar_estado(estado) do
    cancelar_timer(estado.timer)
    estado.retomar.()
    Eventos.cota_rearme()

    %{
      estado
      | batida?: false,
        reabre_em: nil,
        tentativa: 0,
        timer: nil,
        proxima_tentativa_em: nil
    }
  end

  defp agendar_recuo(estado) do
    atraso = recuo_exponencial(estado.tentativa, estado.recuo_inicial, estado.teto_de_recuo)
    ref = Process.send_after(self(), :rearmar, atraso)
    %{estado | timer: ref, tentativa: estado.tentativa + 1, proxima_tentativa_em: atraso}
  end

  defp agendar_para(estado, quando) do
    atraso =
      quando
      |> DateTime.diff(DateTime.utc_now(), :millisecond)
      |> Kernel.+(estado.folga)
      |> max(0)

    ref = Process.send_after(self(), :rearmar, atraso)
    %{estado | timer: ref, tentativa: 0, proxima_tentativa_em: atraso}
  end

  defp cancelar_timer(nil), do: :ok

  # Retorno de `Process.cancel_timer/1` (contagem restante ou `false`) descartado de
  # proposito: os tres chamadores so querem garantir que o timer antigo nao dispare mais,
  # nunca leem quanto tempo faltava. Devolver sempre `:ok` evita um `unmatched_return` nos
  # tres pontos de chamada sem espalhar `_ =` neles.
  defp cancelar_timer(ref) do
    _ = Process.cancel_timer(ref)
    :ok
  end
end
