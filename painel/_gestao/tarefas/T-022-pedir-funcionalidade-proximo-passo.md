---
id: T-022
titulo: Pedir funcionalidade pela UI e "próximo passo sugerido" na página do projeto
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: [T-016]
areas: [web/src/paginas/projeto/]
tentativas: 0
criada: 2026-07-27
atualizada: 2026-07-27
---

## Objetivo
Fechar o beco sem saída em que o usuário caiu no primeiro uso real: importar um projeto e
não ter absolutamente nada a fazer na tela, sem explicação.

## Contexto
Relato do usuário: importou `ia-hibrida-limpa`, mandou "trabalhar", e não havia tarefa
nenhuma — "não ficou nada claro o que estava sendo feito, muito menos o que estava sendo
implementado". E a dúvida central: **"se eu quiser PEDIR uma funcionalidade em vez de
deixar 100% por conta própria, como faço?"**

Diagnóstico no disco (`projetos/ia-hibrida-limpa/_gestao/`):
```
ANALISE.md ✓   DECISOES.md ✓   PROGRESSO.md ✓
tarefas/ VAZIA ✗    PLANO.md ausente ✗    equipe.json ausente ✗
```
**A importação (T-013) analisa mas NÃO planeja.** Sem tarefas, o `/trabalhar` não tem o
que fazer — correto, porém mudo. E sem `equipe.json`, nenhum especialista é criado, então
o recurso mais interessante da fábrica ficava invisível justamente no primeiro contato.

A ponte que faltava já existia no sistema: a ação `/ideia` chama o planejador. Ela só
nunca esteve na página do projeto — a T-016 tinha colocado só Trabalhar e Status.

**Modelo mental que a tela não comunicava:** a autonomia da fábrica é na EXECUÇÃO, não na
decisão do que fazer. `/ideia` = você dirige o que entra; `/trabalhar` = a fábrica executa
sozinha o que já está planejado.

## Critérios de aceite
- [x] Ação "Pedir funcionalidade" (`/ideia`) na página do projeto, com campo de texto
      livre e o projeto já embutido no argumento.
- [x] Bloco "O que fazer agora" no topo, com sugestão calculada do estado REAL do projeto.
- [x] O caso do usuário (projeto sem tarefas) sugere pedir funcionalidade e explica.
- [x] Bloqueio de tarefa NÃO sugere botão (nenhum resolve — espera decisão humana).
- [x] Tarefa "em andamento" sem job rodando é reconhecida como execução interrompida.
- [x] Cada cartão de ação diz em uma linha o que a ação faz (antes só tinha o comando).
- [x] O CTA do "próximo passo" abre a ação certa e rola até ela.

## Notas de execução
- `web/src/paginas/projeto/proximo-passo.ts`: função PURA `proximoPasso(projeto, jobAtivo)`
  com a máquina de estados, em ordem de prioridade — job rodando > sem tarefas >
  bloqueada > presa em andamento > fila > tudo concluído. Pura de propósito: sugestão
  errada é pior que nenhuma, então cada caso tem teste (9 no total).
  - Decisão: **bloqueada não recebe botão**. Nenhuma ação da fábrica resolve um bloqueio —
    ele espera uma decisão do usuário; oferecer "Trabalhar" ali seria empurrar o usuário
    para um ciclo que vai falhar de novo.
  - "Em andamento sem job rodando" vira aviso de execução interrompida (com `/trabalhar`
    como saída, que sana e retoma) em vez de fingir que está tudo bem.
- `AcoesProjeto.tsx` reescrito: 3 ações (Pedir funcionalidade / Trabalhar / Status), cada
  uma com um resumo em linguagem de usuário. O cartão de `/ideia` ganhou `textarea` e monta
  o argumento como `no <projeto>, <texto>`. Recebe agora o `ProjetoDetalhe` inteiro (antes
  só o nome) para poder calcular o próximo passo.

## Verificação
`npm test`: **web 23/23** (+9 de `proximo-passo.test.ts`) **+ servidor 209/209**;
`npm run build` limpo; `tsc --noEmit` limpo nos dois workspaces.
**Não verificado:** a tela renderizada (sem navegador no ambiente) — a lógica é testada
caso a caso, o visual não.

## Revisão
Pulada (decisão de custo geral do painel).
