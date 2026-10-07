---
id: T-094
titulo: "Piloto dormindo pela cota acorda no REARME da Cota, sem laço quente entre `reabre_em` e a folga"
projeto: fabrica-v2
versao: v1.0
status: pronta
prioridade: alta
dependencias: [T-091]
areas: [lib/fabrica/piloto/servidor.ex, test/fabrica/piloto/servidor_test.exs]
tentativas: 0
criada: 2026-10-02
atualizada: 2026-10-02
---

## Objetivo
Depois de uma parede de cota, o piloto fica parado de verdade até a Cota rearmar — acorda pelo rearme
(ou por um piso de espera), e nunca reavalia em laço sem pausa enquanto a cota segue batida.

## Contexto
Achado do executor da T-091 (Notas dela), deduzido lendo o código, NÃO medido — confirme antes:

- `Piloto.Servidor.dormir/2` chama `agendar_acordar(horario)`, que agenda `:acordar` para
  `max(0, horario - agora)`.
- `Fabrica.Cota` só rearma em `reabre_em + folga/0` (`@folga_padrao` = 2 min, tolerância a relógio).
- Entre `reabre_em` e `reabre_em + folga`, o piloto acorda, `Decisao` vê a cota AINDA batida e devolve
  `{:dormir, reabre_em}` — horário já passado → atraso 0 → `:acordar` imediato → de novo. Cada volta
  faz `Repo.all` (há trabalho?) e `File.write!` (persistir). Por ~2 min: laço quente de CPU, banco e
  disco. Não gasta cota (não despacha), mas é o tipo de coisa que derruba o servidor no meio do marco.
- O servidor já assina o barramento (`handle_info({:fabrica, ...})`, ignora tudo que não é
  `[:fabrica, :despacho, :fim]`), e a Cota emite `[:fabrica, :cota, :rearme]` ao rearmar
  (`Eventos.cota_rearme/0`) — o sinal existe e ninguém o lê (sensor sem atuador).

Conserto provável (o executor decide e registra): acordar no evento de rearme e, como rede de
segurança, nunca agendar `:acordar` com atraso abaixo de um piso quando o horário já passou.

## Critérios de aceite
- [ ] Com a cota batida e `reabre_em` já no passado, o piloto dormindo NÃO reavalia em laço: em uma
      janela curta medida no teste, o número de reavaliações fica limitado (≤ 1–2), e o próximo
      `:acordar` é agendado com atraso > 0. Teste que falha antes do conserto (prove com `git stash`).
      `verificar: mix test test/fabrica/piloto/servidor_test.exs`
- [ ] O evento `[:fabrica, :cota, :rearme]` acorda o piloto dormindo e ele volta a decidir (continua
      a rodada se nada mais o impede); piloto desligado ou não dormindo ignora o evento.
      `verificar: mix test test/fabrica/piloto/servidor_test.exs`
- [ ] Bateria completa verde.
      `verificar: mix fabrica.ci`

## Notas de execução


## Verificação


## Conformidade


## Revisão

