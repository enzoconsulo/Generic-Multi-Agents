---
status: roteada
data: 2026-08-23
projeto: banco-imobiliario
tarefas: [T-061, T-062, T-063, T-064, T-065, T-066, T-067, T-068, T-069]
---

Pedido do usuário (Enzo), como veio:

"os icones ainda estao bem pequenos e acho que daria sim para fazer uma forma de deixar
tudo convincentemente bem estruturado e encaixado, mesmo na tela dos iphones, talvez
aumentar pro lado e deixar mais claro de quem é a propriedade, atualmente a marcação
tambem está sumindo ao sugerir uma compra quando abre o balao. deve ter um timer tambem
pra pessoa efetuar a ação e deve tambem dar os passos mais devagar e claros, tambem se
possivel coloque avatares para cada players em vez de um pino feio igual esta agora.
deixa tudo muito bem visivel e facil, atualmente as ações não estao claras e o jogo em si
com o que cada um tambem nao estao. use sua criatividade e exemplos na web de business
tour"

Resumo para roteamento (pedido multi-frente, não trivial — vários itens de escopo próprio):
1. Ícones/peões pequenos e mal encaixados no mobile (iPhone) — aumentar tamanho e
   reestruturar o layout do tabuleiro para caber melhor (inclusive expandindo para os
   lados).
2. Deixar mais claro visualmente de quem é cada propriedade (indicação de dono).
3. Bug: a marcação/peão do jogador some quando abre o balão de sugestão de compra
   (possível recorrência ou variante do bug já corrigido nas T-057/T-059 — investigar se é
   o mesmo ponto ou um caso novo, ex. z-index/overlay do balão de compra especificamente).
4. Adicionar timer visível para o jogador tomar a decisão de compra.
5. Tornar o fluxo de turno/ação mais devagar e em passos explícitos e claros (steps).
6. Trocar o peão genérico por avatares por jogador.
7. Deixar as ações possíveis e o estado geral do jogo (de quem é a vez, o que cada um pode
   fazer) muito mais visíveis/legíveis.
8. Usuário autoriza uso de criatividade e referências visuais de apps tipo Business
   Tour/Monopoly (mesma autorização já dada na ideia de 2026-08-22).
