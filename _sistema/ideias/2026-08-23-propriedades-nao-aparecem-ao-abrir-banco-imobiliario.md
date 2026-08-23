---
status: roteada
data: 2026-08-23
projeto: banco-imobiliario
---

no banco-imobiliario, melhorou bastante o nosso ultimo topico de manter os icones na hora
de comprar, mas nao esta aparecendo as propriedades ja adiquiridas na hora de abrir,
mantanha tambem, igual fica marcado o peao

Roteada direto (correção pontual, causa raiz única) para T-060
(_gestao/tarefas/T-060-estado-completo-ao-entrar-reconectar.md), promovida a `pronta`.

Causa raiz: `sala:entrar`/`sala:reconectar` só devolvem a lista pública de jogadores, sem
`casas`/`turnoAtual`/`log` — por isso só os peões renderizam ao abrir/reconectar; o resto
do tabuleiro (dono das propriedades, construções, painel de propriedades) só aparece
depois da próxima jogada de alguém.
