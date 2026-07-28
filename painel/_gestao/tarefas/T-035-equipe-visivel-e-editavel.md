---
id: T-035
titulo: Equipe de especialistas visível e editável na página do projeto
projeto: painel-fabrica
status: backlog
prioridade: media
dependencias: [T-033]
areas: [servidor/src/rotas/equipe.ts, web/src/paginas/projeto/SecaoEquipe.tsx]
tentativas: 0
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Ver quem é a equipe de especialistas do projeto, o que cada um faz, e poder ajustar ou
mandar recriar.

## Contexto
`_gestao/equipe.json` é o que faz o projeto se auto-estruturar: o planejador sintetiza
especialistas a partir da ideia, e o `/trabalhar` os injeta como `options.agents`. Só que
a equipe é INVISÍVEL fora da execução ao vivo — `EquipeAoVivo.tsx` só mostra quem está
trabalhando agora. Parado, ninguém sabe quem existe, o que cada um faz, nem que um agente
está com o `prompt` vazio e por isso nunca é usado (o leitor já calcula isso em `erros`,
e o dado já chega no `ProjetoDetalhe` — só não é exibido).

## Critérios de aceite
- [ ] Seção "Equipe" no projeto: cada especialista com nome, descrição e ferramentas.
- [ ] Agente inválido aparece com o motivo (o `erros` que o leitor já produz), em vez de
      sumir silenciosamente.
- [ ] Projeto sem `equipe.json` explica que usa o executor genérico — não é erro.
- [ ] Editar a equipe pela web, com validação antes de gravar.
- [ ] Ação "recriar equipe" despachando o planejador.

## Notas de execução
**Escrever `equipe.json` pela web é uma EXCEÇÃO à regra** de o painel nunca escrever nos
arquivos da fábrica — a mesma família de `ANALISE.md`, `ci.json` e a importação. Precisa
ser registrada em `DECISOES.md` e no CLAUDE.md do painel junto com as outras, senão a
regra vira letra morta por acúmulo de exceções não escritas.

Validar ANTES de gravar, reusando as regras que `fabrica/equipe.ts` já aplica na leitura
(id em minúsculas/hífen, prompt não vazio, sem id duplicado) — validação escrita duas
vezes com regras diferentes é como o arquivo fica aceito na gravação e rejeitado na
leitura.

## Verificação


## Revisão
