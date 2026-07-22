---
id: T-004
titulo: API REST de leitura — fábrica, projetos e catálogo de ações
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: [T-003]
areas: [servidor/src/rotas/fabrica.ts, servidor/src/rotas/projetos.ts, servidor/src/fabrica/catalogo-acoes.ts, servidor/testes/rotas/]
tentativas: 2
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Endpoints somente-leitura que expõem o estado da fábrica à SPA: visão geral com o
catálogo das 6 ações globais, lista de projetos e detalhe de projeto.

## Contexto
- Usa o leitor da T-003. Rotas seguem a convenção do agregador (arquivo novo em
  `servidor/src/rotas/`, exportando `{ prefixo, router }` — não editar arquivos de
  outras tarefas).
- Catálogo de ações (`servidor/src/fabrica/catalogo-acoes.ts`): as descrições vêm do
  frontmatter (`description`, `argument-hint`) dos arquivos REAIS
  `.claude/commands/*.md` da raiz da fábrica — lidos na hora (fonte única de verdade),
  com fallback em PT-BR se um arquivo faltar. Cada ação: id, nome, descricao,
  argumentos esperados e `disponivel: false` (vira true quando a T-011 criar os
  endpoints de disparo).
- Erros sempre em JSON com mensagem em PT-BR.

## Critérios de aceite
- [ ] `GET /api/fabrica` → 200 com `acoes` (6 itens: novo-projeto, ideia, trabalhar,
      status, encerrar-dia, manutencao — descrições batendo com os arquivos de
      `.claude/commands/`) e `resumo` (nº de projetos e tarefas agregadas por status).
- [ ] `GET /api/projetos` → 200 com lista; cada item: nome, contagens por status, fase
      atual e estado do marco.
- [ ] `GET /api/projetos/painel-fabrica` → 200 com tarefas (frontmatter + corpo), plano
      (fases/meta/marco/tarefas), textos de decisões e progresso, e `analise: null`
      (enquanto não existe ANALISE.md).
- [ ] `GET /api/projetos/nao-existe` → 404 com `{ erro: <mensagem em PT-BR> }`.
- [ ] Testes de rota (supertest) cobrindo os 4 casos acima usando a fábrica-fixture da
      T-003 (via override da raiz); `npm test` passa.

## Notas de execução

### Ciclo 1

**O que foi feito:** API REST somente-leitura sobre o leitor da T-003 (nada de parsing
reimplementado):
- `servidor/src/rotas/fabrica.ts` — `GET /api/fabrica`: `{ acoes, resumo, erros }`;
  `acoes` vem do catálogo; `resumo` = nº de projetos + contagem de tarefas agregada
  pelas 8 chaves do protocolo; `erros` = problemas no nível da raiz.
- `servidor/src/rotas/projetos.ts` — `GET /api/projetos` (lista leve: nome,
  contagemPorStatus, faseAtual com marco, erros — sem o corpo das tarefas) e
  `GET /api/projetos/:nome` (o `ProjetoDetalhe` do leitor na íntegra: tarefas com
  frontmatter + seções, plano, decisões, progresso, `analise` null sem ANALISE.md);
  404 em JSON PT-BR para inexistente/travessia (o leitor já rejeita).
- `servidor/src/fabrica/catalogo-acoes.ts` — catálogo das 6 ações (id, nome, descricao,
  argumentos, `disponivel: false` até a T-011), lendo `.claude/commands/*.md` da raiz
  NA HORA via gray-matter (`matter(texto, {})` — armadilha do cache) + extração
  tolerante linha a linha quando o YAML é inválido; fallback PT-BR por arquivo.
- Testes (14, todos verdes) em `servidor/testes/rotas/`: `fabrica.test.ts` e
  `projetos.test.ts` (supertest sobre a fábrica-fixture da T-003 via env FABRICA_RAIZ +
  import dinâmico do app, cobrindo os 4 casos dos critérios + travessia + analise null)
  e `catalogo-acoes.test.ts` (fixture própria `testes/rotas/fixtures/raiz-comandos/` com
  comando válido, válido sem hint, YAML inválido recuperável, frontmatter-lixo e
  ausência + contrato vivo contra os comandos REAIS da fábrica).

**Achado importante (decisão em DECISOES.md):** `trabalhar.md` e `status.md` reais têm
`argument-hint` YAML-inválido (`[nome-do-projeto] (vazio = ...)`); o js-yaml lança e o
gray-matter reprova, mas o Claude Code aceita. Sem a extração tolerante, o critério
"descrições batendo com os arquivos" seria inatingível sem editar arquivos fora do
confinamento.

**Como rodar/testar:** `cd servidor` → `npx tsc --noEmit` e `npx vitest run testes/rotas`
(14/14; suíte completa é papel do testador via `npm test`). Servidor real:
`npx tsx src/index.ts` (porta 8765; env PORTA muda).

**Exercício manual (fluxo real):** servidor subido com `npx tsx src/index.ts`
(PORTA=8791) contra a fábrica REAL; 26 checagens via fetch, todas OK:
`/api/fabrica` 200 com as 6 ações (descrição real do trabalhar, hint real do status
recuperado do YAML inválido, encerrar-dia sem argumentos) e resumo
`{projetos: 2, tarefasPorStatus: {backlog: 15, em-execucao: 2, concluida: 3, ...}}`;
`/api/projetos` 200 com cockpit + painel-fabrica (fase atual "Fase 1 — Fundação
(painel somente-leitura)" pendente, lista sem corpo de tarefas); 
`/api/projetos/painel-fabrica` 200 com 20 tarefas (esta T-004 aparecendo
`em-execucao` ao vivo), plano com 3 fases, decisões/progresso e `analise: null`;
`/api/projetos/nao-existe` 404 `{"erro":"Projeto \"nao-existe\" não encontrado"}`.
Servidor encerrado após a verificação.

**Ajustes de gestão:** `areas` corrigidas de `servidor/test/rotas/` para
`servidor/testes/rotas/` (convenção real, conforme despacho).

**Commit:** 4cdbf30 — "T-004: API REST de leitura - fabrica, projetos e catalogo de
acoes" (12 arquivos, 632 inserções: 3 fontes, 3 testes, 4 fixtures, tarefa e
DECISOES.md).


### Ciclo 2 (correção da reprovação C5)

**Escopo:** exatamente o apontado pelo testador — só o ajudante `camposDoArquivo` de
`servidor/testes/rotas/catalogo-acoes.test.ts`. Nenhuma linha de produção tocada.

**Causa e correção:** o ajudante extraía o valor LITERAL da linha do frontmatter,
incluindo as aspas que agora envolvem o `argument-hint` de `trabalhar.md` e `status.md`
reais (YAML corrigido pelo orquestrador após o ciclo 1); produção parseia o YAML válido
e devolve o valor sem aspas. O ajudante ganhou `desembrulharEscalar`: escalar entre
aspas duplas envolventes é desembrulhado (com `\"` e `\\` desescapados) e entre aspas
simples idem (`''` → `'`); escalar plano segue intacto. A comparação do contrato vivo
passou a ser semântica, resistente a qualquer comando real que use aspas legítimas —
mantendo o leitor independente do parser de produção (propósito do teste).

**Testes:** `npx vitest run testes/rotas` → 14/14 verdes (catalogo-acoes 7/7, incluindo
o contrato vivo contra os arquivos reais que reproduzia a falha; fabrica 2/2,
projetos 5/5). `npx tsc --noEmit` limpo. Suíte completa fica com o testador.

**Commit:** 209b17d — "T-004: contrato vivo compara escalares YAML semanticamente
(ciclo 2)" (2 arquivos: o teste e esta tarefa; commit seletivo — a árvore tinha
arquivos de gestão de outras tarefas, não incluídos).

## Verificação

### Ciclo 1

Ambiente: Windows 10, servidor real via `npx tsx src/index.ts` (PORTA=8799) contra a
fábrica REAL; suíte via `npm test` na raiz do monorepo. Contexto relevante: desde o
commit 4cdbf30, o orquestrador corrigiu o YAML de `.claude/commands/trabalhar.md` e
`status.md` na raiz (`argument-hint` agora entre aspas, YAML válido).

**Critério 1 — GET /api/fabrica → 200 com acoes (6) e resumo: PASSOU.**
`curl http://127.0.0.1:8799/api/fabrica` → HTTP 200 `application/json`. `acoes` com os
6 ids na ordem canônica (novo-projeto, ideia, trabalhar, status, encerrar-dia,
manutencao), todos `disponivel: false`. Descrições conferidas campo a campo contra os
arquivos reais de `.claude/commands/` — batem, inclusive o hífen recém-editado de
`trabalhar.md`/`status.md` ("Loop principal da fábrica - executa...", diferente do
fallback com travessão), provando leitura na hora do arquivo e não fallback. Hints:
trabalhar = `[nome-do-projeto] (vazio = todos os projetos)`, status = `[nome-do-projeto]
(vazio = todos)` (valor YAML parseado, aspas corretamente removidas); encerrar-dia e
manutencao = null (sem hint no arquivo). `resumo` = `{projetos: 2, tarefasPorStatus:
{backlog: 15, em-teste: 2, concluida: 3, resto 0}}` — idêntico ao scan real
(`grep ^status: projetos/*/_gestao/tarefas/*.md | sort | uniq -c` → 15/3/2; 2 pastas em
projetos/). `erros: []`.

**Critério 2 — GET /api/projetos → 200 com lista: PASSOU.**
`curl .../api/projetos` → HTTP 200. Dois itens (cockpit, painel-fabrica), cada um com
nome, contagemPorStatus (8 chaves), faseAtual e erros; sem corpo de tarefas (lista
leve). painel-fabrica: contagens 15/2/3 corretas, faseAtual "Fase 1 — Fundação (painel
somente-leitura)" com `marco.estado: "pendente"`. cockpit (gestão incompleta): faseAtual
null + erro "PLANO.md ausente em _gestao/" — degrada sem 500.

**Critério 3 — GET /api/projetos/painel-fabrica → 200 com detalhe: PASSOU.**
HTTP 200 com 20 tarefas (frontmatter completo + seções; T-004 conferida: titulo, status
em-teste, prioridade alta, deps [T-003], 4 areas, seções objetivo/contexto/critérios/
notas preenchidas), plano com 3 fases (nome, meta, marco pendente, tarefas por fase:
6/10/4), decisoes (12.215 chars) e progresso (553 chars) como texto, `analise: null`
(confirmado: não existe `_gestao/ANALISE.md`), `erros: []`.

**Critério 4 — GET /api/projetos/nao-existe → 404 JSON PT-BR: PASSOU.**
HTTP 404 `application/json` com `{"erro":"Projeto \"nao-existe\" não encontrado"}`.
Bordas exercitadas, todas 404 em JSON PT-BR sem vazar nada: `..%2Fpainel-fabrica`,
`..%2F..%2F_sistema`, `%2e%2e`, nome só com espaço, subrota inexistente
(`/api/projetos/painel-fabrica/tarefas`). GET /api/projetos/cockpit → 200 com
tarefas [], plano/analise null e erro descritivo (sem 500).

**Critério 5 — testes de rota + `npm test` passa: FALHOU.**
`npm test` (raiz do monorepo) → **1 teste falha** e o script sai com código 1:
`servidor/testes/rotas/catalogo-acoes.test.ts` > "catalogoAcoes contra a fábrica real
(contrato vivo)" > "descrições e argumentos batem com os arquivos .claude/commands/*.md"
(linha 113):
```
AssertionError: argumentos de trabalhar:
Expected: "\"[nome-do-projeto] (vazio = todos os projetos)\""   ← com aspas
Received: "[nome-do-projeto] (vazio = todos os projetos)"        ← sem aspas
```
Reprodução: `cd servidor && npx vitest run testes/rotas/catalogo-acoes.test.ts`
(determinístico: 6 passam, 1 falha). Placar geral da suíte: servidor 66/67 + web 7/7.

**Causa raiz (no arquivo de teste da T-004, dentro do escopo):** o ajudante
`camposDoArquivo` (linhas 25–35 do teste) extrai o valor LITERAL da linha, incluindo as
aspas que agora envolvem o `argument-hint` de `trabalhar.md` e `status.md` (YAML
válido). Já `catalogoAcoes` parseia o YAML válido corretamente e devolve o valor sem
aspas (comportamento CERTO — é o que o Claude Code exibe). O código de produção está
correto; o leitor "independente" do teste de contrato vivo é ingênuo quanto a escalares
YAML entre aspas e quebra com qualquer comando real que use aspas legitimamente. O
mesmo descompasso latente existe para `status.md` (o loop falha primeiro em trabalhar).
**Correção esperada (executor):** fazer o teste de contrato vivo comparar valores
SEMÂNTICOS (ex.: remover aspas envolventes no ajudante, ou parsear o frontmatter real
com YAML de verdade no lado esperado) — sem tocar no código de produção, que passou em
todos os exercícios reais acima e nos 6 testes de fixture (caminho tolerante para YAML
inválido continua coberto e verde pela fixture `raiz-comandos`).

Nota (fora do escopo da correção): nenhuma falha alheia — os demais 12 arquivos de
teste (fábrica, jobs, saúde, erros, web) passaram todos. Servidor encerrado (PID 3052)
e porta 8799 liberada ao final; nenhum arquivo auxiliar deixado na árvore.

**Veredito: REPROVADA — 4 PASSOU, 1 FALHOU → status volta a em-execucao.**


## Revisão

