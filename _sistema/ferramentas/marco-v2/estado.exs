# uso: elixir --sname ctlX --cookie marco058 estado.exs <projeto>
[nome] = System.argv()
node = :"fabrica@DESKTOP-T79FTD9"
unless Node.connect(node), do: (IO.puts("NO_FORA_DO_AR"); System.halt(0))
p = :rpc.call(node, Fabrica.Repo, :get_by!, [Fabrica.Projetos.Projeto, [nome: nome]])
ts = :rpc.call(node, Fabrica.Repo, :all, [Fabrica.Tarefas.Tarefa]) |> Enum.filter(&(Map.get(&1, :projeto_id) == p.id))
IO.puts("tarefas: " <> inspect(Enum.frequencies(Enum.map(ts, &Map.get(&1, :status)))))
nome_reg = :rpc.call(node, Fabrica.Piloto.Servidor, :nome, [p.id])
case :rpc.call(node, GenServer, :whereis, [nome_reg]) do
  nil -> IO.puts("piloto: SEM_PROCESSO")
  _ -> IO.puts("piloto: " <> inspect(:rpc.call(node, Fabrica.Piloto.Servidor, :estado, [nome_reg])))
end
