node = :"fabrica@DESKTOP-T79FTD9"
true = Node.connect(node)
[j | _] = :rpc.call(node, Fabrica.Repo, :all, [Oban.Job]) |> Enum.sort_by(& &1.id, :desc)
IO.puts(hd(j.errors)["error"])
