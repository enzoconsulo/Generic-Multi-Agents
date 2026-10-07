# Avisos do Dialyzer silenciados NOMINALMENTE. Um por linha, com a razao ao lado.
#
# A regra desta lista: so entra falso positivo com causa entendida e escrita. Ela existe
# justamente para NAO desligar uma checagem inteira — `flags: [:no_opaque]` em `mix.exs`
# calaria a opacidade no projeto todo, e ai a proxima quebra de opacidade de verdade passaria
# sem ninguem ver. Aqui, qualquer arquivo novo com o mesmo aviso continua reprovando.
#
# ---------------------------------------------------------------------------------------
# `call_without_opaque` em quem monta um `Ecto.Multi`
#
# `Ecto.Multi.t()` carrega `names: MapSet.t()`, que e um tipo OPACO. O `Multi.new()` devolve
# o literal `%MapSet{map: %{}}`, e o Dialyzer enxerga dentro do opaco e reclama de quem passa
# esse valor adiante. E limitacao conhecida do par Dialyzer + Ecto.Multi, nao defeito daqui:
# a suite exercita os dois caminhos e o Ecto os aceita.
#
# JA FOI TENTADO (T-022) e NAO resolve: extrair o corpo para uma funcao com
# `@spec (Multi.t(), ...) :: Multi.t()`. O aviso apenas migra para o ponto onde `Multi.new()`
# e passado como argumento. Nao ha reescrita que o elimine sem abandonar o `Ecto.Multi`, e o
# `Ecto.Multi` e exatamente o que da a garantia de tudo-ou-nada da T-022.
[
  {"lib/fabrica/ferramentas/registrar_resultado.ex", :call_without_opaque},
  {"lib/fabrica/tarefas/transicao.ex", :call_without_opaque}
]
