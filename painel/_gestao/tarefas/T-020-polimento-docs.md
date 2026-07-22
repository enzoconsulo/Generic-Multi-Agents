---
id: T-020
titulo: Polimento final de UX e documentação completa do painel
projeto: painel-fabrica
status: backlog
prioridade: baixa
dependencias: [T-015, T-016, T-018]
areas: [web/src/, README.md, CLAUDE.md]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Passada final de consistência: UX dark impecável em todas as telas, estados de
carregamento/vazio/erro amigáveis, zero texto em inglês na UI, e documentação completa
(README para o usuário; CLAUDE.md do projeto para os agentes).

## Contexto
- Percorrer TODAS as telas (home, projeto com todas as abas, jobs) nos três estados:
  carregando, vazio (fábrica sem projetos / projeto sem tarefas / sem jobs) e erro
  (backend fora). Corrigir inconsistências visuais do dark (contraste, foco, hover).
- Varredura de textos: nenhum literal de UI em inglês (procurar "Loading", "Error",
  "Submit", "Cancel", "Retry" e afins no código da web).
- README.md: o que é o painel, requisitos (Node 22+, Claude Code logado), como rodar
  (dev e produção), como testar (`npm test` e `teste:integracao` — este exige login),
  arquitetura de pastas em 10 linhas, e os avisos operacionais (não rodar /trabalhar no
  chat e no painel ao mesmo tempo; comportamento ao trabalhar no próprio painel-fabrica;
  como retomar manualmente uma sessão interrompida com session_id + cwd).
- CLAUDE.md do projeto: preencher/atualizar "Como rodar", "Como testar", "Arquitetura
  em 1 minuto" e "Armadilhas conhecidas" com a realidade final do código (conferir os
  comandos executando cada um).
- Tarefa de refinamento: NÃO adicionar funcionalidade nova.

## Critérios de aceite
- [ ] As três telas principais exibem estados de carregamento e de erro em PT-BR
      (verificado com o backend desligado e religado).
- [ ] Busca por termos comuns em inglês no código da web
      (Loading/Error/Submit/Cancel/Retry) não encontra nenhum literal exibido na UI.
- [ ] README cobre: o que é, requisitos, como rodar dev, como rodar produção, como
      testar, arquitetura, avisos operacionais — e todos os comandos citados funcionam
      como escritos (testados em PowerShell).
- [ ] CLAUDE.md do projeto com "Como rodar", "Como testar", "Arquitetura em 1 minuto" e
      "Armadilhas conhecidas" preenchidos e conferidos contra o código real.
- [ ] Estado vazio decente: fábrica-fixture sem projetos mostra orientação de primeiro
      passo (criar/importar projeto) em vez de tela vazia.

## Notas de execução


## Verificação


## Revisão

