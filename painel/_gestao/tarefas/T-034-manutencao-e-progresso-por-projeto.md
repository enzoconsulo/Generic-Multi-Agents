---
id: T-034
titulo: Manutenção e encerramento por projeto — o que só existia para a fábrica inteira
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-033]
areas: [servidor/src/acoes/acoes-projeto.ts, servidor/src/acoes/prompts/projeto/]
tentativas: 1
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Rodar manutenção e fechar o expediente no ESCOPO DE UM PROJETO, sem arrastar a fábrica
inteira junto.

## Contexto
`/manutencao` e `/encerrar-dia` são os únicos comandos sem `argument-hint`: nasceram
globais e continuam globais. Quem cuida de um projeto só tem a opção "tudo": rodar a
integridade da fábrica inteira para conferir as tarefas de um projeto, ou fechar o dia de
todos para atualizar o `PROGRESSO.md` de um. É caro e é ruído.

## Critérios de aceite
- [x] Ação "Conferir integridade" no projeto: valida as tarefas, o git e a estrutura
      `_gestao/` DAQUELE projeto; corrige o mecânico e reporta o resto.
- [x] Ação "Atualizar progresso" no projeto: consolida o `PROGRESSO.md` dele.
- [x] Nenhuma das duas escreve fora do diretório do projeto.
- [x] As ações globais equivalentes continuam intactas na página inicial.

## Notas de execução
Usa o mesmo motor da T-033 (catálogo + prompt versionado + lock por projeto): estas duas
são mais duas entradas na tabela, não um caminho novo de código. Se exigirem mecanismo
próprio, é sinal de que o motor da T-033 ficou estreito demais — corrigir lá, não aqui.

## Verificação
Suíte: **282 (servidor) + 77 (web)**, build limpo. Conferido AO VIVO com captura: as duas
ações aparecem na seção própria, com agente `orquestrador`.

Confirmou-se o que a tarefa previa: foram **duas entradas na tabela + dois prompts**,
nenhum caminho novo de código. O motor da T-033 aguentou sem alargar.

**Defeito achado OLHANDO a tela, que nenhum teste pegaria:** com as sete ações numa lista
só, "Conferir integridade" e "Atualizar progresso" apareciam sob o título *"Chamar um
especialista"* exibindo agente `orquestrador` — o título mentindo sobre o conteúdo, na
mesma família de "documentação que mente" da T-032. Virou o campo `grupo` no catálogo e
duas seções na tela ("Chamar um especialista" e "Cuidar deste projeto"), com teste que
trava a regra: ação de grupo `especialista` NÃO pode ter agente `orquestrador`, e nenhuma
ação pode ficar fora dos dois grupos (órfã sumiria da tela sem ninguém notar).

## Revisão
O risco real destas duas é escrever fora do projeto — em especial a `progresso`, cujo
instinto natural é gravar no log diário da fábrica, que pertence ao `/encerrar-dia`
global. O prompt proíbe isso explicitamente e há teste que verifica a proibição no texto.

Refatoração aproveitada aqui: a obrigatoriedade do campo de texto saiu de uma comparação
por id (`acao.id === "pesquisar"`) repetida na rota E na UI, e virou `entrada.obrigatoria`
no catálogo. Regra duplicada em dois lugares diverge no próximo ajuste — e este ajuste
chegou uma hora depois de eu escrever a duplicação.
