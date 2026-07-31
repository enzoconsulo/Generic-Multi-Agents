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

## 6. Três propostas avaliadas (2026-07-31, segunda rodada)

### 6.1 Revisor só para código, pulando documentação — **concordo, mas é irrelevante**

| Situação | Custo |
|---|---:|
| Revisão completa de tarefa de código (T=15) | $0,245 |
| Revisão de tarefa de doc, como é hoje (T=8) | $0,169 |
| Só conformidade, sem caçar bug (T=4) | $0,130 |

Economia: **$0,077 em 22 tarefas.** O raciocínio que a torna irrelevante: o revisor é caro
exatamente onde o diff é grande — em código. Numa tarefa de documentação o diff é pequeno,
então ele **já é barato**; cortar onde já é barato não move a agulha.

Vale por outro motivo, que não é custo: caçar bug em prosa produz **falso positivo**. Um
revisor procurando "condição invertida" num README inventa achado. Se implementar, que seja
por qualidade, não por economia — e a economia não deve ser usada como justificativa.

### 6.2 Revisor em lote, no fim do backlog — **discordo, com prova**

Esta é a proposta que a lei de custo refuta de forma decisiva.

| N tarefas | Revisor por tarefa | Revisor em lote | Lote custa |
|---:|---:|---:|---:|
| 3 | $0,73 | $0,88 | **1,2× mais** |
| 5 | $1,22 | $1,70 | **1,4× mais** |
| 10 | $2,45 | $4,57 | **1,9× mais** |
| 22 | $5,38 | $16,30 | **3,0× mais** |

Lotear N tarefas num despacho multiplica o termo quadrático por N:

```
N agentes de T:   N·T·C0 + N·D·T²/2
1 agente de N·T:  N·T·C0 + D·N²T²/2      ← quadrático N vezes maior
```

**Controle que isola a causa:** com `D = 0` (custo puramente linear no contexto inicial),
lotear é exatamente neutro — 1,00× para qualquer N. Toda a penalidade vem do termo
quadrático. E mesmo assumindo generosamente que o revisor em lote reaproveite contexto e
gaste 10 chamadas por tarefa em vez de 15, ainda sai **1,7× mais caro** em N=22.

**Consequência arquitetural mais ampla, e é contraintuitiva:** sob custo quadrático,
**granularidade é economia**. O instinto normal — "menos despachos, menos overhead" — está
invertido aqui. Dividir trabalho em agentes menores e independentes é mais barato, não mais
caro. Isso vale para todo o pipeline, não só para o revisor.

Somam-se dois argumentos de qualidade: revisar no fim do backlog descobre um defeito da
tarefa 2 depois que 3..20 já construíram sobre ele (custo de correção cresce com o tempo até
a detecção), e a regra de escalonamento depende de veredito por tarefa (`tentativas >= 1`).

**Ressalva:** existe algo legítimo no instinto — coerência ENTRE tarefas não é vista pela
revisão por tarefa. Mas isso já tem lugar no protocolo: o **marco de fase**. Revisão
arquitetural de conjunto pertence lá, como adição, nunca como substituição.

### 6.3 Teste antes do código — **concordo, e é mais barato do que parecia**

O argumento levantado está certo e é o principal: teste escrito depois do código tende a
afirmar o que o código faz, não o que a tarefa pediu. Ele nasce passando.

**A fábrica já estava ~90% lá, e isso muda a conta.** Os Critérios de aceite são escritos
pelo planejador antes de existir código, um a um, e frequentemente já nomeiam o arquivo e o
comando de teste. Exemplo real, T-008:

> `tests/aluguel-propriedades.test.js` roda com `node --test tests/aluguel-propriedades.test.js`
> cobrindo todos os critérios acima.

Ou seja: o arquivo de teste **já era exigido**. O que muda é a **ordem**, mais uma execução
vermelha — não o escopo. Delta real ~+3 voltas, não +11.

| | Custo |
|---|---:|
| Executor hoje (T=45) | $0,686 |
| Executor com red-green (T=48) | $0,740 |
| Custo extra em 6 tarefas | **+$0,33** |
| Um ciclo de retrabalho evitado vale | $1,03 |

**Equilíbrio: reduzir retrabalho em 5,3 pontos percentuais** (de 31,8% medidos — 7 de 22
tarefas com `tentativas >= 1` — para 26,5%). Bar baixa o suficiente para aprovar, e o
benefício de validade do teste vem de graça em cima.

**Onde NÃO aplicar, e isso é parte da decisão:** layout/estilo visual, configuração,
documentação, e exploração cujo formato de saída ainda não está definido. Teste-primeiro
nesses casos gasta voltas sem provar nada — a prova de tarefa visual é a captura de tela.
Mandato universal de TDD seria uma piora.

---

## 7. A/B do `effort` — rodado de verdade (US$ 2,13)

`npx tsx integracao/medir-esforco.ts --projeto=ia-hibrida-limpa`, 31/07.

| Ação | Esforço | US$ | Turnos | Saída | Entregue |
|---|---|---:|---:|---:|---|
| `/status` | padrão | 0,2726 | 11 | 2220 | — |
| `/status` | **medium** | **0,3045** | 9 | 1814 | — |
| `projeto:conferir` | padrão | 0,7194 | 20 | 8606 | — (0 arquivos) |
| `projeto:conferir` | **medium** | **0,2287** | 9 | 2300 | — (0 arquivos) |
| `projeto:progresso` | padrão | 0,3856 | 11 | 6615 | 1 arq., **+26 linhas** |
| `projeto:progresso` | **medium** | **0,2146** | 6 | 2922 | 1 arq., **+16 linhas** |

O instrumento concluiu "economia real" nos três. **Duas dessas conclusões não se sustentam**,
e a armadilha é a mesma já registrada no `CLAUDE.md` do painel: *execução que não faz nada é
sempre a mais barata*.

**`/status` — resultado contrário ao esperado, e acionável.** `medium` saiu **12% MAIS caro**
que o padrão, com menos turnos e menos saída. Ou seja: gastou mais lendo para escrever menos.
Isso importa porque `/status` está **hoje configurado como `medium`** em `guardrails.ts`
(decisão da T-042). Uma amostra não derruba a decisão — mas a decisão nunca teve amostra a
favor, e agora tem uma contra. **Requer re-medição antes de manter.**

**`projeto:conferir` — medição INVÁLIDA.** Os −68% comparam duas execuções que entregaram
zero arquivos cada. O projeto alvo (`ia-hibrida-limpa`) estava com escopo fechado e árvore
limpa: **não havia nada a encontrar**. A perna padrão gastou 20 turnos e 8606 tokens
procurando e não achou; a `medium` gastou 9 e também não achou. Isso não distingue "medium é
eficiente" de "medium não procura" — que é exatamente a distinção que a T-042 já tinha pago
para descobrir, quando o padrão achou o `PROGRESSO.md` fora de sincronia e o `medium` não.
Para valer, esta ação precisa ser medida num projeto com **defeito plantado conhecido**.

**`projeto:progresso` — economia provável, com ressalva.** Os −44% vêm com **38% menos linhas
escritas** (26 → 16). O instrumento conta ARQUIVOS e chama de "comparável"; não é a mesma
entrega. Pode ser menos enchimento (bom) ou menos conteúdo (ruim) — só a leitura do texto
resolve, e o instrumento não lê.

**Limitação de fundo, e é a mais importante:** este experimento mede as ações **mecânicas de
zeladoria** — foi para isso que foi construído, na T-042. Ele **não responde** à pergunta que
motivou rodá-lo, que era sobre `/trabalhar`. `/trabalhar` decide o que construir e julga o que
volta; é o fluxo de julgamento, a categoria em que a própria T-042 concluiu que rebaixar
esforço não compensa. **Nenhuma conclusão daqui transfere para lá.**

### Decisão

Não mexer em `esforco` no `/trabalhar` — continua sem evidência, e a evidência que existe é
de outra categoria de ação. Os dois achados acionáveis foram: **re-medir `/status`** e
**corrigir o instrumento**. Ambos feitos — ver §7.1 e §7.2.

### 7.1 Instrumento corrigido

O veredito tinha um único caso de alerta e chamava todo o resto de "economia real". Passou a
distinguir quatro situações, e a mais importante é a que faltava: **INCONCLUSIVO**, quando as
duas pernas não entregam nada. Também compara CONTEÚDO (linhas do diff, similaridade de
Jaccard, razão de volume) em vez de contagem de arquivos, trata relatório como entrega — sem
isso toda ação read-only sumia da avaliação — e ganhou `--repeticoes=N` com faixa min–max,
marcando faixas sobrepostas como diferença **não estabelecida**.

Lógica pura extraída para `integracao/veredito.ts` e testada (17 casos, regressões das
medições reais). `medir-esforco.ts` roda `git` na carga e gasta assinatura ao executar, logo
não é importável por teste — e era justamente essa lógica que errava.

**Defeito do próprio instrumento, encontrado usando-o:** a primeira versão comparava sempre
por LINHA. Certo para diff de código; errado para prosa — dois relatórios com os MESMOS fatos
e redação diferente batem **11%** por linha, e o instrumento acusou "ENTREGA DIFERENTE" na
re-medição do `/status` por isso. Falso alarme do medidor, não sinal. Por palavra, os mesmos
dois batem **47%**, contra **17%** quando um omite metade dos fatos. Modo prosa agora usa
comparação por palavra e cortes mais baixos.

### 7.2 `/status` re-medido (n=3, US$ 0,87) — o "+12%" era ruído

| | Média | Faixa |
|---|---:|---|
| padrão | $0,1645 | [0,1391 – 0,1850] |
| `medium` | $0,1245 | [0,0982 – 0,1726] |

**−24% na média, mas as faixas se sobrepõem** → diferença não estabelecida.

O achado que importa é sobre a medição anterior, não sobre o esforço: aquela rodada (n=1) deu
padrão **$0,2726**. Nesta, a mesma perna, mesma entrada, variou entre **$0,1391 e $0,1850** —
e a rodada anterior ficou 47% acima do topo desta faixa. **A variação entre execuções da
mesma configuração é maior que a diferença entre configurações.** O "+12%" que motivou tudo
isto era ruído, e minha leitura de que havia "uma amostra contra a decisão da T-042" estava
errada: não havia amostra nenhuma, havia uma observação.

**Decisão: manter `/status` em `medium`.** Não porque ficou provado que economiza — não
ficou —, mas porque nada o contradiz, e o sinal fraco que existe (média menor, menos turnos,
menos saída) aponta na direção em que já está. Mudar exigiria evidência que não temos.

**Lição de método, e é a mais cara desta sessão:** n=1 num sistema com esta variância não é
medição, é anedota. O `--repeticoes` existe agora porque a ausência dele produziu uma
"descoberta" que consumiu duas rodadas para ser desfeita.

---

## 8. O que falta medir

O modelo é analítico e calibrado por ordem de grandeza, não por medição direta de
`C0`/`D` — esses dois parâmetros foram estimados, não observados. A instrumentação por
agente fecha essa lacuna **na próxima rodada real, sem gasto adicional**: `porAgente` traz
leitura de cache, voltas e ferramentas por agente, o que permite resolver `C0` e `D` por
regressão e substituir este modelo por medição.

Até lá, tratar as **fatias** (47/26/14/13) como sólidas e os **valores absolutos** como
ordem de grandeza.
