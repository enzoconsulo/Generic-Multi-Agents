---
id: T-003
titulo: Leitor do estado da fábrica (projetos, tarefas, planos, ideias, logs)
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: [T-002]
areas: [servidor/src/fabrica/, servidor/testes/fabrica/, servidor/testes/fixtures/]
tentativas: 1
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Módulo somente-leitura `servidor/src/fabrica/` que transforma os arquivos da fábrica em
dados tipados: lista de projetos com tarefas (frontmatter + seções), plano com fases e
marcos, decisões/progresso/análise, ideias e log diário mais recente.

## Contexto
- Formatos-fonte (o CONTRATO destes dados): `_sistema/PROTOCOLO_TAREFAS.md` (frontmatter
  e status válidos), `_sistema/templates/PLANO.md` (linhas `Meta:`, `Marco:`,
  `Tarefas:`), `_sistema/ideias/` (frontmatter `status: nova|roteada|descartada`),
  `_sistema/logs/AAAA-MM-DD.md`. Ler esses arquivos reais da fábrica ajuda a calibrar.
- Frontmatter com `gray-matter`. Funções puras recebendo a raiz da fábrica como
  parâmetro (testável com fixtures via `FABRICA_RAIZ`/parâmetro direto).
- Robustez em vez de exceção: arquivo malformado (frontmatter inválido, status fora do
  vocabulário, plano sem linha Marco) NÃO derruba o scan — o item retorna com campo
  `erros: string[]` preenchido e o resto segue.
- Fase atual de um projeto = primeira fase do PLANO.md cuja linha `Marco:` está
  `pendente`.
- Este módulo NUNCA escreve nada — somente leitura.
- Montar em `servidor/test/fixtures/` uma mini-fábrica falsa (2 projetos, tarefas em
  vários status, um caso malformado) usada pelos testes.

## Critérios de aceite
- [ ] `lerFabrica(raiz)` retorna, por projeto: nome, contagem de tarefas por status,
      fase atual (nome + estado do marco) e tarefas com frontmatter completo
      (id, titulo, status, prioridade, dependencias, areas, tentativas, datas).
- [ ] `lerProjeto(raiz, nome)` retorna adicionalmente: corpo das tarefas (objetivo,
      critérios, seções de registro), plano completo (fases com meta/marco/tarefas),
      textos de DECISOES.md e PROGRESSO.md, e `analise` (conteúdo de ANALISE.md ou null).
- [ ] Tarefa com frontmatter inválido aparece no resultado com `erros` preenchido e não
      derruba o scan (teste cobre).
- [ ] Testes com fixtures cobrem: projeto sem `_gestao/`, tarefa com status
      desconhecido, plano sem linha `Marco:`, projeto inexistente (retorno null/erro
      tipado — não exceção não tratada).
- [ ] O parse do PLANO.md é testado contra o template real
      (`_sistema/templates/PLANO.md`) e contra o `_gestao/PLANO.md` deste projeto.
- [ ] `npm test` passa.

## Notas de execução

### Ciclo 1

**O que foi feito:** módulo somente-leitura `servidor/src/fabrica/` completo:
- `tipos.ts` (vocabulários e interfaces), `frontmatter.ts` (parse seguro com gray-matter
  + normalizações), `tarefas.ts` (frontmatter validado + seções do corpo + contagem),
  `plano.ts` (fases com Meta multilinha/Marco/Tarefas + fase atual), `sistema.ts`
  (ideias e log diário mais recente), `fabrica.ts` (`lerFabrica`/`lerProjeto`),
  `index.ts` (API pública).
- Fixtures da mini-fábrica em `servidor/testes/fixtures/fabrica-falsa/`: projeto `alfa`
  (5 tarefas em vários status, uma com frontmatter YAML inválido, uma com status fora do
  vocabulário; plano com marcos aprovado/pendente e uma fase SEM linha Marco), projeto
  `beta` (sem `_gestao/`), arquivo solto em `projetos/`, ideias (README excluído + uma
  com status inválido) e logs (com arquivo sem nome de data, ignorado).
- Testes: 24 em `servidor/testes/fabrica/` (`fabrica.test.ts`, `projeto.test.ts`,
  `plano.test.ts`, `tarefas.test.ts`), incluindo o parse do PLANO.md contra o template
  real (`_sistema/templates/PLANO.md`) e contra o `_gestao/PLANO.md` deste projeto
  (asserções estáveis à evolução do plano), CRLF e travessia de caminho em `lerProjeto`.

**Como rodar/testar:** `cd servidor` → `npx tsc --noEmit` e
`npx vitest run testes/fabrica` (24/24 verdes; suíte completa fica com o testador via
`npm test`).

**Exercício manual (fluxo real):** `lerFabrica`/`lerProjeto` rodados contra a fábrica
real — 2 projetos listados; painel-fabrica com 20 tarefas (contagem por status correta),
fase atual "Fase 1 — Fundação (painel somente-leitura)" pendente, plano/decisões/
progresso lidos, `analise` null, projeto inexistente → null; o projeto real `cockpit`
(tem `_gestao/` sem PLANO.md) apareceu com `erros` preenchido SEM derrubar o scan —
robustez confirmada em dado real.

**Decisões (registradas em DECISOES.md):** semântica de erros (valor bruto preservado +
`erros[]`), contagem só de status válidos, fase atual com fallback para `reprovado`, e a
armadilha do cache do gray-matter — sem objeto de options ele cacheia ANTES do parse e
engole o erro de YAML nas chamadas seguintes; por isso `matter(texto, {})`.

**Ajustes de gestão:** `areas` do frontmatter corrigidas de `servidor/test/…` para
`servidor/testes/…` (convenção real do repo, conforme despacho). gray-matter instalado
no workspace servidor (dependência já prevista na especificação).

**Commit:** ec92345 — "T-003: leitor do estado da fabrica - projetos, tarefas, planos,
ideias e logs" (33 arquivos, 1508 inserções).

## Verificação

### Ciclo 1

**Veredito: APROVADA — 6 critérios, 6 PASSOU.** Método: suíte completa do monorepo +
script auxiliar descartável (`servidor/tmp-verificacao-t003.ts`, executado via
`npx tsx` e apagado depois) exercitando `lerFabrica`/`lerProjeto` contra a fábrica
REAL e casos de borda em pasta temporária (26 asserções, todas verdes). Gabarito da
contagem por status obtido independentemente via grep de `^status:` nas 20 tarefas.

1. **`lerFabrica(raiz)` com resumo por projeto — PASSOU.** Contra a raiz real:
   projetos `[cockpit, painel-fabrica]`; painel-fabrica com 20 tarefas e contagem
   `{backlog:16, em-teste:2, concluida:2, resto:0}` idêntica ao gabarito do grep;
   fase atual "Fase 1 — Fundação (painel somente-leitura)" com marco `pendente`;
   frontmatter completo conferido na T-003 (id, titulo, status=em-teste,
   prioridade=alta, dependencias=[T-002], areas=3 itens, tentativas=1,
   criada/atualizada=2026-07-21, erros=[]). Resumo NÃO carrega `secoes` (conferido).

2. **`lerProjeto(raiz, nome)` com detalhe — PASSOU.** `lerProjeto(real,
   "painel-fabrica")`: corpo das tarefas presente (objetivo/contexto/critérios/notas
   da T-003, incluindo o hash ec92345 nas notas); plano completo com 3 fases, todas
   com meta/marco/tarefas e `erros=[]`; DECISOES.md e PROGRESSO.md lidos na íntegra;
   `analise=null` (ANALISE.md não existe). Cockpit: decisoes/progresso lidos,
   plano/analise null.

3. **Frontmatter inválido não derruba o scan — PASSOU.** Teste
   `fabrica.test.ts > "tarefa com frontmatter inválido entra no resultado com erros
   e não derruba o scan"` verde (fixture T-004-quebrada.md com YAML inválido: as 5
   tarefas seguem presentes, id recuperado do nome do arquivo, `erros` com
   "frontmatter inválido"). Extra: arquivo de tarefa com 0 bytes em fábrica temp
   também retorna com `erros` sem exceção.

4. **Cobertura dos casos exigidos nas fixtures — PASSOU.** Todos verdes em
   `npx vitest run` (dentro do `npm test`): projeto sem `_gestao/` (beta, em
   fabrica.test.ts e projeto.test.ts), status desconhecido ("fritando",
   T-003-status-estranho.md), plano sem linha `Marco:` (Fase 3 do alfa, erro sobe
   para o projeto), projeto inexistente → `null` e travessia (`../alfa`, `..\\alfa`,
   `..`, `""`) → `null` (projeto.test.ts).

5. **Parse do PLANO.md contra arquivos reais — PASSOU.** `plano.test.ts` (5 testes
   verdes) valida contra `_sistema/templates/PLANO.md` (3 fases, marcos pendentes,
   comentário HTML não vira fase) e contra o `_gestao/PLANO.md` deste projeto
   (título, 3 fases com meta/marco válidos, T-003 na Fase 1).

6. **`npm test` passa — PASSOU.** `npm test` na raiz do monorepo: servidor
   `tsc --noEmit` limpo + 9 arquivos / 49 testes verdes (24 do módulo fabrica + 25
   pré-existentes de jobs/saúde/erros — nada quebrou); web 7 testes verdes.

**Bordas extras exercitadas (todas OK):** raiz sem `projetos/` → estado vazio com 1
erro registrado; tarefa com BOM UTF-8 + CRLF (arquivo típico de PowerShell) parseada
limpa; PLANO.md sem nenhuma fase → erro registrado, fase atual null; contagem ignora
tarefa sem status válido. Confirmado somente-leitura: nenhuma chamada de escrita
(writeFile/mkdir/rm/etc.) em `servidor/src/fabrica/` (grep). Nenhum processo
pendurado; script auxiliar apagado.

## Revisão

### Ciclo 1

**Aprovado sem ressalvas** (2026-07-21, commit ec92345 — diff integral lido: 7 arquivos
do módulo, 4 de teste, 18 fixtures, package.json, DECISOES.md).

**O que foi verificado:**
- **Correção:** parse de frontmatter nunca lança (YAML escalar/array no topo não quebra —
  acesso por chave vira undefined e erro de campo); datas Date-UTC do js-yaml
  normalizadas sem off-by-one; seções com CRLF/acentos/`### Ciclo N` tratadas certo
  (`^##\s+` não captura `###`); contagem por status coerente com a decisão registrada;
  `faseAtualDoPlano` com fallback reprovado correto; workaround do cache do gray-matter
  CONFERIDO no fonte do pacote (cache só ativa com options falsy — `matter(texto, {})`
  desativa de fato).
- **Segurança:** travessia em `lerProjeto` bloqueada (rejeita `""`/`.`/`..`/qualquer
  separador + exige `stat().isDirectory()`; nomes com `:` no Windows caem no stat →
  null). Módulo comprovadamente somente-leitura (nenhuma API de escrita).
- **Integração:** vocabulários idênticos ao PROTOCOLO_TAREFAS.md; parser fiel ao
  template real de PLANO.md e ao plano deste projeto (comentário HTML não vira fase,
  Meta multilinha, 3 estados de Marco); tipos exportados completos para T-004/T-005/T-006;
  resumo sem `secoes` confirmado.

**Notas menores (não reprovam):**
- [menor] `servidor/src/fabrica/tarefas.ts:31` (idem `sistema.ts:23,77`) — `readFile`
  após `readdir` sem try/catch: arquivo apagado/renomeado no meio do scan rejeitaria a
  promessa inteira de `lerFabrica`. Implausível em uso normal (protocolo proíbe apagar
  tarefa); se um dia incomodar o painel ao vivo, envolver a leitura por item em
  try/catch → `erros[]`.
- [menor] `servidor/src/fabrica/tarefas.ts:62-72` — `tentativas` não-inteiro (ex.: `"2"`
  com aspas) cai para 0 em vez de preservar o bruto como os campos de texto; o erro é
  sinalizado, então a UI enxerga o problema.
