---
id: T-029
titulo: Resumão do commit e commitar pelo painel, com o histórico dentro de caixa que abre
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-028]
areas: [servidor/src/fabrica/git.ts, servidor/src/rotas/git.ts, web/src/componentes/GrafoGit.tsx, web/src/estilos.css, ferramentas/captura.mjs]
tentativas: 1
criada: 2026-07-28
atualizada: 2026-07-28
---

## Objetivo
Clicar num commit e ver o que ele mexeu; ver o que ainda não foi commitado e commitar
pela web, sem terminal.

## Contexto
A T-028 desenhou o histórico, mas ele era só leitura passiva: cada commit era uma linha
de texto, e o que estava PENDENTE não aparecia em lugar nenhum. Faltavam as duas pontas
do ciclo — olhar para trás (o que aquele commit mudou) e fechar o ciclo (commitar o que
está solto).

Também virou a primeira caixa recolhível do painel: o grafo ocupava a home inteira e
empurrava a lista de projetos para fora da tela.

## Critérios de aceite
- [x] Clique num commit abre o "resumão": arquivos tocados, linhas +/−, barra de proporção
      e o corpo da mensagem.
- [x] Lista das alterações pendentes, com situação legível (modificado/novo/apagado/…).
- [x] Botão de commit: `git add -A` + `git commit` com a mensagem digitada. **Sem push.**
- [x] Erros explicados em PT-BR: mensagem vazia (400), nada a commitar (409), pasta sem
      git (409), git sem identidade configurada (409, com o comando pronto).
- [x] Histórico dentro de caixa que abre ao clicar — fechada não busca nada.
- [x] Vale para os projetos e para o repositório da própria fábrica (`_fabrica`).

## Notas de execução
- `fabrica/git.ts` deixou de ser somente-leitura: `commitar()` é a **única escrita** do
  módulo. `lerDetalheCommit` sai de `git show --numstat` — instantâneo, sem custo de
  assinatura (o resumão NÃO chama modelo nenhum).
- **Hash validado contra `/^[0-9a-f]{7,40}$/`.** `execFile` já blinda contra shell, mas
  não contra o git interpretar o argumento como FLAG: `--upload-pack=<comando>` viraria
  execução. Validar o formato fecha isso — tem teste.
- Mensagem do commit vai por `execFile` em array de argumentos: aspas, `;`, `&` e quebra
  de linha entram literais. Tem teste com todos eles juntos.
- `captura.mjs` ganhou `--js`/`--pos-espera`: roda uma expressão na página antes do
  retrato. **Foi o que tornou esta tarefa verificável** — tudo aqui só existe depois de um
  clique, e até agora só dava para ver o estado inicial de cada tela. Tem teto de 15s
  (promessa que nunca resolve deixaria a captura pendurada para sempre).

## Verificação
Suíte: **229 (servidor) + 77 (web)**, build limpo. Servidor subido e conferido AO VIVO
contra o repositório real da fábrica, com captura de tela em cada estado:

1. Caixa fechada → aberta (home e página de projeto), branch e contagem de pendências.
2. Resumão de um commit real (`d7a6b3f`): 13 arquivos, +689 −3, corpo e lista por arquivo.
3. Formulário de commit com os 8 arquivos pendentes listados.
4. `POST /api/git/_fabrica/commit` executado de verdade — este commit foi feito PELO
   PAINEL, não por linha de comando. É a prova de ponta a ponta da única escrita.

**3 defeitos achados OLHANDO, que a suíte não pegaria** (todos corrigidos e re-capturados):
- **O resumão abria fora da tela.** Ele nasce abaixo da lista inteira (crescer um item
  desalinharia o SVG); com 40 commits, clicar no primeiro abria um painel a ~2200px dali —
  clicava e "não acontecia nada". Corrigido com `scrollIntoView`, e **medido na página**:
  `scrollY 0 → 1632`, `resumao.top=616` num viewport de 760 (`VISIVEL=true`).
- Botão de commit esticava de ponta a ponta (coluna flex) e, desabilitado, virava uma
  faixa cinza que não parecia botão.
- `"novo (não versionado)"` quebrava em duas linhas e desalinhava a lista. A situação
  agora é UMA palavra; o código cru do porcelain foi para o `title`.

## Revisão
Escrita no git é o ponto sensível — coberto por 8 testes de rota (incluindo 404 de
projeto inexistente, 400 sem mensagem, 409 sem nada a commitar) e 12 de unidade contra
repositórios de verdade em pasta temporária. Sem push, por decisão: publicar é do dono
do repositório.
