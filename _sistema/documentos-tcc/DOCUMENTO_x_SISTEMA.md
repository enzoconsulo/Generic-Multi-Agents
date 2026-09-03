# O que os documentos afirmam × o que o sistema faz

Companheiro do `CONTEXTO.md`. Ele conta **como os documentos foram feitos**; este conta **onde
eles divergiram do sistema que está sendo construído**, e o que precisa mudar por causa disso.

Carregue os dois numa sessão que vá mexer nos documentos do TCC.

**Escrito em 2026-09-02**, depois de o marco 1 da v0.2 reprovar contra o `claude` real e revelar
uma incompatibilidade de projeto que os documentos não previam.

> **Regra deste arquivo, herdada do projeto:** ele separa o **medido** do **deduzido**. Onde
> houver número, ele veio de execução registrada, e o lugar onde ela está registrada é citado.
> Onde não houver, está escrito que não há.

---

## 1. Em uma tela

A resumida (`fabrica-multi-agente-arquitetura-6.docx`, gerada por `geradores/corpo6.py`) descreve
um sistema em que **a fábrica conduz o agente**: ela monta a requisição, chama a API do modelo,
recebe pedidos de ferramenta e as executa com as próprias travas.

Isso é verdade quando o sistema fala com a **API por token**. Não é verdade quando ele fala com o
`claude` da **assinatura** — porque `claude --print` não é um motor de modelo, é **um agente
completo**, com laço, ferramentas e permissões próprios.

São duas famílias de operário, e a resumida descreve uma delas como se fosse a arquitetura
inteira. Nada do argumento cai; o que muda é que ele passa a ter dois casos.

**O que NÃO mudou:** a tese, a escolha do Elixir/OTP, os dois portões, a escada de fracasso, a
equipe sob demanda, o índice denso, os critérios executáveis e a suíte sem rede. Tudo isso foi
construído e está de pé.

---

## 2. Como se descobriu

A v0.2 tem dois marcos. O primeiro pede *"um agente resolve uma tarefa real de ponta a ponta, com
custo por volta gravado"*.

Ele foi aberto em 31/08 e **reprovou três vezes seguidas, por motivos diferentes** — e é essa
sequência que dá o valor da descoberta:

| tentativa | o que aconteceu |
|---|---|
| 1ª | o adaptador montava uma linha de comando que o CLI **rejeita** (faltava `--verbose`). Tinha 26 testes verdes |
| 2ª | o agente trabalhava no diretório errado: o laço não repassava a raiz do projeto ao operário |
| 3ª | o agente **não resolveu a tarefa**: toda escrita era negada, e o laço tentava reexecutar ferramenta que o próprio CLI já havia executado |

Das três afirmações do marco, **a contabilidade passou exata** (95.558 tokens somados no laço =
95.558 lidos de volta do banco, uma linha por volta). Falhou a que decide: a tarefa não ficou
pronta.

**A causa raiz nº 2 da terceira tentativa não é defeito de implementação — é incompatibilidade de
projeto**, e é o assunto deste arquivo.

Registro completo: `projetos/fabrica-v2/_gestao/tarefas/T-020-marco.md`, seção Verificação.

---

## 3. As duas famílias

| | **agente completo** | **endpoint de modelo** |
|---|---|---|
| exemplo | `claude --print` (assinatura); adiante, outros CLIs | Messages API; adiante, outras APIs por token |
| quem roda o laço de ferramentas | **o próprio operário** | **a fábrica** |
| quem executa a escrita e o shell | o operário | a fábrica |
| governança por | flags: modo de permissão, ferramentas, diretório, teto de turnos | as ferramentas da fábrica, com confinamento próprio |
| controle de cache | nenhum — o operário gerencia o dele | ponto a ponto, byte a byte |
| cobrança | cota da assinatura, **sem fatura** | por token, **com fatura** |

A fronteira `Fabrica.Operario` hoje trata as duas como intercambiáveis. É isso que quebra: elas
estão em **níveis de abstração diferentes**.

---

## 4. O que foi MEDIDO sobre a família de assinatura

Tudo abaixo saiu de `priv/probes/cli_governanca.exs`, rodado contra o `claude` 2.1.258 instalado.
Detalhe e evidência em `projetos/fabrica-v2/_gestao/PROGRESSO.md`, seção T-018b.

**O que dá para garantir:**

- **Escrita headless funciona** com `--permission-mode acceptEdits`. Sem flag de permissão
  nenhuma, toda escrita é negada — não há quem aprove num processo sem terminal.
- **O CLI confina sozinho.** Mandado escrever fora da raiz, ele recusa: caminho absoluto e
  travessia (`..`) são negados pelo próprio CLI, com o erro citando o caminho resolvido — não é o
  modelo recusando por texto. Conferido no disco, não na resposta do modelo.
  **Cláusula obrigatória:** medido **sob `acceptEdits`**. Não medido sob `bypassPermissions`,
  cujo propósito declarado é desligar exatamente essa checagem.
- **Dá para limitar o vocabulário de ferramentas** com `--tools`.
- **Dá para impor teto de turnos** com `--max-turns` — que **não aparece no `--help`** e funciona
  mesmo assim. Superfície não documentada: pode sumir numa atualização do CLI.

**A descoberta que vale para qualquer sistema multi-agente, e não só para este:**

> **Deny-list perde para substituição.** Proibir a ferramenta de escrita remove `Write` da lista
> anunciada ao modelo — **e o arquivo nasce assim mesmo**, porque o modelo troca para o shell.
> Só a allowlist fecha as saídas.

**O que NÃO está garantido:** o confinamento **do shell**. Um comando de shell não se audita por
análise de caminho — encadeamento, variável, redirecionamento e caminho construído em tempo de
execução derrotam qualquer verificação por texto. Hoje essa propriedade é **parcial**, e a única
saída medida para fechá-la é a fábrica servir as próprias ferramentas ao CLI por MCP.

---

---

## 4b. O que a troca de família faz com CADA mecanismo de governança

A pergunta certa não é *"perde-se o controle?"* — é *"qual mecanismo passa a sustentar cada
garantia?"*. Respondida item a item, contra o que está no código hoje.

### Não muda nada

| mecanismo | por quê |
|---|---|
| **equipe especializada** (`equipe.json`, prompt de especialista) | é texto de prompt. As duas famílias recebem prompt do mesmo jeito |
| os **dois portões** e as duas perguntas | é organização do pipeline, não do operário |
| **limite de 3 ciclos**, escada de fracasso, replanejamento | idem |
| **critérios de aceite executáveis** e a passada mecânica | rodam fora do agente, antes dele |
| **contabilidade** (uma linha de consumo por volta, soma batendo) | foi a única das três afirmações do marco 1 que **passou**: 95.558 = 95.558 |

### Muda o mecanismo, a garantia continua de pé

| garantia | como a doc descreve | como passa a ser sustentada |
|---|---|---|
| **vocabulário por papel** — `catalogo.ex:40-45`: o revisor só tem `ler listar buscar registrar_resultado` | a fábrica **não oferece** a ferramenta | `--tools` do CLI (allowlist). **Medido: restringe de verdade** |
| **confinamento de arquivo** (T-012) | a fábrica resolve o caminho e recusa o que sai da raiz | o **próprio CLI** recusa absoluto e travessia. Medido sob `acceptEdits` |
| **teto de voltas** | campo do estado do laço | `--max-turns`. Medido: funciona (ausente do `--help`) |
| **orçamento de ferramentas por papel** (T-017) | a fábrica conta porque ela executa | a fábrica **conta lendo o stream**: todo `tool_use` aparece lá (é a T-017b) |

> Sobre o orçamento, um detalhe que evita conclusão errada: a fábrica **já não cortava** chamada
> no meio — ela mede e não COMEÇA o que não cabe (doutrina da T-065: despacho interrompido custa
> igual sem entregar nada). Então perder o poder de recusar em voo não perde nada que existisse.

### Genuinamente diferente — duas coisas, e só duas

**1. O shell não é auditável.** O construtor e o verificador precisam rodar comando. Quem executa
é o `Bash` do CLI, e comando de shell não se audita por análise de caminho. É a única garantia
que fica **parcial**, e a única que a opção D fecharia.

**2. `registrar_resultado` não existe para o agente do CLI.** A T-016 fez dela a ÚNICA forma de o
agente reportar, com o contador do lado do sistema. Ela é ferramenta da fábrica: sob `--tools`, o
agente do CLI não a tem.

O substituto não precisa ser inventado — **é o que a v1 faz há meses e o que funcionou a semana
inteira**: o agente escreve no arquivo da tarefa, e o sistema lê o arquivo. O estado continua em
arquivo, continua sendo do sistema, e o agente continua sem poder mexer no próprio status.
A diferença é que o relato deixa de ser chamada estruturada e volta a ser seção de markdown.

---

## 5. O que muda na resumida, seção por seção

Nenhuma reescrita. É a versão 6 → 7 do mesmo argumento, e cabe nas 5–8 páginas.

| seção do v6 | o que está escrito hoje | o que passa a valer | tamanho |
|---|---|---|---|
| **3. Como um agente trabalha** | *"Ele monta a requisição, chama a API do modelo … se o modelo pediu ferramentas, o sistema as executa"* | o laço tem duas formas: a fábrica conduz (API) ou o operário conduz (CLI) | 1 parágrafo + legenda da fig. 3 |
| **5. As ferramentas** (tabela da stack) | `Req` — *"conversa com a API do modelo, com controle total do corpo da requisição"* | ganha o par: o adaptador de assinatura, que fala com o CLI | 1 linha |
| **5.** marcador *"Req, e não uma biblioteca pronta de agentes"* | justifica o sistema inteiro | justifica **a família de endpoint**. Na família de assinatura o operário é, na prática, uma biblioteca pronta de agentes — e a escolha é deliberada, porque ela não gera fatura | 2 frases |
| **6. A arquitetura em execução** | as travas são da fábrica | na família de assinatura, as travas são flags do operário: mesma promessa, outro mecanismo. Aqui entra a lição da deny-list | 1 marcador |
| **8. O custo** | a conta de 20 mil × 15 voltas → 300 mil contra ~53 mil (≈ 1/6) | dizer **a qual família** a conta se aplica | 1 frase |
| **10. Limites conhecidos** | — | o confinamento de shell é parcial na família de assinatura, e por quê | 1 marcador |
| **(nova)** | — | o caso real dos dois portões (seção 7 abaixo) | 1 parágrafo |

O que **não** deve entrar: custo medido da v1. Saiu do documento a pedido do Enzo na versão 3→4 e
continua fora.

---

## 6. O ponto fraco do documento, dito sem rodeio

A seção 8 é a afirmação **mais quantitativa** e a **menos demonstrada** do trabalho.

Os números de cache (guardar custa 1,25× ou 2,0×; reaproveitar custa 0,1×; mínimo cacheável por
modelo) vêm da documentação do provedor, conferidos em 21/08. A conta de 1/6 é ilustrativa. **O
sistema ainda não mediu nenhum dos dois**, porque o marco que os mediria exige uma chave de API
que não existe nesta máquina.

Numa banca, é aqui que se pergunta *"você mediu isso ou leu?"*.

**Saída que não depende de chave:** partir o marco 2 em duas metades.

| metade | o que prova | precisa de chave? |
|---|---|---|
| **2a** | o prefixo é montado **byte a byte estável** entre despachos, e os pontos de cache estão posicionados | **não** — é teste da suíte |
| **2b** | o provedor de fato cobra 0,1× pela releitura | sim |

Com a 2a, o documento passa a dizer *"a condição necessária foi demonstrada; a economia é a
tabela do provedor"* — que é honesto, verificável e muito mais forte que uma citação sozinha.

---

## 7. Um ganho que o documento ainda não tem

A seção dos **dois portões** é hoje argumento de princípio: *quem verifica pergunta "funciona?",
quem revisa pergunta "é o que foi pedido?", e nenhum dos dois pode corrigir.*

Em 02/09 ela virou **caso concreto**, e vale um parágrafo:

> Numa tarefa de medição, o verificador executou os nove critérios de aceite e aprovou **nove de
> nove**, duas vezes. O revisor reprovou mesmo assim: duas conclusões escritas no relatório eram
> **mais fortes que o experimento que as produziu** — um controle experimental era uma frase
> impressa que nunca chegou a ser executada, e outra medição estava contaminada pelo próprio
> desenho do teste. Corrigidas, as duas conclusões **se inverteram**. Critério cumprido e
> conclusão errada coexistiram; foi a segunda pergunta que separou os dois.

É a melhor evidência possível de que os portões precisam ser independentes, e ela é do próprio
sistema — não de literatura.

---

## 8. As quatro decisões, e o que cada uma muda no documento

| decisão | efeito no sistema | efeito no documento |
|---|---|---|
| **A** — a fronteira declara a família | obrigatória: sem ela o código não funciona | as mudanças da seção 5 acima. É a menor edição que torna doc e código coerentes |
| **D** — MCP: a fábrica serve as ferramentas ao CLI | fecha o confinamento de shell e devolve `registrar_resultado` | **a favor do documento**: a frase original da seção 3 (*"o sistema as executa"*) volta a valer nas duas famílias |
| **custo por volta interna** | +1 tarefa | decide se o documento pode afirmar custo *por volta* na família de assinatura |
| **partir o marco 2** | destrava metade da prova sem chave | seção 8 passa de *citação* a *demonstração parcial* |

---

## 8b. CORREÇÃO do parecer sobre a opção D (03/09)

**O parecer de 02/09 dizia que D era quase obrigatória, e exagerava.** A correção veio de uma
pergunta do Enzo: *"limitar o que cada agente pode fazer já não estava planejado?"*. Está — e é
justamente isso que mostra onde D é e onde não é necessária.

| para que | D é necessária? |
|---|---|
| **limitar papel** (*"o revisor só lê e julga"*) | **não.** `--tools` resolve, é medido, e já está no escopo da T-018c |
| **confinar escrita de arquivo** | **não.** O próprio CLI recusa, medido sob `acceptEdits` |
| **auditar e contar comando de shell** | **sim.** É a única via |
| **devolver o `registrar_resultado` estruturado** | **sim** — mas o arquivo de tarefa já é substituto provado (é o que a v1 usa) |

**Parecer revisado: A agora, D não.** Fazer `--tools` por papel primeiro entrega a maior parte da
garantia por muito menos trabalho. Depois, com o sistema rodando, dá para MEDIR se o `Bash` não
auditado do construtor é problema real ou preocupação teórica.

Decidir D agora seria decidir sem dado — o erro que este projeto cobrou cinco vezes nesta semana.

---

## 9. Ordem recomendada

1. Decidir A (e se D entra).
2. Construir: desenho da fronteira → as duas correções de código → confinamento e teto → marco.
3. **Só então revisar os documentos.** Revisar antes é escrever sobre um desenho que ainda pode
   mudar — e cada versão do `.docx` é regerada por script, então o custo de esperar é zero.

---

## 10. Onde está cada coisa

| o quê | onde |
|---|---|
| como os documentos foram feitos, e as preferências do Enzo | `CONTEXTO.md`, ao lado |
| geradores dos `.docx` (a resumida é `corpo6.py`) | `geradores/` |
| o plano das seis fases e o veredito de cada marco | `_sistema/PLANO_V2.md` |
| as tarefas da v2, uma por arquivo | `projetos/fabrica-v2/_gestao/tarefas/` |
| a medição do CLI real, com evidência | `projetos/fabrica-v2/_gestao/PROGRESSO.md`, seção T-018b |
| o instrumento que mede | `projetos/fabrica-v2/priv/probes/cli_governanca.exs` |
| o marco que reprovou, com a reprodução | `projetos/fabrica-v2/_gestao/tarefas/T-020-marco.md` |
