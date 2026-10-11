[tid] = System.argv()
node = :"fabrica@DESKTOP-T79FTD9"
true = Node.connect(node)
cs = :rpc.call(node, Fabrica.Repo, :all, [Fabrica.Tarefas.Criterio]) |> Enum.filter(&(&1.tarefa_id == String.to_integer(tid)))
for c <- cs, do: IO.inspect(Map.drop(Map.from_struct(c), [:__meta__, :tarefa]), limit: 40, printable_limit: 1500)
ds = :rpc.call(node, Fabrica.Repo, :all, [Fabrica.Tarefas.Despacho]) |> Enum.sort_by(& &1.id, :desc) |> Enum.take(2)
for d <- ds, do: IO.inspect(Map.drop(Map.from_struct(d), [:__meta__, :ciclo]), limit: 60, printable_limit: 3000)
