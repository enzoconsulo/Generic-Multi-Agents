---
status: roteada
data: 2026-08-09
projeto: banco-imobiliario
---

Roteada em 2026-08-09 pelo planejador: virou a Fase 5 do PLANO.md de
`projetos/banco-imobiliario/` ("Animações de jogabilidade — dados e peão"), tarefas
T-031 (base de animação, `pronta`), T-032 (integração dos dados, `backlog`, depende de
T-031) e T-033 (integração do peão + fila de estados concorrentes, `backlog`, depende de
T-031 e T-032). Detalhes e decisões técnicas em
`projetos/banco-imobiliario/_gestao/DECISOES.md` (entrada 2026-08-09, "Fase 5 criada").

# Ideia — animações de dados e movimento do peão

Origem: usuário, 2026-08-09.

Melhorar drasticamente as animações do jogo — atualmente é praticamente uma cópia do
Business Tour mas as animações estão feias/simples. Ao "rolar os dados", o peão apenas se
teleporta para a casa final: não há animação de dados sendo rolados (sorteio visível) nem
animação do peão andando casa por casa até o destino.

Pedido específico:
1. Animação de rolagem dos dados nítida e clara, mostrando o sorteio acontecendo (dados
   "rodando" visualmente antes de assentar no resultado — pode se inspirar em animações
   conhecidas de dados 3D/rolagem da internet).
2. Animação do peão andando casa a casa (não teleporte) até a casa final, com transição
   clean, bonita, bem organizada e clara para os jogadores acompanharem o que está
   acontecendo.

Contexto: a Fase 4 (polimento visual premium, referência Business Tour) já foi aprovada
(marco 2026-08-09), mas as animações de dados/movimento continuam abaixo do nível visual
do resto do tabuleiro já refeito nessa fase.
