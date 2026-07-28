---
id: T-036
titulo: Visibilidade de gestão do projeto — histórico, bloqueios e dependências
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-033]
areas: [web/src/paginas/projeto/SecaoGestao.tsx, web/src/paginas/projeto/Projeto.tsx]
tentativas: 1
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Responder, na própria página do projeto: o que já rodou aqui, o que está travado, e o que
destrava o quê.

## Contexto
O histórico de execução é global (aba Jobs, todos os projetos misturados) e as
`dependencias` das tarefas já chegam na API mas não aparecem em lugar nenhum da tela. O
kanban mostra que uma tarefa está `bloqueada`, e não POR QUÊ nem o que falta concluir para
soltá-la. Sem isso, decidir o próximo passo exige abrir arquivo de tarefa à mão — que é
exatamente o que o painel existe para evitar.

## Critérios de aceite
- [x] Histórico dos jobs DESTE projeto, com estado, custo e duração.
- [x] Tarefas bloqueadas em destaque, com o motivo registrado.
- [x] Dependências legíveis nos dois sentidos: o que esta tarefa espera e o que espera por ela.
- [x] Tarefa pronta para promover (dependências todas concluídas) sinalizada.

## Notas de execução
Os dados já existem: `dependencias` vem no `ProjetoDetalhe` e o histórico sai do mesmo
canal SSE da aba Jobs, filtrado por `escopo === projeto:<nome>`. Esta tarefa é
majoritariamente FRONTEND — se aparecer necessidade de endpoint novo, desconfiar antes de
criar.

**Uma conexão SSE por página** (armadilha registrada no CLAUDE.md do painel): `Projeto.tsx`
já chama `useJobsAoVivo()` uma vez e passa o estado para baixo. A seção nova recebe por
prop; abrir uma segunda quebra a decisão de canal único.

## Verificação
Suíte: **300 (servidor) + 88 (web, +11)**, build limpo. Confirmou-se a previsão da tarefa:
**nenhum endpoint novo** — `dependencias` já vinha na API e o histórico saiu do mesmo SSE
da aba Jobs, filtrado por escopo. A seção recebe os jobs por prop, sem abrir uma segunda
conexão (decisão de canal único do projeto).

Conferido AO VIVO em duas passadas, e a segunda foi necessária:

1. **No projeto real** (`ia-hibrida-limpa`): o histórico aparece com os 6 jobs daquele
   projeto, estado e duração. Mas os blocos "Bloqueadas" e "Prontas para promover" vieram
   VAZIOS — e vazio pode ser tanto acerto quanto lógica quebrada. Conferi os frontmatters:
   nenhuma tarefa `bloqueada`, e toda tarefa de backlog depende de algo ainda não
   concluído (T-002 está `em-teste`). Ou seja, vazio CORRETO.
2. Como isso deixaria a UI dos outros três blocos entregue sem ninguém ter visto —
   a armadilha registrada neste projeto —, montei um projeto descartável em `projetos/`
   (criado e apagado; a pasta é ignorada pelo git da raiz) com os quatro casos. Todos
   renderizaram: dependência quebrada em vermelho (`T-005 espera por T-999`), bloqueada com
   `espera T-002`, e as duas promovíveis ordenadas por prioridade — com a `T-002` marcando
   "trava 1 tarefa". A `T-005`, de dependência quebrada, corretamente NÃO entrou em
   "prontas para promover".

## Revisão
A distinção que carrega esta tarefa é entre dependência **não concluída** e dependência
**inexistente**. A primeira é o plano funcionando; a segunda é erro de escrita no
frontmatter que nunca fecha sozinho. Juntar as duas em "bloqueado" esconderia a segunda
para sempre — por isso são campos separados, com teste, e a quebrada bloqueia a promoção
(promover assim enterraria o erro).

`jobsDoProjeto` cai para `criadoEm` quando o job nunca iniciou: ordenar só por
`iniciadoEm` jogaria os que falharam na fila para o fim da lista, que é exatamente onde
ninguém olha — e job que falhou é o que mais interessa ver.
