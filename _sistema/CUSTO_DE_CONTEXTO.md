# Custo de contexto — por que 80% da conta não é trabalho, e como cortar

Doutrina de custo da fábrica, válida para as DUAS trilhas e para qualquer projeto.
Escrita em 2026-08-01 a partir de medição dos jobs reais em `painel/dados/jobs/`.

Quem opera a fábrica não precisa ler isto. Quem for mexer em despacho, prompt de agente
ou no runner do painel, precisa — porque quase toda "otimização" intuitiva aqui é neutra
ou negativa, e a seção 3 explica por quê.

---

## 1. O modelo de custo (validado contra os dados)

Uma sessão de agente com `N` voltas de API e contexto `c_t` na volta `t`:

```
cache ESCRITO  ≈  c_final          (cada token entra no contexto uma vez)
cache LIDO     ≈  Σ c_t  ≈  N × c̄  (o prefixo inteiro é relido a CADA volta)

custo ≈ c_final × 5,25/Mtok  +  N × c̄ × 0,30/Mtok
```

Preços medidos (`painel/servidor/src/jobs/claude/precos.ts`): escrita de cache ~5,25
US$/Mtok (a mistura real de TTL 5min/1h; nenhum multiplicador fixo é exato), leitura 0,30
US$/Mtok. **Escrever custa 17,5× mais que ler.** Saída custa 15 US$/Mtok mas é volume
pequeno.

Conferência no job `7a1f9a45` (US$ 7,45 reais, 11 despachos, 211 voltas):

| linha | tokens | US$ | % |
|---|---|---|---|
| cache ESCRITO | 901.574 | 4,73 | 58% |
| cache LIDO | 11.279.158 | 3,38 | 42% |
| saída (produção real) | ~15k–60k | 0,2–0,9 | ~5% |

Contexto médio por volta: 11,28M / 211 = **53,5k tokens**.

O mesmo padrão em `c6d8cede` (62/38), `5d8fca81` (50/50), `fd99c17b` (71/29). O modelo
explica os quatro. A partir daqui, "custo" quer dizer estas duas linhas.

---

## 2. Onde o dinheiro está (medido)

Composição estimada dos 53,5k que cada agente carrega por volta. Os três primeiros itens
foram medidos por `wc -c`; os dois primeiros são estimativa de ordem de grandeza:

| bloco | ~tokens | idêntico entre agentes? |
|---|---|---|
| definições de ferramentas | ~12k | **quase** — `revisor` e `executor` divergem |
| systemPrompt preset `claude_code` | ~4k | **não** — carrega seções dinâmicas (cwd, git) |
| CLAUDE.md fábrica + PROTOCOLO + CLAUDE.md projeto | 9,3k | sim |
| prompt do agente | 0,4k–2,9k | não, por construção |
| **conteúdo de arquivo que o agente leu** | **~26k** | não |

O código do banco-imobiliario inteiro tem **70k tokens** (279.910 chars). Os agentes
escrevem 50–95k de contexto por despacho. **Eles carregam quase o projeto inteiro, a cada
despacho, pagando preço de ESCRITA.** No job `f72534e8` o agente `servidor` fez 20 `Read`
antes de escrever uma linha.

Isso é o alvo. Não é o prompt do agente (2,5k), não é a constituição (5,7k).

---

## 3. A ideia certa e o limite dela — leia antes de propor qualquer coisa

**A ideia:** carregar o contexto uma vez, num prefixo cacheado, e todo agente lê de lá em
vez de recarregar. Direcionalmente correta, e o SDK suporta (seção 4).

**O limite, que quase todo mundo erra:** compartilhar prefixo converte ESCRITA em LEITURA.
Não elimina a leitura — e leitura é cobrada **a cada volta**. Um bloco no prefixo é relido
211 vezes num job de 211 voltas.

Conta feita: pré-carregar um pacote de 40k com o código do projeto no prefixo de todo
agente.

```
economia na escrita:  11 despachos × 40k, vira 1 × 40k   →  −US$ 2,3
custo novo na leitura: o pacote passa a ser lido desde a volta 0,
                       em vez de entrar no meio da sessão
                       211 voltas × 40k × 0,30/M          →  +US$ 2,5
                                                             ----------
                                                       líquido: ~ZERO
```

**Pré-carregar contexto grande é empate.** Move o custo de escrita para leitura e pronto.

A conclusão que importa: **o que decide a conta não é ONDE o contexto mora, é QUANTO ele
mede e por QUANTAS voltas é carregado.** Compartilhar prefixo é ganho real, mas secundário
(~15%). O ganho principal é o contexto ser MENOR.

Daí a regra que rege todo o resto:

> Contexto grande no prefixo compartilhado só compensa se for **denso** — se substituir
> mais conteúdo do que ocupa. Índice de assinaturas: sim. Despejo de código-fonte: não.

---

## 4. O que o SDK realmente oferece (verificado em `sdk.d.ts`, versão pinada 0.3.217)

Achados concretos, não teoria:

**`systemPrompt: string[]` com `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`** — constante exportada
(`"__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__"`). A documentação do tipo é literal: *"blocos antes
do marcador são elegíveis para **cache de prompt entre sessões**; blocos depois, não"*.
É exatamente o mecanismo pedido: um prefixo estático que sobrevive de despacho para
despacho.

**`systemPrompt: { preset: 'claude_code', excludeDynamicSections: true }`** — rotulado no
próprio SDK como *"Cacheable prompt for multi-user fleets"*. Tira do systemPrompt as seções
que variam por sessão (diretório de trabalho, git status, memória) e as reinjeta como
primeira mensagem de usuário. **Sem isso não existe prefixo estável**, porque essas seções
mudam e quebram o cache logo no começo.

**`AgentDefinition.tools` — "se omitido, herda todas as ferramentas do pai".** Ferramentas
vêm ANTES do systemPrompt na chave de cache: se duas requisições têm listas diferentes,
**nada depois pode compartilhar cache**. Hoje o painel já manda a mesma lista para os
especialistas injetados, mas os agentes de disco divergem (`revisor` não tem `Write`,
`executor` tem 10 ferramentas). Unificar é de graça.

**`AgentDefinition.maxTurns`** — teto de voltas POR AGENTE. É o freio que faltava, no nível
certo (o `maxTurns` de topo só limita o laço do orquestrador — foi por isso que jobs
somaram 211 voltas com teto de 120).

**`AgentDefinition.background: boolean`** — permite fixar `false` na DEFINIÇÃO do agente.
Torna mecânico o que hoje é súplica no prompt: é a correção definitiva do incidente
`f72534e8`, melhor que a regra em português que ele violou.

**`autoCompactEnabled` / `autoCompactThreshold`** — existem, e são a ferramenta ERRADA
aqui. Compactação paga uma chamada de sumarização e perde fidelidade; nossos contextos
(35–53k) estão longe do limite da janela. O problema não é estourar contexto, é pagar por
ele. Registrado para não ser reproposto.

---

## 5. As cinco intervenções, em ordem de retorno

Linha de base: job `7a1f9a45`, US$ 7,45 · 11 despachos · 211 voltas · 53,5k de contexto
médio. Todas as projeções derivam do modelo da seção 1.

### I1 — MAPA do projeto: índice denso no lugar da varredura de arquivos
**A maior de todas, e não depende de nenhuma feature do SDK.**

Gerar `_gestao/MAPA.md` (determinístico, sem modelo, invalidado por hash do git): árvore de
arquivos + assinaturas exportadas de cada módulo + uma linha de propósito por arquivo. Para
o banco-imobiliario: ~4k tokens no lugar de 70k de código-fonte.

O agente recebe o MAPA já no contexto e lê na íntegra só os 2–3 arquivos que vai editar.

```
voltas       211  →  ~130   (some ~20 Read de orientação por despacho de construção)
contexto     53,5k → ~35k
leitura      3,38  →  1,37   (−2,01)
escrita      4,73  →  2,02   (−2,71)
                             ---------
                             US$ 7,45 → ~3,4   (−54%)
```

Condição de sucesso: o MAPA precisa ser **injetado**, não oferecido. Disciplina por prompt
já falhou nesta fábrica; se o agente puder varrer o projeto, ele varre.

### I2 — Prefixo compartilhado entre despachos
`tools` unificado (omitir em toda `AgentDefinition`) + `excludeDynamicSections: true` +
bloco estático idêntico antes do `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`.

Bloco compartilhável ≈ ferramentas 12k + preset 4k + docs da fábrica 9k = **25k dos 35k**
que sobram depois da I1.

```
escrita   11 × 35k  →  1 × 25k + 11 × 10k
          2,02      →  0,71   (−1,31)      leitura: inalterada
                                           ---------
                                           ~3,4 → ~2,1   (−72% do original)
```

### I3 — Orquestrador determinístico
Medido no `7a1f9a45`: o orquestrador consumiu 36 voltas, 106k de escrita e 2,44M de
leitura = **US$ 1,29, 17% do job** — para fazer o que é uma máquina de estados: ler
frontmatter, promover tarefa quando as dependências fecham, escolher o próximo agente pelos
3 passos determinísticos do `equipe.json`, aplicar o escalonamento por `tentativas`.

Nada disso precisa de modelo. O painel já lê frontmatter (`fabrica/tarefas.ts`) e já tem o
catálogo de ações. Sobra para o modelo o julgamento de verdade: replanejar, decidir marco
reprovado, redigir relatório.

### I4 — Revisor sem o projeto
O revisor julga o DIFF. Hoje carrega o mesmo contexto de quem escreve o código. Dar-lhe
MAPA + diff + arquivo da tarefa derruba o contexto de ~35k para ~15k em 3 despachos por
job.

### I5 — Critérios de aceite com forma executável
O `planejador` passa a escrever, ao lado do critério em prosa, o comando e o resultado
esperado quando existir. O painel executa os mecânicos de graça e o verificador só é
despachado para o que exige julgamento — que é exatamente a escada de verificação que
`DOMINIOS.md` já define para a trilha genérica, aplicada também à de software.

### Projeção acumulada

| | US$/job | US$/tarefa |
|---|---|---|
| hoje | 7,45 | 2,14 |
| I1 | ~3,4 | ~1,0 |
| I1+I2 | ~2,1 | ~0,60 |
| I1+I2+I3..I5 | ~1,5–1,8 | ~0,45–0,55 |

**−75% no cenário completo, −54% só com a I1.** As duas primeiras casas decimais são
falsas precisão; o que a medição sustenta é a ordem de grandeza e o ranking.

---

## 6. O experimento que vem ANTES de construir a I2

A I1 é aritmética e não precisa de prova. A I2 depende de um comportamento do SDK que a
documentação afirma e que ninguém aqui verificou. Esta fábrica já foi mordida três vezes
por opção que não faz o que a tabela diz (`watchdogMs` nunca lido, `outputConfig.effort`
de nome inexistente, `canUseTool` desligado no modo padrão). Não repita.

**Custo: ~US$ 0,10.** Um job que despacha 3× o mesmo subagente trivial, com `tools`
omitido e um bloco idêntico de ~20k antes do boundary. O painel já grava `cacheEscrita` por
agente — o instrumento existe.

- **Compartilha:** despachos 2 e 3 escrevem ~0 do bloco compartilhado. Construir a I2.
- **Não compartilha:** a I2 morre, a I1/I3/I4/I5 seguem valendo −60%, e fica registrado
  aqui por quê.

---

## 7. O que NÃO fazer (já custou sessões inteiras)

- **Refinar a redação dos prompts dos agentes para cortar custo.** Já foi tentado (commit
  `9e2c9c6`, medido no log de 01/08): 21,6 → 20,4 ferramentas/despacho, US$ 0,56 → 0,60 por
  despacho — ruído. O prompt do agente é 2,5k de um contexto de 53k: mexe em 5% da conta.
- **Pré-carregar o código-fonte no prefixo compartilhado.** Empate, pela seção 3.
- **Sessão única gigante em vez de subagentes.** Leitura é quadrática nas voltas: um job de
  200 voltas com contexto crescendo até 200k custaria MAIS que a arquitetura atual. Os
  subagentes existem justamente para manter `c̄` baixo — o defeito não é despachar, é cada
  despacho recarregar o mundo.
- **Comparar custo entre jobs de tarefas diferentes.** O log de 01/08 já registra: a
  medição fica confundida por desenho. Use `painel/integracao/medir-esforco.ts`, que
  restaura o repositório entre as pernas.
