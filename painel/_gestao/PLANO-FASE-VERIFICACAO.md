# Fase 4 — Verificação honesta (painel)

Plano de trabalho da fase. Escrito para o **orquestrador executar item por item**, sob
demanda do usuário: cada item abaixo é independente o bastante para ser pedido isolado
("faça a T-054"), tem o *porquê* ancorado em evidência medida, o *onde* no código, e o
*como verificar sem gastar modelo*.

Auditoria que originou a fase: `_sistema/logs/2026-08-09.md`, seção "Auditoria de custo".

---

## O diagnóstico, em um parágrafo

A fábrica tem dois portões independentes e um retrabalho já diagnosticado por natureza — o
desenho está certo. O defeito é de **uma camada só**: a verificação não distingue *"a
entrega falhou"* de *"eu não consegui medir"*. Qualquer saída não-zero de um comando de
critério é lida como defeito da tarefa, devolve ao construtor e queima um ciclo inteiro
(construtor + verificador + revisor, muitas vezes em `opus`). Medido em 08-09/08/2026:
**US$ 51,09 em 19 jobs para 7 tarefas** (~US$ 7,30/tarefa) contra **US$ 1,2–1,9 do ciclo
limpo** — ou seja, ~75-80% do gasto foi retrabalho, e as Notas das próprias tarefas dizem
que a maior parte dele não achou defeito nenhum na entrega.

Os dois modos de falha, com evidência:

- **Comando de critério impossível.** T-030: `verificar: node --test tests` não roda nesta
  máquina (diretório nu vira módulo de entrada → `MODULE_NOT_FOUND`). O deliverable estava
  pronto e correto no ciclo 1 (`36e5622`); os ciclos 2-5 não mudaram uma linha dele.
  Custo: **US$ 12,90 e ~10h** para consertar uma string.
- **Instrumento instável lido como veredito.** A suíte do projeto roda **no mínimo duas
  vezes por ciclo** (passada mecânica + passo 3 do `testador.md`, que nunca foi atualizado)
  numa máquina com 7,86 GB e dezenas de processos concorrentes. Crash nativo
  (`0xC0000409`) e contenção de socket aparecem nas Notas de T-024, T-027, T-029 e T-030
  como reprovação — e o commit `99e06c0` diz textualmente *"reprovação era timeout do
  runner, npm test 214/214 confirmado"*. Na Fase 4 do banco-imobiliario **toda** tarefa
  levou 2-3 ciclos.

---

## Restrições de projeto (valem para TODOS os itens)

Estas não são preferências — são a régua de aceitação de cada item.

1. **Genérico, nunca do banco-imobiliario.** Toda melhoria é do PAINEL e vale para todo
   projeto presente e futuro. Nada de caso especial por nome de projeto. O
   banco-imobiliario é só a fonte da evidência e o campo de prova.
2. **Agnóstico de stack.** O comando de teste vem de `ci/ecossistemas.ts` (Node, Python,
   Go, Rust, .NET, Maven, Gradle) — nunca cravado. Onde um item reconhece texto de erro,
   ele precisa de padrão por ecossistema, não só o do Node: `MODULE_NOT_FOUND` tem
   equivalente em `ModuleNotFoundError` (Python), `no Go files in` (Go), `could not find
   Cargo.toml` (Rust), `MSB1003` (.NET/MSBuild). Reconhecer só o do Node repetiria, num
   arquivo novo, o defeito que `ci/ecossistemas.ts` já corrigiu duas vezes.
3. **Agnóstico de sistema operacional.** Código de crash nativo do Windows
   (`3221226505`/`0xC0000409`, `3221225477`/`0xC0000005`) tem par em POSIX: processo morto
   por sinal (`SIGSEGV`, `SIGKILL`, `SIGABRT`), que no Node chega como `signal` preenchido
   e `code` nulo. Trate os dois.
4. **Vale nas DUAS trilhas.** Software e genérica. A passada mecânica é a mesma máquina
   para `testador` e `conferente`; mudança de prompt precisa espelhar nos dois arquivos.
5. **Na dúvida, o caro.** Regra já escrita em `pipeline/diagnostico.ts` e mantida aqui:
   toda incerteza cai no comportamento antigo. Nenhum item pode transformar "não sei" em
   aprovação — só em "não reprove ainda".
6. **Verificável sem gastar modelo.** Cada item fecha com `cd painel && npm test` e, quando
   toca o laço, `npx tsx integracao/simular-pipeline.ts <projeto>` (SDK falso, arquivos
   reais). Item que só dá para conferir gastando assinatura está mal desenhado.

---

## T-054 — Estado `inconclusivo`: separar "falhou" de "não deu para medir"

**É o item central da fase.** Todos os outros compõem com ele.

**Por quê.** Hoje `executarCriterios` tem dois desfechos: `passou` e `falhou`. Um comando
que não *chegou a avaliar nada* — binário ausente, módulo não encontrado, opção inválida,
processo morto por crash nativo, estouro do nosso teto de tempo — devolve `falhou`, e
`reprovouNaMecanica` transforma isso em reprovação da tarefa. É a mecânica exata que
queimou 4 ciclos da T-030 e que produziu reprovação falsa em T-024, T-027 e T-029.
`criterios.ts:220` **já reconhece** o estouro de tempo como ambiente ("Isso é limite de
tempo, não necessariamente defeito da tarefa") — e devolve `falhou` do mesmo jeito. A
informação existe e é jogada fora na linha seguinte.

**O que fazer.** Terceiro estado em `ResultadoCriterio`, decidido por um classificador de
**modo de falha** (não de mensagem solta):

| classe | sinais | desfecho |
|---|---|---|
| `ferramenta` | módulo/arquivo de entrada não encontrado, binário ausente (ENOENT no spawn), opção desconhecida, exit code de uso indevido (`node` 9, `git` 129) | `inconclusivo` — **o critério está errado**, não a entrega. Vai para o relatório e para o orquestrador/planejador. |
| `ambiente` | morte por sinal / crash nativo, nosso estouro de tempo, ENOMEM, EMFILE, EADDRINUSE, ECONNRESET | `inconclusivo` — retenta (T-055); se persistir, cai como `[julgado]` para o verificador. |
| `falha` | qualquer outra saída não-zero (o runner rodou e reprovou) | `falhou`, como hoje. |

`reprovouNaMecanica` passa a considerar **só** `falhou`. `inconclusivo` nunca reprova e
nunca aprova: entra no relatório como `[inconclusivo] <critério> — <classe>: <motivo>` e
segue para julgamento humano/modelo.

**Onde.** `painel/servidor/src/pipeline/criterios.ts` (classificador novo + estado +
`relatorioCriterios` + `reprovouNaMecanica`); `pipeline/motor.ts:490-506` (o ramo que
reprova); a linha `Graus de prova:` ganha a contagem de inconclusivos.

**Cuidado.** O classificador lê saída de processo, que é texto de terceiro — sem regex
gulosa que confunda "o teste chamado `test module not found` falhou" com o erro do runner.
Ancore no par (exit code, stderr do runner) e prefira **falso `falhou`** a falso
`inconclusivo`: errar para o lado de reprovar é o comportamento de hoje; errar para o lado
de não reprovar deixaria defeito passar.

**Como verificar.** Testes unitários do classificador com saída REAL capturada (a da T-030
está em `_gestao/tarefas/T-030-script-inicio-facil.md`) mais um caso por ecossistema;
`npm test`; `simular-pipeline.ts`.

**Ganho esperado.** Elimina a classe de loop da T-030 (US$ 12,90) e a reprovação falsa por
crash nativo. É o item que paga a fase.

---

## T-055 — Uma retentativa para falha de AMBIENTE

**Depende de T-054** (precisa da classe `ambiente`).

**Por quê.** Regressão real falha as duas vezes; crash por contenção normalmente não. Uma
reexecução custa segundos de CPU e zero token. Uma reprovação falsa custa **US$ 1,5-3 mais
uma das 3 fichas da tarefa** — e a ficha é o recurso escasso, porque na terceira a tarefa
bloqueia. A troca é assimétrica em ordens de magnitude.

**O que fazer.** Ao classificar `ambiente`, reexecutar **uma vez** aquele comando. Passou
na segunda: registra como `passou` com nota de que a primeira caiu por ambiente (o registro
importa — é o que permite medir a instabilidade da máquina em vez de esquecê-la). Caiu de
novo: `inconclusivo`, e o verificador julga.

**Onde.** `pipeline/criterios.ts`, dentro de `executarCriterios`. Retentativa por comando,
nunca do lote inteiro (reexecutar o lote multiplicaria a suíte, que é o que T-056 corta).

**Cuidado.** Teto de UMA retentativa, sem espera exponencial nem laço. E não retentar
`ferramenta`: comando impossível continua impossível, e retentar só dobra o tempo.

**Como verificar.** Teste com um comando que falha na 1ª e passa na 2ª (contador em arquivo
temporário); confirmar que `falha` genuína **não** é retentada.

> **Entregue em 09/08 (`53d5cce`), com um desvio a este plano.** Estouro de tempo **não** é
> retentado, ainda que seja `ambiente`. O argumento que autoriza a retentativa aqui em cima
> — "custa segundos de CPU" — é verdadeiro para crash, que falha rápido, e **falso para
> estouro**, que já consumiu o teto inteiro: retentar dobraria 10 min para 20 por critério,
> na máquina onde a suíte já é o gargalo. Estouro segue `inconclusivo`, o que por si é o
> ganho grande (deixou de reprovar). Lição para os itens restantes: **quando este plano
> justificar uma decisão por um custo, confira se o custo é o mesmo em todos os casos que a
> decisão cobre.**
>
> Entregue além do previsto, porque o "registro" do plano seria fraco só no arquivo da
> tarefa: `reexecucoesPorAmbiente()` conta as reexecuções e o motor as loga por tarefa. É o
> termômetro de que a T-061 vai precisar.

---

## T-056 — A suíte roda UMA vez por ciclo

**Independente. É o item mais barato de fazer e o de efeito mais imediato.**

**Por quê.** A passada mecânica roda a suíte do projeto (`criterioDaSuite`,
`criterios.ts:295`) e logo depois o `testador` roda de novo, porque o passo 3 do prompt
(`.claude/agents/testador.md:50`) manda: *"Rode a suíte completa do projeto"*. O prompt
nunca foi atualizado quando a passada mecânica nasceu. Resultado: a operação mais pesada,
mais lenta e mais instável da fábrica acontece **em dobro**, por tarefa, por ciclo — e cada
execução é uma chance a mais de crash por contenção. Cortar a duplicata reduz pela metade a
exposição ao modo de falha que T-054/T-055 estão tratando.

**O que fazer.** Condicionar, não remover: o passo passa a dizer que, se a seção Verificação
já traz a suíte como `[executado]` na passada mecânica, o verificador **confia nela e não
reexecuta**; se não traz (ecossistema não detectado, `ci.json` ausente, `comandoTestes`
nulo), roda como sempre. Espelhar em `.claude/agents/conferente.md` (trilha genérica).

**Onde.** `.claude/agents/testador.md`, `.claude/agents/conferente.md`. Nenhuma mudança de
código — mas confirmar que a passada mecânica **de fato** anexa a linha antes do despacho do
verificador (`motor.ts:833`, `dep.anexarVerificacao`), senão o prompt aponta para algo que
o agente não vê.

**Cuidado.** Não deixe brecha para o verificador *nunca* rodar a suíte. A condição é
"já rodou e está registrada nesta verificação", não "existe alguma menção a teste".

**Como verificar.** `simular-pipeline.ts` mostra o prompt montado por etapa — confirmar que
o texto chega ao verificador com a linha `[executado]` presente.

---

## T-057 — Linha-base: conferir o critério ANTES de gastar despacho

**Depende de T-054** (usa o classificador; sem ele isto viraria alarme falso em série).

**Por quê.** T-030 gastou o primeiro despacho contra um critério que já era impossível antes
de a tarefa começar. Rodar os comandos de critério na promoção a `pronta`, contra a árvore
intocada, custa segundos e zero token — e responde a pergunta certa: *este comando é capaz
de falhar por causa DESTA tarefa?* Se ele nem executa na árvore limpa, a resposta é não, e
nenhum construtor do mundo conserta isso.

**O ponto fino que faz o item funcionar:** na linha-base, **quase todo critério legítimo
falha** — o teste ainda não existe, a feature não foi construída. Falhar não é o sinal. O
sinal é a **CLASSE** da falha: `ferramenta` na árvore intocada = critério quebrado (avisa
antes de gastar); `falha` genuína = critério saudável (é exatamente o que a tarefa vai
consertar); `ambiente` = máquina instável, ignora.

**O que fazer.** Passada de linha-base na promoção `backlog → pronta` (ou no primeiro passo
de construtor da tarefa, se for mais simples de posicionar no laço). Critério classificado
`ferramenta` entra no relatório da rodada como **critério suspeito** com o comando e o erro,
e a tarefa não é despachada até decisão — é caso de planejador, não de construtor.

**Onde.** `pipeline/motor.ts` (promoção / abertura do passo), reaproveitando
`executarCriterios`. Relatório em `MotorRelatorio` (campo novo, ex. `criteriosSuspeitos`)
para aparecer no texto final do job e na aba Jobs.

**Cuidado.** Não transformar isto em portão que trava a rodada: um critério suspeito tira
AQUELA tarefa de circulação e as outras seguem — mesma doutrina de `emCircuito` em
`motor.ts:590`. E a linha-base roda **uma vez por tarefa**, não por ciclo.

---

## T-058 — Replanejar cedo, e um canal de impedimento legível por máquina

**Mudança na máquina de estados — desenhar e mostrar antes de implementar.**

**Por quê.** Hoje `deveReplanejar` (`maquina.ts:326-340`) exige `tentativas > 3`. Toda tarefa
mal especificada paga **três ciclos completos** antes de alguém cogitar quebrá-la. Pior: na
T-030 o executor **diagnosticou a causa certa no ciclo 2** e escreveu nas Notas a
recomendação exata que resolveu o caso — e ninguém estava ouvindo, porque não existe canal
de máquina para "isto não é defeito meu, é da especificação". O executor tem a instrução de
parar e avisar (`.claude/agents/executor.md:159`), mas o aviso é prosa que o motor não lê. O
sistema tinha a resposta e gastou ~US$ 9 para chegar nela mais três vezes.

**O que fazer — dois gatilhos, ambos estreitos de propósito:**

1. **Mesmo comando falhando mecanicamente duas vezes seguidas** → o critério é suspeito, vai
   ao planejador em vez de um terceiro construtor. Note a precisão: *mesmo comando*, não
   "mesma natureza". Duas reprovações mecânicas por comandos DIFERENTES são a tarefa
   progredindo; o mesmo comando duas vezes é a especificação travando.
2. **Linha `Impedimento: <motivo>` nas Notas**, que o construtor escreve quando um critério
   é impossível ou o escopo está errado. O motor lê, para de despachar construtor naquela
   tarefa e roteia ao planejador. Formaliza o que o contrato do executor já manda fazer.

**Onde.** `pipeline/maquina.ts` (`deveReplanejar` e uma função nova de detecção),
`pipeline/motor.ts` (memória de qual comando reprovou por tarefa), `.claude/agents/`
executor + construtor (a linha `Impedimento:`), `_sistema/PROTOCOLO_TAREFAS.md` (documentar
o campo).

**Cuidado.** O limite de "autocorreção uma vez por linhagem" (`replanejada-de`) continua
valendo — sem ele, tarefa mal dimensionada gera replanejamento em cascata. E `Impedimento:`
não pode virar rota de fuga do construtor: se ele alegar impedimento e o critério for
executável, o planejador devolve a tarefa e isso precisa ficar registrado.

---

## T-059 — Fechar a porta de entrada: critério redundante e doutrina

**Barato, e é o que impede a fase inteira de ser refeita em três meses.**

**Por quê.** O critério que custou US$ 12,90 era **redundante**: a suíte já roda
implicitamente em toda verificação, então "a suíte continua passando" como `verificar:`
acrescenta zero e só cria uma segunda chance de escrever o comando errado. Enquanto o
formato permitir isso, alguém — planejador ou orquestrador — vai escrever de novo. Eu
escrevi.

**O que fazer.**
- **Guarda mecânica:** na leitura dos critérios, comando equivalente ao canônico do projeto
  (`comandoTestes` normalizado) é descartado como duplicata, com nota no relatório. Não é
  censura ao planejador — é deduplicação, e o efeito colateral bom é que a *variante
  errada* do comando canônico fica visível em vez de virar reprovação.
- **Doutrina escrita:** `_sistema/PROTOCOLO_TAREFAS.md`, `_sistema/templates/` e o prompt do
  `planejador`/`planejador-generico` — não escreva "a suíte continua passando" como
  critério executável; o motor já faz. E `CLAUDE.md` (raiz): **o orquestrador não redige
  comando de verificação à mão** — copia o canônico de `_gestao/ci.json`. Foi exatamente
  esse passo que faltou no `/ideia` que gerou a T-030.

**Onde.** `pipeline/criterios.ts` (`lerCriterios`/`criterioDaSuite`),
`_sistema/PROTOCOLO_TAREFAS.md`, `_sistema/templates/`, `.claude/agents/planejador*.md`,
`CLAUDE.md`.

> **Entregue em 09/08 (`acde1e3`), com desenho diferente do que está escrito aqui.**
>
> A causa era mais funda do que "alguém vai escrever de novo": **o template oficial ENSINAVA
> a duplicata** — seu exemplo de abertura era `` - [ ] `npm test` roda a suíte inteira.
> `verificar: npm test` ``. Medido no disco: T-023 a T-029 (a Fase 4 inteira do
> banco-imobiliario) e T-031 declaram exatamente isso, idêntico ao canônico do `ci.json`.
> Com a T-056, a suíte de 212 testes rodava até **3× por ciclo**; só na Fase 4 são ~17
> execuções inteiras desperdiçadas, cada uma um sorteio novo do crash nativo.
>
> **Descartar o critério redundante (o que este plano pedia) estava errado**: descarta a
> pergunta, não a duplicata — na T-030 o critério repetido tinha conteúdo próprio com uma
> checagem de suíte enxertada no fim. A regra implementada é mais simples e mais geral: *o
> mesmo comando, no mesmo lote, sobre a mesma árvore, não pode dar resposta diferente* — roda
> uma vez, veredito compartilhado, `espelho: true` no resultado. Serve para qualquer
> duplicação entre critérios e não precisa de caso especial para a suíte.
>
> Limite assumido e conhecido: a equivalência SEMÂNTICA não é resolvida (`npm test` expandido
> à mão como `node --test`, que é o caso da T-030 hoje, ainda roda duas vezes). Resolver
> exigiria interpretar manifesto de cada ecossistema, e chave de deduplicação que erra para o
> lado de "é o mesmo" faria um critério herdar veredito de outro — aprovar sem conferir é o
> pior desfecho possível aqui. A doutrina passa a impedir que a forma expandida seja escrita.
>
> **Armadilha que quase entrou:** o critério espelhado herda os campos do original, então
> `reexecucoesPorAmbiente` passaria a contar critérios afetados em vez de execuções perdidas
> — inflando o termômetro da máquina exatamente onde a T-061 vai usá-lo. Corolário para os
> itens restantes: **ao copiar um resultado, pergunte quais métricas o leem** — as duas que
> existiam hoje mentiriam em silêncio.

---

## T-060 — O painel precisa ver o próprio desperdício

**Por quê.** Para descobrir que a T-030 custou US$ 12,90 eu tive que abrir cinco JSONs de
job à mão, cruzar com o git e ler as Notas de cinco ciclos. **O sistema não sabe dizer
quanto uma tarefa custou, nem que fatia disso foi retrabalho** — e o que não é medido não é
otimizado. Esta fase inteira existe porque o usuário estranhou uma fatura; ele não deveria
ter precisado estranhar.

**O que fazer.** Custo por TAREFA (somando os jobs que a tocaram), com a fatia de retrabalho
e a natureza dela (`mecanica`/`funcional`/`conformidade`/`defeito`, que
`diagnostico.ts` já classifica e hoje só vai para o log). Na página do projeto, ao lado do
kanban. Mais um sinal explícito de **reprovação inconclusiva**, para a instabilidade da
máquina aparecer como número em vez de virar folclore.

**Onde.** `painel/servidor/src/` (agregação sobre `dados/jobs/` + `lib/gestao.ts`, que já
cruza custo por projeto), `painel/web/src/paginas/projeto/`.

**Cuidado.** A armadilha já documentada em `painel/CLAUDE.md`: **"execução que não faz nada é
sempre a mais barata"** — a métrica tem de ser custo POR TRABALHO ENTREGUE, senão otimizar
por ela premia não fazer nada.

---

## T-061 — Investigar a pressão de memória da máquina (raiz da instabilidade)

**Investigação, não mudança de código. Faça depois de T-054/T-055/T-056.**

**Por quê.** No momento da auditoria: **0,44 GB livres de 7,86 GB e 23 processos `node`
vivos**. A coleta de órfãos (`pipeline/coleta-processos.ts`) existe e é bem desenhada, mas
não está dando conta. Boa parte do que parece erro de agente é máquina sem memória — e T-054
a T-056 tratam o SINTOMA (não reprovar por causa disso) com todo o mérito, sem tratar a
CAUSA. Vale medir antes de concluir qualquer coisa.

**O que fazer.** Medir acumulação de processos por rodada (a amostragem do
`RastreadorDescendentes` já existe, a 30s); verificar se a coleta roda **entre etapas** ou só
no fim do job; conferir se o corte da duplicata da suíte (T-056) já resolve sozinho. Só
depois propor mudança. `npx tsx integracao/dry-coleta.ts` antes de qualquer heurística que
mate processo — regra dura já registrada em `painel/CLAUDE.md`.

---

## Ordem recomendada

| # | item | depende de | esforço | ganho | estado |
|---|---|---|---|---|---|
| 1 | **T-054** estado `inconclusivo` | — | médio | alto — é o que parou o dinheiro | **feita** 09/08 (`f52d901`) |
| 2 | **T-056** suíte uma vez por ciclo | — | **baixo** | alto — corta a exposição pela metade | **feita** 09/08 (`cc9bfcf`) |
| 3 | **T-055** retentativa de ambiente | T-054 | baixo | alto | **feita** 09/08 (`53d5cce`) |
| 4 | **T-059** dedupe + doutrina | — | baixo | médio (impede a recaída) | **feita** 09/08 (`acde1e3`) |
| 5 | **T-057** linha-base na promoção | T-054 | médio | alto | pronta para começar |
| 6 | **T-060** custo/retrabalho visível | — | médio | médio (habilita medir o resto) | pronta para começar |
| 7 | **T-058** replanejar cedo | T-054 | médio | alto — desenhar antes | pronta para começar |
| 8 | **T-061** memória da máquina | T-056 | investigação | desconhecido | pronta para começar |

### O que a T-054 mudou nas premissas dos itens seguintes

- **T-055 ficou trivial.** A classe `ambiente` já existe e já é devolvida em
  `ResultadoCriterio.classe`; falta só reexecutar UMA vez quando ela aparecer.
- **T-057 ganhou o discriminador de que precisava.** A linha-base só funciona porque agora
  existe como distinguir "critério quebrado" de "critério saudável que a tarefa vai fazer
  passar" — é a mesma regra do disco descrita em `classificarFalha`.
- **T-061 ganhou evidência nova, sem esforço.** Ao tentar rodar
  `integracao/simular-pipeline.ts banco-imobiliario` como verificação da T-054, o script
  passou de **400 s parado no primeiro arquivo de teste** do projeto e teve de ser
  encerrado — com a máquina recém-limpa (22 processos órfãos removidos, memória livre de
  0,44 GB → 1,45 GB) e nenhum outro agente rodando. A suíte do banco-imobiliario está lenta
  por si, não só por contenção. Vale medir isso antes de concluir qualquer coisa sobre a
  máquina.
- **Aprendizado de método, para os próximos itens:** a T-054 derrubou DOIS testes que
  estavam verdes pelo motivo errado (um afirmando o defeito como contrato, outro rodando
  num `cwd` inexistente onde o comando nunca executava). Ao mexer em portão de verificação,
  desconfie de teste rápido demais — 37 ms para "rodar um comando real" era o sintoma.

T-054 e T-056 são independentes entre si e podem ir na mesma leva; **T-056 é o de melhor
razão esforço/ganho** se a ideia for um ganho imediato. Nenhum item depende de outro além do
que a coluna diz.

## Como saber se a fase funcionou

Medir na PRÓXIMA fase de um projeto real (Fase 5 do banco-imobiliario serve, com T-031 a
T-033 já planejadas) e comparar com a Fase 4, que é a linha-base ruim e está toda medida:

- **`tentativas` médio por tarefa.** Fase 4: 2,4 (7 tarefas, nenhuma de primeira). Alvo: ≤ 1,5.
- **Custo por tarefa concluída.** Fase 4: ~US$ 7,30. Alvo: ≤ US$ 3.
- **Reprovações que não acharam defeito.** Fase 4: pelo menos 4 documentadas nas Notas
  (T-024, T-027, T-029, T-030). Alvo: zero por causa de instrumento.

Se o custo por tarefa não cair e o `tentativas` médio não cair, a fase falhou e o
diagnóstico estava errado — registre isso em `DECISOES.md` em vez de acrescentar mais
mecanismo em cima.
