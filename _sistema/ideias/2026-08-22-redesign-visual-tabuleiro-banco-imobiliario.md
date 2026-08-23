---
status: roteada
data: 2026-08-22
projeto: banco-imobiliario
tarefas: [T-056, T-057, T-058]
---

Pedido do usuário (Enzo), como veio:

"melhorou e ficou bom melhor mas ainda esta uma bosta, esta um lixo o painel principal
muito feito, sei la, arrume isso deixe bonito com contruções reais, o nome nitido das
ruas e das propriedades, nomes convincentes, modelos e peoes bonitos, literalmente igual
business tour em design, voce deve fazer desse jeito, profissional. A questao de acesso
pelo celular está muito boa e bonita, mas quando aparece uma propriedade pra comprar a
notificação para adiquirir a propriedade caga todo o design do tabuleiro. ele sobe e nao
consigo ver onde esta o peao. me ajude com isso e me ajude a solucionar para ficar em
pleno estado, se precisar escalar agentes especializados em outra area fique a vontade,
mas deve haver projetos como esse no github ou qualquer outro lugar para voce refinar o
visual."

Resumo para roteamento:
1. Redesign visual do tabuleiro principal (desktop) — hoje "feito"/genérico, precisa de
   acabamento profissional: construções com aparência real, nomes nítidos e convincentes
   de ruas/propriedades, peões/modelos com bom acabamento. Referência explícita do
   usuário: qualidade visual estilo "Business Tour".
2. Bug de UX mobile: modal/notificação de "comprar propriedade" empurra o layout do
   tabuleiro para cima, tirando o peão de vista. Precisa virar overlay/bottom-sheet que
   não desloca o board.
3. Usuário autoriza pesquisa web de referências visuais (Business Tour / Monopoly-like) e
   autoriza escalar para agentes especialistas.
