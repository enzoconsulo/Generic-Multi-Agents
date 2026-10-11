# cancela todas as tarefas abertas de um projeto e os jobs Oban delas
[nome] = System.argv()
node = :"fabrica@DESKTOP-T79FTD9"
true = Node.connect(node)
p = :rpc.call(node, Fabrica.Repo, :get_by!, [Fabrica.Projetos.Projeto, [nome: nome]])
ts = :rpc.call(node, Fabrica.Repo, :all, [Fabrica.Tarefas.Tarefa]) |> Enum.filter(&(&1.projeto_id == p.id))
ids = Enum.map(ts, & &1.id)
jobs = :rpc.call(node, Fabrica.Repo, :all, [Oban.Job]) |> Enum.filter(&(&1.args["tarefa_id"] in ids and &1.state in ~w[available scheduled executing retryable]))
for j <- jobs, do: IO.inspect(:rpc.call(node, Oban, :cancel_job, [j.id]), label: "cancel job #{j.id}")
for t <- ts, t.status not in [:concluida, :cancelada] do
  IO.inspect(:rpc.call(node, Fabrica.Tarefas.Transicao, :aplicar, [t.id, :cancelada, [papel: "orquestrador", desfecho: "ensaio_abortado"]]) |> elem(0), label: "#{t.codigo} #{t.status}")
end
