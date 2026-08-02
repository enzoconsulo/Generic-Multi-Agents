#!/usr/bin/env node
/**
 * mapa.mjs — gera `_gestao/MAPA.md`: o índice DENSO de um projeto.
 *
 * POR QUE EXISTE (medido, não teórico). Ver `_sistema/CUSTO_DE_CONTEXTO.md`.
 *
 * 80-90% da conta de cada job da fábrica é contexto, não produção. A maior linha é o
 * agente carregando o projeto inteiro para se orientar: no job `f72534e8` o `servidor`
 * fez 20 `Read` antes de escrever uma linha, e o código do banco-imobiliario inteiro tem
 * 70k tokens. Isso é pago em ESCRITA de cache (17,5× o preço da leitura) a cada despacho,
 * e depois relido a cada volta de API.
 *
 * O agente não precisava dos CORPOS de 20 módulos. Precisava saber o que existe, onde, e
 * com que assinatura. Isso cabe em ~5% do tamanho.
 *
 * DESENHO — três regras que valem mais que o código:
 *
 * 1. DENSO OU NADA. Um pacote grande no contexto do agente é EMPATE: economiza escrita e
 *    devolve o mesmo em leitura (é relido a cada volta). Só compensa se substituir mais
 *    do que ocupa. Por isso aqui entra assinatura + uma frase, nunca corpo de função.
 *    Se este arquivo passar de ~10% do código-fonte, ele parou de valer a pena.
 *
 * 2. DETERMINÍSTICO E DE GRAÇA. Nenhuma chamada de modelo. Roda em milissegundos, então
 *    pode ser regenerado a cada commit sem ninguém pensar no custo.
 *
 * 3. SEM DEPENDÊNCIA. Só built-ins do Node, como `captura.mjs`. Extração por regex sobre
 *    as linhas de `export`, não AST. É uma escolha consciente contra `BIBLIOTECAS.md`:
 *    um índice de assinaturas não precisa de parser completo, precisa das linhas de
 *    declaração — e um parser por linguagem traria dependência e instalação para dentro
 *    de `_sistema/`, que hoje roda em qualquer projeto sem preparo. O custo dessa escolha
 *    é honesto e está na seção "Limites" do MAPA gerado: o que o regex não pegar, o
 *    agente descobre lendo o arquivo, que é o comportamento antigo — degrada, não quebra.
 *
 * USO:
 *   node _sistema/ferramentas/mapa.mjs <caminho-do-projeto>
 *   node _sistema/ferramentas/mapa.mjs .            (de dentro do projeto)
 *
 * Escreve `<projeto>/_gestao/MAPA.md` e imprime uma linha de medição (tamanho do mapa
 * contra tamanho do fonte) — é ela que diz se a regra 1 continua sendo respeitada.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, extname, sep, resolve, basename } from "node:path";
import { execFileSync } from "node:child_process";

/** Nunca descer aqui: ou é gerado, ou é dependência, ou é o próprio versionamento. */
const PASTAS_IGNORADAS = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage", ".next", ".nuxt",
  "__pycache__", ".venv", "venv", "env", "target", "bin", "obj", ".cache",
  "vendor", ".pytest_cache", ".mypy_cache", ".gradle", ".idea", ".vscode",
]);

/** Extensões que não têm assinatura para extrair — entram só na árvore. */
const EXT_BINARIAS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".pdf", ".zip",
  ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".mp4", ".wav", ".bin", ".exe",
  ".pptx", ".xlsx", ".docx", ".odt", ".ods", ".odp",
]);

/** Linguagens de que sabemos extrair símbolos. O resto entra só na árvore. */
const LINGUAGENS = {
  ".js": "js", ".mjs": "js", ".cjs": "js", ".jsx": "js",
  ".ts": "ts", ".mts": "ts", ".cts": "ts", ".tsx": "ts",
  ".py": "py",
  ".go": "go",
  ".rs": "rs",
};

const LIMITE_ARQUIVO = 2_000_000; // não tenta extrair de arquivo gigante gerado

// ---------------------------------------------------------------------------
// Varredura
// ---------------------------------------------------------------------------

/** Lista recursiva de arquivos do projeto, já sem o que `PASTAS_IGNORADAS` exclui. */
function varrer(raiz, dir = raiz, saida = []) {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return saida; // pasta sem permissão não derruba o mapa inteiro
  }
  for (const e of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".") && e.name !== ".gitignore") continue;
    const caminho = join(dir, e.name);
    if (e.isDirectory()) {
      if (PASTAS_IGNORADAS.has(e.name)) continue;
      varrer(raiz, caminho, saida);
    } else if (e.isFile()) {
      saida.push(relative(raiz, caminho).split(sep).join("/"));
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Extração de símbolos
// ---------------------------------------------------------------------------

/** Colapsa espaço/quebra e corta, para nada no mapa virar parágrafo. */
function resumir(texto, max = 150) {
  const s = String(texto).replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Primeira frase útil do bloco de comentário que ANTECEDE a linha `i`.
 *
 * Aceita as duas formas que o código real usa: bloco `/** … *​/` (JSDoc) e sequência de
 * `//`. Ignora as linhas de `@tag` — elas são detalhe, e o mapa quer a frase que diz o
 * que a coisa faz.
 */
function docAcimaDe(linhas, i) {
  let j = i - 1;
  while (j >= 0 && linhas[j].trim() === "") j--;
  if (j < 0) return "";

  const coletadas = [];
  if (linhas[j].trim().endsWith("*/")) {
    // Sobe até a abertura do bloco.
    let k = j;
    while (k >= 0 && !linhas[k].includes("/*")) k--;
    for (let n = k; n <= j; n++) {
      const t = linhas[n].replace(/^\s*\/?\*+\/?/, "").replace(/\*\/\s*$/, "").trim();
      if (t.startsWith("@")) break; // chegou nas tags: a descrição acabou
      if (t !== "") coletadas.push(t);
    }
  } else if (linhas[j].trim().startsWith("//") || linhas[j].trim().startsWith("#")) {
    let k = j;
    while (k >= 0 && /^\s*(\/\/|#)/.test(linhas[k])) k--;
    for (let n = k + 1; n <= j; n++) {
      const t = linhas[n].replace(/^\s*(\/\/+|#+)/, "").trim();
      if (t !== "") coletadas.push(t);
    }
  }
  if (coletadas.length === 0) return "";
  // Só a primeira frase: o resto é contexto que o agente pega lendo o arquivo.
  const texto = coletadas.join(" ");
  const ponto = texto.search(/\.\s|\.$/);
  return resumir(ponto > 20 ? texto.slice(0, ponto + 1) : texto);
}

/** Tipo de retorno declarado no JSDoc (`@returns {…}`) acima da linha `i`, se houver. */
function retornoAcimaDe(linhas, i) {
  for (let j = i - 1; j >= 0 && j > i - 40; j--) {
    const m = linhas[j].match(/@returns?\s+\{(.+)\}/);
    if (m) return resumir(m[1], 70);
    if (/^\s*(export|function|const|class|def |func )/.test(linhas[j]) && j !== i) break;
  }
  return "";
}

/**
 * Lista de parâmetros, comprimida para caber numa linha.
 *
 * Recebe uma JANELA de linhas, não a linha da declaração: assinatura quebrada em várias
 * linhas é comum no código real (`cobrarAluguelCompanhia` tem 6), e olhar só a primeira
 * não acha o parêntese de fechamento — o mapa saía com `(…)` justo nas funções de mais
 * parâmetros, que são as que mais precisam estar documentadas.
 */
function parametros(janela) {
  const assinatura = janela.replace(/\s+/g, " ");
  const abre = assinatura.indexOf("(");
  if (abre === -1) return "";
  let nivel = 0;
  let fim = -1;
  for (let i = abre; i < assinatura.length; i++) {
    if (assinatura[i] === "(") nivel++;
    else if (assinatura[i] === ")") {
      nivel--;
      if (nivel === 0) { fim = i; break; }
    }
  }
  if (fim === -1) return "(…)";
  // A vírgula final é legítima no fonte (trailing comma) e ruído no mapa.
  return `(${resumir(assinatura.slice(abre + 1, fim).replace(/,\s*$/, ""), 90)})`;
}

/** Padrões de declaração exportada, por linguagem. Ordem importa: o 1º que casar vence. */
const PADROES = {
  js: [
    [/^export\s+(?:async\s+)?function\s*\*?\s*([\w$]+)/, "função"],
    [/^export\s+class\s+([\w$]+)/, "classe"],
    [/^export\s+(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?\(/, "função"],
    [/^export\s+(?:const|let|var)\s+([\w$]+)/, "valor"],
    [/^export\s+default\s+(?:async\s+)?function\s*([\w$]*)/, "função (default)"],
    [/^export\s*\{([^}]+)\}/, "reexporta"],
    [/^module\.exports\.([\w$]+)\s*=/, "função"],
  ],
  ts: [
    [/^export\s+(?:async\s+)?function\s*\*?\s*([\w$]+)/, "função"],
    [/^export\s+(?:abstract\s+)?class\s+([\w$]+)/, "classe"],
    [/^export\s+interface\s+([\w$]+)/, "interface"],
    [/^export\s+type\s+([\w$]+)/, "tipo"],
    [/^export\s+enum\s+([\w$]+)/, "enum"],
    [/^export\s+(?:const|let|var)\s+([\w$]+)\s*[:=]\s*(?:async\s*)?\(/, "função"],
    [/^export\s+(?:const|let|var)\s+([\w$]+)/, "valor"],
    [/^export\s*\{([^}]+)\}/, "reexporta"],
  ],
  py: [
    [/^class\s+([\w]+)/, "classe"],
    [/^(?:async\s+)?def\s+([\w]+)/, "função"],
  ],
  go: [
    [/^func\s+\([^)]*\)\s*([A-Z][\w]*)/, "método"],
    [/^func\s+([A-Z][\w]*)/, "função"],
    [/^type\s+([A-Z][\w]*)/, "tipo"],
  ],
  rs: [
    [/^pub\s+(?:async\s+)?fn\s+([\w]+)/, "função"],
    [/^pub\s+struct\s+([\w]+)/, "struct"],
    [/^pub\s+enum\s+([\w]+)/, "enum"],
    [/^pub\s+trait\s+([\w]+)/, "trait"],
  ],
};

/** Símbolos públicos de um arquivo + a frase de propósito do módulo. */
function analisar(texto, lang) {
  const linhas = texto.split(/\r?\n/);
  const simbolos = [];
  const padroes = PADROES[lang] ?? [];

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    // Só declarações no nível de topo: indentado é detalhe interno.
    if (/^\s/.test(linha)) continue;
    for (const [re, tipo] of padroes) {
      const m = linha.match(re);
      if (!m) continue;
      const nome = m[1].trim();
      if (nome === "") break;
      if (tipo === "reexporta") {
        simbolos.push({ nome: resumir(nome, 90), tipo, args: "", ret: "", doc: "" });
      } else {
        // Janela de 12 linhas: cobre assinatura multi-linha sem arrastar o corpo junto
        // (o `parametros` para no fecha-parênteses equilibrado).
        const janela = linhas.slice(i, i + 12).join(" ");
        simbolos.push({
          nome,
          tipo,
          args: tipo.startsWith("função") || tipo === "método" ? parametros(janela) : "",
          ret: retornoAcimaDe(linhas, i),
          doc: docAcimaDe(linhas, i),
        });
      }
      break;
    }
  }

  // Propósito do módulo: comentário do topo do arquivo.
  let proposito = "";
  for (let i = 0; i < Math.min(linhas.length, 5); i++) {
    if (linhas[i].trim() === "" || linhas[i].startsWith("#!")) continue;
    if (/^\s*(\/\/|\/\*|#|"""|'''|--)/.test(linhas[i])) {
      proposito = docAcimaDe(linhas, i + contarBloco(linhas, i));
      if (proposito === "") proposito = resumir(linhas[i].replace(/^\s*(\/\/+|\/\*+|#+|"""|''')/, ""));
    }
    break;
  }
  return { simbolos, proposito };
}

/** Quantas linhas o bloco de comentário iniciado em `i` ocupa (para `docAcimaDe`). */
function contarBloco(linhas, i) {
  if (linhas[i].includes("/*")) {
    let n = i;
    while (n < linhas.length && !linhas[n].includes("*/")) n++;
    return n - i + 1;
  }
  let n = i;
  while (n < linhas.length && /^\s*(\/\/|#)/.test(linhas[n])) n++;
  return n - i;
}

// ---------------------------------------------------------------------------
// Árvore
// ---------------------------------------------------------------------------

/** Árvore compacta: só diretórios e a contagem/lista curta de arquivos. */
function arvore(arquivos) {
  const porDir = new Map();
  for (const a of arquivos) {
    const partes = a.split("/");
    const dir = partes.length === 1 ? "." : partes.slice(0, -1).join("/");
    if (!porDir.has(dir)) porDir.set(dir, []);
    porDir.get(dir).push(partes[partes.length - 1]);
  }
  const linhas = [];
  for (const dir of [...porDir.keys()].sort()) {
    const nomes = porDir.get(dir).sort();
    const lista = nomes.length > 12
      ? `${nomes.slice(0, 12).join(", ")} … (+${nomes.length - 12})`
      : nomes.join(", ");
    linhas.push(`${dir === "." ? "(raiz)" : `${dir}/`}  ${lista}`);
  }
  return linhas.join("\n");
}

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

function hashDoGit(raiz) {
  try {
    return execFileSync("git", ["-C", raiz, "rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "sem-git";
  }
}

function gerar(raiz) {
  const arquivos = varrer(raiz);
  const analisados = [];
  let bytesFonte = 0;

  for (const rel of arquivos) {
    const ext = extname(rel).toLowerCase();
    if (EXT_BINARIAS.has(ext)) continue;
    const lang = LINGUAGENS[ext];
    if (lang === undefined) continue;
    const abs = join(raiz, rel);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (st.size > LIMITE_ARQUIVO) continue;
    bytesFonte += st.size;
    let texto;
    try { texto = readFileSync(abs, "utf8"); } catch { continue; }
    const { simbolos, proposito } = analisar(texto, lang);
    if (simbolos.length === 0 && proposito === "") continue;
    analisados.push({ rel, simbolos, proposito, linhas: texto.split(/\r?\n/).length });
  }

  const nome = basename(raiz);
  const partes = [];
  partes.push(`# MAPA — ${nome}`);
  partes.push("");
  partes.push(
    `<!-- GERADO por _sistema/ferramentas/mapa.mjs. NÃO editar à mão — a próxima geração` +
    ` sobrescreve. HEAD: ${hashDoGit(raiz)} · ${new Date().toISOString().slice(0, 10)} -->`,
  );
  partes.push("");
  partes.push(
    "Índice denso deste projeto: o que existe, onde, e a assinatura de cada símbolo",
    "público. **Existe para você não precisar varrer o projeto para se orientar** — ler o",
    "código inteiro custa ~20× mais que ler isto, e é pago em toda tarefa por todo agente.",
    "",
    "Como usar: leia este arquivo primeiro; depois abra na íntegra **só** os arquivos que",
    "você vai modificar ou cujo comportamento interno você precisa conferir.",
  );
  partes.push("");
  partes.push("## Árvore");
  partes.push("");
  partes.push("```");
  partes.push(arvore(arquivos));
  partes.push("```");
  partes.push("");
  partes.push("## Símbolos públicos por arquivo");
  partes.push("");

  for (const a of analisados) {
    partes.push(`### \`${a.rel}\`${a.proposito !== "" ? ` — ${a.proposito}` : ""}`);
    if (a.simbolos.length === 0) {
      partes.push("");
      continue;
    }
    for (const s of a.simbolos) {
      const cabeca = s.tipo === "reexporta"
        ? `reexporta \`${s.nome}\``
        : `\`${s.nome}${s.args}\``;
      const ret = s.ret !== "" ? ` → \`${s.ret}\`` : "";
      const marca = s.tipo === "função" || s.tipo === "reexporta" ? "" : ` *(${s.tipo})*`;
      partes.push(`- ${cabeca}${ret}${marca}${s.doc !== "" ? ` — ${s.doc}` : ""}`);
    }
    partes.push("");
  }

  partes.push("## Limites deste mapa");
  partes.push("");
  partes.push(
    "- Extração por padrão de linha, não por AST: declaração exportada em forma incomum",
    "  pode não aparecer aqui. Se algo que você espera não está listado, o arquivo existe",
    "  na árvore acima — abra e leia.",
    "- Só símbolos de TOPO e públicos. Função interna, helper e detalhe de implementação",
    "  ficam de fora de propósito: eles são o que você lê no arquivo quando for mexer nele.",
    "- Descrição é a primeira frase da documentação do símbolo. O resto (parâmetros,",
    "  casos de borda, contratos) está no arquivo.",
  );

  const texto = `${partes.join("\n")}\n`;
  const destino = join(raiz, "_gestao");
  if (!existsSync(destino)) mkdirSync(destino, { recursive: true });
  const arquivoMapa = join(destino, "MAPA.md");
  writeFileSync(arquivoMapa, texto, "utf8");

  return {
    arquivo: arquivoMapa,
    bytesMapa: Buffer.byteLength(texto, "utf8"),
    bytesFonte,
    arquivos: analisados.length,
    simbolos: analisados.reduce((n, a) => n + a.simbolos.length, 0),
  };
}

// ---------------------------------------------------------------------------

const alvo = resolve(process.argv[2] ?? ".");
if (!existsSync(alvo)) {
  console.error(`Projeto não encontrado: ${alvo}`);
  process.exit(1);
}
const r = gerar(alvo);
const razao = r.bytesFonte > 0 ? ((r.bytesMapa / r.bytesFonte) * 100).toFixed(1) : "0";
console.log(
  `${r.arquivo}\n` +
  `  ${r.arquivos} arquivos, ${r.simbolos} símbolos\n` +
  `  mapa ${(r.bytesMapa / 1024).toFixed(1)} kB  ·  fonte ${(r.bytesFonte / 1024).toFixed(1)} kB` +
  `  ·  ${razao}% do fonte  (~${Math.round(r.bytesMapa / 4)} tok vs ~${Math.round(r.bytesFonte / 4)} tok)`,
);
