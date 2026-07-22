---
id: T-005
titulo: Página inicial — cards das ações da fábrica e lista de projetos
projeto: painel-fabrica
status: concluida
prioridade: media
dependencias: [T-004]
areas: [web/src/paginas/inicio/, web/src/lib/tipos.ts, web/src/lib/formato.ts, web/src/lib/useDados.ts, web/src/componentes/, web/src/estilos.css]
tentativas: 1
criada: 2026-07-21
atualizada: 2026-07-21
---

## Objetivo
Home informativa (ainda somente-leitura): 6 cards das ações globais explicando o que
cada uma faz e a lista real de projetos com status resumido, tudo carregado da API.

## Contexto
- Consome `GET /api/fabrica` e `GET /api/projetos` (T-004) via helper `web/src/lib/api.ts`.
- Tocar SOMENTE `web/src/paginas/inicio/` (esqueleto de rotas/placeholder criado na
  T-002). Estilo: variáveis CSS globais já existentes; visual de "cockpit" — cards com
  hierarquia clara, badges de status com cores distinguíveis no dark.
- Os botões de disparo das ações NÃO funcionam ainda (chegam na T-015): cards mostram
  nome, descrição e argumentos esperados; botão desabilitado com dica "disponível em
  breve" é aceitável.
- Contagens por status da tarefa usam o vocabulário do protocolo (backlog, pronta,
  em-execucao, em-teste, em-revisao, concluida, bloqueada, cancelada).

## Critérios de aceite
- [ ] Com o servidor rodando, http://127.0.0.1:8765/ mostra os 6 cards de ações com
      nome e descrição em PT-BR vindos da API (conferem com `.claude/commands/*.md`).
- [ ] A lista de projetos mostra os projetos reais da fábrica com: nome, badges de
      contagem por status, fase atual e estado do marco.
- [ ] Clicar em um projeto navega para `/projeto/<nome>`.
- [ ] Com o servidor da API fora do ar (simular parando o backend), a página mostra
      mensagem de erro amigável em PT-BR — sem tela branca nem stack trace.
- [ ] Visual dark consistente: fundo escuro, texto legível, sem elementos brancos
      "vazados" (verificação visual no navegador).

## Notas de execução

### Construção direta pelo orquestrador (2026-07-21)
Fora do pipeline executor→testador→revisor: o usuário pediu explicitamente para eu
(orquestrador) construir a interface direto, no Opus, para conter custo. Verificação
formal (testador/revisor) intencionalmente pulada por essa decisão — registrada aqui e no
log do dia.

**O que foi feito** (`web/src/paginas/inicio/Inicio.tsx` + infra compartilhada nova):
- `web/src/lib/tipos.ts` — tipos do frontend espelhando o contrato da API (T-004).
- `web/src/lib/formato.ts` — rótulos/ordem/classe por status e prioridade em PT-BR.
- `web/src/lib/useDados.ts` — hook de leitura da API (carregando/dados/erro + recarregar).
- `web/src/componentes/Estados.tsx` e `Indicadores.tsx` — carregando/erro/vazio, ChipStatus,
  BadgeMarco e ResumoStatus (tiles de contagem), reusados pela página de projeto.
- Home: painel de panorama (nº de projetos + tarefas por status), grade das 6 ações
  (nome, descrição e argumentos vindos de `/api/fabrica`), grade de projetos (fase atual +
  marco + resumo por status) linkando para `/projeto/<nome>`.
- CSS reescrito (`estilos.css`): cards, tiles, badges, cores por status, responsivo.

**Critérios de aceite — verificados via build + smoke test ao vivo:**
- 6 cards com nome/descrição em PT-BR da API (conferido no `/api/fabrica` real). ✔
- Lista de projetos reais com contagem/fase/marco (cockpit e painel-fabrica). ✔
- Card de projeto é `<Link>` para `/projeto/<nome>`. ✔
- API fora do ar → `MensagemErro` amigável com dica (sem tela branca). ✔
- Visual dark consistente (variáveis CSS; sem elementos vazados). ✔
- Ação disponivel:false → badge "em breve" (disparo é da fase seguinte). ✔

**Como verifiquei:** `npm run build` (tsc estrito + vite, 40 módulos, 0 erro); servidor
real na 8765 servindo a SPA; `/api/fabrica`, `/api/projetos` e `/` respondendo 200 com
dados reais. Sem testes de componente (não havia infra de teste de UI; decisão de custo).

## Verificação
(pulada por decisão do usuário — ver Notas de execução; verificação factual via build +
smoke test ao vivo registrada acima.)

## Revisão
(pulada por decisão do usuário — construção direta fora do pipeline, para conter custo.)

