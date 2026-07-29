---
id: T-041
titulo: Análise do projeto em painel visual — sair do .md corrido
projeto: painel-fabrica
status: backlog
prioridade: media
dependencias: []
areas: [servidor/src/acoes/prompts/analise.md, servidor/src/fabrica/analise-estruturada.ts, web/src/paginas/projeto/PainelAnalise.tsx]
tentativas: 0
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
- [ ] O fluxo de análise passa a gravar TAMBÉM um `_gestao/analise.json` estruturado.
- [ ] Painel com: o que o projeto faz, peças principais, fluxo de execução e pontos de atenção.
- [ ] O `.md` continua existindo (é o que um humano lê fora do painel) e fica acessível.
- [ ] Projeto com análise ANTIGA (só `.md`) não quebra: mostra o texto e convida a reanalisar.
- [ ] JSON malformado nunca derruba a página — cai no `.md`.

## Notas de execução
O `.md` continua sendo a fonte para humano fora do painel; o `.json` é para a tela. Gerar
os dois na mesma passada evita a divergência clássica de ter duas fontes de verdade
escritas em momentos diferentes.

Compatibilidade importa aqui: já existem análises gravadas (o `ia-hibrida-limpa` tem uma
que custou US$3,86). Elas não podem virar tela quebrada só porque o formato novo chegou.

## Verificação


## Revisão
