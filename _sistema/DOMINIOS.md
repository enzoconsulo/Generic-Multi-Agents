# Doutrina de Domínios da Fábrica

Contrato de **como construir o que NÃO é software**. É o par de `BIBLIOTECAS.md`, que
manda na trilha de software e continua mandando lá sozinho.

Vale para `planejador-generico` (escolhe artefato, ferramenta e verificador), para os
construtores da trilha genérica (`construtor`, `construtor-reforcado`, especialistas de
`equipe.json`) e para os portões (`conferente`, `revisor-generico`).

## Separação — leia isto antes de qualquer coisa

A fábrica tem **duas trilhas**, escolhidas pelo campo `dominio` de
`projetos/<nome>/_gestao/equipe.json`:

| `dominio` | Doutrina | Constrói | Verifica | Revisa |
|---|---|---|---|---|
| `software` (ou ausente) | `BIBLIOTECAS.md` | `executor` | `testador` | `revisor` |
| qualquer outro | **este arquivo** | `construtor` | `conferente` | `revisor-generico` |

**Nada neste documento se aplica a projeto de software, e nenhum agente da trilha de
software o lê.** A separação é deliberada: a trilha de software está calibrada e medida,
e o custo dela não pode subir por causa de uma generalização que ela não usa.

## O que muda e o que NÃO muda

Não muda nada do que sustenta a fábrica: o protocolo de tarefas, o pipeline de seis
estados, os **dois portões com duas perguntas**, o limite de 3 ciclos com replanejamento,
a equipe sob demanda em `equipe.json`, o confinamento e o estado em arquivo.

Muda exatamente três coisas: **quem constrói**, **como se prova que ficou pronto** e **o
que é a T-001**.

## O princípio: artefato + verificador

A fábrica só funciona porque o portão do meio é **mecânico**. Em software isso vem de
graça: roda, e o programa passa ou quebra. Fora de software não vem — e é aí que o sistema
degenera, porque um `conferente` sem nada para executar vira um segundo revisor, e dois
julgamentos subjetivos sobre o mesmo texto não são dois portões, são custo em dobro.

Portanto, a pergunta que define o projeto inteiro, antes da primeira tarefa:

> **Como um programa prova que este artefato está pronto?**

### A escada de verificação

Todo critério de aceite fica em um destes três degraus. **Suba sempre o mais alto
possível; descer é decisão, não conveniência.**

1. **Comando executável** — um comando roda e o resultado é o veredito.
   `uv run pytest tests/test_calculos.py → 6 passam`, `npx markdownlint docs/ → 0 erros`,
   `uv run python verificar.py → OK: 12 slides, 0 problemas`.
2. **Inspeção programática do artefato** — um script **abre o arquivo entregue** e afirma
   fatos sobre ele. É o degrau que salva os formatos binários.
   `uv run python -c "from pptx import Presentation; d=Presentation('saida/deck.pptx'); print(len(d.slides))" → 12`.
3. **Rubrica declarada** — só quando 1 e 2 são genuinamente impossíveis (qualidade de
   redação, força de um argumento, gosto visual). Exige **duas** coisas na tarefa:
   `verificacao: rubrica` no frontmatter e uma seção `## Rubrica` com itens binários
   ("cada seção abre com uma frase-tese", "nenhum slide tem mais de 6 linhas"), nunca
   escalas vagas. O `conferente` avalia item a item e **rotula o resultado como
   julgamento, não como execução** — o rótulo é obrigatório e é o que impede a fábrica de
   fingir que tem dois portões quando tem um.

Critério que não diz em qual degrau está e o que rodar vira interpretação — e
interpretação no portão do meio é reprovação falsa, que custa um ciclo inteiro.

## A T-001 é a FUNDAÇÃO — e é ela que instala o verificador

O equivalente genérico do scaffold. A T-001 de todo projeto da trilha genérica entrega:

- estrutura de pastas do projeto (`fonte/`, `saida/`, `ferramentas/`);
- **ferramenta de geração instalada pelo gerenciador oficial** (`uv add python-pptx`,
  `npm i -D @marp-team/marp-cli`), nunca montada à mão;
- **o verificador rodando**: um script `verificar.<ext>` que abre o artefato gerado, afirma
  o que dá para afirmar e sai com código != 0 quando falha;
- **um artefato mínimo já gerado e passando no verificador** (mesmo trivial);
- `README.md` com os comandos reais de gerar e de verificar;
- `.gitignore` e commit inicial.

Sem verificador na fundação, todo critério do projeto cai para o degrau 3 e os dois
portões viram um só. É o análogo exato do "não consegui executar o projeto" da trilha de
software: a reprovação mais cara do sistema.

## Regra do binário: o artefato é GERADO, a fonte é versionada

O `revisor-generico` revisa o **diff**. Um `.pptx`, `.xlsx`, `.docx` ou `.png` commitado
como fonte de verdade é um blob: `git show` devolve `Bin 40213 bytes` e o portão da
revisão simplesmente deixa de existir.

Portanto, sem exceção:

- a **fonte** é texto versionado (`fonte/deck.md`, `dados/entrada.csv`,
  `ferramentas/gerar.py`);
- o **binário** é produzido por um comando (`uv run python ferramentas/gerar.py`) e vive em
  `saida/`, que entra no `.gitignore` salvo quando o usuário precisa do arquivo no
  repositório;
- ninguém edita o binário à mão. Correção se faz na fonte e regera.

Isso também é o que torna o retrabalho barato: o construtor do ciclo 2 lê um diff, não
abre um arquivo do PowerPoint.

## Prova visual

Entrega que tem forma visual (slide, página, relatório diagramado, gráfico) leva captura
em `_gestao/evidencias/T-NNN-*.png`, e é sobre ela que a conformidade visual é julgada —
mesma regra da trilha de software.

- Artefato HTML (deck reveal.js/Marp, relatório, dashboard): sirva localmente e use
  `node _sistema/ferramentas/captura.mjs <url> <arquivo.png> --espera=3000`.
- PPTX/PDF: exporte para imagem antes (`soffice --headless --convert-to pdf`, depois
  `pdftoppm`/`magick`, se disponíveis na máquina). Não deu? **Renderize a fonte** — o deck
  quase sempre tem um caminho HTML — ou diga por que não deu, no lugar de inventar que viu.

Sem imagem numa entrega visual, a conformidade visual é **NÃO VERIFICADA**, e isso é
escrito na tarefa.

## Os 3 filtros para adotar uma ferramenta

Iguais aos de `BIBLIOTECAS.md`, generalizados. Adote quando **todos** valerem:

1. **Problema não-trivial ou cheio de armadilha.** Escrever OOXML à mão para gerar um
   `.pptx`, formatar `.docx` por string, recalcular fórmula de planilha no braço, parsear
   PDF por regex — tudo isto é dívida garantida, exatamente como hash de senha artesanal.
2. **Viva e permissiva.** Release recente, licença MIT/Apache-2.0/ISC/BSD.
3. **Encaixa no que já foi decidido** (`_gestao/DECISOES.md`) — não traga a segunda
   ferramenta para o mesmo papel.

Toda ferramenta nova entra em `DECISOES.md` com uma linha de motivo.

## Catálogo por domínio

Padrões da casa. Divergir é permitido com motivo em `DECISOES.md`. **Domínio fora desta
lista é legítimo** — o `planejador-generico` cunha o nome e declara na ESPECIFICACAO.md as
três colunas que importam: artefato, ferramenta de geração e verificador.

### `apresentacao` — slides

| Peça | Escolha |
|---|---|
| Fonte | Markdown (`fonte/deck.md`) — é o que torna o deck revisável por diff |
| Geração | **Marp** (`@marp-team/marp-cli`: Markdown → HTML/PDF/PPTX) para deck de conteúdo; **python-pptx** (via `uv`) quando o pedido é editar/preencher um `.pptx` de template corporativo |
| Verificador | script que abre a saída e afirma: nº de slides, títulos presentes, nenhum slide acima do limite de linhas, imagens referenciadas existem |
| Prova visual | render HTML + `captura.mjs`, uma imagem por seção do deck |
| Especialistas típicos | `roteirista` (narrativa e sequência), `slides` (layout e densidade), `dados-visuais` (gráficos) |

### `documento` — texto estruturado (manual, relatório, artigo, contrato, roteiro)

| Peça | Escolha |
|---|---|
| Fonte | Markdown, um arquivo por capítulo/seção em `fonte/` |
| Geração | **pandoc** para `.docx`/`.pdf`/`.html`; **python-docx** só quando o alvo é um `.docx` de template existente |
| Verificador | `markdownlint` + checador de links + script que confere as seções obrigatórias da especificação, contagem de palavras por seção e ausência de marcador `TODO`/placeholder |
| Especialistas típicos | `redator`, `editor` (corte e consistência), `verificador-fatos` |

### `dados` — análise, planilha, modelo, painel de números

| Peça | Escolha |
|---|---|
| Fonte | Python com `uv` + **polars** (ou pandas) em `ferramentas/`; entrada bruta versionada em `dados/` |
| Geração | **openpyxl**/**xlsxwriter** para `.xlsx`; a planilha é SAÍDA de um script, nunca a fonte |
| Verificador | `pytest` sobre as funções de cálculo + script que reabre a saída e confere os totais contra os valores esperados |
| Prova visual | gráfico exportado como PNG direto para `_gestao/evidencias/` |
| Especialistas típicos | `analista-dados`, `modelador`, `redator-achados` |

### `midia` — imagem, diagrama, áudio, vídeo

| Peça | Escolha |
|---|---|
| Fonte | descrição textual versionada: **mermaid**/**graphviz** para diagrama, roteiro + lista de cortes para vídeo |
| Geração | mermaid-cli, graphviz, **ffmpeg**, Pillow |
| Verificador | `ffprobe` (duração, resolução, faixas), Pillow (dimensão, formato), existência dos arquivos referenciados |
| Prova visual | o próprio arquivo, ou um quadro extraído, em `_gestao/evidencias/` |

### `generico` — o resto

Não force o pedido para dentro de uma linha do catálogo. Declare na ESPECIFICACAO.md:

```
Domínio: <nome que você cunhou>
Artefato: <o arquivo exato que o usuário recebe, com caminho>
Fonte: <o que é versionado em texto>
Geração: <comando que produz o artefato>
Verificação: <comando que prova, e o que ele afirma>
Degrau mínimo: comando | inspecao | rubrica — <por que não dá para subir>
```

Se você não conseguir preencher a linha "Verificação", **pare e diga isso ao
orquestrador** antes de criar tarefa nenhuma: um projeto sem verificador possível é um
projeto que vai rodar com um portão só, e essa é uma decisão do usuário, não sua.

## Higiene de qualidade — o equivalente ao "parece profissional"

O que separa um entregável amador de um profissional, em qualquer domínio, quase nunca é o
conteúdo central: é a base. Vale como exigência de conformidade, do mesmo jeito que os três
estados de UI valem na trilha de software.

- **Consistência** — um só padrão de título, de citação, de unidade, de formato de data e
  de casas decimais no artefato inteiro. Sai do template da fundação, não de escolha por
  arquivo.
- **Estrutura visível** — sumário, numeração e referência cruzada que funciona.
- **Nada de placeholder** — `TODO`, "Lorem ipsum", `<preencher>` e número inventado são
  achado `critica` no revisor, não detalhe.
- **Origem dos números** — todo dado afirmado tem fonte rastreável na fonte versionada.
  Número sem origem é o análogo do segredo hardcoded.
- **Legibilidade** — densidade por slide, tamanho de parágrafo, contraste. É julgado na
  captura.
