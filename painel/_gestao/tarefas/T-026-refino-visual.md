---
id: T-026
titulo: Refino visual — cronômetro ao vivo, layout de página e integridade do CSS
projeto: painel-fabrica
status: em-teste
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
`npm test`: **web 53/53** (+5 de `tempo.test.ts`) **+ servidor 209/209**; build e
`tsc --noEmit` limpos. Auditoria automatizada de classes: zero órfãs.

**NÃO VERIFICADO NO NAVEGADOR** — mesma limitação de sempre. O que pedir ao usuário para
conferir: o cronômetro andando durante uma execução, o selo verde no menu Jobs enquanto
algo roda, e se o espaçamento das páginas continua correto após o `.pagina` ganhar layout
(é a mudança com maior chance de efeito colateral visual).

## Revisão
Pendente da verificação acima.
