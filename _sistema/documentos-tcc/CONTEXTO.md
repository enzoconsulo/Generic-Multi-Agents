# Documentos do TCC — contexto completo

Arquivo de handoff. Carregue-o inteiro numa sessão nova para retomar o trabalho sobre os
documentos de apresentação do TCC sem precisar redescobrir nada.

**Escrito em 2026-08-21**, ao fim da sessão que produziu as versões 3 a 7 e as duas traduções.

> **Leia junto: `DOCUMENTO_x_SISTEMA.md`, ao lado.** Este arquivo conta como os documentos foram
> feitos; aquele conta onde eles **divergiram do sistema que está sendo construído**. Em 02/09 o
> marco 1 da v0.2 revelou que a seção 3 da resumida descreve só metade da arquitetura — há duas
> famílias de operário, não uma. Nada aqui foi apagado por causa disso; o que mudou está lá.

---

## 1. O que são estes documentos

O TCC do Enzo é a **fábrica de software multi-agente** deste repositório. Além do sistema em
si, ele precisa de documentos que o **apresentem** — para banca e para o professor
orientador. Estes documentos NÃO são o trabalho escrito completo: são peças de apresentação,
densas em ilustração, geradas por script (python-docx + matplotlib), não escritas à mão no
Word.

O tema técnico que eles descrevem é a **versão 2 da fábrica: uma reimplementação em
Elixir/OTP**, decidida nesta sessão. A versão 1 (o que roda hoje neste repositório) é
tratada como protótipo que validou o desenho.

---

## 2. Estado atual — qual arquivo é qual

**A raiz foi centralizada em 21/08/2026**: só ficam os quatro documentos vivos. Os seis
superados foram **movidos** (não apagados) para `_sistema/documentos-tcc/historico/`.
**Nenhum .docx está commitado.**

| Arquivo (raiz) | Pág. | O que é |
|---|---|---|
| `fabrica-multi-agente-arquitetura-6.docx` | 7 | **versão resumida** de apresentação, em português |
| `fabrica-multi-agente-arquitetura-7.docx` | 19 | **documentação completa** — 8 partes, 21 figuras, 28 seções |
| `multi-agent-software-factory-SUMMARY-en.docx` | 7 | tradução do v6 |
| `multi-agent-software-factory-COMPLETE-en.docx` | 19 | tradução do v7 |

Em `historico/` (referência, não usar como entrega): `Fabrica-Multi-Agente-Arquitetura.docx`
(primeira tentativa), `-2` (só a v1; foi a base visual de tudo), `-3-completo` (11 pág., é
onde está o detalhe técnico cortado nas versões curtas), `-3`, `-4`, e `-5` (declarado
FECHADO pelo Enzo — o v6 nasceu dele).

**Para apresentação curta, parta do v6; para referência, do v7.** As versões em inglês são
geradas dos mesmos corpos e das mesmas figuras — ver seção 6.

---

## 3. O que o Enzo quer (preferências aprendidas, com o motivo)

Estas foram ditas ou corrigidas por ele ao longo da sessão. Respeitá-las evita refazer
trabalho.

- **Público: um professor que não conhece Elixir, nem as ferramentas, nem o projeto v1.**
  O documento tem de ser autônomo e explicar do zero. Foi a correção mais importante da
  sessão — a versão 4 parecia continuação da v1 e foi rejeitada por isso.
- **Compacto e visual: 5 a 8 páginas.** Mas *"não deve ser puramente visual"* — o
  funcionamento precisa estar explicado em texto também.
- **Tabelas enxutas.** Ele pediu explicitamente menos tabelas com muito texto. A regra que
  ficou: célula de tabela é de UMA linha; o que não couber vira marcador ou parágrafo.
- **Complexidade crescente.** Ilustrações claras e objetivas no começo, específicas no fim.
- **Não citar custos medidos da v1.** A seção que atribuía 78% da fatura às sessões de chat
  do CLI foi removida a pedido dele, e não deve voltar.
- **Ele pergunta antes de aceitar mudança grande** e espera o mesmo: *"me responda antes de
  ajustar"*. Quando ele aponta algo que não entendeu, responder e propor antes de editar.
- **Versão fechada é fechada.** Alterações viram arquivo novo.

---

## 4. Por que cada versão mudou (não desfazer sem motivo)

| De → para | O que mudou | Por quê |
|---|---|---|
| 2 → 3-completo | virou plano da reimplementação em Elixir | pedido inicial: doc de planejamento técnico do TCC |
| 3-completo → 3 | 11 → 6 páginas | *"mais direta e resumida, para apresentar sem ler textos longos"* |
| 3 → 4 | saiu a seção de custo medido; tabelas enxutas | pedido explícito |
| 4 → 5 | reescrito do zero, autônomo; +2 figuras novas | o professor não conhece Elixir nem a v1 |
| 5 (ajuste) | escada de 4 degraus para o fracasso + figura de estados com saída de replanejamento | ele notou que faltava o replanejamento (quebrar a tarefa em menores) — e faltava mesmo |
| 5 → 6 | vocabulário 6→9 termos; seções 8 e 9 explicadas; jargão traduzido nas figuras | ele não entendeu as seções 8 e 9 — porque usavam "vetor", "prefixo", "byte a byte" sem definir |

**Lição que vale para a próxima:** ao compactar, o que quebra primeiro não é o argumento —
é o **vocabulário**. Cada corte tirou definições e deixou os termos. Antes de entregar,
conferir: *todo termo técnico usado está definido antes do primeiro uso?*

---

## 5. O conteúdo técnico documentado (a arquitetura da v2)

Isto é o que os documentos afirmam. Mantê-lo coerente entre versões.

### A tese

Um sistema multi-agente não falha por escrever mal — falha por governar mal; e governança
escrita em prosa dentro de um prompt é governança opcional. A v2 move para o compilador,
para a árvore de supervisão e para o esquema do banco tudo o que hoje é frase imperativa
dirigida a um modelo. **A v2 não precisa ser mais esperta que a v1: precisa ser mais difícil
de operar errado.**

### Por que Elixir/OTP

O gargalo não é cálculo, é espera: dezenas de trabalhos lentos e falíveis em voo ao mesmo
tempo, que precisam ser cortados com segurança e sobreviver a falhas. Mapeamento decisivo:
**agente = processo supervisionado** (tem identificador, dono, quem o mate e quem perceba
que morreu). Alternativas descartadas e o motivo estão no `-3-completo`, seção 5.

Honestidade obrigatória no texto: **Elixir não barateia o modelo** (preço por token é do
provedor) e o ecossistema de IA é menor que o de Python — mitigado porque a parte pesada é
espera de rede e a única etapa numérica (embeddings) tem biblioteca madura.

### A stack

| Papel | Escolha | Justificativa curta |
|---|---|---|
| Linguagem/runtime | Elixir sobre a BEAM (OTP) | processos isolados, supervisão, concorrência |
| Web/painel | Phoenix + LiveView | tela ao vivo sem segunda stack de frontend |
| Banco | PostgreSQL + Ecto | transação de verdade nas transições de estado |
| Fila | Oban | filas duráveis no próprio banco; enfileirar e mudar estado na mesma transação |
| Chamada ao modelo | **Req (HTTP direto)** | controle byte a byte da requisição — é o que destrava o cache de prompt |
| Embeddings | Bumblebee + Nx (EXLA) | rodam local, em lote, sem custo por chamada e sem mandar o código para fora |
| Índice vetorial | pgvector | vetores no mesmo banco e na mesma transação das tarefas |
| Corte de texto | TextChunker | corte por estrutura (markdown, código), não por contagem de caracteres |
| Testes | ExUnit + Mox + **cliente falso da API** | suíte sem rede e sem custo — condição para ela ser executada |

**A escolha mais contraintuitiva, e que precisa continuar justificada:** não usar biblioteca
pronta de agentes (existem em Elixir — `langchain`, `anthropic`). O núcleo precisa decidir
requisição a requisição onde marcar os pontos de cache; camada de conveniência esconde isso.

### Mecanismos preservados da v1 (aprovados por uso real)

- Dois portões com duas perguntas: *funciona?* (executa os critérios) e *é o que foi pedido?*
  (conformidade + defeitos). Quem verifica e quem revisa **não podem corrigir**.
- Limite de 3 ciclos por tarefa.
- **Escada de resposta ao fracasso** (a parte que o Enzo notou faltando):
  1. 1ª reprovação → sobe de modelo;
  2. 2ª reprovação sob o mesmo especialista → troca de especialista;
  3. 3 ciclos esgotados → **replanejamento: o planejador quebra a tarefa em 2–3 menores**,
     que entram na fila como novas; a original é cancelada com referência;
  4. esgotou de novo → bloqueia e reporta (não se replaneja um replanejamento).
- Equipe sob demanda: o planejador sintetiza 2–5 especialistas a partir do próprio pedido.
- Índice denso do projeto (gerado por script, sem custo de modelo).
- Critérios de aceite executáveis (comando + resultado esperado).
- Duas trilhas (software / não-software) com escada de prova: executado > inspecionado >
  julgado.

### Economia de tokens (seção 8 dos documentos)

Mecanismo, em três passos: a API não tem memória → o texto de abertura é recobrado em toda
volta → o provedor deixa guardar o começo já processado e cobra ~1/10 por reusá-lo.

Números usados (verificados em 2026-08-21 pela skill `claude-api`; **reconferir antes de
reafirmar**): guardar custa 1,25x com validade de 5 min ou 2,0x com 1 h; reaproveitar custa
0,1x; até 4 pontos de marcação por requisição; trecho mínimo de 512 tokens (Opus 5) —
1024 em Sonnet 5 / Opus 4.8 e 4096 em Haiku 4.5. Ordem de montagem fixada pela API:
ferramentas → instruções → conversa. Preços por milhão de tokens à época: Opus 5 US$ 5/25,
Sonnet 5 US$ 3/15, Haiku 4.5 US$ 1/5.

Conta ilustrativa que ficou no documento (v6): abertura fixa de 20 mil tokens, despacho de
15 voltas → 300 mil tokens sem reaproveitamento contra ~53 mil com ele, cerca de 1/6.

**A armadilha que o documento precisa continuar avisando:** uma data, contador ou hash de
commit dentro do trecho estável invalida tudo o que vem depois, **sem erro nenhum** — daí o
teste que monta o começo duas vezes e compara.

### Memória do projeto (seção 9)

Dois índices, porque são duas perguntas:

- **índice gerado por script** → *o que existe e como se chama*; exato, completo, custo zero,
  vai inteiro no prompt;
- **índice por significado (vetores)** → *isto já foi resolvido aqui, e o que foi decidido?*;
  aproximado, sob demanda, só os melhores trechos.

O material indexado **não é o código** (o primeiro índice já cobre): é a história do projeto
— decisões com motivo, achados de revisão, tarefas concluídas.

Busca **híbrida** (vetor + termo exato) porque o vetor perde nome próprio (`--exigir`) e a
busca textual perde sinônimo. A fusão usa posto recíproco (RRF, k=60) — a consulta SQL está
no `-3-completo`.

### Plano em 6 fases

F1 Fundação (inclui o **cliente falso da API**) · F2 Laço de agente · F3 Máquina de estados ·
F4 Concorrência · F5 Memória semântica · F6 Painel e trilha genérica. Cada fase fecha num
marco **observável**, nunca em percentual.

---

## 6. Como regenerar os documentos

Os geradores estão em `_sistema/documentos-tcc/geradores/` (foram salvos aqui de propósito:
antes viviam num diretório temporário de sessão, que não sobrevive).

```
figuras3.py      todas as figuras base (fig1..fig14) -> geradores/figs3/*.png
figuras5.py      figuras exclusivas do v5 (agente, BEAM) + ajustes de rodapé
figuras6.py      variantes do v6 com jargão traduzido (fig5-cache-v6, fig7-rag-v6)
patch_fig6.py    reescreve a máquina de estados dentro de figuras3.py
patch_fig12.py   reescreve o roadmap dentro de figuras3.py

documento3-longo.py   gera o -3-completo (11 pág.), autossuficiente
documento4.py         gera o -4 (5 pág.), autossuficiente
documento5_base.py + corpo5.py + gerar5.py   -> gera o -5
documento6_base.py + corpo6.py + gerar6.py   -> gera o -6
documento7_base.py + corpo7a/b/c.py + gerar7.py -> gera o -7 (completo)
figuras7.py      8 figuras exclusivas do v7 (tarefa, portoes, banco, escada,
                 equipe, contexto por papel, projeto ponta a ponta, painel)
preview5.py / preview6.py                    -> converte em PDF e rasteriza as páginas
```

Fluxo: `python figuras3.py` → `python figuras6.py` → `python gerar6.py` →
`python preview6.py`. Os `gerar*.py` aceitam um caminho como argumento para gravar em outro
lugar (útil quando o arquivo oficial está aberto no Word).

### Versões em inglês

As figuras **não foram redesenhadas**: um arreio traduz os textos e reexecuta os geradores
em português sem alterá-los.

```
coletar_textos.py   varre os geradores e lista toda string desenhada, por figura
                    -> textos_figuras.txt (454 strings nas 21 figuras usadas)
traducoes_en.py     TRAD = {pt: en} cobrindo as 454
figuras_en.py       monkey-patch em Axes.text (traduz) e Figure.savefig (redireciona)
                    -> geradores/figs_en/*.png; strings sem tradução vão para faltando_en.txt
mk_en7.py           deriva documento7_en_base.py e gerar7_en.py dos originais
                    (troca FIGS para figs_en, o DESTINO e o literal "PARTE " -> "PART ")
corpo6_en.py / corpo7a_en.py / corpo7b_en.py / corpo7c_en.py   os corpos traduzidos
gerar6_en.py / gerar7_en.py / preview6_en.py / preview7_en.py
```

Fluxo completo, do zero: `figuras3.py` → `figuras5.py` → `figuras6.py` → `figuras7.py` →
`figuras_en.py` → os quatro `gerar*.py` → os quatro `preview*.py`.
**Ordem importa**: `figuras5.py` reescreve rodapés dentro de `figuras3.py`, então rodar
`figuras3.py` sozinho desfaz esse ajuste. `figuras_en.py` neutraliza essa escrita.
Critério de aceite do arreio: `figuras em ingles geradas: 21 de 21` e
`textos SEM traducao em figuras usadas: 0`.

Dependências: `python-docx`, `matplotlib`, `pymupdf`, `pywin32` (Word instalado). Fonte
Segoe UI/Calibri.

**Padrão visual** (mantido desde o `-2`): Calibri 9,3–9,5 pt; títulos azul `#184F95`;
figuras em PNG 220 dpi geradas por matplotlib com largura de 7 in, inseridas com 13,4–14,2 cm;
caixas coloridas com barra lateral (azul = conceito, roxo = decisão, vermelho = armadilha,
verde = limite); tabelas com cabeçalho azul `#2A78D6` e zebra `#F5F5F2`.

---

## 7. Armadilhas técnicas (todas custaram tempo nesta sessão)

- **O `.docx` fica travado quando aberto no Word.** `python-docx` levanta `PermissionError`.
  Gravar num arquivo provisório e copiar depois; **não matar o WINWORD**, pode ser trabalho
  do usuário. O Word/OneDrive também **regrava o arquivo sozinho** (AutoSave) — o tamanho
  muda sem que o conteúdo mude, então não use hash para concluir que algo foi alterado.
- **Heredoc do Bash come barras invertidas.** `python - <<'PY'` com `\n` dentro de string
  virou quebra de linha real e corrompeu o gerador duas vezes. Para escrever/alterar scripts,
  use a ferramenta Write ou Edit, nunca heredoc.
- **Texto estoura caixa no matplotlib sem avisar.** Regra prática: largura útil ÷ 0,045 in
  ≈ caracteres por linha a 6 pt. Sempre **abrir o PNG e olhar** — três defeitos reais
  (figura das fases ilegível, painel do cache sobreposto, faixa cortada) só apareceram assim.
- **Tradução mais longa estoura figura que cabia em português.** Aconteceu em quatro
  figuras (fig10 trilhas, fig16 portões, fig18 escada, fig19 equipe) — e **três delas já
  estouravam em português**, sem que ninguém tivesse notado. Ao traduzir, olhe TODAS as
  figuras, e conserte a geometria no gerador (vale para os dois idiomas).
- **Página em branco no meio do documento.** Um `quebra()` logo depois de conteúdo que
  termina exatamente no fim da página gera uma página vazia. Detectar assim:
  `pymupdf.open(pdf)` e listar páginas sem texto e sem imagem; consertar encurtando duas
  linhas do texto anterior.
- **Sempre converter o `.docx` em PDF e olhar as páginas.** Foi assim que apareceram órfãos,
  colisões e uma página com duas linhas soltas.
- **`exec` de gerador montado por concatenação** (`gerar5.py`) funciona bem, mas cuidado com
  substituição de caminho: fazer a troca na linha inteira `DESTINO = r"..."`, não em pedaço
  do caminho.

---

## 8. O que ficou em aberto

- Os `.docx` **não estão no git**. Decidir se entram (são binários grandes; o repositório já
  versiona `_sistema/` e `painel/`).
- O `-3-completo` (11 pág.) ainda tem a seção de custo medido, que o Enzo pediu para não
  usar nas versões de apresentação. Se ele virar anexo do TCC, revisar isso.
- A v6 não foi impressa/apresentada ainda; pode voltar com ajuste do professor.
- Nada disto foi implementado: a reimplementação em Elixir é **projeto**, não código. A
  fábrica que roda hoje continua sendo a v1 em TypeScript/Node descrita no `CLAUDE.md` da
  raiz.
