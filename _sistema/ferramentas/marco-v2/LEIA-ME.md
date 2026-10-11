# Ferramentas do marco da v2 (T-058)

Scripts usados em 10-11/10/2026 para rodar o marco T-058 da `projetos/fabrica-v2`: subir o
servidor, disparar um projeto a partir de um pedido, acompanhar o piloto e diagnosticar
falhas. Eles falam com o servidor da v2 por distribuição Erlang (nó
`fabrica@DESKTOP-T79FTD9`, cookie `marco058`), então só funcionam **com o servidor no ar e
nesta máquina**. Em outra máquina, troque o nome do nó nos `.exs`.

Todo `.exs` roda assim, de dentro desta pasta, com um `--sname` diferente a cada chamada:

    elixir --sname ctl1 --cookie marco058 <script>.exs <argumentos>

## Subir e parar

| script | o que faz |
|---|---|
| `servidor.cmd` | sobe a v2 (`mix phx.server`, dev) com nome de nó e log em `C:\Users\enzoconsulo\tcc-tmp\marco-servidor.log`. Para não morrer com a sessão, lance destacado: `Invoke-CimMethod Win32_Process Create` com `cmd.exe /c "<caminho>\servidor.cmd"` |
| `pausar.exs` | pausa todas as filas da Oban (freio de emergência: nada novo é despachado) |
| `desligar.exs <projeto>` | desliga o piloto do projeto |

Pré-requisitos do servidor: Postgres (`projetos/fabrica-v2/_sistema/ferramentas/banco-v2.ps1 subir`)
e Ollama (`ollama serve`, modelo `embeddinggemma`), usado pela memória.

## Disparar e continuar

| script | o que faz |
|---|---|
| `disparar.exs <projeto> <teto_usd> <max_rodadas> <pedido.txt> [dominio]` | troca o operário para o `ClaudeCLI`, planeja o projeto a partir do pedido e liga o piloto com os dois tetos. `dominio` diferente de `software` (ex. `apresentacao`) usa a trilha genérica |
| `continuar.exs <projeto> <teto> <max> [promover]` | religa o piloto de um projeto já planejado, sem replanejar. `promover` libera as tarefas cujas dependências já fecharam |
| `cancelar-projeto.exs <projeto>` | cancela as tarefas abertas do projeto e os jobs delas |

Os pedidos usados no marco estão em `pedidos/`.

## Acompanhar e diagnosticar

| script | o que faz |
|---|---|
| `estado.exs <projeto>` | contagem de tarefas por estado + estado do piloto |
| `vigiar.sh <projeto> <min>` | chama o `estado.exs` a cada 3 min (grava em `vigia-<projeto>.log`) e sai quando o piloto desliga ou fica `<min>` minutos sem mudança |
| `plano.exs <projeto>` | cada tarefa com estado, tentativas e critérios (grau e comando) |
| `ciclos.exs <id_tarefa>` | os ciclos de uma tarefa: papel, desfecho e relatório |
| `criterios.exs <id_tarefa>` | critérios da tarefa + os dois últimos despachos |
| `erro-do-ultimo-job.exs` | a mensagem de erro do job mais recente da Oban |
| `desempenho.exs` | tabela por projeto: tarefas, 1ª tentativa, ciclos, reprovações, custo, US$/tarefa, tempo |

Não chame `Supervisor.which_children` no `Fabrica.Agente.Supervisor` por RPC: ele não
implementa essa chamada e cai, derrubando junto os agentes em voo. Foi isso que aconteceu com
um script de diagnóstico antigo, já removido.
