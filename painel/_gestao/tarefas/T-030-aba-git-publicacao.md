---
id: T-030
titulo: Aba Git — link do repositório na nuvem, commit e push por repositório
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: [T-029]
areas: [servidor/src/fabrica/publicacao.ts, servidor/src/rotas/publicacao.ts, web/src/paginas/git/, web/src/componentes/PainelCommit.tsx, web/src/App.tsx]
tentativas: 1
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Uma aba onde cada repositório da fábrica — a raiz e cada subprojeto — mostra seu link na
nuvem, deixa esse link ser configurado pela web, e permite commitar e publicar (push).

## Contexto
Pedido do usuário. O desenho já existente é uma **bifurcação**: a raiz é um repositório
(sistema + painel) e cada `projetos/<nome>` é um repositório INDEPENDENTE, com remoto
próprio — a raiz nem versiona `projetos/` (está no `.gitignore`). O que faltava era
enxergar e operar isso de um lugar só, em vez de abrir terminal em cada pasta.

A T-029 já deu commit pela web; falta a outra metade (o remoto e o push).

## Critérios de aceite
- [x] Aba "Git" listando TODOS os repositórios: a fábrica e cada subprojeto.
- [x] Por repositório: branch, link do remoto, pendências e quantos commits não publicados.
- [x] Link do remoto configurável pela web (colar URL do GitHub e salvar).
- [x] Botão de publicar (push), com a primeira publicação criando o upstream (`-u`).
- [x] URL de remoto validada — `ext::<comando>` é execução de comando pelo git.
- [x] Push nunca pendura o servidor esperando senha; falha com mensagem em PT-BR.

## Notas de execução
- Módulo NOVO `fabrica/publicacao.ts`, separado de `git.ts` de propósito: lá é o
  repositório local (histórico, commit), aqui é tudo que ATRAVESSA a rede.
- **Validação de URL é lista de PERMISSÃO (https / git@ / ssh://), não lista de
  proibições.** O motivo é `ext::<comando>`: é uma URL que o git aceita e que faz ele
  EXECUTAR o comando ao buscar/publicar — execução remota disfarçada de endereço.
  Também barra `file://` (publicar para dentro da própria máquina sem querer) e valor
  começando com `-` (o git leria como flag).
- **Ordem das mensagens importa.** `ext::sh -c ...` tem espaço; com a regra de espaço
  antes, o usuário levava "não pode conter espaços" para um endereço que na verdade é
  execução de comando. Diagnóstico errado ensina errado — específico vem antes de
  genérico. Isso foi pego por um teste que falhou, não por leitura.
- **Push com ambiente à prova de travamento**: `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS`
  vazio e `ssh -o BatchMode=yes`. Sem isso, um push que precise de senha fica esperando
  uma resposta que nunca vem e **pendura o servidor do painel junto**. Mais teto de 2 min.
- Saída crua do git vai num campo `detalhe` separado da mensagem (mensagem é para o
  usuário; `detalhe` é diagnóstico) — o `ErroApi` do front passou a carregá-lo.
- **Sem pull, sem merge, sem force.** Histórico divergente volta como erro explicado
  ("rode `git pull --rebase`"), não como resolução automática: sobrescrever histórico é
  irreversível e não é decisão do painel.
- `PainelCommit` saiu do `GrafoGit.tsx` para componente próprio e passou a buscar as
  próprias pendências. Dois lugares mostram o formulário agora; duplicar significaria
  corrigir bug em dois lugares.

## Verificação
Suíte: **243 (servidor, +14) + 77 (web)**, build limpo. O push é testado DE VERDADE
contra um repositório `--bare` em pasta temporária (remoto git legítimo, sem rede):
primeira publicação cria upstream, o commit chega do outro lado, o segundo push leva só
o commit novo.

Conferido AO VIVO com captura de tela, contra os repositórios reais:
- lista mostrando a fábrica (`master`, remoto do GitHub, "publicado — em dia") e o
  `ia-hibrida-limpa` (`master`, "sem endereço", 5 commits nunca publicados);
- formulário de endereço aberto, com placeholder e aviso;
- home conferida depois da refatoração do `PainelCommit` — sem regressão.
- **Push real pelo painel**: `POST /api/repos/_fabrica/push` publicou esta tarefa no
  GitHub. É a prova de ponta a ponta contra remoto de verdade, não bare local.

**1 defeito achado OLHANDO:** os botões "Publicar" ficavam AZUIS quando desabilitados —
`.botao:disabled` só baixa a opacidade, e azul a 55% ainda parece azul. Dois botões com
cara de clicáveis que não fazem nada. Corrigido para todo botão de ação do painel, não
só os da aba Git.

## Revisão
O ponto sensível é a escrita que atravessa a rede. Coberto por 14 testes (10 de unidade
+ 4 de rota), incluindo a recusa do `ext::` verificada pela MENSAGEM, não só pelo fato de
recusar — o que garante que a recusa acontece pelo motivo certo.

Pendência conhecida, fora do escopo desta tarefa: `projetos/ia-hibrida-limpa` **não tem
`.gitignore`**. Publicar esse projeto sem um é risco de arrastar arquivo indesejado no
`git add -A`.
