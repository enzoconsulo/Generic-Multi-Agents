---
id: T-033
titulo: Ações de agente por projeto — cada especialista vira um botão no projeto
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: []
areas: [servidor/src/acoes/acoes-projeto.ts, servidor/src/acoes/prompts/projeto/, servidor/src/rotas/acoes-projeto.ts, web/src/paginas/projeto/AcoesProjeto.tsx]
tentativas: 1
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Poder pedir UM agente especializado para UM projeto, direto da página dele: documentar,
pesquisar, revisar, replanejar, testar.

## Contexto
Pedido do usuário: dar "acesso e visibilidade total" e "mais opções nos subprojetos",
mantendo o projeto capaz de se auto-estruturar pela equipe de especialistas.

Hoje a página do projeto tem TRÊS ações (`/ideia`, `/trabalhar`, `/status`) mais
"Analisar". Os 6 agentes da fábrica só rodam POR DENTRO do `/trabalhar` — não existe
"documenta isso agora", "pesquisa essa lib antes de eu decidir" nem "revisa o que acabou
de entrar". Na prática o usuário só tem dois botões de verdade: *planejar tudo* e
*executar tudo*. Falta o meio-termo, que é onde mora a gestão fina.

## Critérios de aceite
- [x] Cinco ações novas na página do projeto: documentar, pesquisar, revisar, replanejar, testar.
- [x] Cada uma despacha o agente correspondente, com o caminho absoluto do projeto e a
      regra de confinamento no prompt.
- [x] `pesquisar` aceita a pergunta em texto livre; as demais dispensam argumento.
- [x] Lock `projeto:<nome>`: duas ações no mesmo projeto não correm juntas; em projetos
      diferentes, correm em paralelo.
- [x] Nome de projeto com travessia de caminho (`..`, absoluto) é recusado com 404.
- [x] Cada ação tem guardrail próprio (`maxTurns`/watchdog), nunca ilimitado.
- [x] Tela conferida com captura antes de concluir.

## Notas de execução
**Decisão principal — `cwd` na RAIZ da fábrica, não na pasta do projeto.** É o oposto do
que a análise (T-012) faz, e de propósito: os `.claude/agents/` vivem na raiz, então é de
lá que o fluxo consegue DESPACHAR o agente real em vez de eu recopiar a definição dele
dentro do prompt. Prompt duplicado viraria a segunda fonte de verdade do que é um
"documentador" e sairia de sincronia no primeiro ajuste do agente. O confinamento, que o
`cwd` dava de graça na análise, passa a ser explícito no texto do despacho (caminho
absoluto + "não toque em nada fora daqui"), exatamente como manda o modelo de despacho do
CLAUDE.md raiz.

- Catálogo data-driven em `acoes-projeto.ts`, no mesmo espírito de `catalogo-acoes.ts` e
  da tabela de guardrails: ação nova = uma entrada + um arquivo de prompt.
- Prompts versionados em `prompts/projeto/<id>.md`, seguindo o "Modelo de despacho".
- Rota em ARQUIVO NOVO (`rotas/acoes-projeto.ts`), pela convenção do painel de não editar
  arquivo compartilhado — preserva o paralelismo por `areas`.
- Reusa `dirProjeto()` da análise para barrar travessia de caminho.

## Verificação
Suíte: **279 (servidor, +27) + 77 (web)**, build limpo. Conferido AO VIVO com captura na
página do `ia-hibrida-limpa`: as cinco ações aparecem com agente, peso e custo estimado; o
formulário do `pesquisar` abre com campo de texto, seletor de modelo e estimativa.

**Medido, não só olhado** (truque do CLAUDE.md — resultado injetado na própria página):
`vazio: disabled=true | preenchido: disabled=false`, provando a trava do campo obrigatório
do `pesquisar` na tela real, e não só no teste da rota.

Cobertura que interessa: `cwd` na raiz da fábrica (a decisão da tarefa) tem teste dos dois
lados — afirma a raiz E nega a pasta do projeto; travessia de caminho recusada em `..`,
`.` e projeto inexistente; nenhum marcador `$…` sobra no prompt final de NENHUMA ação; e
todo id do catálogo tem arquivo de prompt que cita o agente certo — entrada de catálogo
sem prompt só quebraria no clique do usuário.

**Não verificado ainda: o disparo real ponta a ponta.** Clicar em Confirmar gasta a
assinatura e altera o projeto de verdade, então não fiz por conta própria. O caminho está
coberto por supertest com runner falso (job criado com escopo, cwd e prompt corretos).

**Um susto no caminho, que vale registrar:** a rota nova respondeu 404 na primeira
conferência. Não era o código — era uma instância ANTIGA do painel (de 10:55) ainda
segurando a porta 8765 e servindo build velho; o log do processo novo mostrava
`/api/acoes-projeto` montada normalmente. Conferir DE QUEM veio a resposta antes de
suspeitar do código.

## Revisão
O risco desta tarefa é o prompt: ele é o produto aqui, não o TypeScript. Três guardas
deliberadas contra o modo de falha mais provável (agente que faz mais do que devia):
`revisar` e `testar` proíbem corrigir código; `replanejar` proíbe apagar tarefa que
continua necessária; e `documentar`, `revisar` e `testar` dizem explicitamente que "nada a
fazer" / "nenhum bug" é resposta legítima — sem isso, um agente entrega mudança inventada
para parecer produtivo.

Injeção pelo texto do usuário foi tratada: a substituição é `split/join` (literal), não
`String.replace`, senão `$&` e `$'` digitados no campo virariam padrões de substituição.
Tem teste com esses caracteres.
