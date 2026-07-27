---
id: T-020
titulo: Polimento final de UX e documentação completa do painel
projeto: painel-fabrica
status: concluida
prioridade: baixa
dependencias: [T-015, T-016, T-018]
areas: [web/src/, README.md, CLAUDE.md]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-27
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
- [x] As três telas principais exibem estados de carregamento e de erro em PT-BR.
      **Corrigido um furo real aqui** (ver notas) — mas a verificação foi por código +
      bundle, NÃO com o navegador aberto: sem navegador neste ambiente.
- [x] Busca por termos comuns em inglês no código da web
      (Loading/Error/Submit/Cancel/Retry/Save/Delete/Close/Search/Settings) não encontra
      nenhum literal exibido na UI — zero ocorrências.
- [x] README cobre: o que é, requisitos, como rodar dev, como rodar produção, como
      testar, arquitetura, avisos operacionais. Comandos conferidos contra os scripts
      reais do package.json; `npm run build`, `npm start` e `npm test` executados.
- [x] CLAUDE.md do projeto com "Como rodar", "Como testar", "Arquitetura em 1 minuto" e
      "Armadilhas conhecidas" preenchidos e conferidos contra o código real.
- [x] Estado vazio decente: fábrica sem projetos mostra os dois caminhos de primeiro
      passo (criar do zero / importar pasta existente) em vez de uma linha cinza.

## Notas de execução
Tarefa de refinamento — nenhuma funcionalidade nova, conforme o contexto exige.

**Furo real encontrado no critério 1:** a tela de Jobs não tinha estado de erro. Com o
backend fora do ar, `useJobsAoVivo` engolia a falha do `GET /api/jobs` num `catch` vazio
e a tela exibia *"Nenhuma execução ainda. Dispare uma ação na página inicial."* — mentira
que manda o usuário procurar o problema no lugar errado. O hook passou a expor
`carregando` e `erro`; a página mostra `MensagemErro` com a dica de subir o servidor, e
distingue "sem execuções" de "não foi possível carregar".

**Estado vazio da home:** trocada a linha cinza por um bloco orientado com os DOIS
caminhos concretos de primeiro passo (executar `/novo-projeto` no cartão acima, ou
importar pasta existente), que é a dúvida real de quem abre o painel pela primeira vez.

**Documentação — o que estava mentindo:**
- O CLAUDE.md dizia que o motor de jobs "ainda não está ligado à UI" (verdade na T-007,
  falso desde a Fase 2) e que os testes com login real ficam em `teste:integracao`. Este
  script **é um placeholder que não roda nada** (`echo ...`, criado na T-002): nenhum
  teste de integração foi escrito. Documentado como está, nos dois arquivos — inclusive
  que o `canUseTool` segue não validado em execução paga.
- "Armadilhas conhecidas" estava com o placeholder `<coisas que já causaram problema>`.
  Preenchida com 10 armadilhas reais, cada uma de um bug que custou tempo nesta ou em
  sessões anteriores (cache do gray-matter, `_gestao/` ausente, "corrigir o teste até
  passar", "falha em toda execução não é flaky", I/O sob OneDrive, `npm.cmd` no Windows,
  eventos perdidos no construtor, `sessionId` no init, uma só conexão SSE por página,
  `/trabalhar` duplo).
- README do painel tinha **3 linhas**. Reescrito: o que dá para fazer, requisitos (Node
  22+, Claude Code logado por assinatura — sem `ANTHROPIC_API_KEY`), como rodar (dev e
  produção), tabela de envs, como testar, arquitetura em 10 linhas e avisos operacionais
  — incluindo a **retomada manual** (`sessionId` + `cwd` → `claude --resume <id>` no mesmo
  diretório; a exigência do mesmo `cwd` está confirmada na pesquisa do próprio projeto,
  `2026-07-21-claude-code-headless.md`).

## Verificação
`npm run build` limpo e `npm test`: **servidor 195/195 + web 14/14**. Varredura de
literais em inglês na UI: zero ocorrências. Smoke com o painel no ar: bundle publicado
contém as strings novas ("Sua fábrica ainda não tem projetos", "Carregando execuções",
"Não foi possível carregar as execuções").

**Guardrail da T-019 provado ponta a ponta ao vivo:** um disparo real de `/status` saiu
com `maxTurns: 40` nos params — exatamente o teto da tabela para essa ação.

**Erro meu no smoke, registrado:** esse disparo foi um job PAGO de verdade — eu esperava
só inspecionar o job montado, mas `POST /api/acoes/:id` enfileira E executa. Cancelado em
seguida; o job terminou `cancelado` sem `sessionId`, ou seja, a sessão do SDK nem chegou a
iniciar e o custo foi ~zero. Ainda assim violou a regra de avisar o custo ANTES. Fica o
registro para não se repetir: no painel não existe disparo "a seco".

**Não verificado:** os estados de carregamento/vazio/erro NO NAVEGADOR (backend desligado
e religado, como o critério pede). Não há navegador neste ambiente — a checagem foi por
código e bundle. É o único item da tarefa que depende de olho humano.

## Revisão
Pulada (decisão de custo geral do painel). Auto-revisão: `npx tsc --noEmit` limpo nos dois
workspaces; removido um import (`Vazio`) que ficou sem uso — o tsconfig não tem
`noUnusedLocals`, então o compilador não pegaria sozinho.

