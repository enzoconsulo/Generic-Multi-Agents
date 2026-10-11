[nome] = System.argv()
node = :"fabrica@DESKTOP-T79FTD9"
true = Node.connect(node)
p = :rpc.call(node, Fabrica.Repo, :get_by!, [Fabrica.Projetos.Projeto, [nome: nome]])
IO.inspect(:rpc.call(node, Fabrica.Piloto.Servidor, :desligar, [:rpc.call(node, Fabrica.Piloto.Servidor, :nome, [p.id])]), label: "desligar")
