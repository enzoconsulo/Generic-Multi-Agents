# Economia do pipeline multi-agente — modelo, cenários e decisões

**Data:** 2026-07-31 · **Motivo:** cota de 4 h estourando com entrega percebida como baixa.

---

## 1. A lei que governa o custo

Um fluxo agêntico não paga pelo que o modelo **escreve**; paga pelo que ele **relê**. Nos
seis jobs com telemetria real em `dados/jobs/`, a leitura de cache é ~85% do volume de
tokens e a razão típica é:

```
cacheLeitura / saída  ≈  100 : 1
```

O mecanismo: cada chamada de ferramenta é uma ida ao modelo, e cada ida reenvia todo o
contexto acumulado até ali. Um agente que faz `T` chamadas, com contexto inicial `C0` e
acréscimo médio `D` por resultado de ferramenta, lê:

```
cacheLeitura(T)  =  T·C0  +  D·T²/2
```

**O termo dominante é quadrático.** Consequência prática, e é a única coisa que precisa ser
lembrada deste documento:

> **Dobrar as chamadas de ferramenta de um agente quadruplica o custo dele.
> Cortá-las pela metade corta ~75%.**

Isso inverte a intuição de otimização. Trocar de modelo é um fator ~1,67×; cortar
exploração pela metade é um fator ~4×. **Quem manda no custo é o número de idas ao modelo,
não a tarifa.**

### Validação do modelo

Alimentado com a distribuição real de chamadas do job `603ea999` (21 despachos, 472
chamadas), o modelo devolve 14–17M de leitura de cache conforme `C0`/`D`. O job medido
`358c14f1`, de porte comparável, registrou **13,5M reais**. A ordem de grandeza confere.

Mais importante: a **repartição** entre agentes é estável em toda a faixa de parâmetros
testada — é dela que saem as decisões, e ela não depende da calibragem fina.

| Agente | Fatia do custo | Chamadas de ferramenta |
|---|---:|---:|
| executor (`engine`/`servidor`) | **47%** | 177 |
| revisor | **26%** | 123 |
| testador | 14% | 106 |
| orquestrador | 13% | 63 |

---

## 2. Cenários (custo modelado da MESMA rodada)

| # | Cenário | Custo | vs. base |
|---|---|---:|---:|
| S0 | Status quo — a rodada real de 31/07 | $7,83 | — |
| S1 | Revisor vai direto ao hash do commit (teto 15 chamadas) | $6,42 | **−18%** |
| S2 | S1 + executor não redescobre em retrabalho (teto 45) | $4,67 | **−40%** |
| S3 | S2 + retrabalho fica em sonnet (sem escalonar) | $4,60 | −41% |
| S4 | S3 + orquestrador partido em 2 jobs de ~20 min | $4,63 | −41% |

### O que cada linha ensina

**S1 — implementado.** O revisor gastava 70 chamadas porque precisava *descobrir* quais
commits revisar. Ver §3.

**S2 — implementado (parcial).** Maior item isolado. O corte aplicado é o seguro: em
**retrabalho**, o executor redescobria o que ele mesmo já havia registrado no ciclo
anterior. Essa informação já está paga e escrita no arquivo da tarefa.

**S3 — REJEITADO, e a conta é o motivo.** Escalar retrabalho para opus custa **+$0,46 por
ciclo**; um ciclo extra inteiro em sonnet custa **$1,03**. O reforço se paga se evitar mais
de ~45% dos ciclos extras — e ele só dispara quando uma reprovação **já provou** que o
modelo do disparo não deu conta. A economia de 1 ponto percentual em S3 é ruído; o risco de
um ciclo a mais não é. **Manter o escalonamento.**

> Ressalva honesta: isto vale em DÓLAR. A cota da assinatura é ponderada por modelo, e não
> tenho como medir esse peso a partir daqui. Se a ponderação de opus for muito maior que
> 1,67×, a conclusão pode inverter **para cota** sem inverter para custo.

**S4 — REJEITADO como economia; mantido como robustez.** Partir em jobs de ~20 min é
**neutro em custo** (+$0,03): o que se ganha zerando o contexto do orquestrador se perde em
escrita de cache do novo prefixo e em re-contextualização. Mas o orquestrador é só 13% do
custo — não há muito a ganhar ali, por construção.

O valor real do chunking é outro, e é grande: **limitar o estrago quando a cota morre.** A
rodada de 31/07 perdeu 40 minutos de trabalho em voo. Com jobs de 20 min, a perda máxima é
20. É uma decisão de **resiliência**, não de economia, e deve ser justificada como tal.

---

## 3. O defeito que explicava 18% do custo

O revisor tem uma resposta certa e delimitada para "o que revisar": o diff do commit. Ele
gastava 70 chamadas porque não a recebia.

**Causa raiz — uma impossibilidade de ordem no protocolo.** O passo do executor dizia
"commite ... anote o hash", com a anotação *dentro do próprio commit*. O hash não existe
antes do commit. Resultado medido em `banco-imobiliario`, tarefas concluídas:

| Tarefa | Campo `Commit:` |
|---|---|
| T-001 | `466053d` ✓ (fez dois commits por conta própria) |
| T-002 | "(a seguir, ver mensagem…)" ✗ |
| T-003 | "a ser feito ao final desta execução" ✗ |
| T-007 | `d5a3edc` ✓ |
| T-013 | "ver hash abaixo" ✗ |

**3 de 5 sem o hash.** A T-002 chegou a registrar a própria falha no arquivo. Sem o campo,
o revisor cai em `git log --grep` + `git show` por commit + abrir arquivos — exploração sem
teto, num agente que roda no modelo do disparo.

**Correção:** dois commits explícitos (código; depois `git rev-parse --short HEAD` gravado
na tarefa e commitado). O revisor lê o campo e vai direto ao `git show`. O caminho de
descoberta continua existindo — mas como exceção, e gera achado `menor` na Revisão, porque
é defeito de processo que precisa aparecer.

**Lição transferível:** exortação não corrige gasto de descoberta; **artefato determinístico
corrige**. O prompt do revisor já dizia "leia o diff" e mesmo assim custava 70 chamadas —
faltava o dado, não a instrução.

---

## 4. "Cachear respostas entre agentes"

O termo técnico para o que isto quer dizer é **handoff estruturado**: o artefato que um
agente produz para o próximo não redescobrir. Não é cache de LLM — é o arquivo da tarefa
funcionando como livro-razão.

O pipeline já tem os slots (Notas de execução → Verificação → Revisão). O que faltava era
**um deles carregar o dado que o próximo precisa em forma consumível.** O hash do commit é
exatamente esse caso, e era o elo quebrado.

Próximos candidatos, na ordem de retorno:

1. **Arquivos tocados, em lista.** O testador e o revisor os redescobrem. `git show --stat`
   resolve para o revisor; o testador ainda varre.
2. **Comando de teste da tarefa.** O testador redescobre como rodar o projeto a cada
   despacho.
3. **Mapa de módulos do projeto** no `CLAUDE.md` do projeto — corta descoberta do executor
   em tarefa nova (onde o retrabalho não ajuda, porque não há ciclo anterior).

O que **não** funciona: passar contexto bruto adiante. Contexto grande é justamente o que se
está tentando evitar; o handoff só paga quando é **destilado** (um hash, uma lista, um
comando), não quando é volumoso.

---

## 5. Decisões

| Decisão | Situação |
|---|---|
| Corrigir handoff do hash (executor 2 commits, revisor lê direto) | **Implementado** |
| Executor não redescobre em retrabalho | **Implementado** |
| Instrumentar custo por agente | **Implementado** |
| Manter escalonamento para opus no retrabalho | **Mantido** — a conta favorece |
| Chunking em jobs de ~20 min | **Adiado** — neutro em custo; rediscutir como resiliência |
| `esforco: medium` no `/trabalhar` | **Não decidido** — exige A/B pago (~US$ 2) |

## 6. O que falta medir

O modelo é analítico e calibrado por ordem de grandeza, não por medição direta de
`C0`/`D` — esses dois parâmetros foram estimados, não observados. A instrumentação por
agente fecha essa lacuna **na próxima rodada real, sem gasto adicional**: `porAgente` traz
leitura de cache, voltas e ferramentas por agente, o que permite resolver `C0` e `D` por
regressão e substituir este modelo por medição.

Até lá, tratar as **fatias** (47/26/14/13) como sólidas e os **valores absolutos** como
ordem de grandeza.
