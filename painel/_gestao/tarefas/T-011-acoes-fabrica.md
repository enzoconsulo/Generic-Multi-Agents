---
id: T-011
titulo: Endpoints das ações da fábrica — de botão a job Claude correto
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: [T-008]
areas: [servidor/src/acoes/, servidor/src/rotas/acoes.ts, servidor/test/acoes/]
tentativas: 0
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Transformar cada ação do catálogo em endpoint que valida os argumentos e cria o job
Claude certo: prompt com o comando da fábrica, cwd na raiz da fábrica, escopo de lock e
modelo corretos.

## Contexto
- Ações e seus jobs (prompt = o comando como o usuário digitaria no chat; o CLI expande
  `/comando` em modo headless):
  - `POST /api/acoes/trabalhar` `{ projeto? }` → prompt `/trabalhar <projeto>` (ou sem
    arg); lock `projeto:<nome>` quando escopado, `global` quando não.
  - `POST /api/acoes/status` `{ projeto? }` → `/status <projeto?>`; lock `global`
    (curto; simplicidade sobre otimização).
  - `POST /api/acoes/ideia` `{ texto }` → `/ideia <texto>`; lock `global`.
  - `POST /api/acoes/novo-projeto` `{ nome, descricao }` → `/novo-projeto <nome> —
    <descricao>`; lock `global`.
  - `POST /api/acoes/encerrar-dia` e `POST /api/acoes/manutencao` → sem args; lock
    `global`.
- TODOS com cwd = raiz da fábrica (é o que carrega CLAUDE.md raiz, agents, commands e
  settings — ver pesquisa §1). Modelo/maxTurns via config (T-008).
- Validações: texto/nome/descrição obrigatórios onde couber; nome de projeto
  kebab-case (`^[a-z0-9][a-z0-9-]*$`); `novo-projeto` recusa nome já existente em
  `projetos/` (409); `trabalhar`/`status` com projeto inexistente → 404.
- Atualizar `catalogo-acoes.ts` (T-004) para marcar `disponivel: true` e apontar o
  endpoint de cada ação — é a única edição fora de arquivos novos, e o arquivo já está
  livre (T-004 concluída antes, por dependência transitiva).
- Resposta de disparo: 202 com o job criado (id, estado) — a UI acompanha pelo SSE.
- Testes usam runner fake (inspecionam o job criado: prompt, cwd, lock); NENHUMA chamada
  real ao Claude no `npm test`.

## Critérios de aceite
- [ ] `POST /api/acoes/trabalhar {"projeto":"painel-fabrica"}` → 202 e job com prompt
      `/trabalhar painel-fabrica`, cwd = raiz da fábrica e lock `projeto:painel-fabrica`
      (teste com runner fake).
- [ ] `POST /api/acoes/trabalhar {}` → job com lock `global`.
- [ ] `POST /api/acoes/ideia` sem texto → 400 com mensagem PT-BR; com texto → job com
      prompt `/ideia <texto>`.
- [ ] `POST /api/acoes/novo-projeto` com nome inválido → 400; com nome de projeto
      existente → 409; válido → job criado.
- [ ] As 6 ações globais aparecem em `GET /api/fabrica` com `disponivel: true` e cada
      uma tem endpoint funcional (teste percorre o catálogo).
- [ ] `npm test` passa sem rede/login.

## Notas de execução

### Construção direta pelo orquestrador (2026-07-21, Opus)
`servidor/src/acoes/acoes.ts` (traduz ação→job claude: prompt `/<id> <args>`, cwd = raiz
da fábrica, escopo de lock global ou projeto:<nome> conforme DECISOES.md) +
`servidor/src/rotas/acoes.ts` (POST /api/acoes/:id, valida modelo contra a lista, 404
ação inexistente, 503 sem runner). Catálogo passou a `disponivel: true`; `/api/fabrica`
agora expõe `modelos` e `modeloPadrao` (default econômico `sonnet`). Inputs pendentes
(T-010) ainda não implementados — permissionMode bypass local.

**Verificação:** 6 testes unitários (`acoes.test.ts`) + 5 de rota (`acoes-rota.test.ts`)
+ **ao vivo**: POST /api/acoes/status disparou o fluxo real que concluiu com sucesso.

## Verificação
(formal dispensada por custo; testes + disparo real comprovados.)

## Revisão
(formal dispensada por custo — construção direta.)

