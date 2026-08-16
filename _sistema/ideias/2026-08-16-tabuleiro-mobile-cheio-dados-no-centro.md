---
status: nova
projeto: banco-imobiliario
data: 2026-08-16
---

# Tabuleiro mobile em tela cheia + botão de rolar dados no centro

Ideia trazida pelo usuário (Enzo), em português, como veio:

> gostaria que o botao rolar os dados fosse no meio do tabuleiro e que o tabuleiro fque
> visivel no celular, atualmente as casinhas estão muito pequenininhas e horriveis de ver
> o seu nome e os valores de alugueis, deixe meio que em tela cheio para o celular, aumente
> o tamanho mas que caiba perfeitamente e deixo o rolar os dados no meio do tabuleiro. o
> usuário só deve rolar pra baixo caso queira ler aos detalhes

## Leitura

1. O botão "Rolar dados" (`#botao-rolar-dados`, hoje em `public/index.html` dentro do
   `painel-lateral`) deve se mover para o miolo do tabuleiro — que já tem uma área central
   (`.centro-dados-visual`, `atualizarCentro`/`animarCentroComDados` em
   `public/js/tabuleiro.js`, T-042) mostrando os cubos 3D e de quem é a vez. Hoje essa área
   é só visual; o clique continua vindo do botão no painel lateral, longe do tabuleiro.
2. No celular, o tabuleiro deve ocupar quase a tela inteira (visível de cara, sem precisar
   rolar), com casas GRANDES o bastante para ler nome da propriedade e valor de aluguel —
   hoje pequenas demais (achado que já apareceu antes: T-052, backlog, trata fonte de chips/
   badges, não o tamanho das casas em si). Precisa caber perfeitamente na viewport, não
   estourar.
3. Detalhes (painel de jogadores, propriedades, log) só aparecem ao rolar a página para
   baixo — o primeiro impacto na tela é o tabuleiro.

Este projeto já passou por uma fundação de mobile (T-034 fundação overlay ancorado, T-035
tabuleiro-mobile-fit, T-039 PWA lite, T-042 cubo 3D dos dados) — a ideia é evolução dessa
base, não do zero. Toca `public/index.html`, `public/js/app.js`, `public/js/tabuleiro.js`,
`public/css/tabuleiro.css`/`estilo.css`.
