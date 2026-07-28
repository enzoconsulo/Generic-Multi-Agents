---
id: T-035
titulo: Equipe de especialistas visível e editável na página do projeto
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-033]
areas: [servidor/src/rotas/equipe.ts, web/src/paginas/projeto/SecaoEquipe.tsx]
tentativas: 1
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Ver quem é a equipe de especialistas do projeto, o que cada um faz, e poder ajustar ou
mandar recriar.

## Contexto
`_gestao/equipe.json` é o que faz o projeto se auto-estruturar: o planejador sintetiza
especialistas a partir da ideia, e o `/trabalhar` os injeta como `options.agents`. Só que
a equipe é INVISÍVEL fora da execução ao vivo — `EquipeAoVivo.tsx` só mostra quem está
trabalhando agora. Parado, ninguém sabe quem existe, o que cada um faz, nem que um agente
está com o `prompt` vazio e por isso nunca é usado (o leitor já calcula isso em `erros`,
e o dado já chega no `ProjetoDetalhe` — só não é exibido).

## Critérios de aceite
- [x] Seção "Equipe" no projeto: cada especialista com nome, descrição e ferramentas.
- [x] Agente inválido aparece com o motivo (o `erros` que o leitor já produz), em vez de
      sumir silenciosamente.
- [x] Projeto sem `equipe.json` explica que usa o executor genérico — não é erro.
- [x] Editar a equipe pela web, com validação antes de gravar.
- [x] Ação "recriar equipe" despachando o planejador.

## Notas de execução
**Escrever `equipe.json` pela web é uma EXCEÇÃO à regra** de o painel nunca escrever nos
arquivos da fábrica — a mesma família de `ANALISE.md`, `ci.json` e a importação. Precisa
ser registrada em `DECISOES.md` e no CLAUDE.md do painel junto com as outras, senão a
regra vira letra morta por acúmulo de exceções não escritas.

Validar ANTES de gravar, reusando as regras que `fabrica/equipe.ts` já aplica na leitura
(id em minúsculas/hífen, prompt não vazio, sem id duplicado) — validação escrita duas
vezes com regras diferentes é como o arquivo fica aceito na gravação e rejeitado na
leitura.

## Verificação
Suíte: **300 (servidor, +18) + 77 (web)**, build limpo. Conferido AO VIVO com captura na
página do `ia-hibrida-limpa`, com a equipe REAL do projeto: os dois especialistas
(`ia-integracao`, `streamlit-ui`) com nome, descrição e ferramentas, e o editor abrindo
com os prompts completos carregados.

**Gravação provada ponta a ponta contra o servidor real**, num projeto descartável criado
e apagado em `projetos/`: `PUT` → `gravado:true` → arquivo no disco → `GET` de volta com
**zero erros do leitor**. É a prova que interessa, porque gravação e leitura usam as
mesmas regras e o risco real era divergirem.

**Um falso alarme investigado até o fim:** o primeiro round-trip gravou `U+FFFD` no lugar
do "Á". Parecia bug de encoding no servidor — num projeto todo em PT-BR, grave. Não era:
o `curl` do Git Bash mandou cp1252 na linha de comando. Repetido com payload UTF-8 gravado
pelo Node, `Áudio Ç ã` chegou intacto ao disco. Verificar antes de "consertar" evitou uma
correção inventada para um bug que não existia.

**Defeito achado OLHANDO:** o id `ia-integracao` saía CORTADO ("ia-inte") no card, espremido
pelo nome longo do especialista — e o id é justamente o que as tarefas citam em `agente:`.
Corrigido com `flex-shrink: 0` no id e quebra no nome.

**Duas correções de fora do escopo, que a tarefa expôs:**
1. O `npm test` da web NÃO rodava `tsc` (só o do servidor) — mas o CLAUDE.md afirmava
   "tsc estrito + Vitest no servidor e na web". Documentação que mente, de novo. Dois
   erros de tipo reais passaram pela suíte verde e só apareceram no `npm run build`.
   Agora o script da web roda `tsc --noEmit && vitest run`, e a documentação virou verdade.
2. Teste de rota com `FABRICA_RAIZ` sobrescrito só aceita import DINÂMICO — trocar um
   número fixo por `ACOES_PROJETO.length` com import estático derrubou 5 testes que
   passavam, porque o import içado carrega `config.js` antes da env. Virou armadilha
   registrada no CLAUDE.md.

## Revisão
O risco desta tarefa é gravar uma equipe que o leitor depois rejeita — o projeto ficaria
com especialistas que nunca são injetados, silenciosamente. Coberto pelo teste que grava
e relê exigindo `erros: []` em cada agente, e por `prompt` vazio ser BLOQUEIO de gravação
e não aviso (agente sem prompt é carregado e ignorado pelo injetor: falha muda).

Validação devolve TODOS os problemas de uma vez, não só o primeiro: quem edita cinco
agentes precisa ver os cinco erros, não descobrir um por tentativa de salvar.

Lista vazia é gravação legítima (volta ao executor genérico), com teste — tratá-la como
erro impediria desfazer uma equipe ruim pela UI.
