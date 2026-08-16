---
status: roteada
data: 2026-08-16
projeto: banco-imobiliario
---

## Pedido original do usuário (literal)

> no banco-imobiliario, os dados não estão rolando certo, o que deu errado, não tem a
> animação

## O que já verifiquei antes de rotear

- `equipe.json` do projeto NÃO tem campo `dominio` → trilha SOFTWARE (`planejador` normal).
- Este sintoma é quase idêntico ao que abriu a T-044 (`primeira-rolagem-nao-anima`,
  criada 2026-08-14): "a primeira rolagem de cada sessão não anima — dados e peão pulam
  direto para o resultado". A T-044 foi para `concluida` no ciclo 3, aprovada **sem
  ressalvas** na Revisão de 2026-08-15 (commit `f1bd953`), com 3 cenas versionadas
  (`primeira-rolagem-anima`, `primeira-rolagem-carta-anima`,
  `entrar-em-andamento-nao-anima`) todas passando, e `npm test` 215/215.
- A T-038 (auditoria de animação em mobile real, dependia de T-044) também está
  `concluida`, aprovada sem ressalvas, com 9 cenas novas em `ferramentas/cenario.mjs`
  confirmando peão/dados/cubo 3D funcionando em viewport 390×844.
- Ou seja: **as duas tarefas que existem especificamente para este sintoma foram dadas
  como resolvidas ontem**, com evidência automatizada robusta (cenas versionadas,
  screenshots, leitura de diff pela Revisão). O usuário está relatando o MESMO sintoma
  hoje (16/08), um dia depois.
- Este projeto já teve casos confirmados de gap entre "verificação automatizada passou" e
  "experiência real do usuário" (a queixa de 2026-08-10 que abriu a Fase 6 inteira, e o
  histórico de tarefas `concluida` sem implementação real em T-020/T-021). Não é motivo
  para desconfiar do trabalho da T-044/T-038 sem investigar, mas é motivo para não
  assumir "já foi resolvido, deve ser outra coisa" sem checar.
- Não investiguei o código/servidor real nesta sessão (isso é trabalho de agente, não do
  orquestrador no chat principal) — não sei ainda se é: (a) o usuário testando uma versão
  não atualizada/servidor não reiniciado, (b) um caminho real de jogo que as cenas
  automatizadas não cobrem, ou (c) uma regressão introduzida depois do commit `f1bd953`
  (ex. por T-038 rodando em cima do mesmo código, embora T-038 diga que não tocou
  `app.js`/`tabuleiro.js`/`tabuleiro.css`).

## Roteamento

Não é trivial nem inequívoco o suficiente para eu criar a tarefa direto: a causa raiz
está em aberto entre pelo menos 3 hipóteses (ambiente do usuário vs. caminho de jogo não
coberto vs. regressão), e as duas tarefas mais relevantes já foram fechadas com
verificação forte — decidir a causa exige investigação, não é um conserto pontual óbvio.
Despachando o `planejador` para investigar e decompor.

## Resultado (2026-08-16)

Planejador investigou por leitura (sem acesso a execução de comando nessa sessão) e
**descartou regressão de código**: nada tocou `public/js/app.js`/`server/` desde o commit
`f1bd953` (fix da T-044) além de auditoria/testes sem relação; sem service worker (T-039);
cache HTTP do `express.static` já força revalidação por padrão. Hipótese que sobrou e não
foi descartada: uma aba congelada pelo **bfcache** do navegador (comum ao trocar de app no
celular) continua rodando o JS de antes do fix, porque nada no código reage a uma
restauração desse tipo.

**Tarefa criada:** T-048 (`_gestao/tarefas/T-048-recarregar-ao-restaurar-do-bfcache.md`),
`pronta`, sem dependências, `agente: frontend`. Detecta `pageshow` com `event.persisted`
e força `location.reload()`; primeiro critério dela também reconfirma por execução real
(que o planejador não pôde fazer) que as cenas da T-044 continuam passando hoje.

Registrado em `_gestao/DECISOES.md` e `_gestao/PLANO.md` do projeto, commitado
(`dbcee46`, `chore: ideia integrada — T-048 (bfcache pode congelar o fix da T-044)`).

Proximo passo: `/trabalhar banco-imobiliario` para a T-048 sair do papel. Se o sintoma
persistir depois dela, nao ha mais hipotese barata a descartar por leitura -- o proximo
passo sera pedir ao usuario detalhe de repro (navegador, celular vs. desktop, partida nova
ou retomada, se o celular tinha ficado em segundo plano).
