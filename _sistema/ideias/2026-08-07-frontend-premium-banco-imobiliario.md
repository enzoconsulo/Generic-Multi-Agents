---
status: roteada
data: 2026-08-07
projeto: banco-imobiliario
roteada-para: [T-023, T-024, T-025, T-026, T-027, T-028, T-029]
---

# Frontend precisa ficar num nível profissional/premium

O frontend do banco-imobiliario (HTML/CSS/JS vanilla, sem framework — decisão registrada
em `_gestao/DECISOES.md`), entregue pelas tarefas T-006/T-018/T-019/T-020/T-021, não está
bom. Palavras do usuário:

> "eu coloquei para o github cli terminar o frontend mas nao sei se gostei muito do
> resultado, o frontend em si nao está realmente bom, esta muito simples cheio de bugs e
> horrivelmente feio e sem detalhes, deve ser impecavel e extremamente clean e limpo quase
> que literalmente uma copia de business tour um jogo de banco imobiliario tem esboços da
> cidades detalhes ao extremo no frontend e muito bonito e detalhado com bonequinhos,
> preço de aluguel claro e bem informado, preço de compra e etc. melhore a parte do
> frontend ao extremo deixando realmente profissional"

Pedido, traduzido em requisitos:
- Qualidade visual extrema: limpo, clean, sem bugs visuais, acabamento profissional.
- Referência direta: o jogo **Business Tour** (banco imobiliário digital) — tabuleiro com
  esboços/ilustrações de cidades, riqueza de detalhe visual, peões/personagens
  ("bonequinhos") ilustrados em vez de formas simples.
- Informação de preço clara e bem visível: preço de compra E preço de aluguel de cada
  propriedade sempre legíveis (no tabuleiro e/ou no painel de propriedades).
- Isso é retrabalho/refinamento visual de UI já existente, não feature nova de regra de
  jogo — domínio continua o `frontend` do `equipe.json` do projeto.

## Roteamento (2026-08-07)

Planejador despachado, trilha software. Criou Fase 4 — Polimento visual premium
(T-023..T-029) em `_gestao/PLANO.md`, com `agente: frontend` em todas. T-023 (sistema
visual base) promovida a `pronta`; as demais dependem dela.

**Achado durante o planejamento, fora do escopo original mas relevante:** T-020 e T-021
estavam marcadas `concluida` sem implementação real — `painel-propriedades.js`,
`log-eventos.js`, `fim-de-jogo.js` são stubs vazios (`export function render(estado) {}`),
`trocas.js` nem existe. O commit que marcou como concluída (`1005d80`, "T-019/T-020/T-021:
marcar como concluida") tem co-autor "Copilot" — não passou pelo pipeline
executor/testador/revisor da fábrica. É provavelmente o mesmo uso do GitHub CLI que o
usuário mencionou. Por isso T-025, T-026 e T-027 (novas) pedem a funcionalidade REAL, não
só acabamento visual — ver `_gestao/DECISOES.md` do projeto para o detalhe completo.
Commit da gestão: `d2ea237`.
