[nome] = System.argv()
node = :"fabrica@DESKTOP-T79FTD9"
true = Node.connect(node)
p = :rpc.call(node, Fabrica.Repo, :get_by!, [Fabrica.Projetos.Projeto, [nome: nome]])
ts = :rpc.call(node, Fabrica.Repo, :all, [Fabrica.Tarefas.Tarefa]) |> Enum.filter(&(&1.projeto_id == p.id)) |> Enum.sort_by(& &1.id)
ids = Map.new(ts, &{&1.id, &1})
cs = :rpc.call(node, Fabrica.Repo, :all, [Fabrica.Tarefas.Criterio]) |> Enum.filter(&Map.has_key?(ids, &1.tarefa_id))
for t <- ts do
  IO.puts("#{t.codigo} [#{t.status} t=#{t.tentativas}] #{t.titulo}")
  for c <- cs, c.tarefa_id == t.id, do: IO.puts("   - #{c.grau} | #{c.comando || "-"} | #{String.slice(c.texto, 0, 90)}")
end
