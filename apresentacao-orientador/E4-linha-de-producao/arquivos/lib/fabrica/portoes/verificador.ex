defmodule Fabrica.Portoes.Verificador do
  @moduledoc """
  O primeiro portao: **"funciona?"** — respondido executando os criterios de aceite.

  ## O que ele recebe pronto, e por que isso importa

  A passada mecanica da T-025 ja rodou **de graca** todo criterio com comando. O verificador
  recebe esse resultado feito e cuida do que sobrou: os criterios de julgamento, que nenhum
  comando responde. Refazer a passada aqui gastaria um despacho para descobrir o que uma
  execucao de segundos ja sabia.

  ## Ele nao pode consertar o que reprova

  O catalogo (`Fabrica.Ferramentas.Catalogo`) **nao da `escrever` nem `editar` a este papel**.
  Nao e recomendacao de conduta: e ausencia de ferramenta. Um portao que pode consertar o que
  reprova deixa de ser portao — e a tentacao de *"so ajustar um detalhe para passar"* e
  exatamente o que ele existe para impedir.

  ## Roda no modelo barato

  Verificar e mecanico: executar criterio e comparar resultado. E onde o custo escala sem
  ganho de qualidade, e por isso a fabrica poe o verificador no modelo mais barato **de
  proposito**. O que protege a decisao e o portao seguinte: o revisor le o diff depois, no
  modelo do disparo.

  ## Aprovar exige que NENHUM criterio tenha reprovado

  E `:inconclusivo` nao aprova nem reprova — vai para julgamento. O verificador nao pode
  aprovar uma tarefa cujo criterio o comando nao conseguiu avaliar: seria transformar
  "nao sei" em "sim".
  """

  alias Fabrica.Criterios
  alias Fabrica.Ferramentas.Catalogo

  @papel "verificador"

  @typedoc "O veredito do portao."
  @type veredito :: %{
          aprovado: boolean(),
          motivo: :aprovado | :criterio_reprovado | :sem_prova,
          resultados: [Criterios.resultado()],
          relatorio: String.t()
        }

  @doc "O papel deste portao no catalogo de ferramentas."
  @spec papel() :: String.t()
  def papel, do: @papel

  @doc """
  As ferramentas deste papel. **Nunca inclui escrita** — ver `@moduledoc`.
  """
  @spec ferramentas() :: {:ok, map()} | {:erro, :papel_desconhecido}
  def ferramentas, do: Catalogo.do_papel(@papel)

  @doc """
  Julga a tarefa a partir do resultado da passada mecanica.

  Reprova quando algum criterio falhou por ENTREGA. Nao aprova quando ha criterio
  `:inconclusivo` pendente: transformar *"o comando nao conseguiu avaliar"* em *"passou"*
  seria aprovar por omissao, que e o oposto de um portao.

  Criterio sem comando (`:nao_executado`) **nao** impede a aprovacao aqui — ele e o que o
  verificador julga com o proprio texto, e o julgamento dele entra pelo `:inspecionado`.
  """
  @spec julgar([Criterios.resultado()]) :: veredito()
  def julgar(resultados) do
    motivo =
      cond do
        Criterios.reprovou?(resultados) -> :criterio_reprovado
        Criterios.inconclusivos(resultados) != [] -> :sem_prova
        true -> :aprovado
      end

    %{
      aprovado: motivo == :aprovado,
      motivo: motivo,
      resultados: resultados,
      relatorio: Criterios.relatorio(resultados)
    }
  end

  @doc """
  O que o verificador precisa ver, e nada mais.

  Recebe o texto da tarefa e o relatorio da passada mecanica **ja pronto**. Note o que NAO
  entra: o diff, o historico e os fontes. O verificador responde *"funciona?"* rodando o que
  a tarefa pediu — ler o codigo e a pergunta do outro portao, e dar-lhe o codigo aqui so
  convidaria a julgar implementacao em vez de resultado.
  """
  @spec contexto(String.t(), String.t()) :: %{papel: String.t(), blocos: [{atom(), String.t()}]}
  def contexto(texto_da_tarefa, relatorio_mecanico) do
    %{
      papel: @papel,
      blocos: [
        {:tarefa, texto_da_tarefa},
        {:passada_mecanica, relatorio_mecanico}
      ]
    }
  end
end
