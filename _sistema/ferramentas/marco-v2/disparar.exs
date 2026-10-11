# uso: elixir --sname ctlN --cookie marco058 disparar.exs <projeto> <teto_usd> <max_rodadas> <arquivo_pedido>
[nome, teto, max, arq | dom] = System.argv()
opts = if dom == [], do: [], else: [dominio: hd(dom)]
node = :"fabrica@DESKTOP-T79FTD9"
true = Node.connect(node)
pedido = File.read!(arq)
:ok = :rpc.call(node, Application, :put_env, [:fabrica, :operario, Fabrica.Operario.ClaudeCLI])
IO.inspect(:rpc.call(node, Fabrica.Operario, :configurado, []), label: "operario")
IO.puts("planejando #{nome}...")
r = :rpc.call(node, Mix.Tasks.Fabrica.Planejar, :executar, [pedido, nome, opts], :infinity)
IO.inspect(r, label: "planejamento", limit: 30)
{:ok, _} = r
pid_projeto = :rpc.call(node, Fabrica.Repo, :get_by!, [Fabrica.Projetos.Projeto, [nome: nome]]).id
srv = Fabrica.Piloto.Servidor
nome_reg = :rpc.call(node, srv, :nome, [pid_projeto])
case :rpc.call(node, GenServer, :whereis, [nome_reg]) do
  nil -> IO.inspect(:rpc.call(node, GenServer, :start, [srv, [projeto_id: pid_projeto], [name: nome_reg]]), label: "piloto start")
  pid -> IO.inspect(pid, label: "piloto ja existia")
end
{t, _} = Float.parse(teto)
IO.inspect(:rpc.call(node, srv, :ligar, [nome_reg, t, String.to_integer(max)]), label: "ligar", limit: 40)
