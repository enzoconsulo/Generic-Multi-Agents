---
id: T-041
titulo: Análise do projeto em painel visual — sair do .md corrido
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: []
areas: [servidor/src/acoes/prompts/analise.md, servidor/src/fabrica/analise-estruturada.ts, web/src/paginas/projeto/PainelAnalise.tsx]
tentativas: 1
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Entender um projeto olhando, não lendo: o que ele faz, de que peças é feito, como o fluxo
corre e onde estão os pontos de atenção.

## Contexto
Pedido do usuário: *"na análise completa a gente tem vários textos, mas não é minha
intenção ficar lendo textos extensos .md para entender o projeto"*. Escolheu, entre as
opções, o painel visual com a análise saindo estruturada.

Hoje o fluxo de análise (T-012) grava `_gestao/ANALISE.md` e a tela renderiza o markdown
inteiro. O conteúdo é bom; o formato exige leitura linear de página inteira.

## Critérios de aceite
- [x] O fluxo de análise passa a gravar TAMBÉM um `_gestao/analise.json` estruturado.
- [x] Painel com: o que o projeto faz, peças principais, fluxo de execução e pontos de atenção.
- [x] O `.md` continua existindo (é o que um humano lê fora do painel) e fica acessível.
- [x] Projeto com análise ANTIGA (só `.md`) não quebra: mostra o texto e convida a reanalisar.
- [x] JSON malformado nunca derruba a página — cai no `.md`.

## Notas de execução
O `.md` continua sendo a fonte para humano fora do painel; o `.json` é para a tela. Gerar
os dois na mesma passada evita a divergência clássica de ter duas fontes de verdade
escritas em momentos diferentes.

Compatibilidade importa aqui: já existem análises gravadas (o `ia-hibrida-limpa` tem uma
que custou US$3,86). Elas não podem virar tela quebrada só porque o formato novo chegou.

## Verificação
Suíte: **349 (servidor, +12) + 93 (web)**, build limpo. Os DOIS caminhos conferidos com
captura, porque cada um é um requisito separado da tarefa:

1. **Com `analise.json`** (projeto descartável criado e apagado em `projetos/`): destaque
   "o que faz" com os chips da stack, peças com nome e papel, pontos de atenção ordenados
   por gravidade (▲ vermelho, ■ âmbar, ▪ cinza) e fluxo numerado. O `.md` fica atrás de
   "ver a análise por extenso".
2. **Sem ele** (o `ia-hibrida-limpa`, analisado antes desta tarefa): aviso explicando que
   a análise é anterior ao painel visual, convite a reanalisar, e o texto abaixo. Nenhuma
   tela quebrada — que era o requisito de compatibilidade.

O painel visual foi conferido com fixture escrita à mão, e não reanalisando o projeto: a
análise real custou US$ 3,86 da última vez, e o que estava em teste aqui é a RENDERIZAÇÃO,
não a qualidade do texto que o modelo produz.

## Revisão
O risco é o JSON escrito por um modelo derrubar a página do projeto. Por isso o leitor
nunca lança e nunca exige o arquivo: ausência é `null`, JSON malformado é `null`, e campo
torto vira vazio com o RESTO continuando a aparecer — todos com teste. Objeto sem nada
aproveitável também vira `null`, porque cair no `.md` é melhor que mostrar painel vazio.

Gravidade desconhecida vira `media` em vez de descartar o ponto: perder um alerta é pior
que classificá-lo no meio.

Os dois arquivos saem da MESMA passada do fluxo de análise. Gerar em momentos diferentes é
exatamente como o painel passaria a mostrar uma coisa e o `.md` outra.