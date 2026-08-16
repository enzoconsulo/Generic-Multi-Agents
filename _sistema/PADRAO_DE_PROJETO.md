# Padrão de projeto — como todo projeto da fábrica se documenta

Vale para **todo** projeto sob `projetos/`, criado do zero ou importado, nas duas trilhas.
Também vale para o `painel/`, que é ferramenta de sistema e não projeto.

## O problema que isto resolve

Um agente (ou o Enzo) abre um projeto e precisa responder três perguntas antes de escrever
uma linha:

1. **O que existe aqui?**
2. **Onde mexo para fazer X?**
3. **Isto já está resolvido em algum lugar?**

Sem resposta escrita, cada um responde varrendo o código — caro, lento e, pior, **incompleto
de um jeito que não se percebe**. O sintoma clássico, e é a queixa que originou este padrão:
escrever uma função nova e descobrir DEPOIS que ela já existia, com outro nome, três pastas
adiante. O tempo perdido é o menor dos danos; o dano real é a segunda cópia, que a partir daí
diverge da primeira em silêncio.

## Os dois documentos, e por que são dois

| arquivo | quem escreve | responde | quando muda |
|---|---|---|---|
| `_gestao/MAPA.md` | **gerado** por `_sistema/ferramentas/mapa.mjs` | *o que existe e onde* — árvore + assinatura e propósito de cada símbolo público | regenerado a cada commit de tarefa |
| `_gestao/GUIA.md` | **à mão**, por quem constrói | *como se faz* — o papel de cada módulo, as receitas e o que NÃO reinventar | quando a arquitetura muda |

São complementares e nenhum substitui o outro. O MAPA é exaustivo e mecânico: sabe que
`formatarCusto(c: Custo): string` existe, e não sabe que ela é a única forma certa de exibir
preço. O GUIA é curto e opinativo: não lista tudo, lista **o que a pessoa precisa saber para
não errar**.

A divisão de trabalho é essa: **o que uma máquina consegue extrair, uma máquina extrai.**
Escrever à mão o que o `mapa.mjs` gera é trabalho que envelhece e vira mentira. O GUIA cobre
só o que nenhuma ferramenta deduz — intenção, fronteira entre módulos, e a lista do que já
existe.

## O que todo `_gestao/GUIA.md` precisa ter

Quatro seções. Nesta ordem, porque é a ordem em que as perguntas aparecem.

### 1. Em uma tela
O que o projeto é, a stack, e como rodar/testar. Se a pessoa só ler isto, já consegue
levantar o projeto.

### 2. Onde fica o quê
Uma tabela **módulo → responsabilidade → quando mexer aqui**. Uma linha por módulo, não por
arquivo. A coluna que mais vale é a terceira: é ela que transforma um índice numa decisão.

### 3. Receitas
"Para fazer X, mexa em Y" — os 5 a 10 caminhos que de fato se repetem no projeto
(acrescentar uma rota, uma tela, um comando, um relatório). Cada receita cita os arquivos na
ORDEM em que se toca neles. Receita é o que evita a leitura exploratória.

### 4. Já existe — não reinvente
**A seção que resolve a queixa que criou este padrão.** Lista, por necessidade recorrente, o
helper canônico do projeto: formatação, datas, validação, acesso a disco, chamadas externas,
tratamento de erro. Uma linha cada, com o caminho.

Regra para manter viva: **ao criar um helper que outra tarefa vai querer, a mesma tarefa o
acrescenta aqui.** Não é burocracia — é a única prevenção contra a segunda cópia, e custa uma
linha contra o dia que se perde depois.

## Regras de organização em módulos

Valem para as duas trilhas e são o que torna o GUIA possível de escrever:

- **Um módulo, um assunto.** Se o cabeçalho do arquivo precisa de "e" para descrever o que
  ele faz, são dois arquivos.
- **Arquivo novo em vez de arquivo compartilhado.** Tarefa nova acrescenta arquivo; editar um
  arquivo que todo mundo toca destrói o paralelismo por `areas` (é o mutex da fábrica) e
  produz conflito onde não havia. O agregador de rotas do painel existe exatamente por isso.
- **Lógica pura separada da moldura.** Decisão em função pura e testável; componente/handler
  só monta a entrada e desenha a saída. Lógica dentro de componente é lógica não verificada.
- **O cabeçalho do arquivo diz POR QUE, não O QUE.** O "o que" o código já mostra e o MAPA já
  extrai. O que se perde é a razão — e é ela que impede o próximo de "consertar" uma decisão
  deliberada.

## Como isto entra em cada projeto

| origem | quem cria o `GUIA.md` | quando |
|---|---|---|
| `/novo-projeto` | o `planejador` da trilha, junto com ESPECIFICACAO/PLANO | na criação; a **T-001 (fundação)** o preenche com a estrutura real |
| importado pelo painel | o painel cria o esqueleto a partir de `_sistema/templates/GUIA.md` | na importação; a análise automática de código o preenche |
| projeto que já existe | o `documentador`, no próximo lote | quando passar por lá |

O `documentador` mantém o GUIA junto com o README a cada lote de tarefas concluídas —
GUIA desatualizado é pior que GUIA ausente, porque manda a pessoa para o lugar errado com
confiança.

## Como conferir se está valendo

Um GUIA bom passa neste teste: **alguém que nunca viu o projeto consegue dizer onde mexeria
para uma mudança típica, sem abrir o código.** Se não consegue, falta receita ou falta a
coluna "quando mexer aqui".

Exemplo vivo e completo, para copiar a forma: [`painel/GUIA.md`](../painel/GUIA.md).
