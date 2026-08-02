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

---

### I1 — MAPA do projeto: índice denso no lugar da varredura  ✅ FEITO em 2026-08-01

`_sistema/ferramentas/mapa.mjs` gera `_gestao/MAPA.md`: árvore de arquivos + assinatura,
tipo de retorno e frase de propósito de cada símbolo público. Determinístico, sem
dependência, milissegundos.

**Tamanho medido — a regra "denso ou nada" (seção 3) está sendo cumprida:**

| projeto | mapa | fonte | razão |
|---|---|---|---|
| banco-imobiliario | ~5,8k tok | ~62,9k tok | **9,2%** |
| ia-hibrida-limpa | ~7,8k tok | ~180,5k tok | **4,3%** |
| painel (TS) | ~14,3k tok | ~266,6k tok | **5,4%** |

**Onde ficou ligado:**
- leitura de abertura de `executor`, `testador`, `revisor`, `construtor`, `conferente`,
  `revisor-generico` — o MAPA entra na mesma mensagem paralela das outras aberturas;
- `executor` e `construtor` **regeneram e commitam** o MAPA junto com a entrega (passos 9 e
  11): mapa velho desorienta todo mundo e é pior que mapa nenhum;
- `/trabalhar` regenera na preparação (rede de segurança);
- `/novo-projeto` cria o MAPA já no commit inicial;
- doutrina na "Disciplina de contexto" do `CLAUDE.md` da raiz.

**Projeção (a confirmar no primeiro job real pós-mudança):**

```
voltas       211  →  ~130   (some ~20 Read de orientação por despacho de construção)
contexto     53,5k → ~35k
leitura      3,38  →  1,37   (−2,01)
escrita      4,73  →  2,02   (−2,71)
                             ---------
                             US$ 7,45 → ~3,4   (−54%)
```

**Risco conhecido, e é real:** o MAPA é *oferecido* na leitura de abertura, não *injetado*
no prefixo. Disciplina por prompt já falhou nesta fábrica mais de uma vez. Se o próximo job
mostrar o agente varrendo o projeto mesmo com o MAPA lido, a correção não é escrever a
regra com mais ênfase — é a I2, que põe o MAPA no prefixo compartilhado, onde ele chega
queira o agente ou não.

**Como confirmar (grátis, no próximo job):** compare, no `.log.jsonl`, quantos `Read` o
agente de construção faz ANTES da primeira escrita. A linha de base é 20 (job `f72534e8`,
agente `servidor`). Alvo: ≤ 5.

---

### I2 — Prefixo compartilhado entre despachos  ⬜ PRONTA PARA COMEÇAR

**Precede tudo:** o experimento da seção 6. Se ele falhar, esta intervenção morre e as
outras três seguem valendo.

**O que mudar**
1. `painel/servidor/src/acoes/agentes-dinamicos.ts` — **omitir `tools`** em toda
   `AgentDefinition` (o SDK documenta: "se omitido, herda todas as ferramentas do pai").
   Alinhar também os agentes de disco: hoje `revisor` não tem `Write` e `executor` tem 10
   ferramentas, enquanto os especialistas têm 7. Ferramentas vêm ANTES do systemPrompt na
   chave de cache — **enquanto divergirem, nada depois pode compartilhar.**
2. `painel/servidor/src/jobs/claude/runner-claude.ts` — `systemPrompt` passa a
   `{ type: 'preset', preset: 'claude_code', excludeDynamicSections: true }`. Sem isso,
   cwd/git-status/memória variam e quebram o prefixo logo no início.
3. Bloco estático idêntico (constituição + protocolo + MAPA do projeto) antes de
   `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`, com o específico do agente depois.

**Cuidado que decide o resultado:** o bloco compartilhado precisa ser **byte-idêntico**
entre despachos. Data, hash de commit, caminho absoluto ou contagem dentro dele zeram o
ganho sem avisar. O `MAPA.md` gerado tem `HEAD: <hash> · <data>` no cabeçalho — ou ele sai
do bloco compartilhado, ou o hash/data saem do MAPA.

**Ganho projetado:** bloco compartilhável ≈ ferramentas 12k + preset 4k + docs 9k = **25k
dos 35k** que sobram depois da I1.

```
escrita   11 × 35k  →  1 × 25k + 11 × 10k
          2,02      →  0,71   (−1,31)      leitura: inalterada
                                           ---------
                                           ~3,4 → ~2,1   (−72% do original)
```

**Pronta quando:** dois despachos seguidos do mesmo agente, no mesmo job, mostrarem o
segundo com `cacheEscrita` ≈ só a parte específica dele. O painel já grava isso por agente.

---

### I3 — Orquestrador determinístico  ⬜ PRONTA PARA COMEÇAR

**Medido no `7a1f9a45`:** o orquestrador consumiu 36 voltas, 106k de escrita e 2,44M de
leitura = **US$ 1,29, 17% do job** — para fazer o que é uma máquina de estados.

**O que é determinístico e não precisa de modelo** (tudo já implementado em algum lugar do
painel, em `fabrica/tarefas.ts` e `lib/gestao.ts`):
- ler frontmatter e montar o painel de status;
- promover `backlog → pronta` quando todas as `dependencias` estão `concluida`;
- escolher o agente pelos 3 passos de "Equipe do projeto" (`<id>` → `<projeto>__<id>` →
  genérico com prompt colado);
- aplicar o escalonamento por `tentativas` (`>=1` reforçado; `>=2` sob o mesmo
  especialista → reforçado genérico);
- decidir a trilha pelo `dominio` do `equipe.json`;
- respeitar as regras de paralelismo (`areas` disjuntas, verificador exige projeto quieto);
- mover status entre as etapas e commitar a gestão.

**O que continua no modelo:** replanejar, julgar marco reprovado (causa raiz única ou
múltipla), redigir relatório, decidir pular `em-teste` numa tarefa trivial.

**Forma sugerida:** um motor de pipeline em `painel/servidor/src/jobs/pipeline/`, que
despacha um agente por vez via SDK e só chama o modelo-orquestrador nos pontos de
julgamento. Cada despacho vira uma `query()` própria — o que, junto com a I2, é o desenho
em que o prefixo compartilhado rende mais.

**Efeito colateral que vale por si:** com o pipeline em código, o **teto de custo por job
com parada limpa na fronteira de tarefa** (o freio que não existe hoje — ver
`proximo_prompt_2.txt`, P1) fica trivial de implementar, e `maxTurns` deixa de ser o
instrumento errado.

---

### I4 — Revisor sem o projeto  ⬜ PRONTA PARA COMEÇAR

O revisor julga o DIFF; hoje carrega o mesmo contexto de quem escreve o código. Com MAPA +
diff + arquivo da tarefa, o contexto cai de ~35k para ~15k, em 3 despachos por job.

**O que mudar:** o prompt do `revisor`/`revisor-generico` já foi ajustado na I1 para dizer
que o objeto de trabalho é o diff. Falta a parte mecânica: o despacho do revisor passar o
`git show <hash>` **já no prompt**, em vez de o agente rodar o comando (economiza uma volta
com contexto cheio) — e o orçamento de chamadas dele cair junto.

**Pronta quando:** `cacheLeitura` do `revisor` por despacho cair pelo menos à metade da
linha de base (1,78M / 3 despachos ≈ 594k).

---

### I5 — Critérios de aceite com forma executável  ⬜ PRONTA PARA COMEÇAR

O `planejador` passa a escrever, ao lado do critério em prosa, o comando e o resultado
esperado **quando existir**. O painel executa os mecânicos de graça e o verificador só é
despachado para o que exige julgamento.

Não é conceito novo: é a **escada de verificação** que `_sistema/DOMINIOS.md` já define para
a trilha genérica (`[executado]` / `[inspecionado]` / `[julgado]`), aplicada também à de
software.

**O que mudar:** template de tarefa (`_sistema/templates/`) ganha o campo opcional por
critério; `planejador` e `planejador-generico` passam a preenchê-lo; o motor da I3 executa
os `[executado]` antes de despachar o verificador e já entrega o resultado pronto no
arquivo da tarefa.

**Depende da I3** para valer de verdade (é o motor em código que roda os comandos de
graça). Sem a I3, ainda ajuda: o verificador gasta menos voltas descobrindo COMO verificar.

---

### Projeção acumulada

| | US$/job | US$/tarefa | |
|---|---|---|---|
| linha de base | 7,45 | 2,14 | medido |
| I1 | ~3,4 | ~1,0 | **feito**, a confirmar no próximo job |
| I1+I2 | ~2,1 | ~0,60 | |
| I1+I2+I3..I5 | ~1,5–1,8 | ~0,45–0,55 | |

**−75% no cenário completo, −54% só com a I1.** As duas primeiras casas decimais são falsa
precisão; o que a medição sustenta é a ordem de grandeza e o ranking.

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
