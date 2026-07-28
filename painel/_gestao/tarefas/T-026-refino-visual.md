---
id: T-026
titulo: Refino visual — cronômetro ao vivo, layout de página e integridade do CSS
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-024, T-025]
areas: [web/src/lib/, web/src/App.tsx, web/src/estilos.css]
tentativas: 0
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Passada de refino sobre a visualização aprovada nas T-024/T-025, com foco em deixar
sempre visível **o que está acontecendo agora** — e fechar buracos de integridade do CSS.

## Contexto
Pedido do usuário após aprovar as telas: *"dê uma refinada e revisada na integridade dos
visuais e melhore, deixando sempre muito visual e fácil de entender o que está ou foi
feito, inclusive nos agentes em tempo real trabalhando"*.

Auditoria feita SEM navegador (o orquestrador não tem um), cruzando as classes usadas nos
`.tsx` com as definidas no `estilos.css`. Isso pega bug invisível: classe aplicada no
markup que não estiliza nada.

## Critérios de aceite
- [x] Tempo decorrido da execução, ANDANDO na tela (segundo a segundo) enquanto o job roda.
- [x] Job terminado mostra quanto durou, sem timer ligado à toa.
- [x] Atividade da fábrica visível de QUALQUER tela (selo no menu).
- [x] Toda classe usada no markup existe no CSS (auditoria automatizada, zero órfãs).
- [x] `.pagina` deixa de ser um invólucro sem estilo.
- [x] Formatação de tempo testada, inclusive entrada inválida.
- [x] Documentos da fábrica (ANALISE/DECISOES/PROGRESSO) renderizados como conteúdo, não
      como markdown cru numa `<pre>`.
- [x] Documento longo colapsado, com o resto a um clique.
- [x] Telas VERIFICADAS visualmente (capturadas e olhadas).

## Notas de execução
**Furo próprio corrigido:** "há quanto tempo o job roda" era critério de aceite da T-024 e
**não tinha sido implementado** — a auditoria pegou. Era justamente o dado mais vivo da
tela de execução.

- `lib/formato.ts`: `duracaoLegivel` (escala a unidade: 5s / 2min 13s / 1h 04min) e
  `decorrido`. Entrada inválida devolve `—`/`null` em vez de "NaN" na tela.
- `lib/useAgora.ts`: relógio que avança de segundo em segundo. **Desliga quando o job
  termina** — um `setInterval` por job encerrado seria desperdício puro. Atualiza também
  no momento de ligar, senão o primeiro segundo mostra o valor do render anterior.
- Jobs: tempo aparece no bloco "quem trabalha agora" (`· há 2min 13s`) e nos metadados,
  com rótulo que muda conforme o estado ("Rodando há" / "Durou").
- `App.tsx`: selo com pulso no menu Jobs quando há execução ativa, com os títulos no
  tooltip. Sem isso, o painel parece parado a menos que você já esteja na aba certa.

**Integridade do CSS (auditoria cruzando .tsx × .css):** 3 classes eram aplicadas sem
existir no estilo — `.pagina`, `.marco` e `.bloco-id`.
- `.pagina` envolve TODAS as telas e não tinha estilo nenhum: cada página herdava só o
  padding do `.conteudo` e o ritmo vertical ficava por conta de cada seção. Agora
  centraliza com largura máxima e `gap` consistente. **Atenção:** `.secao`/`.intro` já
  trazem `margin-bottom`, que somaria ao `gap` — por isso o reset `.pagina > .secao`.
- `.marco` e `.bloco-id` eram markup morto: removidas do TSX.
- Auditoria re-executada ao final: **zero classes órfãs**.

## Verificação
`npm test`: **web 66/66** (+13: `tempo.test.ts` e `markdown.test.ts`) **+ servidor 209/209**; build e
`tsc --noEmit` limpos. Auditoria automatizada de classes: zero órfãs.

**VERIFICADO NO NAVEGADOR — pela primeira vez no projeto.** Criada
`ferramentas/captura.mjs`, que dirige o Edge já instalado via DevTools Protocol e gera PNG
que pode ser lido. Telas conferidas: home (dados reais, ações, projetos), página do projeto
(o que fazer agora, equipe, mapa, kanban, CI, documentos) e "como funciona".

**O que a captura revelou e não teria sido pego de outro jeito:** as seções Análise,
Decisões e Progresso eram PAREDES DE MARKDOWN CRU — `#`, `**`, `-` aparecendo como texto
literal numa `<pre>`. Exatamente o que o usuário reclamou ("não quero ficar lendo textos
extensos"), e nenhum teste pegaria: o texto estava lá, só ilegível. Daí o parser e o
colapso terem entrado nesta tarefa.

Pendente de conferida do usuário (opcional, já que agora eu vejo): o cronômetro ANDANDO
segundo a segundo — a captura é estática, então provei que o valor aparece, não que ele
avança.

## Revisão
Auto-revisão com evidência visual. `tsc --noEmit` limpo nos dois workspaces.
