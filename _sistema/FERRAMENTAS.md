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
       [--largura=1400] [--altura=1200] [--porta=9333]
       [--js="<expressão>"] [--console] [--exigir="<expressão>"]
```

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
servidor é você (numa porta livre, derrubando pelo PID ao terminar) — ou a cena versionada do
projeto, abaixo.

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
