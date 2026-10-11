[tid] = System.argv()
node = :"fabrica@DESKTOP-T79FTD9"
true = Node.connect(node)
cs = :rpc.call(node, Fabrica.Repo, :all, [Fabrica.Tarefas.Ciclo]) |> Enum.filter(&(&1.tarefa_id == String.to_integer(tid))) |> Enum.sort_by(& &1.id)
for c <- cs, do: IO.inspect(Map.drop(Map.from_struct(c), [:__meta__, :tarefa]), limit: 40, printable_limit: 1200)
t = :rpc.call(node, Fabrica.Repo, :get!, [Fabrica.Tarefas.Tarefa, String.to_integer(tid)])
IO.inspect(Map.take(t, [:codigo, :titulo, :status, :tentativas]))
