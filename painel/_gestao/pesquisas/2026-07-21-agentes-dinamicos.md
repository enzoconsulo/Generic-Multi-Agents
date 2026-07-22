# Design — Agentes dinâmicos sob demanda no /trabalhar (2026-07-21)

Objetivo do usuário: o /trabalhar deve **pegar a ideia central do projeto e criar,
orquestrar e ordenar sub-agentes sob demanda** — especialistas montados para AQUELE
projeto, não só os 6 papéis fixos. Genérico e coringa para qualquer tipo de projeto.

## Enabler técnico (confirmado)
O Agent SDK aceita agentes dinâmicos: `options.agents` é um
`Record<string, AgentDefinition>`, e `AgentDefinition = { description, prompt, tools?,
disallowedTools?, model?, skills? }` (verificado em `sdk.d.ts`). Ou seja, o painel pode
injetar especialistas na sessão headless em tempo de execução — eles ficam disponíveis
como tipos de subagente para o orquestrador despachar, junto dos agentes de arquivo.

## Arquitetura proposta — "Equipe do projeto"

A ideia central: **os especialistas fazem a construção (papel de executor, especializado);
o testador e o revisor continuam fixos e genéricos** (verificação/revisão não devem ser
"criativas" — estabilidade ali é feature). Isso dá agentes sob demanda onde importa
(implementação) sem desestabilizar a qualidade.

### 1. Geração da equipe (a partir da ideia)
O **planejador** (já é arquiteto + PM) ganha um produto novo: além de spec/plano/tarefas,
gera `projetos/<nome>/_gestao/equipe.json` — manifesto de especialistas sintetizados da
spec/stack. Cada entrada:
```json
{ "id": "frontend", "nome": "Especialista Frontend",
  "descricao": "Quando a tarefa toca UI/React/CSS",
  "prompt": "<system prompt específico: convenções, stack, o que priorizar>",
  "ferramentas": ["Read","Edit","Write","Bash"] }
```
Genérico: para um app React inventa `frontend`/`api`/`estilos`; para um CLI, outros; para
um pipeline de dados, `etl`/`qualidade`. Projeto simples → equipe vazia (cai no executor
genérico; nada quebra).

### 2. Tarefa → especialista
Frontmatter da tarefa ganha o campo OPCIONAL `agente:` (id do especialista que executa),
decidido pelo planejador pela natureza/área da tarefa. Ausente = executor genérico
(retrocompatível — todas as tarefas atuais seguem funcionando).

### 3. Execução (painel + SDK)
Ao disparar `/trabalhar <projeto>`, o painel:
- lê `equipe.json`, converte cada especialista em `AgentDefinition` e passa em
  `options.agents` para o `query()` — agora eles existem na sessão, ao lado de
  testador/revisor;
- a estratégia de modelo já escolhida flui para eles (model `inherit` → modelo da sessão,
  incl. o fallback Fable→Opus).
O comando `/trabalhar` (na fábrica) passa a despachar cada tarefa `pronta` ao especialista
do campo `agente:` (fallback: executor genérico); testador e revisor seguem iguais.

### 4. Visibilidade no painel
A página do projeto mostra a **equipe** (cada especialista e quando é usado) — serve ao
requisito de "visão profunda". Botão futuro "regerar equipe" ao evoluir o projeto.

## Por que assim (trade-offs)
- **File-based:** `equipe.json` é arquivo versionado no projeto, inspecionável e editável —
  respeita o princípio da fábrica (estado reconstruível de arquivos).
- **Nativo:** usa `options.agents` do SDK, sem injeção hacky de arquivos (agentes de
  projeto sob `projetos/<nome>/.claude/agents` NÃO carregariam, porque o cwd do /trabalhar
  é a raiz da fábrica — por isso a injeção via painel é o caminho confiável).
- **Retrocompatível e seguro:** `agente:` opcional; verificação/revisão estáveis.
- **Genérico:** a equipe nasce da ideia via planejador → funciona para qualquer projeto.

## Fases de implementação (proposta)
- **P1 — Geração:** planejador gera `equipe.json`; protocolo/template de tarefa ganham
  `agente:`. (Toca a fábrica: `.claude/agents/planejador.md`, `_sistema/`.)
- **P2 — Painel injeta agentes:** ao disparar /trabalhar de um projeto, o painel carrega
  `equipe.json` → `options.agents` no runner. (Toca o painel: acoes/runner.)
- **P3 — /trabalhar usa especialistas:** comando despacha por `agente:` (fallback
  executor). (Toca a fábrica: `.claude/commands/trabalhar.md`.)
- **P4 — Painel mostra a equipe:** leitor lê `equipe.json`; página do projeto exibe.

## Riscos / questões abertas
- O `/trabalhar` e o planejador vivem na FÁBRICA (que o painel não mantém mais pelo
  pipeline) — mudanças ali são feitas à mão por mim.
- Especialistas só existem quando o /trabalhar roda VIA painel (via `options.agents`).
  Rodar /trabalhar manualmente no chat não os teria. Aceitável (o painel é a interface).
- Custo: mais especialistas não custam mais por si; o custo extra é o passo de gerar a
  equipe (uma vez por projeto/replanejamento).
- Validar em projeto real exige uma execução paga do planejador + /trabalhar (modelo
  barato no teste).
