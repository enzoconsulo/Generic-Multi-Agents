// Apresentação principal do TCC — gerada a partir de dados.json (dados_deck.py).
//   node deck.js <dados.json> <saida.pptx>
const path = require("path");
const fs = require("fs");
const pptxgen = require(process.env.PPTXGENJS || "pptxgenjs");

const [, , DADOS, SAIDA] = process.argv;
const D = JSON.parse(fs.readFileSync(DADOS, "utf8"));

const THEME = {
  name: "Fabrica TCC",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1F2328", lt1: "FFFFFF", dk2: "1B2A41", lt2: "F2F4F7",
    accent1: "E9A23B", accent2: "2A9D8F", accent3: "C0392B", accent4: "4A6FA5",
    accent5: "8C96A3", accent6: "6B4E9B", hlink: "4A6FA5", folHlink: "6B4E9B",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "Fábrica de Software Multi-Agente — acompanhamento";
pres.author = "Enzo Consulo";
const C = pres.SchemeColor;

const ST = {
  ok: { cor: C.accent2, txt: "Entregue" },
  parcial: { cor: C.accent1, txt: "Entregue com pendência" },
  andamento: { cor: C.accent1, txt: "Em andamento" },
  bloqueada: { cor: C.accent3, txt: "Entrega bloqueada" },
  pendente: { cor: C.accent3, txt: "Pendente" },
  done: { cor: C.accent2, txt: "Concluída" },
  blocked: { cor: C.accent3, txt: "Bloqueada" },
  in_progress: { cor: C.accent1, txt: "Em andamento" },
};

pres.defineSlideMaster({
  title: "ESCURO",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 1.55, w: 8.8, h: 1.3, fontSize: 40, bold: true, color: C.background1, fontFace: THEME.headFontFace, valign: "bottom" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.6, y: 2.95, w: 8.8, h: 1.4, fontSize: 18, color: C.background2, valign: "top" }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "CONTEUDO",
  background: { color: C.background1 },
  margin: [0.5, 0.5, 0.5, 0.5],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.3, w: 9, h: 0.75, fontSize: 28, bold: true, color: C.text2, fontFace: THEME.headFontFace, valign: "middle" }, text: "" } },
    { text: { text: "Fábrica de Software Multi-Agente · TCC", options: { x: 0.5, y: 5.2, w: 6, h: 0.3, fontSize: 9, color: C.accent5 } } },
  ],
  slideNumber: { x: 9.0, y: 5.2, w: 0.5, h: 0.3, fontSize: 9, color: HEX.accent5 },
});

let secAtual = "";
function slide(master, secao) {
  if (secao && secao !== secAtual) { pres.addSection({ title: secao }); secAtual = secao; }
  return pres.addSlide({ masterName: master, sectionTitle: secAtual });
}
function txt(s, t, o) { s.addText(t, Object.assign({ isTextBox: true, fontFace: THEME.bodyFontFace, color: C.text1, fontSize: 14, valign: "top", margin: 0 }, o)); }
function card(s, x, y, w, h, nome, fill) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill || C.background2 }, line: { color: fill || C.background2 }, objectName: nome });
}
function pill(s, x, y, w, st, rotulo) {
  const v = ST[st];
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.32, rectRadius: 0.16, fill: { color: v.cor }, line: { color: v.cor } });
  txt(s, rotulo || v.txt, { x, y, w, h: 0.32, fontSize: 11, bold: true, color: C.background1, align: "center", valign: "middle" });
}
function stat(s, x, y, w, valor, rotulo) {
  card(s, x, y, w, 1.05, "stat-" + rotulo);
  txt(s, String(valor), { x: x + 0.15, y: y + 0.1, w: w - 0.3, h: 0.55, fontSize: String(valor).length > 5 ? 22 : 30, bold: true, color: C.text2, fontFace: THEME.headFontFace });
  txt(s, rotulo, { x: x + 0.15, y: y + 0.66, w: w - 0.3, h: 0.3, fontSize: 11, color: C.accent5 });
}
const fmt = (n) => Number(n).toLocaleString("pt-BR");
const E = (n) => D.etapas.find((e) => e.n === n);

// 1. Capa ------------------------------------------------------------------------------
{
  const s = slide("ESCURO", "Abertura");
  s.addText("Fábrica de Software Multi-Agente", { placeholder: "title" });
  s.addText("Acompanhamento do desenvolvimento — Trabalho de Conclusão de Curso\nEnzo Consulo", { placeholder: "body" });
  s.addNotes("Abertura. O sistema recebe a descrição de um projeto e o constrói de ponta a ponta com agentes especializados — e as regras de governança são impostas pela estrutura do programa, não pelo texto do pedido.");
}

// 2. A ideia central ---------------------------------------------------------------------
{
  const s = slide("CONTEUDO", "Abertura");
  s.addText("A regra mora na estrutura, não no pedido", { placeholder: "title" });
  txt(s, "Um sistema multi-agente não falha por escrever mal, e sim por governar mal.", { x: 0.5, y: 1.15, w: 9, h: 0.4, fontSize: 16, italic: true, color: C.accent4 });
  const regras = [
    ["Não escrever fora do projeto", "a ferramenta de escrita recusa o caminho"],
    ["No máximo três tentativas", "contador no banco, que o agente não altera"],
    ["Quem constrói não aprova", "o revisor não recebe ferramenta de escrita"],
    ["Não estourar o orçamento", "o sistema não deixa começar o que não cabe"],
  ];
  regras.forEach(([r, onde], i) => {
    const x = 0.5 + (i % 2) * 4.6, y = 1.75 + Math.floor(i / 2) * 1.6;
    card(s, x, y, 4.4, 1.4, "regra-" + i);
    txt(s, r, { x: x + 0.25, y: y + 0.2, w: 3.9, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
    txt(s, "→ " + onde, { x: x + 0.25, y: y + 0.7, w: 3.9, h: 0.55, fontSize: 14, color: C.text1 });
  });
  s.addNotes("Cada regra que normalmente é um pedido ao modelo vira um mecanismo do programa. É isso que o projeto inteiro prova, etapa por etapa.");
}

// 3. A régua -----------------------------------------------------------------------------
{
  const s = slide("CONTEUDO", "Abertura");
  s.addText("A régua: 8 critérios medidos na validação", { placeholder: "title" });
  const crit = [["Constrói sozinho", "≥ 3 de 5 projetos"], ["Conclui tarefas", "≥ 80%"], ["Pouco retrabalho", "≤ 2 execuções"], ["Não aprova errado", "nenhuma"],
    ["Governa de verdade", "todas barradas"], ["Aguenta falha", "sem perder trabalho"], ["Custo sob controle", "nenhuma acima do teto"], ["Cabe na máquina", "≤ 8 GB"]];
  crit.forEach(([c, lim], i) => {
    const x = 0.5 + (i % 4) * 2.3, y = 1.3 + Math.floor(i / 4) * 1.75;
    card(s, x, y, 2.1, 1.55, "crit-" + i);
    txt(s, c, { x: x + 0.18, y: y + 0.2, w: 1.75, h: 0.6, fontSize: 15, bold: true, color: C.text2 });
    txt(s, lim, { x: x + 0.18, y: y + 0.9, w: 1.75, h: 0.45, fontSize: 13, color: C.accent4 });
  });
  txt(s, "Medidos a partir da E8 com os 5 projetos de teste. Ajusta-se o sistema, nunca a régua.", { x: 0.5, y: 4.85, w: 9, h: 0.3, fontSize: 12, color: C.accent5 });
}

// 4. O plano em cascata ------------------------------------------------------------------
{
  const s = slide("CONTEUDO", "O plano");
  s.addText("O plano: 10 etapas em cascata", { placeholder: "title" });
  const nomes = ["Planejamento", "Fundação", "Agente", "Linha de produção", "Paralelismo", "Memória", "Painel", "Testes reais", "Refinamento", "Entrega"];
  nomes.forEach((nome, i) => {
    const n = i + 1, e = E(n), x = 0.5 + i * 0.905, y = 1.5;
    const cor = e ? ST[e.status].cor : C.background2;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 0.85, h: 1.1, rectRadius: 0.08, fill: { color: cor }, line: { color: cor }, objectName: "etapa-" + n });
    txt(s, "E" + n, { x, y: y + 0.12, w: 0.85, h: 0.4, fontSize: 18, bold: true, align: "center", color: e ? C.background1 : C.text2 });
    txt(s, nome, { x: x + 0.03, y: y + 0.55, w: 0.79, h: 0.5, fontSize: 9.5, align: "center", color: e ? C.background1 : C.text2 });
  });
  txt(s, [{ text: "Planejamento", options: { bold: true } }, { text: " E1 · " }, { text: "Desenvolvimento", options: { bold: true } }, { text: " E2–E7 (19/09 a 17/12) · " },
    { text: "Validação", options: { bold: true } }, { text: " E8–E10 (até 26/01/2027)" }], { x: 0.5, y: 2.85, w: 9, h: 0.35, fontSize: 13 });
  [["ok", "entrega aprovada"], ["parcial", "entregue com pendência / em andamento"], ["bloqueada", "entrega bloqueada"]].forEach(([st, r], i) => {
    s.addShape(pres.shapes.OVAL, { x: 0.5 + i * 3, y: 3.55, w: 0.22, h: 0.22, fill: { color: ST[st].cor }, line: { color: ST[st].cor } });
    txt(s, r, { x: 0.8 + i * 3, y: 3.52, w: 2.6, h: 0.3, fontSize: 12 });
  });
  txt(s, "Cada etapa termina numa entrega demonstrável; a seguinte só começa com ela pronta.", { x: 0.5, y: 4.25, w: 9, h: 0.4, fontSize: 14, italic: true, color: C.accent4 });
}

// 5. Como acompanhar no git --------------------------------------------------------------
{
  const s = slide("CONTEUDO", "O plano");
  s.addText("Uma branch por etapa, um commit por entrega", { placeholder: "title" });
  s.addShape(pres.shapes.LINE, { x: 0.7, y: 1.75, w: 8.6, h: 0, line: { color: C.accent5, width: 2 } });
  txt(s, "main", { x: 0.5, y: 1.35, w: 1, h: 0.3, fontSize: 12, bold: true, color: C.accent5 });
  for (let n = 1; n <= 7; n++) {
    const e = E(n), x = 0.7 + (n - 1) * 1.25;
    s.addShape(pres.shapes.OVAL, { x: x + 0.45, y: 1.63, w: 0.24, h: 0.24, fill: { color: ST[e.status].cor }, line: { color: C.background1, width: 1.5 } });
    s.addShape(pres.shapes.LINE, { x: x + 0.57, y: 1.87, w: 0, h: 0.5, line: { color: C.accent5, width: 1, dashType: "dash" } });
    card(s, x, 2.4, 1.15, 1.3, "branch-" + n);
    txt(s, "E" + n, { x, y: 2.5, w: 1.15, h: 0.35, fontSize: 16, bold: true, align: "center", color: C.text2 });
    const c = e.codigo;
    txt(s, (c ? c.commits.length : e.tarefas) + (c ? " commits" : " docs"), { x, y: 2.9, w: 1.15, h: 0.3, fontSize: 11, align: "center" });
    txt(s, e.concluidas + "/" + e.tarefas + " tarefas", { x, y: 3.2, w: 1.15, h: 0.3, fontSize: 11, align: "center", color: C.accent4 });
  }
  txt(s, "etapa/e1-planejamento → etapa/e2-fundacao → … → etapa/e7-painel: cada branch nasce da anterior. No dia da apresentação de cada etapa, a branch dela entra na main.", { x: 0.5, y: 4.0, w: 9, h: 0.7, fontSize: 13 });
}

// 6. Panorama ------------------------------------------------------------------------------
{
  const s = slide("CONTEUDO", "Panorama");
  s.addText("Panorama das etapas desenvolvidas", { placeholder: "title" });
  const cab = ["Etapa", "Entrega combinada", "Situação", "Tarefas", "Testes"].map((t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text2 } } }));
  const linhas = D.etapas.map((e) => [
    { text: "E" + e.n + " " + e.nome, options: { bold: true } },
    e.entrega,
    { text: ST[e.status].txt, options: { color: ST[e.status].cor, bold: true } },
    e.concluidas + "/" + e.tarefas,
    e.codigo ? fmt(e.codigo.testes) : "—",
  ]);
  s.addTable([cab, ...linhas], { x: 0.5, y: 1.15, w: 9, colW: [1.9, 4.2, 1.5, 0.75, 0.65], fontSize: 10, fontFace: THEME.bodyFontFace, color: HEX.dk1, border: { type: "solid", pt: 0.5, color: HEX.lt2 }, valign: "middle", rowH: 0.48 });
}

// 7–13. Uma por etapa -----------------------------------------------------------------------
for (const e of D.etapas) {
  const s = slide("CONTEUDO", "Etapas");
  s.addText(`E${e.n} — ${e.nome}`, { placeholder: "title" });
  txt(s, e.datas + "  ·  " + e.branch, { x: 0.5, y: 1.0, w: 6, h: 0.3, fontSize: 11, color: C.accent5 });
  pill(s, 7.3, 1.0, 2.2, e.status);
  txt(s, [{ text: "Entrega combinada: ", options: { bold: true } }, { text: e.entrega }], { x: 0.5, y: 1.45, w: 5.6, h: 0.65, fontSize: 13 });
  txt(s, e.texto.como.slice(0, 4).map((c, i, a) => ({ text: c, options: { bullet: true, breakLine: i < a.length - 1, paraSpaceAfter: 5 } })), { x: 0.5, y: 2.15, w: 5.6, h: 2.4, fontSize: 12 });
  const c = e.codigo;
  if (c) {
    stat(s, 6.4, 1.5, 1.5, e.concluidas + "/" + e.tarefas, "tarefas");
    stat(s, 8.0, 1.5, 1.5, fmt(c.testes), "testes");
    stat(s, 6.4, 2.7, 1.5, fmt(c.linhas_lib), "linhas em lib/");
    stat(s, 8.0, 2.7, 1.5, c.commits.length, "commits");
  } else {
    stat(s, 6.4, 1.5, 3.1, e.concluidas + "/" + e.tarefas, "documentos de planejamento");
    stat(s, 6.4, 2.7, 3.1, "15 + 8", "requisitos + critérios");
  }
  card(s, 0.5, 4.6, 9, 0.5, "prova-" + e.n, C.background2);
  txt(s, [{ text: "Prova: ", options: { bold: true } }, { text: e.texto.prova }], { x: 0.65, y: 4.65, w: 8.7, h: 0.42, fontSize: 10.5, valign: "middle" });
  const notas = [e.texto.resumo, "Pendente: " + (e.texto.pendente.join(" ") || "nada."), "Próxima: " + e.texto.proxima];
  s.addNotes(notas.join("\n"));
}

// 14. Crescimento ----------------------------------------------------------------------------
{
  const s = slide("CONTEUDO", "Dados");
  s.addText("O sistema cresce etapa por etapa", { placeholder: "title" });
  const com = D.etapas.filter((e) => e.codigo);
  const base = { x: 0.5, y: 1.15, w: 4.4, h: 3.6, barDir: "col", showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 10, dataLabelColor: HEX.dk1,
    catAxisLabelColor: HEX.accent5, valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" }, showLegend: false, showTitle: true, titleFontSize: 13, titleColor: HEX.dk2,
    catAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt", titleFontFace: "+mn-lt" };
  s.addChart(pres.charts.BAR, [{ name: "Testes", labels: com.map((e) => "E" + e.n), values: com.map((e) => e.codigo.testes) }], Object.assign({}, base, { title: "Testes automáticos", chartColors: [HEX.accent2] }));
  s.addChart(pres.charts.BAR, [{ name: "Linhas", labels: com.map((e) => "E" + e.n), values: com.map((e) => e.codigo.linhas_lib) }], Object.assign({}, base, { x: 5.1, title: "Linhas de código em lib/", chartColors: [HEX.accent4] }));
}

// 15. Processo -------------------------------------------------------------------------------
{
  const s = slide("CONTEUDO", "Dados");
  s.addText("Como o trabalho foi feito: retrabalho e custo", { placeholder: "title" });
  const com = D.etapas.filter((e) => e.execucoes_media);
  const base = { y: 1.15, w: 4.4, h: 3.3, barDir: "col", showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 10, dataLabelColor: HEX.dk1,
    catAxisLabelColor: HEX.accent5, valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" }, showLegend: false, showTitle: true, titleFontSize: 13, titleColor: HEX.dk2,
    catAxisLabelFontFace: "+mn-lt", dataLabelFontFace: "+mn-lt", titleFontFace: "+mn-lt" };
  s.addChart(pres.charts.BAR, [{ name: "Execuções", labels: com.map((e) => "E" + e.n), values: com.map((e) => e.execucoes_media) }], Object.assign({}, base, { x: 0.5, title: "Execuções de agente por item (limite: 2)", chartColors: [HEX.accent1], dataLabelFormatCode: "0.00" }));
  s.addChart(pres.charts.BAR, [{ name: "Custo", labels: com.map((e) => "E" + e.n), values: com.map((e) => e.custo_usd) }], Object.assign({}, base, { x: 5.1, title: "Custo medido dos agentes (US$, cota)", chartColors: [HEX.accent4], dataLabelFormatCode: "0" }));
  txt(s, "Execuções: quantas vezes um agente construiu cada item até ele ser aprovado. Custo: dólar-equivalente da cota da assinatura, medido nas rodadas do painel.", { x: 0.5, y: 4.55, w: 9, h: 0.5, fontSize: 11, color: C.accent5 });
}

// 16. Requisitos ------------------------------------------------------------------------------
{
  const s = slide("CONTEUDO", "Dados");
  s.addText("Requisitos: 11 atendidos, 3 parciais, 1 pendente", { placeholder: "title" });
  D.requisitos.forEach((r, i) => {
    const col = Math.floor(i / 8), lin = i % 8, x = 0.5 + col * 4.6, y = 1.15 + lin * 0.47;
    const st = r.status === "ok" ? "ok" : r.status === "parcial" ? "parcial" : "pendente";
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: y + 0.04, w: 0.55, h: 0.32, rectRadius: 0.08, fill: { color: ST[st].cor }, line: { color: ST[st].cor } });
    txt(s, r.r, { x, y: y + 0.04, w: 0.55, h: 0.32, fontSize: 11, bold: true, color: C.background1, align: "center", valign: "middle" });
    txt(s, [{ text: r.txt, options: { bold: true } }, { text: "  " + r.como, options: { color: C.accent5 } }], { x: x + 0.65, y: y + 0.02, w: 3.85, h: 0.38, fontSize: 10.5, valign: "middle" });
  });
}

// 17. Pendências ------------------------------------------------------------------------------
{
  const s = slide("CONTEUDO", "Próximos passos");
  s.addText("O que ainda não está pronto", { placeholder: "title" });
  const pend = D.etapas.flatMap((e) => e.texto.pendente.map((p) => ["E" + e.n, p]));
  pend.forEach(([e, p], i) => {
    const y = 1.2 + i * 0.75;
    card(s, 0.5, y, 9, 0.62, "pend-" + i);
    txt(s, e, { x: 0.65, y: y + 0.12, w: 0.6, h: 0.38, fontSize: 16, bold: true, color: C.accent3 });
    txt(s, p, { x: 1.35, y: y + 0.08, w: 8.0, h: 0.48, fontSize: 12, valign: "middle" });
  });
}

// 18. Próximos passos ---------------------------------------------------------------------------
{
  const s = slide("ESCURO", "Próximos passos");
  s.addText("Próximo: validação com projetos reais", { placeholder: "title" });
  s.addText("E8 · executar os 5 projetos de teste sem intervenção e medir os 8 critérios\nE9 · corrigir por ordem de impacto e medir de novo\nE10 · último ciclo, versão congelada e documento de entrega", { placeholder: "body" });
}

pres.writeFile({ fileName: SAIDA }).then(async () => {
  const { applyTheme } = require(process.env.APPLY_THEME);
  await applyTheme(SAIDA, THEME);
  console.log("ok", SAIDA);
});
