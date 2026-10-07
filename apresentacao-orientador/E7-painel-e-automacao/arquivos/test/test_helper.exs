# Testes marcados `:precisa_pg_dump` (test/mix/backup_test.exs) SEMPRE ficam fora do
# `mix test` padrao — nao so quando `pg_dump` esta ausente.
#
# POR QUE (T-072, D-008): esses testes chamam `Backup.restaurar/1`, que dispara
# `pg_restore --clean --if-exists` CONTRA O BANCO DE TESTE COMPARTILHADO, ao vivo, dropando e
# recriando tabelas. Isso invalida o cache de OID de tipo das conexoes VIVAS do pool — o teste
# so corrige a PROPRIA conexao, nunca as outras que testes concorrentes estao usando. Rodar
# junto com o resto da suite produzia falha intermitente em modulos sem relacao nenhuma com
# backup (`busca_test.exs`, `confinamento_test.exs`), sempre com um
# `Postgrex.Protocol disconnected: client exited` no log.
#
# O ciclo de backup continua coberto: `mix test.backup` (alias em mix.exs) roda SO esses
# testes, sozinhos, sem nenhum outro teste concorrente batendo no mesmo banco.
ExUnit.start(exclude: [:precisa_pg_dump])

unless Fabrica.Backup.disponivel?() do
  IO.puts("""

  ATENCAO: `pg_dump` nao encontrado em #{Fabrica.Backup.executavel("pg_dump")}.
  `mix test.backup` vai falhar — o ciclo de backup NAO pode ser exercitado nesta maquina.
  Configure `config :fabrica, :pg_bin` para roda-lo.
  """)
end

Ecto.Adapters.SQL.Sandbox.mode(Fabrica.Repo, :manual)
