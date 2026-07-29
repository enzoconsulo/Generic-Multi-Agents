---
id: T-040
titulo: Toda ação diz o que vai fazer, o que escreve e quanto custa — antes do clique
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: []
areas: [servidor/src/acoes/acoes-projeto.ts, web/src/componentes/ExplicaAcao.tsx]
tentativas: 1
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Nenhum botão do painel disparado no escuro: antes de clicar dá para saber o que acontece,
o que é alterado no disco e quanto tende a custar.

## Contexto
Pedido do usuário: *"todas as ações opções e botões devem ser extremamente claros e nítidos
em qual o gasto esperado, qual a ação a ser executada e o que será feito, nem que seja em
um botão toggle ao lado clicável que explica o que será feito em uma janelinha ao lado"*.

Hoje o cartão tem uma frase de resumo e um selo de peso (leve/médio/pesado) que só faz
sentido para quem conhece a tabela interna. O usuário não sabe, sem clicar: se a ação
ESCREVE alguma coisa, o que ela escreve, e quanto custou da última vez.

E já há dado real para isso: as ações rodaram de verdade hoje, com custo medido por
execução — dá para mostrar o custo OBSERVADO em vez de só a estimativa qualitativa.

## Critérios de aceite
- [x] Cada ação declara: o que faz, o que ESCREVE no disco, e o que nunca toca.
- [x] Explicação abre num toggle ao lado do botão, sem sair da página nem abrir o formulário.
- [x] Custo esperado em dinheiro, não só "leve/médio/pesado".
- [x] Quando já houve execução daquela ação naquele projeto, mostrar o custo REAL da última.
- [x] Ação que escreve fica visivelmente distinta da que só lê.

## Notas de execução
O custo observado sai do histórico de jobs que a T-036 já cruza por projeto — é dado que
o painel tem e não usa. Estimativa qualitativa continua como fallback para ação nunca
executada ali.

## Verificação
Suíte: **337 (servidor) + 93 (web, +5)**, build limpo. Conferido AO VIVO com captura, com
DADOS REAIS do `ia-hibrida-limpa` — e o custo observado bateu exatamente com o que as ações
gastaram nesta sessão: Documentar US$ 1,11, Pesquisar US$ 1,84, Revisar US$ 1,14,
Replanejar US$ 1,81, Testar US$ 0,71.

O selo do card deixou de mostrar o peso do fluxo (`leve/médio/pesado`, que só significa algo
para quem conhece a tabela interna) e passou a responder a pergunta que decide o clique:
**"altera arquivos"** em âmbar ou **"só lê"** em verde. `revisar` e `testar` aparecem
corretamente como só leitura.

**Defeito visto na captura:** o `resumo` da ação aparecia duas vezes — no card e de novo
como primeira linha da caixa. Repetição empurra para baixo justamente a informação nova.
Removido da caixa.

## Revisão
O risco aqui é a promessa errada: dizer "só lê" numa ação que escreve é pior que não dizer
nada, porque o usuário clica confiando. Duas guardas: `escreve` é obrigatório no tipo (ação
nova não compila sem declarar), e há teste travando quais ids podem ter a lista vazia —
esquecer o campo cairia em "só lê" por omissão, que é a mentira mais perigosa possível.

O custo observado ignora job não concluído de propósito: um cancelado no meio informaria
custo parcial como se fosse o preço da ação, e o usuário decidiria por um número baixo
demais. Tem teste.

O casamento job↔ação é por prefixo do título (`"<rótulo> — <projeto>"`), com o separador
` — ` garantindo que "Testar" não capture "Testar tudo". Também tem teste — é frágil por
natureza, e o teste é o que avisa se o formato do título mudar.