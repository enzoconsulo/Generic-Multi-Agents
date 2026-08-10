---
status: roteada
data: 2026-08-10
projeto: banco-imobiliario
---

## Pedido original do usuário (literal)

> misericordia cara eu te pedi um design profissional e fluido e voce me fez (pelo menos
> em teoria) animações de andar e de rodar dados que gastei varios ciclos para no fim nao
> ter feito bosta nenhuma, uns detalhinhos bobos que teria implementado em 1 pedido no
> console, quero que arrume essa porra desse visual, sei la, se preciso se disponha a usar
> react.js qualquer coisa, quero um design profissional, uma animação de jogando os dados,
> movimentação do peao em vez de simplesmente o peao teletransportar e aparecer uma
> mensagem gigante na tela, o jogo está um lixo, muito feio nada é claro, não está
> organizado, mal da pra perceber as ações e o que acontece nas jogadas e pra piorar o
> formato está uma bosta no celular, ao cair em uma casa perde-se toda a visao do jogo e do
> tabuleiro, o log esta um lixo o tabuleiro está mal posicionado e com formato não-aparente.
> arrume isso e faça praticamente um app mobile nativo web para iphone e que caiba em
> qualquer celular junto com isso deve ter visibilidade notavel e clara para todas as
> jogadas com visao ampla de todo o jogo em tudo que é feito. e obviamente o que ja tinha
> te pedido que voce tem as tasks prontas mas na verdade nao tem nada. quero ver a ação dos
> peoes antes mesmo de simplesmente jogar a porra do lugar que caiu do nada na tela e
> perguntar se quero comprar

## Queixas concretas (decompor em critérios objetivos, não subjetivos)

1. Animações de dados/peão (Fase 5, T-031/T-032/T-033) foram dadas como `concluida` com
   evidência real (screenshots de múltiplos frames, revisão de código linha a linha) e o
   Marco da Fase 5 foi **aprovado em 2026-08-10** — mas o usuário relata não ter percebido
   NADA. Ver seção "O que já verifiquei" abaixo antes de assumir que é só falta de
   implementação — a causa mais provável, dado o resto da queixa, é mismatch
   mobile/viewport, não ausência de código.
2. Peão deve se mover pelas casas (já implementado em desktop, T-033) — validar
   especificamente em viewport mobile/iPhone.
3. Dado deve ter animação de "rolando" antes do resultado (já implementado em desktop,
   T-032) — validar em mobile.
4. A ação do peão (chegar na casa) deve ser visível ANTES de qualquer modal de decisão
   ("quer comprar?") aparecer — hoje a modal parece surgir "do nada" na percepção do
   usuário.
5. Mensagens/modais GIGANTES tomam a tela inteira e escondem o tabuleiro ao cair numa
   casa — o usuário perde a visão do jogo completamente. Isso é o oposto do que foi pedido.
6. Visão ampla e constante do tabuleiro deve se manter durante qualquer interação (decisão,
   compra, evento) — nunca cobrir o jogo inteiro.
7. Toda jogada/ação precisa ter feedback visual claro e perceptível.
8. Log de eventos está confuso/mal organizado.
9. Tabuleiro está mal posicionado, formato pouco claro/reconhecível.
10. **Mobile está quebrado** — "uma bosta no celular". Pedido explícito: comportamento
    "praticamente de app nativo web para iPhone", funcionando em qualquer tamanho de tela
    de celular (PWA / viewport mobile-first / safe-area / touch).
11. Visual geral deve ser "profissional e fluido". Usuário AUTORIZA explicitamente
    reconsiderar a decisão de stack "sem framework/sem build" (DECISOES.md 2026-07-30) e
    introduzir React (ou equivalente) se for o que resolve de verdade — ele mesmo sugeriu
    isso porque acha que ajustes que deveriam ser triviais não estão saindo.

## O que já verifiquei antes de rotear (para o planejador não repetir a investigação)

- `equipe.json` do projeto NÃO tem campo `dominio` → trilha SOFTWARE (`planejador` normal).
- Este projeto já teve um caso CONFIRMADO de tarefa `concluida` sem implementação real
  (T-020/T-021, achado em 2026-08-07/08, DECISOES.md) — então o ceticismo do usuário é
  historicamente justificado nesse projeto especificamente.
- MAS a Fase 5 (animações) não é o mesmo caso: T-031/T-032/T-033 têm Notas de execução,
  Verificação com screenshots reais (`_gestao/evidencias/T-033-01...04*.png`), Conformidade
  e Revisão preenchidas com achados específicos de código (linha, função), e o Marco da
  Fase 5 foi aprovado hoje (2026-08-10) via pipeline autônomo. A verificação em si parece
  robusta (browser real via CDP, 2 jogadores reais via socket.io-client), mas rodou em
  **viewport desktop** — não há evidência nenhuma de teste em viewport mobile/iPhone em
  nenhuma das 3 tarefas da Fase 5, nem da Fase 4 (T-023-T-029).
- Hipótese mais provável para reconciliar "verificação rigorosa passou" com "usuário diz
  que não viu nada": o usuário testa principalmente no celular (toda a queixa é dominada
  por mobile), e ou (a) o layout mobile quebra a ponto da animação não ser perceptível/
  usável ali, ou (b) o modal gigante de decisão cobre a tela antes/durante a animação e a
  experiência inteira, na prática, se resume a "apareceu uma mensagem gigante perguntando
  se quero comprar" — que é literalmente a queixa final do usuário. **Se for isso, o
  defeito não é "a animação não existe", é "a animação nunca chega a ser vista antes do
  modal engolir a tela"** — encadeamento de UX, não ausência de feature.
- Decisão a favor de não usar libs de animação/framework foi tomada 2x (2026-07-30 stack;
  2026-08-09 animações) por doutrina de `_sistema/BIBLIOTECAS.md` (não introduzir
  dependência para o que cabe em poucas dezenas de linhas). O usuário agora está pedindo
  explicitamente para reabrir essa decisão se for o que resolve profissionalismo/fluidez
  visual e responsividade real — isto NÃO é uma ideia genérica de "usar React", é uma
  autorização condicional: só migrar se o planejador concluir que vanilla CSS/JS não
  sustenta o padrão pedido (o que é plausível dado o histórico de "detalhes triviais" não
  saindo do papel).

## Contexto de gestão

Tratar como retrabalho de prioridade ALTA na frente de UI/UX — não é feature nova
incremental, é correção de uma entrega que o usuário considera falha apesar do pipeline
interno registrar sucesso. Se o planejador decidir migrar a camada de apresentação
(ex. React), registrar a decisão em DECISOES.md com justificativa explícita (o que muda
em relação às duas decisões anteriores de "sem framework", e por quê desta vez é
diferente). Recomendo uma tarefa-fundação que resolve a base técnica (biblioteca/estado de
UI, breakpoints mobile reais, estrutura de layout que nunca esconde o tabuleiro) ANTES das
tarefas de comportamento específico — mesmo padrão que já funcionou nas Fases 4 e 5
(T-023/T-031 como fundação). E critérios de aceite que não repitam o padrão de falso
positivo: evidência visual específica de MOBILE (viewport iPhone real, ex. 390×844), não
só desktop.

## Roteamento (2026-08-10)

Hipótese validada por leitura direta do código (não refutada): `.modal-overlay` em
`public/css/modais.css` é `position: fixed; inset: 0` (cobre a tela inteira) e o grid do
tabuleiro (`public/css/tabuleiro.css`) usa `minmax(3.8rem, 1fr)` × 11 colunas, impondo
~670px de largura mínima — maior que qualquer iPhone. O sequenciamento JS de
animação→render (`public/js/app.js`) já está correto (refutado o receio de bug de
ordenação). Detalhe completo em `_gestao/DECISOES.md` do projeto, entrada
"2026-08-10 — Retrabalho UX/mobile: causa raiz identificada em código".

Decisão de stack: **mantida vanilla** (não migrar para React) — justificativa completa em
`_gestao/DECISOES.md`. Virou Fase 6 do PLANO.md (Marco: pendente), com as tarefas:
T-034 (fundação: overlay ancorado + breakpoint), T-035 (tabuleiro cabe no celular), T-036
(modais de decisão no novo padrão), T-037 (log de eventos), T-038 (auditoria das animações
em mobile), T-039 (manifest/app quase-nativo, independente), T-040 (painel de jogadores),
T-041 (painel de propriedades + trocas).

## Retomada (2026-08-10, mesma tarde — sessão anterior cortada pela cota antes de fechar)

O usuário reenviou o MESMO pedido pelo `/ideia` (texto quase idêntico) porque, do lado dele,
nada tinha mudado ainda — sinal correto: o roteamento acima ficou pronto em disco (Fase 6
completa, 8 tarefas escritas) mas **não commitado** na sessão anterior, e T-034/T-039 (sem
dependência) não tinham sido promovidas. Mais uma vez o mesmo padrão de "trabalho real,
cota cortou antes do fechamento" já visto no `/novo-projeto` de 30/07 e no `/trabalhar` de
01/08 (ver CLAUDE.md, regra 7).

**Retomado e fechado nesta sessão:**
- Commitado o que já existia em disco (Fase 6 inteira) e promovidas T-034/T-039 a `pronta`
  (`projetos/banco-imobiliario`, commit `4c90098`).
- Elemento NOVO do pedido, ainda não coberto antes: usuário pediu explicitamente um
  "projeto no github ou algo do tipo" para a animação de dados parecer rolando de verdade,
  natural, sem fundo. Despachado `pesquisador` — conclusão: nenhuma lib de dado 3D (ex.
  `@3d-dice/dice-box`) combina "viva" com "aceita forçar o resultado final" (requisito
  duro, servidor decide o valor); relatório completo em
  `projetos/banco-imobiliario/_gestao/pesquisas/2026-08-10-animacao-dados-referencia.md`,
  recomenda reimplementar como cubo CSS 3D real (técnica documentada, sem dependência
  nova). Integrado ao plano pelo `planejador`: **T-042** criada (cubo CSS 3D, substitui a
  troca de texto de T-031/T-032), T-038 passou a depender de T-042. Commit `5e05807`.
- Entrada de doutrina acrescentada a `_sistema/BIBLIOTECAS.md` (elemento 3D com resultado
  decidido pelo servidor → sem lib de física, cubo CSS calculado).

Status final: **roteada**, sem pendência de commit. Tarefas da Fase 6:
T-034, T-035, T-036, T-037, T-038, T-039, T-040, T-041, T-042 (`pronta`: T-034, T-039; as
demais aguardam dependência). Próximo passo é `/trabalhar banco-imobiliario` (fora do
escopo do `/ideia`) para essas tarefas saírem do papel.
