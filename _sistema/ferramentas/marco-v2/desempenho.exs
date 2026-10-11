n = :"fabrica@DESKTOP-T79FTD9"
true = Node.connect(n)
all = fn s -> :rpc.call(n, Fabrica.Repo, :all, [s]) end
projs = all.(Fabrica.Projetos.Projeto) |> Enum.filter(&(&1.nome in ~w[ensaio-gastos2 encurtador deck-fabrica xadrez]))
ts = all.(Fabrica.Tarefas.Tarefa); cs = all.(Fabrica.Tarefas.Ciclo); ds = all.(Fabrica.Tarefas.Despacho); co = all.(Fabrica.Tarefas.Consumo)
custo_d = Enum.group_by(co, & &1.despacho_id) |> Map.new(fn {k, v} -> {k, Enum.reduce(v, 0.0, &(&2 + (fn %{coef: c, exp: e, sign: s} -> s * c * :math.pow(10, e) end).(&1.custo_usd)))} end)
IO.puts("| projeto | trilha | tarefas | concluídas | 1ª tentativa | ciclos (constr/verif/rev) | reprovações | despachos | custo US$ | US$/tarefa concluída | tempo de agente |")
IO.puts("|---|---|---|---|---|---|---|---|---|---|---|")
for p <- Enum.sort_by(projs, & &1.id) do
  pt = Enum.filter(ts, &(&1.projeto_id == p.id))
  ids = MapSet.new(pt, & &1.id)
  pc = Enum.filter(cs, &MapSet.member?(ids, &1.tarefa_id))
  cids = MapSet.new(pc, & &1.id)
  pd = Enum.filter(ds, &MapSet.member?(cids, &1.ciclo_id))
  conc = Enum.count(pt, &(&1.status == :concluida))
  primeira = Enum.count(pt, &(&1.status == :concluida and &1.tentativas == 1))
  por = Enum.frequencies_by(pc, & &1.papel)
  repro = Enum.count(pc, &(&1.papel in ["verificador", "revisor"] and &1.desfecho not in ["aprovado"]))
  custo = pd |> Enum.map(&Map.get(custo_d, &1.id, 0.0)) |> Enum.sum()
  seg = pd |> Enum.map(&(if &1.iniciado_em && &1.terminado_em, do: DateTime.diff(&1.terminado_em, &1.iniciado_em), else: 0)) |> Enum.sum()
  pct = if conc > 0, do: "#{round(primeira * 100 / conc)}%", else: "—"
  porT = if conc > 0, do: :erlang.float_to_binary(custo / conc, decimals: 2), else: "—"
  IO.puts("| #{p.nome} | #{p.dominio} | #{length(pt)} | #{conc} | #{pct} | #{por["construtor"] || 0}/#{por["verificador"] || 0}/#{por["revisor"] || 0} | #{repro} | #{length(pd)} | #{:erlang.float_to_binary(custo, decimals: 2)} | #{porT} | #{div(seg, 60)} min |")
end
