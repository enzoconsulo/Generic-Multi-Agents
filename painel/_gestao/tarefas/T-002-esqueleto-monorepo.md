---
id: T-002
titulo: Esqueleto do monorepo — servidor Express + SPA Vite dark, scripts e testes
projeto: painel-fabrica
status: concluida
prioridade: alta
dependencias: []
areas: [package.json, .gitignore, servidor/, web/]
tentativas: 2
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Monorepo npm workspaces funcionando de ponta a ponta: `servidor/` (Express 5 + TS
estrito) com healthcheck e `web/` (Vite + React + TS) com layout dark e navegação,
scripts unificados na raiz e Vitest rodando.

## Contexto
- Stack e convenções: ver `## Stack` e `## Convenções` do CLAUDE.md deste projeto e
  `_gestao/DECISOES.md` (2026-07-21). O SDK do Claude NÃO entra nesta tarefa.
- Porta do servidor: 8765, bind EXPLÍCITO em 127.0.0.1. Dev da web: Vite em 5173 com
  proxy de `/api` para 8765. Produção local: `vite build` gera `web/dist/` e o servidor
  serve os estáticos (fallback de SPA para rotas não-/api).
- Config em `servidor/src/config.ts`: raiz da fábrica = `resolve(<raiz do painel>, "..",
  "..")`, sobrescrevível por env `FABRICA_RAIZ`; porta e demais defaults centralizados.
- Criar o agregador dinâmico de rotas: `servidor/src/rotas/` onde cada arquivo exporta
  `{ prefixo, router }` e é carregado automaticamente — tarefas futuras adicionam
  arquivos sem editar código compartilhado. Incluir a rota `saude` como exemplo.
- Criar o esqueleto da SPA com react-router e páginas placeholder em
  `web/src/paginas/inicio/`, `web/src/paginas/projeto/` e `web/src/paginas/jobs/`
  (rotas `/`, `/projeto/:nome`, `/jobs`) + `web/src/lib/api.ts` (helper genérico de
  fetch com tratamento de erro) — para que as tarefas de UI só toquem a própria pasta.
- Dark mode via variáveis CSS num stylesheet global; título "Painel da Fábrica".
- Scripts na raiz: `dev` (servidor+web em paralelo), `dev:servidor`, `dev:web`, `build`,
  `start`, `test`, `teste:integracao` (placeholder que ainda não tem testes).

## Critérios de aceite
- [ ] `npm install` na raiz conclui sem erro.
- [ ] `npm run dev:servidor` sobe o servidor; `curl.exe http://127.0.0.1:8765/api/saude`
      responde 200 com JSON contendo `ok: true` e `fabricaRaiz` apontando para um
      caminho absoluto existente.
- [ ] O servidor está escutando apenas em 127.0.0.1 (verificável com
      `netstat -ano | findstr 8765` mostrando 127.0.0.1:8765, não 0.0.0.0).
- [ ] `npm run build` compila servidor (tsc sem erros, strict) e web (vite build) sem erro.
- [ ] Após o build, `npm start` serve a SPA em http://127.0.0.1:8765/ — página carrega
      com fundo escuro, título "Painel da Fábrica" e navegação para as 3 rotas
      placeholder (inclusive acessando /projeto/x direto pela URL — fallback SPA).
- [ ] `npm test` roda Vitest e passa com ao menos 1 teste real do servidor (ex.: rota
      saude via supertest).
- [ ] `.gitignore` cobre node_modules, dist e `dados/`.

## Notas de execução

### Ciclo 1 (2026-07-21, executor)

**O que foi feito:** monorepo npm workspaces completo (raiz + `servidor/` + `web/`),
funcionando de ponta a ponta em dev e produção local.

Arquivos criados:
- Raiz: `package.json` (workspaces, scripts `dev`, `dev:servidor`, `dev:web`, `build`,
  `start`, `test`, `teste:integracao` placeholder; devDep `concurrently` para o `dev`
  paralelo), `.gitignore` (node_modules, dist, dados/, *.log, .env), `package-lock.json`.
- `servidor/` (Express 5 + TS estrito, ESM/NodeNext):
  - `src/config.ts` — host 127.0.0.1, porta 8765 (env `PORTA` opcional), `raizPainel`
    resolvida da localização do módulo (funciona em src/ e dist/), `fabricaRaiz` =
    `resolve(raizPainel, "..", "..")` sobrescrevível por env `FABRICA_RAIZ`, `webDist`.
  - `src/agregador-rotas.ts` — lê `src/rotas/` em runtime, importa cada arquivo `.ts`/`.js`
    (ignora `.d.ts` e `.test.`) e monta `{ prefixo, router }` no app; arquivo sem o
    contrato é ignorado com aviso. Funciona sob tsx (dev), node dist (prod) e Vitest.
  - `src/rotas/saude.ts` — GET `/api/saude` → `{ ok: true, fabricaRaiz, fabricaRaizExiste }`.
  - `src/app.ts` — `criarApp()` assíncrono: json(), rotas dinâmicas, 404 JSON para `/api/*`
    desconhecido, estáticos de `web/dist` + fallback SPA (GET não-/api → index.html; só
    quando `web/dist` existe), error handler 500 JSON.
  - `src/index.ts` — bind explícito `app.listen(porta, "127.0.0.1")`.
  - `testes/saude.test.ts` — 2 testes com supertest (saúde 200 + 404 JSON de /api).
  - `tsconfig.json` (strict, NodeNext, ES2022), `vitest.config.ts`, `package.json`
    (dev = `tsx watch`, build = `tsc`, test = `vitest run`).
- `web/` (React 18 + Vite 6 + TS estrito):
  - `index.html` (lang pt-BR, título "Painel da Fábrica", color-scheme dark),
    `vite.config.ts` (porta 5173, proxy `/api` → 127.0.0.1:8765).
  - `src/main.tsx`, `src/App.tsx` (BrowserRouter; header com título + navegação NavLink
    para as 3 rotas; rota `*` = página não encontrada), `src/estilos.css` (dark via
    variáveis CSS globais).
  - Páginas placeholder: `src/paginas/inicio/Inicio.tsx` (`/`),
    `src/paginas/projeto/Projeto.tsx` (`/projeto/:nome`), `src/paginas/jobs/Jobs.tsx`
    (`/jobs`).
  - `src/lib/api.ts` — helper genérico `api<T>(caminho, init)` + classe `ErroApi`
    (mensagem do campo `erro` do backend ou padrão PT-BR).
  - `web/build` roda `tsc --noEmit && vite build` (TS estrito também na web).

**Como rodar/testar:**
- `npm install` na raiz; `npm run dev:servidor` (tsx watch) ou `npm run dev` (servidor+web);
  `npm run build` → `npm start` (serve SPA em http://127.0.0.1:8765); `npm test` (Vitest).

**Verificação executada de verdade (Windows 10 + PowerShell):**
- `npm install`: OK, 240 pacotes, 0 vulnerabilidades.
- `npm test`: 2/2 testes passando (servidor).
- `npm run dev:servidor` + `curl.exe http://127.0.0.1:8765/api/saude`: 200 JSON
  `{"ok":true,"fabricaRaiz":"C:\\Users\\enzoconsulo\\Documents\\Gerador_de_projetos","fabricaRaizExiste":true}`.
- `netstat -ano | findstr 8765`: `TCP 127.0.0.1:8765 ... LISTENING` (não 0.0.0.0).
- `npm run build`: tsc (servidor) e tsc --noEmit + vite build (web) sem erros.
- `npm start`: GET `/` 200 text/html (SPA), GET `/projeto/x` direto 200 com o index da
  SPA (fallback), asset CSS servido com as variáveis dark, `/api/inexistente` 404 JSON.
- Processos encerrados ao final; porta 8765 livre.

**Decisões menores (sem impacto arquitetural):** `concurrently` como devDep da raiz para
o script `dev` paralelo (padrão de mercado, leve); dev do servidor com `tsx watch`;
agregador de rotas em `src/agregador-rotas.ts` (a pasta `rotas/` contém SÓ rotas);
testes do servidor em `servidor/testes/` (fora de `src/` para o build não os incluir).

**Observações para próximas tarefas:** aviso do npm sobre `allow-scripts` no postinstall
do esbuild (política local de segurança do npm) — sem efeito prático: vite/vitest/tsx
funcionaram normalmente (binário vem do pacote opcional `@esbuild/win32-x64`).

**Commit:** `600c1d3be2dfa0e7c114cfec4f83ebb38170af98` — "T-002: esqueleto do monorepo
— Express 5 + SPA Vite dark, scripts e testes" (24 arquivos).

### Ciclo 2 (2026-07-21, executor — retrabalho da revisão)

**Achado 1 corrigido — `servidor/src/app.ts`:** o error handler final agora respeita
`erro.status`/`erro.statusCode` quando for inteiro na faixa 400–599 (default continua
500). 4xx responde mensagem PT-BR do cliente (400 "Requisição inválida (corpo
malformado)", 413, 415 mapeadas; genérica para o resto) e loga `console.warn`
`[erro-cliente]`; 5xx mantém "Erro interno do servidor" + `console.error`. Guarda
`res.headersSent` adicionada (resposta já iniciada → delega ao Express via `next`).

**Achado 2 corrigido — `web/src/lib/api.ts`:** headers normalizados com
`new Headers(init?.headers)` — os três formatos de HeadersInit (objeto simples,
instância `Headers`, array de pares) são preservados; defaults aplicados com
`has()`/`set()`, então o chamador sempre vence. Bônus (nota menor): `Content-Type:
application/json` não é mais forçado quando o body é FormData/URLSearchParams/Blob
(o fetch define o próprio tipo — preserva o boundary de multipart).

**Notas menores resolvidas no mesmo ciclo:**
- Fallback SPA espelha GET em HEAD (`res.sendFile` já omite o corpo em HEAD).
- `servidor/src/config.ts`: env `PORTA` inválida falha na subida com mensagem clara
  (`Env PORTA inválida: "abc". Use um inteiro entre 1 e 65535`); vazia = default 8765.
- `FABRICA_RAIZ` relativa agora é resolvida para absoluta (`resolve()`); vazia = default.
- Type-check dos testes do servidor: `servidor/tsconfig.json` virou o config de
  type-check (noEmit, inclui `src` + `testes` + `vitest.config.ts`) e o build usa o novo
  `servidor/tsconfig.build.json` (só `src`, emite em `dist`). `npm test -w servidor`
  roda `tsc --noEmit && vitest run` — erro de tipo em teste agora quebra o `npm test`.

**Testes novos cobrindo os 2 achados:**
- `servidor/testes/erros.test.ts` (3): 400 para JSON malformado (era 500), 413 para
  corpo acima do limite do express.json, servidor segue respondendo após erro de cliente.
- `web/testes/api.test.ts` (7): headers preservados nos 3 formatos, defaults e
  overrides, sem Content-Type para FormData/sem body, ErroApi com mensagem do backend
  e com mensagem padrão. Infra criada: devDep `vitest ^3.1.1` na web (Vitest nos dois
  lados já era a especificação), `web/vitest.config.ts` (environment node — api.ts não
  precisa de DOM), script `test` na web (o `npm test` da raiz pega automaticamente via
  `--workspaces --if-present`); `web/tsconfig.json` inclui `testes/` e
  `vitest.config.ts` (type-checados no `tsc --noEmit` do build da web).

**Executado de verdade (Windows 10 + PowerShell):**
- `npm install`: OK (up to date, 240 pacotes, 0 vulnerabilidades).
- `npm run test -w servidor`: tsc limpo + 5/5 testes. `npm run test -w web`: 7/7.
- `npm run build`: servidor e web sem erros.
- `npm start` (produção): POST `/api/saude` com `{invalido` → **400**
  `{"erro":"Requisição inválida (corpo malformado)"}` (antes: 500); corpo de 150 KB →
  **413**; GET `/api/saude` → 200 com raiz absoluta existente; **HEAD** `/projeto/x` →
  200 (antes: 404); GET `/projeto/x` → 200 text/html (fallback intacto);
  `/api/nao-existe` → 404 JSON; `netstat`: escuta só em 127.0.0.1:8765.
- Dev (`npm run dev:servidor` com tsx + tsconfig novo): saúde 200 e 400 no malformado.
- `PORTA=abc` → subida falha com a mensagem amigável; `FABRICA_RAIZ=..\..` →
  `/api/saude` devolve `C:\Users\enzoconsulo\Documents\Gerador_de_projetos` (absoluta).
- Todos os processos encerrados ao final; porta 8765 livre (netstat vazio).

**Commit:** `af772865d6856a078b303f85e570dae5cd590552` — "T-002: retrabalho ciclo 2 -
error handler respeita status 4xx e api.ts normaliza headers" (13 arquivos).

## Verificação

### Ciclo 1 (2026-07-21, testador)

Ambiente: Windows 10 + PowerShell. Verificação do zero: `node_modules` e os `dist` do
executor foram APAGADOS antes do install/build para testar o caminho de usuário novo.
Todos os processos foram encerrados ao final (porta 8765 livre, confirmado por
`Get-NetTCPConnection -LocalPort 8765` vazio).

**Placar: 7 PASSOU, 0 FALHOU.**

1. **`npm install` na raiz conclui sem erro — PASSOU.** Install limpo (node_modules
   apagado antes): `added 237 packages, and audited 240 packages in 43s ... found 0
   vulnerabilities`, exit 0. Aviso `npm warn allow-scripts` sobre postinstall do esbuild
   (política local do npm) é warning, não erro — vite/vitest/tsc/tsx funcionaram
   normalmente em todos os passos seguintes.

2. **`dev:servidor` + `/api/saude` — PASSOU.** `npm run dev:servidor` subiu (tsx watch);
   `curl.exe -s -i http://127.0.0.1:8765/api/saude` → `HTTP/1.1 200 OK`,
   `Content-Type: application/json`, corpo
   `{"ok":true,"fabricaRaiz":"C:\\Users\\enzoconsulo\\Documents\\Gerador_de_projetos","fabricaRaizExiste":true}`.
   Caminho absoluto e existente confirmado de forma independente:
   `Test-Path "C:\Users\enzoconsulo\Documents\Gerador_de_projetos"` → `True`.

3. **Escuta apenas em 127.0.0.1 — PASSOU.** `netstat -ano | findstr 8765` →
   `TCP 127.0.0.1:8765 0.0.0.0:0 LISTENING <pid>`; nenhuma linha `0.0.0.0:8765` ou
   `[::]:8765`. Verificado tanto no dev (tsx) quanto no `npm start` (node dist).

4. **`npm run build` — PASSOU.** Build do zero (dist apagados antes): `tsc` do servidor
   sem erros (strict), `tsc --noEmit && vite build` da web sem erros
   (`✓ 34 modules transformed`, `✓ built in 1.75s`), exit 0.

5. **`npm start` serve a SPA — PASSOU.** `GET /` → 200 `text/html` com
   `<title>Painel da Fábrica</title>` e `<meta name="color-scheme" content="dark">`.
   Fallback SPA: `GET /projeto/x` direto pela URL → 200 com o index.html da SPA; idem
   `GET /jobs`. Fundo escuro comprovado no CSS servido
   (`/assets/index-CPLefPe-.css`): `--cor-fundo: #0f1115` +
   `body{background-color:var(--cor-fundo)...}` + `color-scheme:dark`. Navegação para as
   3 rotas comprovada no bundle JS servido (contém "Painel da F...", "Início", "Jobs",
   "/projeto/", "Navega...", "Página não encontrada").

6. **`npm test` — PASSOU.** `Test Files 1 passed (1)`, `Tests 2 passed (2)`, exit 0 —
   2 testes reais do servidor via supertest (saúde 200 com caminho absoluto/existente +
   404 JSON de rota /api desconhecida).

7. **`.gitignore` cobre node_modules, dist e dados/ — PASSOU.**
   `git check-ignore -v` casou `node_modules` e `servidor/node_modules` (linha 2),
   `servidor/dist` e `web/dist` (linha 5) e `dados/jobs.json` (linha 8, padrão `dados/`).

**Além do caminho feliz (tudo OK):**
- `GET /api/rota-inexistente` → 404 JSON `{"erro":"Rota de API não encontrada"}` tanto
  em dev quanto em produção (não cai no fallback SPA).
- `POST /qualquer` em produção → 404 (fallback SPA corretamente restrito a GET).
- Path traversal em produção (`/../../package.json`, `%2e%2e%2f...`, `..%5c...` com
  `--path-as-is`) → sempre responde o index.html da SPA; nada do disco vaza.
- Env `FABRICA_RAIZ` apontando para caminho inexistente → servidor sobe com warning no
  log e `/api/saude` responde `{"ok":true,...,"fabricaRaizExiste":false}` sem quebrar.
- POST `/api/saude` com JSON malformado → resposta controlada em JSON e o servidor
  continua vivo (saúde respondendo 200 em seguida).

**Nota (não é reprovação — fora dos critérios; fica para o revisor julgar):** body JSON
malformado responde **500** `{"erro":"Erro interno do servidor"}` — o error handler de
`servidor/src/app.ts` ignora o status do erro do `express.json()` (SyntaxError com
status 400) e responde 500 fixo. O correto semanticamente seria 400.

### Ciclo 2 (2026-07-21, testador — retrabalho do commit af77286)

Ambiente: Windows 10 + PowerShell. Rodada COMPLETA dos 7 critérios originais (o código
compartilhado mudou no retrabalho) + verificação dirigida das correções do ciclo 2.
Builds refeitos do zero (`servidor/dist` e `web/dist` apagados antes do build). Todos os
processos encerrados ao final: `Get-NetTCPConnection -LocalPort 8765` (Listen) vazio e
zero processos node do painel restantes.

**Placar: 7 PASSOU, 0 FALHOU (critérios originais) + todas as correções do ciclo 2
confirmadas.**

Critérios originais:

1. **`npm install` — PASSOU.** `up to date, audited 240 packages ... found 0
   vulnerabilities`, exit 0 (warning `allow-scripts` do esbuild segue sendo política
   local do npm, não erro).
2. **`dev:servidor` + `/api/saude` — PASSOU.** `curl.exe -s -i
   http://127.0.0.1:8765/api/saude` → `HTTP/1.1 200 OK`, `application/json`, corpo
   `{"ok":true,"fabricaRaiz":"C:\\Users\\enzoconsulo\\Documents\\Gerador_de_projetos","fabricaRaizExiste":true}`;
   `Test-Path` do caminho → `True`.
3. **Escuta só em 127.0.0.1 — PASSOU.** `netstat -ano | findstr 8765` → apenas
   `TCP 127.0.0.1:8765 ... LISTENING` (dev e produção); nenhuma linha `0.0.0.0` ou `[::]`.
4. **`npm run build` — PASSOU.** Do zero (dists apagados): `tsc -p tsconfig.build.json`
   (servidor) e `tsc --noEmit && vite build` (web, `✓ 34 modules transformed`), exit 0.
5. **`npm start` serve a SPA — PASSOU.** `GET /` → 200 text/html com
   `<title>Painel da Fábrica</title>`; CSS servido contém `--cor-fundo:#0f1115` (dark);
   bundle JS contém `/projeto/`, `/jobs` e "Início" (navegação das 3 rotas);
   `GET /projeto/x` e `GET /jobs` DIRETO pela URL → 200 text/html (fallback SPA).
6. **`npm test` — PASSOU.** Suíte completa da raiz: servidor `tsc --noEmit` limpo +
   5/5 testes (saude 2 + erros 3, supertest real); web 7/7 (api.test.ts); exit 0.
7. **`.gitignore` — PASSOU.** `git check-ignore -v`: `node_modules` e
   `servidor/node_modules` (linha 2), `servidor/dist` e `web/dist` (linha 5),
   `dados/jobs.json` (linha 8).

Correções do ciclo 2 (verificação dirigida, executadas de verdade):

- **Achado 1 (error handler) — CORRIGIDO.** POST `/api/saude` com `{invalido` →
  **400** `{"erro":"Requisição inválida (corpo malformado)"}` em dev E produção (antes
  500); corpo de 150 KB → **413**; `Content-Type: application/json; charset=latin-1` →
  **415** `{"erro":"Tipo de conteúdo não suportado"}`; após os erros, `GET /api/saude`
  segue 200 (servidor vivo). Logs mostram `[erro-cliente] 400/413` (não `console.error`).
- **Achado 2 (headers do api.ts) — CORRIGIDO.** 7/7 testes reais em
  `web/testes/api.test.ts` cobrindo os três formatos de HeadersInit (instância
  `Headers`, array de pares sem header numérico, objeto simples com override vencendo
  default), defaults sem headers, sem Content-Type para FormData/sem body e ErroApi
  (mensagem do backend + padrão PT-BR). Código confere: `new Headers(init?.headers)` +
  `has()`/`set()`.
- **`PORTA` inválida — CORRIGIDO.** `PORTA=abc node servidor/dist/index.js` → falha na
  subida com `Error: Env PORTA inválida: "abc". Use um inteiro entre 1 e 65535 (padrão:
  8765).`, exit 1; borda `PORTA=0` também falha (fora da faixa).
- **`FABRICA_RAIZ` relativa — CORRIGIDO.** `FABRICA_RAIZ='..\..'` (cwd = raiz do
  painel) → `/api/saude` devolve `C:\Users\enzoconsulo\Documents\Gerador_de_projetos`
  absoluta com `fabricaRaizExiste:true`.
- **Type-check dos testes — CORRIGIDO (prova adversarial).** Arquivo temporário
  `servidor/testes/tmp-verificacao-typecheck.test.ts` com erro de tipo proposital →
  `npm run test -w servidor` FALHOU com `error TS2322: Type 'string' is not assignable
  to type 'number'`, exit 2 (antes do retrabalho, testes ficavam fora do type-check).
  Arquivo temporário apagado em seguida.
- **HEAD espelha GET — CORRIGIDO.** `HEAD /projeto/x` em produção → 200 (antes 404).
- **Guarda `res.headersSent`** conferida por inspeção de `servidor/src/app.ts:57`
  (padrão Express correto: `if (res.headersSent) return next(erro)`); não é acionável
  externamente de forma determinística — sem teste dinâmico.

Além do caminho feliz (regressões baratas re-checadas em produção): `/api/nao-existe` →
404 JSON `{"erro":"Rota de API não encontrada"}`; `POST /qualquer` → 404 (fallback
restrito a GET/HEAD); path traversal `--path-as-is /../../package.json` e variante
percent-encoded → 200 text/html do index da SPA (nada do disco vaza).

Arquivos auxiliares do testador removidos (teste temporário de type-check e corpo de
150 KB em `$env:TEMP`); porta 8765 livre e árvore limpa ao final.

## Revisão

### Ciclo 1 (2026-07-21, revisor)

**Veredito: REPROVADA — 2 achados `importante`.** Diff inteiro do commit `600c1d3`
lido (24 arquivos); foco em correção, segurança e integração do código compartilhado
(agregador, app, config, helper de API), que pela convenção do projeto as próximas
tarefas NÃO editam — defeito aqui se multiplica pelas 18 tarefas seguintes.

**Achados que reprovam:**

1. `[importante]` **servidor/src/app.ts:35-38** — o error handler final ignora o status
   do erro e responde **500 fixo**. `express.json()` gera erros de CLIENTE com
   `status`/`statusCode` já preenchidos (400 `entity.parse.failed`, 413 payload grande,
   415 charset não suportado) e todos viram `500 {"erro":"Erro interno do servidor"}`.
   Cenário concreto: `curl.exe -X POST http://127.0.0.1:8765/api/saude -H
   "Content-Type: application/json" -d "{invalido"` → 500 em vez de 400 (confirmado
   pelo testador). Consequências: a UI (via `ErroApi`) mostra "Erro interno do
   servidor" para erro de entrada do usuário; qualquer lógica retry-on-5xx (padrão em
   fetch com retry) re-tenta para sempre um pedido inválido; log polui `console.error`
   com falha "do servidor" que é do cliente. Correção esperada: usar
   `erro.status`/`erro.statusCode` quando estiver na faixa 4xx (mantendo 500 como
   default) — e este é o ÚNICO caminho de erro compartilhado do backend inteiro.

2. `[importante]` **web/src/lib/api.ts:23-27** — a montagem de headers faz spread de
   `init?.headers` como se fosse sempre objeto simples, mas o tipo
   `RequestInit["headers"]` (HeadersInit) também aceita `Headers` e
   `[string, string][]`. Spread de instância `Headers` produz `{}` (nenhuma
   propriedade própria enumerável) → **headers do chamador silenciosamente
   descartados**; spread de array produz chaves numéricas → header de nome `"0"`.
   Cenário concreto: `api("/api/jobs", { method: "POST", body,
   headers: new Headers({ "X-Qualquer": "v" }) })` compila sem erro, roda sem erro e
   nunca envia o header. Helper genérico usado por todas as tarefas de UI futuras;
   falha silenciosa é o pior modo. Correção esperada: normalizar com
   `new Headers(init?.headers)` e aplicar defaults com `headers.has(...)`/`headers.set(...)`.

**Notas menores (NÃO reprovam — corrigir se barato no mesmo ciclo):**

- `servidor/src/app.ts:35` — error handler sem guarda `res.headersSent`: erro após o
  início do streaming da resposta (ex.: falha no meio de `sendFile`) tenta reescrever
  headers e gera erro secundário `ERR_HTTP_HEADERS_SENT`; o padrão Express é
  `if (res.headersSent) return next(erro)`.
- `servidor/src/app.ts:24-27` — fallback SPA só para GET: `HEAD /projeto/x` responde
  404 enquanto `GET /projeto/x` responde 200 (HEAD deveria espelhar GET). Impacto
  baixo em painel local.
- `web/src/lib/api.ts:25` — `Content-Type: application/json` forçado para QUALQUER
  `body !== undefined`: um body `FormData` sem override quebraria o boundary do
  multipart. Footgun documentável para tarefas futuras.
- `servidor/src/config.ts:16` — `PORTA` inválida vira `NaN` e `app.listen(NaN)` falha
  com RangeError sem mensagem amigável (falha barulhenta na subida; aceitável).
- `servidor/src/config.ts:11` — `FABRICA_RAIZ` relativa não é resolvida para absoluta
  (comportamento passa a depender do cwd); um `resolve()` no valor da env blindaria.
- `servidor/testes/` fica fora do type-check (`tsconfig include: ["src"]` e Vitest
  transpila sem checar tipos): erro de tipo em teste passa despercebido.

### Ciclo 2 (2026-07-21, revisor)

**Aprovado sem ressalvas.** Diff inteiro do commit `af77286` lido (13 arquivos) e os
arquivos tocados abertos na íntegra (`app.ts`, `config.ts`, `api.ts`, tsconfigs,
packages, testes novos). Os 2 achados `importante` do ciclo 1 e as 6 notas menores
foram corrigidos exatamente como esperado, sem defeito novo introduzido.

**O que foi verificado:**

- **Achado 1 (error handler, `servidor/src/app.ts`):** `statusDoErro` valida tipo
  (`typeof === "number"`), inteiro e faixa 400–599 antes de usar
  `erro.status`/`erro.statusCode`; qualquer outra coisa (string, float, 2xx, ausente)
  cai no default 500 — robusto contra erros arbitrários. 4xx responde mensagem PT-BR
  fixa (`MENSAGENS_4XX` + fallback "Erro na requisição"); `erro.message` vai só para o
  console local (`console.warn`), nunca para o cliente — sem vazamento de detalhe
  interno. 5xx preserva o comportamento anterior (`console.error` + mensagem genérica).
  Guarda `res.headersSent → next(erro)` é o padrão Express correto. O handler continua
  sendo o último middleware; a ordem rotas → 404 `/api` → estáticos → fallback SPA →
  error handler está intacta.
- **Achado 2 (`web/src/lib/api.ts`):** `new Headers(init?.headers)` normaliza os três
  formatos de HeadersInit; defaults com `has()`/`set()` (chamador sempre vence);
  `{ ...init, headers }` põe `headers` depois do spread, então a versão normalizada
  prevalece sobre `init.headers`. `corpoDefineProprioContentType` cobre
  FormData/URLSearchParams/Blob. Tratamento de erro (`ErroApi`) inalterado e correto.
- **Notas menores do ciclo 1:** fallback SPA agora aceita GET e HEAD (`sendFile` omite
  corpo em HEAD); `portaDaEnv` valida inteiro 1–65535 com mensagem clara e trata env
  vazia como default; `FABRICA_RAIZ` passa por `resolve()` (relativa vira absoluta,
  vazia = default via truthiness); split de tsconfigs correto — `tsconfig.json`
  (noEmit, inclui `src` + `testes` + `vitest.config.ts`) para type-check e
  `tsconfig.build.json` (`include: ["src"]` sobrescreve o herdado — testes NÃO vazam
  para `dist/`; `rootDir: src` mantém o layout `dist/index.js` que o `npm start` da
  raiz espera).
- **Código novo:** `servidor/testes/erros.test.ts` (3 testes reais via supertest, cobrem
  400/413/servidor-vivo) e `web/testes/api.test.ts` (7 testes; `vi.stubGlobal` com
  `unstubAllGlobals` no afterEach — sem vazamento de mock entre testes) estão corretos.
  `web/vitest.config.ts` em environment node é adequado (Node 22+ tem
  Headers/FormData/Response globais; engines da raiz exige >=22). Integração dos
  scripts: `test` da web é `vitest run` (não-watch) e entra no `npm test` da raiz via
  `--workspaces --if-present`; `package-lock.json` coerente com o novo devDep.

**Notas menores (não reprovam; opcionais para tarefas futuras):**

- `servidor/src/app.ts:12` — `erro.status ?? erro.statusCode`: se um erro trouxer
  `status` inválido (ex.: string) E `statusCode` numérico válido, o `??` não cai para o
  `statusCode` e responde 500. Sem cenário real hoje (body-parser define os dois campos
  coerentes); o default 500 é seguro.
- `web/src/lib/api.ts:37` — `body: null` explícito ainda recebe
  `Content-Type: application/json` (`null !== undefined`). Comportamento herdado do
  ciclo 1, inofensivo; um `!= null` resolveria se algum dia incomodar. agregador dinâmico (filtros `.d.ts`/`.test.`/
`.map`, contrato `{ prefixo, router }` com aviso, funcionamento em src/ e dist/ via
`import.meta.url`); ordem de montagem rotas → 404 `/api` JSON → estáticos → fallback
SPA → error handler (rota `/api` desconhecida nunca cai no fallback; `app.use("/api")`
não captura `/api-outro`); bind explícito 127.0.0.1; path traversal coberto pelo
`express.static` (testado pelo testador); `config.ts` correto em dev e dist; scripts da
raiz coerentes com workspaces; `.gitignore` cobre o exigido; SPA (rotas, NavLink, 404,
`useParams`, dark via variáveis CSS) sem defeitos; testes de `saude.test.ts` reais.

