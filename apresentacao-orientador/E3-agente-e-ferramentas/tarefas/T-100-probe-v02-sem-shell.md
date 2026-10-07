---
id: T-100
titulo: "O probe do marco da v0.2 volta a rodar no Windows: a tarefa do probe não precisa de shell, então o agente sobe sem Bash"
projeto: fabrica-v2
versao: v0.2
status: backlog
prioridade: alta
dependencias: [T-099]
areas: [priv/probes/marco_v02_agente.exs, lib/fabrica/operario/claude_cli.ex, test/fabrica/operario/claude_cli_test.exs]
tentativas: 0
criada: 2026-10-07
atualizada: 2026-10-07
---

## Objetivo
`mix run priv/probes/marco_v02_agente.exs` volta a dar `PROBE OK` na máquina Windows de origem, sem
desligar nem afrouxar o sandbox de quem tem shell: o agente do probe sobe com um vocabulário que
NÃO contém Bash (a tarefa dele é só escrever um arquivo), e por isso não precisa do sandbox.

## Contexto
Rodado pelo orquestrador em 2026-10-07 (HEAD `88c92aa`, Windows 10, `claude` da máquina): o probe
REPROVOU nas três afirmações porque o agente não subiu —

    o claude recusou subir: o papel tem Bash e o sandbox exigido nao esta disponivel (nenhum comando
    rodou, nada foi gasto). causa: Error: sandbox required but unavailable: sandbox is enabled but
    the Windows sandbox is not active on this session (feature gate off)

É o comportamento CERTO da T-090/D-016 (fail-closed: papel com Bash não sobe sem sandbox). O
problema é que o probe pede o vocabulário do papel `construtor` (que tem `rodar` → `Bash`), quando a
tarefa dele — escrever `resultado.txt` com uma senha — só precisa de escrita de arquivo, que é
auditada pelo `Confinamento` e não depende do sandbox. Este probe é a DEMONSTRAÇÃO do marco da E3
("um agente resolve uma tarefa real com o custo gravado") e precisa rodar na máquina onde ele é
apresentado.

Caminho provável: o probe passa ao `ClaudeCLI` um vocabulário sem `rodar` (menor privilégio) — veja
como `linha/1` decide `--tools`, `--allowedTools "Bash"` e o `--settings` do sandbox a partir do
papel/vocabulário. Se hoje só dá para escolher por PAPEL, o conserto mínimo é aceitar um vocabulário
explícito (com teste), sem criar chave nenhuma que desligue o sandbox para quem tem Bash.
**Proibido:** qualquer caminho em que um vocabulário COM Bash suba sem o bloco de sandbox.

## Critérios de aceite
- [ ] O probe roda no Windows e imprime `PROBE OK` (as três afirmações `ok`); a saída fica em
      `_gestao/evidencias/T-100-probe.txt`. Consome ~27 mil tokens da cota (autorizado).
      `verificar: mix run priv/probes/marco_v02_agente.exs`
- [ ] Teste prova que um vocabulário sem `rodar` sobe sem `--allowedTools "Bash"` e sem o bloco de
      sandbox, e que todo vocabulário COM `rodar` continua levando o bloco (falha se alguém afrouxar).
      `verificar: mix test test/fabrica/operario/claude_cli_test.exs`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução
- 2026-10-07 (orquestrador): passa a depender da T-099 — no Windows a suíte cai em 2 testes de link do confinamento, e toda verificação desta tarefa reprovaria por isso (reprovação falsa). Volta a `pronta` sozinha quando a T-099 concluir.


## Verificação


## Conformidade


## Revisão

