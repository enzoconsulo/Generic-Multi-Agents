---
id: T-031
titulo: Push-safe por projeto — conferência de segurança, git init e .gitignore
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: [T-030]
areas: [servidor/src/fabrica/seguranca.ts, servidor/src/fabrica/publicacao.ts, servidor/src/rotas/publicacao.ts, web/src/componentes/PublicacaoRepo.tsx, web/src/paginas/projeto/Projeto.tsx]
tentativas: 1
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
O ciclo completo de git — commitar, conferir, publicar — funcionando para CADA PROJETO no
seu próprio repositório, e não só para a raiz da fábrica.

## Contexto
Correção de alvo pedida pelo usuário: *"esse era o ponto central da task, não no projeto
principal em si"*. A T-030 nasceu genérica (a lista sempre incluiu os projetos), mas
faltavam três coisas para o ciclo fechar num projeto de verdade:

1. **A parte "push-safe" não existia.** A análise de dados sensíveis da sessão anterior
   foi feita por mim, no chat, à mão. O painel publicava sem conferir nada.
2. **Projeto sem repositório era beco sem saída** — a UI dizia "não é um repositório git"
   e não oferecia saída.
3. **Nada disso aparecia na página do projeto**, que é onde se olha um projeto. Repetia o
   erro da T-023: entregar longe de onde o usuário está.

E é no PROJETO que isso mais importa: é lá que mora código de verdade, com chave de API
por perto. A raiz da fábrica é quase só texto.

## Critérios de aceite
- [x] Varredura pré-publicação: chaves de provedor, arquivos sensíveis e `.gitignore`.
- [x] Vê as DUAS frentes: o que já está versionado e o que `git add -A` varreria.
- [x] Achado grave BARRA o push; publicar assim mesmo exige decisão explícita.
- [x] `git init` pela UI num projeto que ainda não é repositório.
- [x] Criar `.gitignore` adequado ao ecossistema detectado.
- [x] Seção de publicação na página do próprio projeto.

## Notas de execução
- `fabrica/seguranca.ts`: assinaturas de provedor (Anthropic, OpenAI, GitHub, AWS,
  Google, Slack, chave privada) + atribuição genérica com filtro de placeholder — é o
  que separa `CHAVES.env.example` (`FAL_KEY=sua_chave_fal_ai`) de um segredo real.
- **O relatório NUNCA repete o segredo encontrado**, só onde ele está. Um relatório de UI
  vira captura de tela, log e print no chat: repetir o valor espalharia o problema em vez
  de contê-lo. Tem teste que verifica isso.
- **A guarda mora em `publicar()`, não na rota.** Se estivesse na rota, publicar sem
  conferir dependeria de a UI ter lembrado de chamar a varredura antes.
- Achado grave separado por ONDE está: `já versionado` é pior que `entraria no próximo
  commit` — o primeiro já está no histórico, apagar o arquivo não resolve.
- Sem `.gitignore` é aviso (médio), não bloqueio: repositório só de texto passa bem.
- `criarGitignore` reusa `detectarEcossistema` e `PASTAS_IGNORADAS` — cravar regras de
  Node aqui repetiria o erro que já custou uma sessão (CI e importação presumindo Node).

## Correção no fechamento (mesma sessão, antes do commit)
`validarUrlRemoto` tinha os caracteres de controle **crus** no fonte (`[\s` + U+0000 até
U+001F + `]`) em vez de escapes. A semântica estava CERTA — o efeito era ferramental: um
byte NUL faz o git tratar o arquivo inteiro como **binário**, e `publicacao.ts` é
justamente o arquivo que atravessa a rede, o que mais precisa de diff revisável. Já tinha
entrado assim no commit da T-030. Trocado por `[\s\u0000-\u001F]`, com equivalência
provada em U+0000..U+2FFF (zero divergências) antes de gravar.
Coberto agora por teste: controle que **não** é espaço em branco (U+0001, ESC, NUL) era o
único pedaço do range sem asserção — havia teste de espaço e de hífen aceito, não de
controle. Servidor: **252**.

## Verificação
Suíte: **251 (servidor, +8) + 77 (web)**, build limpo. Conferido AO VIVO com captura:

- **Varredura no projeto real** (`ia-hibrida-limpa`): 15 arquivos, achou sozinha a falta
  de `.gitignore` — exatamente o risco que eu tinha apontado à mão na sessão anterior.
- **Varredura na fábrica**: 243 arquivos, **zero achados**. Bate com a análise manual —
  é a prova de que não é barulhento a ponto de ninguém olhar.
- **Bloqueio provado na tela**, com projeto descartável de segredo plantado (criado e
  apagado em `projetos/`, que é ignorado pelo git): borda vermelha, `GRAVE .env`, o selo
  "já versionado (está no histórico)", e a saída explícita "Entendi o risco" separada.
  O valor do segredo não aparece em lugar nenhum da tela.
- Seção "Publicação" conferida na página do próprio projeto.

## Revisão
O ponto sensível é o falso negativo (deixar passar) e o falso positivo (virar ruído). O
primeiro está coberto por testes de `.env` versionado, `.env` não versionado e chave
dentro de arquivo comum; o segundo, pelo teste de `.env.example` com placeholders e pela
varredura real da fábrica com zero achados.
