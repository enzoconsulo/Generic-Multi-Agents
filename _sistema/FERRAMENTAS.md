# Ferramental da fábrica — o que você JÁ TEM antes de construir ou instalar qualquer coisa

Este é o inventário. Ele é injetado no contexto de todo agente do pipeline, de propósito:
três vezes um agente desta fábrica não soube que uma destas ferramentas existia e improvisou
uma pior no lugar. Antes de escrever script descartável, instalar dependência ou declarar
que "não é possível neste ambiente", procure aqui.

## Prova visual — `_sistema/ferramentas/captura.mjs`

Dirige o **Edge/Chrome já instalado no Windows** pelo DevTools Protocol. **Não instala nada**
e não precisa de nada instalado: o Node 22 tem `WebSocket` e `fetch` nativos.

```
node _sistema/ferramentas/captura.mjs <url> <arquivo.png> [--espera=2500] [--pos-espera=1200]
       [--largura=1400] [--altura=1200] [--porta=<auto>] [--js-teto=15000]
       [--js="<expressão>"] [--console] [--exigir="<expressão>"] [--movimento-reduzido]
```

**Tem suíte** (`cd _sistema/ferramentas && node --test`): 7 casos que sobem o navegador de
verdade e conferem viewport exato, códigos de saída, PNG gravado mesmo na reprovação, zero
processo órfão e duas capturas simultâneas sem disputar porta. Mexeu aqui? Rode.

- **`--movimento-reduzido`** fotografa o caminho ACESSÍVEL. **Por padrão, agora, o navegador
  responde `no-preference`** — e antes não respondia: o Edge headless reporta
  `prefers-reduced-motion: reduce`, então TODA tarefa de animação desta fábrica fotografava o
  caminho acessível achando que fotografava o normal, e a evidência provava o contrário do que
  a tarefa pedia. Se a sua tarefa exige verificar o caminho acessível (e várias exigem), é
  esta flag que faz isso — de propósito, não por acidente.
- `--js-teto` é o teto do `--js` e de cada `--exigir` (padrão 15s). Fluxo de UI com vários
  turnos não cabe em 15s; quando estoura, a captura segue e as afirmações voltam como
  `Uncaught` sem dizer onde parou — então aumente o teto em vez de acelerar o fluxo.
- `--porta` tem padrão derivado do PID. Não fixe um número: a fábrica roda até 3 agentes em
  paralelo, e porta fixa faz duas capturas disputarem o mesmo DevTools.

- `--largura`/`--altura` dão o **viewport exato**, inclusive larguras de celular (360, 390) —
  ele emula as métricas do dispositivo em vez de redimensionar a janela, que tem mínimo. A
  linha `viewport: LxA (pedido LxA)` sai **sempre**; divergência é erro (código **4**).
  **Copie essa linha para as Notas ao lado de qualquer número geométrico que você medir** —
  medida sem a régua ao lado já custou uma fase inteira ao banco-imobiliario, julgada a
  496×704 por três tarefas seguidas enquanto os critérios diziam 390×844.
- `--js` roda uma expressão **na página** antes do retrato — é como se fotografa tela que só
  existe depois de um clique (modal aberto, formulário submetido, caixa expandida). O valor
  de retorno vai para o stdout: é assim que um clique DIZ o que fez.
- `--console` reporta erros/avisos da página e falhas de rede; sai com código **2** se houver.
  PNG prova que a tela pintou, não que ela funciona — um `TypeError` num handler não muda um
  pixel.
- `--exigir` AFIRMA algo sobre a página e sai com código **3** se for falso. Pode repetir:
  todas as afirmações rodam na MESMA subida de navegador, e o código de saída é o veredito do
  conjunto. É o que transforma critério geométrico (`getBoundingClientRect`, `getComputedStyle`)
  em fato medido em vez de julgamento.

**O que ele NÃO faz: subir servidor.** Ele fotografa uma URL que já responde. Quem sobe o
servidor é você — ou, melhor, a cena versionada do projeto (abaixo), que faz isso sozinha.

Subindo à mão, **use o PowerShell**, porque é o único jeito de obter o PID real do Windows:

```powershell
$s = Start-Process npm -ArgumentList 'start' -PassThru   # $s.Id é o PID de verdade
taskkill /PID $s.Id /T /F                                # /T mata o node.exe filho do npm
```

**Não use `npm start & PID=$!` no Bash.** Medido: `$!` devolveu 626 enquanto o processo
Windows era 3780 — é o PID do JOB do Git Bash. O `kill` do Git Bash traduz e mata o processo
direto, mas `taskkill /PID` com esse número falha, e o `node.exe` que o `npm` deixou fica
órfão de qualquer jeito. Órfão acumulado já derrubou o painel levando junto o job em voo.

**`file://` não serve para montar prova visual composta.** Uma página local que referencie
sub-recurso de OUTRO diretório (`<img src="file:///.../public/icone.svg">`) tem o recurso
bloqueado pelo navegador **em silêncio**: a captura sai com o item quebrado e **código 0** —
evidência verde que não prova nada. Suba o servidor e use `http://`.

**`--exigir` não serve para escrever `verificar:` na tarefa.** A passada mecânica recusa
comando com `< > ; | & $` ou crase, e afirmação geométrica é feita de `<=`/`>=`. Em `verificar:`
use uma CENA nomeada.

## Cenas verificáveis — `<projeto>/ferramentas/cenario.mjs`

Quando o projeto tem este arquivo, ele é **o caminho certo para toda evidência de UI**: sobe o
servidor numa porta livre, monta um estado de jogo/tela conhecido, chama o `captura.mjs` por
dentro, afirma a geometria e derruba o servidor pelo PID — numa invocação só, sem metacaractere
de shell.

```
node ferramentas/cenario.mjs --listar          # nomes das cenas disponíveis
node ferramentas/cenario.mjs --cena=<nome>     # executa; sai 0 se todas as afirmações passarem
```

Sai != 0 imprimindo qual afirmação falhou **e o valor medido**. O PNG vai para
`_gestao/evidencias/<nome>.png` **sempre**, inclusive quando a afirmação falha — é aí que a
evidência visual mais importa.

É a única forma de um critério de UI virar `verificar:` executável. **Rode `--listar` antes de
improvisar**: se a cena que você precisa já existe, usá-la custa um comando; refazê-la custou
um dia inteiro na T-036.

## Retomada por cota — `_sistema/ferramentas/retomar-v2.ps1`

Espera a cota da assinatura voltar e retoma o trabalho da v2. Existe porque a cota cortou três
despachos em três dias (31/08, 01/09, 02/09): nenhum gerou fatura e nenhum perdeu trabalho, mas
cada corte custa o despacho inteiro, e quem está longe do teclado só descobre horas depois que a
cota já tinha voltado.

```
_sistemaerramentasetomar-v2.ps1              # espera e avisa (padrão)
_sistemaerramentasetomar-v2.ps1 -Modo sondar # lê a cota agora e sai
_sistemaerramentasetomar-v2.ps1 -Modo auto   # espera e abre o Claude Code
```

**Como ele sabe que a cota voltou:** não há API de cota. O que existe é o `rate_limit_event` que
o `claude` emite em toda resposta, com a utilização das duas janelas — fato medido pela T-018a.
A sonda é uma chamada mínima que lê esse evento; ela gasta alguns tokens de **cota** e **não gera
fatura**. O intervalo padrão (15 min) é generoso de propósito: sondar de minuto em minuto gastaria
cota para descobrir que não há cota.

**O modo `auto` abre o Claude Code INTERATIVO, e não `claude --print`.** Num job headless não
existe quem entregue a notificação de subagente concluído, e o orquestrador cortaria os agentes em
voo — a armadilha da regra 7 do `CLAUDE.md`, que já custou duas rodadas.

O prompt de retomada fica em `_sistema/v2/RETOMAR.md`, pronto para colar depois de um `/clear`.

**Duas armadilhas do Windows que este script já pagou:**

| sintoma | causa |
|---|---|
| `'}' de fechamento ausente` no parser, em linha que tem chave fechada | o PowerShell 5.1 lê script sem BOM como **ANSI**: acento e travessão viram lixo. Por isso este arquivo e o `banco-v2.ps1` são **ASCII puro** |
| o caminho impresso sai como `_sistema\_sistema2\...` | `Split-Path -Parent` **duas** vezes a partir de `ferramentas/` para em `_sistema`, não na raiz. São **três** |

---

## Índice do projeto — `_sistema/ferramentas/mapa.mjs`

Gera `_gestao/MAPA.md`: árvore + assinatura e propósito de cada símbolo público, ~5% do tamanho
do fonte, determinístico e sem modelo. **É por ele que você se orienta em vez de varrer o
código** — abrir arquivo para descobrir o que já existe é o desperdício nº 1 medido aqui. Ele
já vem embutido no seu contexto; regenere (`node _sistema/ferramentas/mapa.mjs <projeto>`) ao
commitar mudança estrutural.

## Suíte do projeto

`_gestao/ci.json` (estágio `testes`) tem o comando canônico da suíte. **Copie de lá** — não
redija comando de teste de cabeça. A fábrica já roda a suíte inteira uma vez por ciclo, no
verificador: você roda só o que toca a sua tarefa.

---

# Proibido — e o que fazer no lugar

| não faça | por quê | faça |
|---|---|---|
| `npm i puppeteer` / `playwright` / `selenium` / `cypress` / `chromedriver` | o navegador já é dirigido pelo `captura.mjs`, sem instalar nada; baixar um Chromium inteiro custa minutos e polui o `package.json` do projeto | `captura.mjs`, ou a cena do projeto |
| script descartável `_tmp-*.mjs` para gerar evidência | já foi escrito e jogado fora 4 vezes neste repositório; um deles quebrou por `spawnSync` dentro do próprio servidor | a cena versionada; se não existir, registre a falta nas Notas |
| chamar `captura.mjs` com `spawnSync` de dentro do processo que **é** o servidor | `spawnSync` bloqueia o event loop → o servidor para de responder → o handshake do socket nunca fecha → PNG vazio (T-036, ciclo 1: 0 entrega) | `spawn` assíncrono com `await` no `close`, ou processo separado |
| "não há navegador disponível neste ambiente" | falso, e já foi reprovado por conformidade uma vez (T-026) | leia este arquivo antes de declarar impossibilidade |
| `taskkill /IM node.exe`, `Stop-Process -Name node`, `pkill node`, matar o dono de uma porta | o PAINEL que está te executando é um `node` desta máquina: você derruba o job e destrói o trabalho de todos os agentes em voo | porta ocupada → outra porta (`PORT=3001`); encerrar o que VOCÊ subiu → pelo PID dele, e só dele |
| deixar servidor de pé ao terminar a etapa | depois do fim da etapa ninguém mais conhece aquele PID; um órfão por rodada, numa máquina de 7,9 GB, é o que vira "sem memória" | guarde o PID ao subir e encerre na MESMA etapa |
| `npm start` em primeiro plano | não retorna — é servidor. Trava a etapa até o teto de tempo e deixa o processo órfão | suba em background guardando o PID, ou use `npm test` (porta efêmera) para provar que sobe |

**Regra geral:** ferramenta antes de trabalho artesanal. Se você está prestes a escrever código
para validar data, formatar tabela, fazer parsing, gerar `.pptx` por string, recalcular
planilha no braço ou dirigir um navegador — pare e procure a ferramenta. Doutrina completa em
`_sistema/BIBLIOTECAS.md` (software) e `_sistema/DOMINIOS.md` (genérica).
