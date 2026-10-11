node = :"fabrica@DESKTOP-T79FTD9"
true = Node.connect(node)
IO.inspect(:rpc.call(node, Oban, :pause_all_queues, []), label: "pause")
Process.sleep(2000)
IO.inspect(:rpc.call(node, Oban, :check_all_queues, []) |> Enum.map(&{&1.queue, &1.paused, length(&1.running)}), label: "filas")
