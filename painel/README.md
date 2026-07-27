# painel-fabrica

Cockpit web local da fábrica de software multi-agente **Gerador_de_projetos**: ver o
estado real de tudo e **disparar os fluxos da fábrica pelo navegador**, sem abrir pasta
nem terminal.

O painel não é um projeto sob `projetos/` — é **ferramenta de sistema** da fábrica, mora
em `<fabrica>/painel/` e é versionado junto com o sistema. Consequência: ele fica fora do
pipeline `executor → testador → revisor` (que só opera em `projetos/`) e é mantido à mão.

## O que dá para fazer

- **Ver**: panorama da fábrica, projetos, kanban de tarefas, plano e marcos, decisões,
  progresso, equipe de especialistas e a análise do código.
- **Disparar**: as 6 ações da fábrica (`/novo-projeto`, `/ideia`, `/trabalhar`, `/status`,
  `/encerrar-dia`, `/manutencao`) escolhendo o modelo, com estimativa de custo antes de
  gastar e log ao vivo no console.
- **Importar** uma pasta de código existente para dentro de `projetos/`.
- **Analisar** um projeto (gera/atualiza o `_gestao/ANALISE.md` dele).
- **Responder** ao fluxo quando ele pede aprovação ou faz uma pergunta.
- **Rodar CI** por projeto: `instalar → lint → testes → build`, com log por estágio.

## Requisitos

- **Node.js 22+** (`engines` do package.json).
- **Claude Code instalado e logado por assinatura** na máquina. O painel reusa esse login
  pelo Agent SDK — **não** use `ANTHROPIC_API_KEY` (o spike da T-001 validou exatamente o
  caminho da assinatura).
- **git** no PATH (a importação de projetos inicializa repositório quando falta).

O painel escuta **somente em `127.0.0.1`**. Não exponha essa porta na rede: quem alcança
a API dispara fluxos que escrevem em disco na sua máquina.

## Como rodar

Instalar dependências (uma vez, na pasta `painel/`):

```powershell
npm install
```

**Produção local** — build + tudo servido numa porta só:

```powershell
npm run build
npm start
# abre em http://127.0.0.1:8765
```

**Desenvolvimento** — recarrega ao salvar (servidor com `tsx watch`, web com Vite):

```powershell
npm run dev
# abra http://localhost:5173  (a 5173 faz proxy de /api para a 8765)
```

### Variáveis de ambiente (todas opcionais)

| Env | Default | Para quê |
|---|---|---|
| `PORTA` | `8765` | Porta do servidor (validada na subida) |
| `FABRICA_RAIZ` | `..` (a pasta acima do painel) | Apontar para outra fábrica; os testes usam fábricas falsas temporárias |
| `DADOS_DIR` | `painel/dados` | Onde ficam jobs/CI (pasta descartável, fora do git) |
| `TETO_JOBS_CLAUDE` | `2` | Fluxos Claude simultâneos |
| `ESTRATEGIA_PADRAO` | `sonnet` | Estratégia de modelo quando o disparo não escolhe uma |

## Como testar

```powershell
npm test          # tsc estrito + Vitest (servidor e web). Não usa rede nem login.
```

> `npm run teste:integracao` existe mas **hoje é só um placeholder** (criado na T-002):
> imprime um aviso e não roda nada. Nenhum teste que exija login real do Claude foi
> escrito ainda — a integração real do `canUseTool` com o SDK continua **não validada em
> execução paga**. Está registrado como pendência no `_gestao/PROGRESSO.md`.

## Arquitetura em 10 linhas

```
painel/
├── servidor/            Express 5 + TypeScript estrito (ESM)
│   └── src/
│       ├── fabrica/     LEITOR somente-leitura dos arquivos da fábrica (fonte dos dados)
│       ├── jobs/        Motor de fila: locks, persistência, cancelamento, inputs
│       │   ├── claude/  Runner do Agent SDK (versão PINADA)
│       │   └── robustez/  Watchdog de inatividade + guardrails por ação
│       ├── ci/          Motor de CI local (config, processo, resultados)
│       ├── acoes/       Traduz ação da fábrica → job; prompt da análise
│       └── rotas/       Um arquivo por área; carregadas automaticamente
└── web/                 React 18 + Vite + TS; páginas em src/paginas/, tema dark
```

Estado é **sempre derivado dos arquivos da fábrica** na hora da consulta — o painel não
tem banco. O que ele persiste em `dados/` é só histórico operacional (metadados de job,
resultados de CI), descartável sem corromper nada.

## Avisos operacionais

**Não rode `/trabalhar` no chat e no painel ao mesmo tempo.** Os locks do painel só
enxergam os jobs do painel: uma sessão interativa do Claude Code que você abriu no
terminal é invisível para ele. Dois orquestradores na mesma árvore de trabalho se
atropelam (é o desperdício mais caro do sistema). Escolha um dos dois.

**Trabalhar no próprio painel.** A página do projeto avisa antes de disparar `/trabalhar`
em `painel-fabrica`, porque o fluxo alteraria o código que está rodando. Na prática isso
hoje nem é alcançável: desde que o painel virou ferramenta de sistema, ele não aparece
mais como projeto sob `projetos/`. Para mexer no painel, use o chat principal.

**Custo.** Toda ação mostra peso e estimativa antes de disparar, e o custo real aparece no
fim do job. Prefira modelos baratos (Haiku/Sonnet) para rotina — a estratégia padrão já é
econômica. Fluxos podem ser cancelados a qualquer momento pela página de Jobs.

**Retomar um fluxo interrompido.** Se o processo do painel cair no meio de uma execução,
o job vira `interrompido` no boot seguinte (nada fica dizendo "executando" para sempre).
O painel **não** retoma sozinho — mas guarda o que você precisa para retomar à mão: abra
`GET /api/jobs/<id>` (ou a página de Jobs) e pegue `sessionId` e `cwd`. Então, **na mesma
pasta do `cwd`**:

```powershell
cd <o cwd do job>
claude --resume <sessionId>
```

O mesmo diretório é obrigatório: o lookup de sessão do Claude Code é escopado ao diretório
do projeto (ver `_gestao/pesquisas/2026-07-21-claude-code-headless.md`).

**Watchdog.** Um fluxo Claude que fica mudo por ~15–20 min é interrompido automaticamente,
para não segurar o lock do projeto para sempre. Fluxo pausado esperando resposta sua
**não** conta como inatividade — pode demorar o quanto precisar.

## Documentos do projeto

`_gestao/`: `ESPECIFICACAO.md` (o que é), `PLANO.md` (fases e marcos), `DECISOES.md`
(decisões datadas, só-adição), `PROGRESSO.md` (diário), `tarefas/` (as tarefas, com o
status no frontmatter) e `pesquisas/` (relatórios técnicos).
