# Comece aqui

Relatório do que foi feito em 31/08 a 02/09 e o que fazer a seguir. Escrito para o Enzo ler,
não para um agente — a versão densa está em `_sistema/logs/2026-09-02.md`.

---

## 0. A FÁBRICA ESTÁ RODANDO SOZINHA (ligada em 02/09, 21h46)

**Você não precisa fazer nada de madrugada.** O piloto automático do painel está ligado e
encadeia rodadas sozinho até um dos freios parar.

| | |
|---|---|
| painel | `http://127.0.0.1:8765` — rodando destacado, sobrevive a fechar o terminal |
| projeto | `fabrica-v2`, estratégia `sonnet` (escala para opus no retrabalho) |
| freios | teto de **US$ 20** no total, **US$ 5** por rodada, **6 rodadas** no máximo |
| parada automática | acabou tarefa pronta · tarefa pedindo replanejamento · 2 rodadas sem concluir nada · falha |
| cota | se bater na parede, ele **dorme e rearma** na hora anunciada. Não perde a noite |

### De manhã, faça só isto

1. Abra `http://127.0.0.1:8765` no navegador. O quadro mostra o que andou.
2. Se o piloto tiver parado, o motivo está escrito lá (e em `painel/dados/piloto.json`).
3. Aí sim, se quiser continuar no chat, siga o passo a passo da seção 1.

### Se quiser desligar

```powershell
Invoke-RestMethod http://127.0.0.1:8765/api/piloto -Method Post -ContentType application/json -Body '{"ligado":false}'
```

Desligar **não corta a rodada em voo** — ela termina, e a seguinte não nasce.

> **Uma ressalva honesta:** esta é a **primeira vez** que o pipeline em código roda neste
> projeto. Verifiquei que o painel lê as 71 tarefas corretamente e que o executor está de fato
> trabalhando, mas não pude ver uma rodada inteira fechar. Se de manhã algo estiver estranho,
> a causa mais provável é o primeiro contato — e é para isso que os freios existem. Nada é
> irreversível: tudo passa por git.

---

## 1. O que fazer amanhã (passo a passo)

**Você só precisa do passo 2. O resto é conferência e plano B.**

### Passo 1 — conferir se há cota (10 segundos, opcional)

```powershell
_sistema\ferramentas\retomar-v2.ps1 -Modo sondar
```

Ele imprime uma linha, tipo `disponivel :: 5h em 20% :: 7 dias em 21%`, e sai.
Em 02/09 às 21h30 estava assim: **folgada**. Se disser `ESTOURADA`, pule para o passo 4.

### Passo 2 — abrir o Claude Code e colar o prompt

Abra o Claude Code na raiz da fábrica e cole o prompt que está em **`_sistema/v2/RETOMAR.md`**.

Ele já vem pronto, com a decisão preenchida. **Se você concorda com a recomendação, cola e
pronto** — não precisa editar nada.

### Passo 3 — deixar rodando

O prompt manda a sessão seguir sozinha pelas oito tarefas restantes, até o marco rodar de novo.
Ela vai parar e te perguntar só se algo divergir do que os arquivos dizem.

### Passo 4 — SÓ se a cota tiver acabado

```powershell
_sistema\ferramentas\retomar-v2.ps1
```

Ele fica esperando, sonda a cada 15 minutos, e **apita** quando a cota voltar. Aí você volta ao
passo 2. Com `-Modo auto` ele abre o Claude Code sozinho quando a cota voltar.

> **Por que ele não continua o trabalho sozinho:** porque em modo automático o orquestrador
> encerraria o turno e cortaria os agentes que estão trabalhando no meio. Já custou duas rodadas
> a esta fábrica. Retomar sozinho e destruir o trabalho seria pior que não retomar.

---

## 2. O que foi feito nestes três dias

| | |
|---|---|
| tarefas concluídas | **3** — T-018a, T-020a, T-018b |
| marco 1 da v0.2 | **reprovado**, com três causas raiz |
| replanejamento | **10 tarefas** novas, das quais 1 já concluída |
| documentos novos | 3 (este, o de divergências do TCC, e o prompt de retomada) |
| ferramenta nova | o script de retomada por cota |
| estado do código | `mix fabrica.ci` verde nos 5 estágios · as duas árvores git limpas |

---

## 3. A descoberta que importa

Foi para isto que o marco existe, e ele fez o trabalho dele.

**A v2 foi construída supondo que o `claude` é um motor de modelo** — a fábrica manda o pedido,
ele responde *"quero escrever o arquivo X"*, e a fábrica escreve, com as travas dela.

**Medido: não é.** O `claude` da assinatura é um **agente completo** — ele escreve sozinho, com as
travas dele. A fábrica ficava esperando um pedido que nunca vinha, e o CLI, sem ninguém para
aprovar, negava toda escrita.

Isso **não é um bug**: é uma incompatibilidade de projeto. E ela é a mesma coisa que você pediu no
mesmo dia (poder trocar entre assinatura, API e outros CLIs) vista do outro lado — por isso o seu
pedido **não custou nenhuma tarefa a mais**.

### Três coisas que ninguém sabia e agora estão medidas

| descoberta | por que importa |
|---|---|
| **O CLI confina sozinho** — mandado escrever fora da pasta do projeto, ele recusa | era o maior risco de entregar a execução a ele. Não se perde a garantia |
| **Proibir uma ferramenta não protege** — tirar a de escrita, e o modelo escreve pelo shell | vale para qualquer sistema multi-agente. Só *lista do que pode* funciona; *lista do que não pode*, não |
| **Existe teto de turnos** (`--max-turns`), mas ele não aparece na documentação do CLI | dá para limitar quanto um agente gasta. Como é não documentado, pode sumir numa atualização |

---

## 4. A lição que se repetiu, e vale para o TCC

Cinco vezes neste projeto, sempre a mesma forma: **algo escrito a partir da documentação,
verde nos testes, nunca exercitado contra a coisa real.**

Desta vez na versão mais sutil: um *controle experimental* que era uma frase impressa e nunca
chegou a ser executada. E uma medição contaminada pelo próprio desenho do teste.

**O resultado disso é o melhor material que o TCC ganhou nesta semana:**

> O verificador executou os nove critérios e aprovou **nove de nove**, duas vezes.
> O revisor reprovou mesmo assim — as conclusões escritas eram **mais fortes que o experimento
> que as produziu**. Corrigidas, **duas delas se inverteram**.

Critério cumprido e conclusão errada coexistiram. É a prova, vinda do próprio sistema, de que os
dois portões precisam fazer perguntas diferentes. Detalhes em
`_sistema/documentos-tcc/DOCUMENTO_x_SISTEMA.md`, seção 7.

---

## 5. O que está esperando você

**Uma decisão, e ela já vem respondida no prompt.** Se concordar, é só colar.

| pergunta | recomendação | o que muda se você trocar |
|---|---|---|
| **desenho A** — a fronteira passa a declarar se o operário conduz o laço ou a fábrica conduz | **sim** (obrigatório: sem isso o código não funciona) | — |
| **opção D** — MCP, a fábrica serve as próprias ferramentas ao CLI | **não por enquanto** | com D, fecha também o confinamento do shell. Custa tarefas a mais, ainda não estimadas |
| **custo por volta interna** | **não** | só vale se o TCC for citar o custo por volta. +1 tarefa, ~1 h |
| **partir o marco 2** | **sim** | metade dele passa a rodar sem chave de API, e o TCC deixa de depender de uma chave que não existe nesta máquina |

**Um bloqueio que continua:** não existe `ANTHROPIC_API_KEY` nesta máquina. Procurei em todo lugar
razoável. Ela trava só a metade paga do marco 2 — nada mais. E ela **não pode** ser definida como
variável do sistema: isso reprovaria o marco da v0.1, que já está aprovado.

---

## 6. Onde está cada coisa

| o quê | onde |
|---|---|
| **o prompt para colar** | `_sistema/v2/RETOMAR.md` |
| o script de espera por cota | `_sistema/ferramentas/retomar-v2.ps1` |
| o que muda nos documentos do TCC | `_sistema/documentos-tcc/DOCUMENTO_x_SISTEMA.md` |
| o relatório denso, para uma sessão nova | `_sistema/logs/2026-09-02.md` |
| o estado técnico do projeto | `projetos/fabrica-v2/_gestao/PROGRESSO.md` |
| as 10 tarefas do replanejamento | `_sistema/v2/tarefas/` |
| o plano das seis fases e os quatro desenhos | `_sistema/PLANO_V2.md` |
