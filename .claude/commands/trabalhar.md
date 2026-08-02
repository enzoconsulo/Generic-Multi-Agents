---
description: Loop principal da fábrica - executa o pipeline completo (construtor → verificador → revisor, na trilha de cada projeto) em todas as tarefas prontas, sem intervenção
argument-hint: "[nome-do-projeto] (vazio = todos os projetos)"
---

Rodar a fábrica. Escopo: $ARGUMENTS (se vazio, todos os projetos em `projetos/`).

Você é o orquestrador (regras no CLAUDE.md raiz; transições em
`_sistema/PROTOCOLO_TAREFAS.md`). Este é o modo totalmente autônomo: NÃO pare para
perguntar nada ao usuário até o fim — decisões são suas, registradas nos arquivos.
Trabalhe até esgotar as tarefas ou tudo estar bloqueado.

## Preparação

1. Leia o log mais recente de `_sistema/logs/` (contexto do que vinha acontecendo).
2. Escaneie os frontmatters de `projetos/*/_gestao/tarefas/*.md` no escopo — um único
   Grep em modo content de `^(status|prioridade|dependencias|areas|agente|verificacao):`,
   sem ler os arquivos inteiros; leia por completo apenas o que for despachar. Leia também
   o PLANO.md dos projetos ativos (fases e linhas `Marco:`) — é a base para detectar
   marcos de fase — e **`_gestao/equipe.json` de cada projeto ativo**, que traz as DUAS
   coisas que roteiam tudo: o campo `dominio` (qual trilha) e os especialistas (quem
   despachar nas tarefas com `agente:`).

   **Fixe a trilha de cada projeto antes do loop** (CLAUDE.md, "As duas trilhas"):
   `dominio` ausente, `software`, ou sem `equipe.json` → `executor` / `testador` /
   `revisor`. Qualquer outro valor → `construtor` / `conferente` / `revisor-generico`.
   Trilha errada desperdiça o ciclo inteiro: o `testador` num projeto de apresentação vai
   tentar subir um servidor que não existe.
3. **Saneamento** (sobras de sessão anterior, sem agente rodando): `em-teste`/`em-revisao`
   NÃO regridem — a etapa anterior está commitada/registrada; apenas despache
   testador/revisor no loop normal. `em-execucao` volta para `pronta` — exceto se as
   Notas de execução registrarem trabalho parcial consistente; aí mantenha o status e
   despache o executor para continuar de onde parou.
4. Promova `backlog → pronta` onde todas as dependências estão `concluida`.
5. **Regenere o MAPA de cada projeto no escopo**, numa chamada só:
   `node _sistema/ferramentas/mapa.mjs projetos/<nome>`. É determinístico, sem custo de
   modelo, milissegundos. Os construtores regeneram ao commitar, mas isto é a rede de
   segurança: mapa desatualizado desorienta TODOS os agentes do projeto, e é por ele que
   eles evitam varrer o código — a maior linha de custo da fábrica
   (`_sistema/CUSTO_DE_CONTEXTO.md`). Commite junto com a gestão no encerramento.

## Loop principal (repita até não haver tarefa `pronta` nem pipeline em andamento)

1. **Selecione até 3 tarefas `pronta`** independentes entre si: prioridade `alta`
   primeiro; entre iguais, a que destrava mais dependentes. Mesmo projeto na mesma
   leva: só com `areas` disjuntas.

   **Antes de despachar, cheque o TAMANHO.** Tarefa com **5 ou mais `areas`** não vai para
   o construtor: despache o `planejador` em modo replanejamento para quebrá-la, e só então
   siga com as partes. O custo de um agente cresce com o QUADRADO das idas ao modelo —
   medido nesta fábrica: 2 `areas` ≈ 22 chamadas de ferramenta, 5 `areas` ≈ 70, o que sai
   ~10× mais caro. Uma única tarefa de 5 `areas` (T-006 do `banco-imobiliario`) consumiu
   **47% de um job inteiro**.

   A conta fecha a favor de quebrar: o despacho do planejador custa ~US$ 0,30–0,50 e
   economiza ~US$ 1 na tarefa. Com 4 `areas`, siga — mas não junte outra tarefa grande na
   mesma leva.
2. **Despache um construtor por tarefa** (em paralelo quando a regra acima permitir).
   Qual construtor — **resolução determinística em 3 passos** (CLAUDE.md, "Equipe do
   projeto"), sem adivinhação. Tarefa com `agente: <id>` presente no `equipe.json`:

   1. despache o subagente **`<id>`**;
   2. não existe → **`<projeto>__<id>`** (nome qualificado, usado quando o mesmo id aparece
      em mais de um projeto injetado);
   3. também não existe → você está fora do painel (no chat interativo o SDK não injeta
      equipe). **Não caia no genérico em silêncio:** despache o `executor`/`construtor`
      genérico da trilha com o prompt do especialista COLADO no despacho —
      `Contexto extra: você atua como <nome>. <prompt do equipe.json>`. O prompt do
      especialista é curto de propósito (delega a disciplina ao executor/construtor), então
      colar custa pouco — e é isto que faz a equipe valer nos dois caminhos de disparo.

   Sem `agente:` → genérico da trilha. Com `agente:` que não consta no `equipe.json` →
   genérico **e anote no log**: é defeito de planejamento que só aparece se alguém
   escrever.

   O prompt de despacho é o mesmo para especialista e genérico: caminho absoluto do
   projeto, ID da tarefa e, em retrabalho, aviso de que há relatório de reprovação a
   atender. Todos seguem a MESMA disciplina (protocolo, verificar o que tocou, commitar,
   registrar Notas). **Ao retorno de CADA agente**, confirme por busca que o status no
   frontmatter confere com o relatório dele antes do próximo despacho; divergência →
   corrija você mesmo conforme o protocolo e anote no log.

   **Retrabalho sobe de modelo (protocolo, regra 12):** tarefa com `tentativas >= 1` vai
   para o construtor REFORÇADO, pelos mesmos 3 passos com `-reforcado` no fim do nome
   (`<id>-reforcado`, `<projeto>__<id>-reforcado`, ou
   `executor-reforcado`/`construtor-reforcado` com o prompt colado). Uma reprovação é prova
   de que o modelo atual não deu conta; repetir a aposta gasta o ciclo inteiro de novo.
   Disparo já em `opus`/`fable`: não há para onde subir, siga com o normal. **Com
   `tentativas >= 2` sob o MESMO especialista**, troque para o reforçado genérico da trilha
   e registre a troca — duas reprovações sob o mesmo prompt de domínio dizem que a
   especialização está enviesando o ataque.
3. **Quando um construtor terminar:** despache o verificador da trilha — `testador`
   (software) ou `conferente` (genérica) —, respeitando a regra de projeto quieto (nenhum
   construtor/verificador ativo no MESMO projeto; enquanto não der, siga com outras tarefas
   e despache assim que o projeto liberar). Pulo de verificação (tarefa trivial, sem nada
   executável nem artefato gerado): registre a decisão e mande direto ao revisor. Aprovou →
   despache o revisor da trilha (`revisor` ou `revisor-generico`; pode rodar em paralelo com
   qualquer agente). Reprovou → volta ao construtor.

   **Trilha genérica — olhe a linha `Graus de prova:`** da Verificação. Se a tarefa passou
   majoritariamente como `[julgado]`, ela foi aprovada por opinião, não por execução:
   registre isso no log e trate como sinal de critério no degrau errado (candidato a
   replanejamento), não como tarefa verificada.
4. **Revisor aprovou** (conformidade `cumpre` e sem achado relevante) → tarefa `concluida`;
   promova dependentes que ficaram livres. Reprovou → volta ao construtor. **Repare no motivo
   antes de redespachar:** reprovação por *conformidade* (o entregue não é o que foi pedido)
   pede que o executor refaça a partir do Objetivo, não que remende o que já existe — diga
   isso no despacho. Conformidade `cumpre-parcial` aprovada com pendência registrada: decida
   se a sobra vira tarefa nova e anote no log. **Marco de fase:** todas as tarefas da fase `concluida`
   e a linha `Marco:` ainda `pendente` no PLANO.md → despache o verificador da trilha
   (`testador` ou `conferente`) em modo marco (meta da fase de ponta a ponta, também sob
   projeto quieto) e registre o resultado na linha `Marco:` (aprovado/reprovado + data).
   Reprovado: causa raiz única e óbvia → crie você a tarefa corretiva pelo template;
   múltiplas causas ou abordagem em dúvida → o planejador da trilha cria as correções (uma
   por causa raiz).
5. **Controle de ciclos:** tarefa reprovada com `tentativas >= 3` → marque `bloqueada` e
   escreva o motivo consolidado no arquivo. Depois, **autocorreção** (uma vez por
   linhagem): sem `replanejada-de` no frontmatter → despache o planejador da trilha
   (`planejador` ou `planejador-generico`) em modo replanejamento; com `replanejada-de` →
   fica `bloqueada` para o usuário.
6. Entre levas, re-escaneie e mantenha o pipeline cheio (novas `pronta` entram na fila).
   **Checkpoint:** registre no log do dia 1 linha por tarefa concluída/bloqueada assim
   que acontecer — queda de sessão não pode perder histórico.

## Encerramento da sessão de trabalho

1. Projetos com 3+ tarefas concluídas nesta sessão → despache o `documentador`.
2. Consolide `_sistema/logs/AAAA-MM-DD.md` (os checkpoints já estão lá): resumo,
   bloqueadas com motivo, decisões relevantes, estado em que o pipeline parou.
3. **Commits de gestão:** em cada projeto tocado, commite as pendências de `_gestao/`
   (`chore: gestão AAAA-MM-DD`). Se arquivos da fábrica (`_sistema/`, `.claude/`)
   mudaram, commite também a raiz.

## Relatório final ao usuário

Placar por projeto (concluídas / em andamento / bloqueadas), destaques do que foi
construído, bloqueios que precisam dele, e o que a próxima rodada de `/trabalhar` fará.
