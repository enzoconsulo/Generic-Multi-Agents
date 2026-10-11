# uso: continuar.exs <projeto> <teto> <max> [promover]
[nome, teto, max | resto] = System.argv()
node = :"fabrica@DESKTOP-T79FTD9"
true = Node.connect(node)
:ok = :rpc.call(node, Application, :put_env, [:fabrica, :operario, Fabrica.Operario.ClaudeCLI])
{:module, _} = :rpc.call(node, Code, :ensure_loaded, [Fabrica.Piloto.Decisao])
p = :rpc.call(node, Fabrica.Repo, :get_by!, [Fabrica.Projetos.Projeto, [nome: nome]])
if resto == ["promover"] do
  ts = :rpc.call(node, Fabrica.Repo, :all, [Fabrica.Tarefas.Tarefa]) |> Enum.filter(&(&1.projeto_id == p.id))
  ts = :rpc.call(node, Fabrica.Repo, :preload, [ts, [:areas, :dependencias]])
  {:ok, %{promover: ps}} = :rpc.call(node, Fabrica.Tarefas.Fila, :promover, [ts])
  for t <- ps, do: IO.inspect(:rpc.call(node, Fabrica.Tarefas.Transicao, :aplicar, [t, :pronta]) |> elem(0), label: "promovida #{t.codigo}")
end
srv = Fabrica.Piloto.Servidor
nome_reg = :rpc.call(node, srv, :nome, [p.id])
if :rpc.call(node, GenServer, :whereis, [nome_reg]) == nil,
  do: IO.inspect(:rpc.call(node, GenServer, :start, [srv, [projeto_id: p.id], [name: nome_reg]]), label: "piloto start")
{t, _} = Float.parse(teto)
IO.inspect(:rpc.call(node, srv, :ligar, [nome_reg, t, String.to_integer(max)]), label: "ligar")
