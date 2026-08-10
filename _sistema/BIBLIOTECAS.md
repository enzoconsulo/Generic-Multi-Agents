# Doutrina de Stack da Fábrica

Contrato de **como construir**, complementar ao PROTOCOLO_TAREFAS.md (que é o *como
tramitar*). Vale para `planejador` (escolhe a stack) e para os construtores
(`executor`, `executor-reforcado`, especialistas de `equipe.json`).

## Princípio

**Código não escrito é código sem bug, sem teste e sem manutenção.** A fábrica entrega
software que *parece profissional* — e o que separa um projeto amador de um profissional
quase nunca é a lógica de negócio: é a base. Formulário com validação e mensagem de erro,
tabela que ordena e pagina, data que respeita fuso, tema claro/escuro, foco acessível,
estados de carregando/vazio/erro. Isso já está resolvido em bibliotecas maduras. Escrever
à mão custa dez vezes mais e sai pior.

Consequência prática, em ordem de preferência:

1. **Scaffold oficial** do ecossistema (cria a estrutura inteira já configurada).
2. **Biblioteca madura** para o problema genérico.
3. **Código próprio** — só para a regra de negócio do projeto, que é o que ninguém pode
   escrever por você.

## Os 3 filtros para adotar uma dependência

Adote quando **todos** valerem:

1. **Problema não-trivial ou cheio de armadilha.** Data/fuso/duração, moeda e
   arredondamento, parsing (datas, CSV, markdown, argv), criptografia e hash de senha,
   validação de esquema, i18n, acessibilidade, virtualização de listas, drag-and-drop,
   gráficos, editor de texto rico. Reimplementar qualquer um destes é dívida garantida.
2. **Viva e permissiva.** Release nos últimos ~12 meses, issues respondidas, licença
   MIT/Apache-2.0/ISC/BSD. Sem release há 2 anos = passivo.
3. **Encaixa no que já foi decidido.** Não traga um segundo framework para a mesma função
   (dois gerenciadores de estado, dois clientes HTTP, dois sistemas de estilo). Confira
   `_gestao/DECISOES.md` antes.

**NÃO adote quando:** resolve algo que a plataforma já dá de graça (`fetch`, `Intl`,
`crypto`, `structuredClone`, `pathlib`, `dataclasses`); substitui menos de ~50 linhas
óbvias; arrasta um build/runtime novo por um detalhe; ou o projeto é um exercício cujo
objetivo declarado é implementar aquilo à mão (leia o ESPECIFICACAO.md — se a tarefa pede
"implemente o algoritmo X", a biblioteca de X está fora).

Toda dependência não-óbvia entra em `_gestao/DECISOES.md` com **uma linha de motivo**.

## Catálogo padrão

Padrões da casa. Divergir é permitido — com motivo em `DECISOES.md`. Fora do catálogo e
com dúvida real, chame o `pesquisador`.

**Nunca fixe versão de memória.** Use o comando de scaffold ou `npm i <pkg>@latest` /
`uv add <pkg>` e deixe o gerenciador resolver.

### Web app (TypeScript) — o caso mais comum

| Papel | Escolha | Por quê |
|---|---|---|
| Scaffold | `npm create vite@latest <nome> -- --template react-ts` | build, TS e dev-server prontos |
| Estilo | Tailwind CSS | sem CSS artesanal; consistência de graça |
| Componentes | shadcn/ui (`npx shadcn@latest add ...`) | acessível (Radix), código copiado para o repo — editável, sem lock-in |
| Ícones | lucide-react | acompanha o shadcn |
| Estado de servidor | TanStack Query | cache, retry, loading/error resolvidos |
| Formulários | react-hook-form + zod | validação declarativa, erro por campo |
| Rotas | React Router | padrão do ecossistema |
| Gráficos | Recharts | integra com o shadcn/ui |
| Datas | date-fns | tree-shakeable, sem monkey-patch |
| Testes | Vitest + @testing-library/react | mesmo runner do Vite |
| E2E / visual | Playwright | quando o fluxo cruza telas |
| Lint + format | Biome | um binário, rápido; alternativa: ESLint + Prettier |

### API / backend (TypeScript)

Fastify (ou Hono, se for edge/serverless) · **zod** para validar toda entrada de fronteira ·
Drizzle ou Prisma como ORM · SQLite (`better-sqlite3`) como banco inicial — migra para
Postgres sem reescrever a camada · `pino` para log estruturado · `jose` para JWT ·
`argon2`/`bcrypt` para senha (**nunca** hash artesanal) · Vitest + supertest.

### CLI

**Node:** commander (ou citty) · `@clack/prompts` para interação · picocolors + ora ·
cli-table3.
**Python:** Typer + Rich (Rich sozinho já dá aparência profissional a qualquer saída de
terminal: tabelas, progresso, sintaxe colorida).

### Python (geral)

`uv` para projeto e dependências (`uv init`, `uv add`, `uv run`) · FastAPI + pydantic para
API · pytest + pytest-cov · **ruff** (lint + format num binário só) · mypy quando houver
domínio tipado de verdade · polars ou pandas para dados.

### Jogo 2D / canvas na web

Phaser (jogo com física, cenas, sprites) ou PixiJS (renderização 2D pura). Não faça loop
de jogo, colisão e sprite sheet à mão.

Elemento 3D pequeno cujo resultado é decidido pelo SERVIDOR, não por física local (dado,
moeda, roleta): não traga `@3d-dice/dice-box` nem similares baseados em física/WebGL — nenhum
candidato do mercado combina "vivo" com "aceita forçar o resultado final" (pesquisa completa em
`projetos/banco-imobiliario/_gestao/pesquisas/2026-08-10-animacao-dados-referencia.md`; ex.:
`dice-box` é vivo mas não força resultado, `dice-box-threejs` força mas está morto há ~4 anos).
Use cubo CSS 3D (`transform-style: preserve-3d` + `perspective` no pai) com a rotação-alvo
calculada em JS a partir do valor (mapa `valor → {rx, ry}` + voltas extras `N*360deg`
variando sinal/eixo por dado) e disparada via `Element.animate()` nativo — zero dependência,
funciona sem build.

### Desktop

Tauri (leve, binário pequeno) ou Electron (ecossistema maior). Decisão em DECISOES.md.

## Higiene obrigatória em projeto novo

A **T-001** de todo projeto é o scaffold, e deve deixar o repositório com:

- estrutura criada pelo gerador oficial (não montada à mão);
- **lint + format configurados e rodando** (`npm run lint`, `ruff check`) — é o que impede
  o projeto de virar um patchwork de estilos ao longo de 20 tarefas de agentes diferentes;
- **runner de teste instalado e com um teste passando** (mesmo trivial) — para que as
  tarefas seguintes tenham onde escrever teste sem montar infraestrutura antes;
- `README.md` com os comandos reais de rodar/testar;
- `.gitignore` do ecossistema;
- commit inicial.

Sem isso, cada tarefa seguinte paga de novo a instalação da base — e o `testador` reprova
por "não consegui executar o projeto", que é a reprovação mais cara do sistema.

## Interface: o padrão visual da casa

Tarefa de UI é julgada por **captura de tela** (o `revisor` olha a imagem). Então:

- componente comum (botão, diálogo, tabela, aba, toast, menu) vem do shadcn/ui — não se
  escreve do zero;
- **três estados sempre existem**: carregando, vazio, erro. Tela que só desenha o caminho
  feliz é reprovação de conformidade esperando acontecer;
- espaçamento, tipografia e cor saem da escala do Tailwind, não de números avulsos;
- tema claro e escuro quando o projeto tiver mais de uma tela;
- foco visível e navegação por teclado — o Radix (sob o shadcn) já entrega isso de graça,
  e é exatamente o tipo de coisa que se perde escrevendo `<div onClick>` à mão.
