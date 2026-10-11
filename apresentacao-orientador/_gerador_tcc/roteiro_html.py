# -*- coding: utf-8 -*-
"""Gera a página HTML de estudo de cada etapa a partir de roteiros-de-estudo/fonte/E<n>.md.

    python roteiro_html.py            # todas as etapas que tiverem fonte
    python roteiro_html.py 2          # só a E2

Saída: roteiros-de-estudo/E<n>-<slug>.html e index.html. Figuras (faixa, mapa, diagrama) entram
embutidas em base64; Mermaid e realce de código vêm de CDN (precisa de internet ao abrir).
"""
import base64
import html
import os
import re
import sys
import tempfile

import markdown

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import catalogo as C  # noqa: E402
import figuras_etapa as F  # noqa: E402
import metricas as M  # noqa: E402

PASTA = os.path.join(os.path.dirname(AQUI), "roteiros-de-estudo")
ETAPA_STATUS = {1: "parcial", 2: "ok", 3: "ok", 4: "ok", 5: "ok", 6: "bloqueada", 7: "andamento"}
SELO = {"ok": ("Entrega aprovada", "ok"), "parcial": ("Entregue com pendência", "warn"),
        "bloqueada": ("Entrega bloqueada", "bad"), "andamento": ("Entrega em andamento", "warn")}
CAIXAS = {"IDEIA": ("💡", "Ideia-chave", "ideia"), "DICA": ("🎯", "Dica para a apresentação", "dica"),
          "ATENCAO": ("⚠️", "Atenção", "atencao"), "FALA": ("🗣️", "Frase pronta", "fala")}


def arquivo(n):
    return f"E{n}-{C.ETAPAS[n]['slug'].split('-', 1)[1]}.html"


def b64(caminho):
    return "data:image/png;base64," + base64.b64encode(open(caminho, "rb").read()).decode()


def converter(md):
    # duas caixas seguidas, separadas só por linha em branco, viram UM blockquote no Markdown;
    # um comentário entre elas mantém cada caixa separada
    md = re.sub(r"(?m)^(>[^\n]*)\n\n(?=> \[!)", r"\1\n\n<!-- -->\n\n", md)
    corpo = markdown.markdown(md, extensions=["tables", "fenced_code", "toc", "sane_lists"],
                              extension_configs={"toc": {"permalink": False}})
    # Mermaid: <pre><code class="language-mermaid"> → <pre class="mermaid">
    corpo = re.sub(r'<pre><code class="language-mermaid">(.*?)</code></pre>',
                   lambda m: '<div class="diagrama"><pre class="mermaid">' + html.unescape(m.group(1)) + "</pre></div>",
                   corpo, flags=re.S)
    # caixas: <blockquote><p>[!TIPO] texto</p>...</blockquote>
    def caixa(m):
        tipo, resto = m.group(1), m.group(2)
        ico, rot, cls = CAIXAS.get(tipo, ("ℹ️", tipo.title(), "ideia"))
        return f'<div class="caixa {cls}"><div class="caixa-rot">{ico} {rot}</div><p>{resto}</div>'
    corpo = re.sub(r"<blockquote>\s*<p>\[!(\w+)\]\s*(.*?)</blockquote>", caixa, corpo, flags=re.S)
    return corpo


def indice(corpo):
    itens = re.findall(r'<h2 id="([^"]+)">(.*?)</h2>', corpo)
    return "".join(f'<a href="#{i}">{re.sub("<.*?>", "", t)}</a>' for i, t in itens)


CSS = """
:root{--bg:#f6f7f9;--card:#fff;--ink:#1f2328;--ink2:#4a5160;--muted:#7a8290;--line:#e3e6eb;--navy:#1b2a41;
--acc:#2a78d6;--ok:#2a9d8f;--warn:#e9a23b;--bad:#c0392b;--code:#f1f3f6;--ideia:#e8f1fc;--dica:#e6f5f3;
--atencao:#fdf1e2;--fala:#f1ecfb}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#121417;--card:#1b1e23;--ink:#eceef1;
--ink2:#c3c8d0;--muted:#8d95a1;--line:#2c3139;--navy:#9db4d8;--acc:#5b9cf0;--code:#23272e;--ideia:#17263a;
--dica:#13302c;--atencao:#352812;--fala:#262038}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 "Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
.topo{background:#fff;border-bottom:1px solid var(--line);padding:14px 24px 6px}
.topo img{width:100%;max-width:1150px;display:block;margin:0 auto}
.nav{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;padding:8px 16px;background:var(--card);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.nav a{padding:4px 12px;border-radius:99px;text-decoration:none;color:var(--ink2);font-weight:600;font-size:14px;border:1px solid var(--line)}
.nav a.atual{background:var(--navy);color:#fff;border-color:var(--navy)}
.layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:28px;max-width:1240px;margin:0 auto;padding:24px}
aside{position:sticky;top:60px;align-self:start;max-height:calc(100vh - 80px);overflow:auto}
aside h4{margin:0 0 8px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
aside a{display:block;padding:5px 10px;border-radius:8px;color:var(--ink2);text-decoration:none;font-size:14px}
aside a:hover{background:var(--card)}
main{min-width:0}
.hero{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:26px 30px;margin-bottom:22px}
.hero .k{font-size:13px;letter-spacing:.12em;font-weight:700;color:var(--muted)}
.hero h1{margin:4px 0 6px;font-size:38px;line-height:1.15;color:var(--navy);font-family:Cambria,Georgia,serif}
.selo{display:inline-block;padding:4px 14px;border-radius:99px;color:#fff;font-weight:700;font-size:14px}
.selo.ok{background:var(--ok)}.selo.warn{background:var(--warn)}.selo.bad{background:var(--bad)}
.duas{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}
.bloco{border-radius:12px;padding:16px 20px;color:#fff}.bloco small{display:block;font-weight:700;letter-spacing:.08em;font-size:12px;opacity:.9;margin-bottom:6px}
.bloco b{font-family:Cambria,Georgia,serif;font-size:19px;line-height:1.35}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}
.tile{background:var(--bg);border-radius:12px;padding:14px 16px}.tile .v{font-size:32px;font-weight:700;color:var(--navy);font-family:Cambria,Georgia,serif;line-height:1}
.tile .l{color:var(--muted);font-size:13px;margin-top:6px}
.figs{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0 6px}
.figs figure{margin:0;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px}
.figs img{width:100%;display:block}.figs figcaption{font-size:13px;color:var(--muted);margin-top:4px;text-align:center}
article{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:8px 34px 30px}
article h1{display:none}
article h2{font-size:26px;color:var(--navy);font-family:Cambria,Georgia,serif;margin:40px 0 10px;padding-top:14px;border-top:1px solid var(--line)}
article h2:first-of-type{border-top:0}
article h3{font-size:19px;margin:28px 0 8px;padding:8px 14px;background:var(--bg);border-radius:10px}
article h4{font-size:16px;margin:18px 0 6px;color:var(--ink2)}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14.5px;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}th{background:var(--bg)}
code{font-family:Consolas,"Cascadia Mono",monospace;font-size:.9em;background:var(--code);padding:.1em .35em;border-radius:5px}
pre{background:var(--code);border-radius:10px;padding:14px 16px;overflow:auto;line-height:1.45}pre code{background:none;padding:0}
.diagrama{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;margin:14px 0;overflow-x:auto;text-align:center}
.diagrama pre{background:none}
.caixa{border-radius:12px;padding:12px 18px;margin:14px 0}.caixa p{margin:4px 0}
.caixa-rot{font-weight:700;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink2)}
.caixa.ideia{background:var(--ideia)}.caixa.dica{background:var(--dica)}.caixa.atencao{background:var(--atencao)}.caixa.fala{background:var(--fala)}
.caixa.fala p{font-size:17px;font-style:italic}
@media (max-width:900px){.layout{grid-template-columns:1fr}aside{position:static;max-height:none}.duas,.figs{grid-template-columns:1fr}.tiles{grid-template-columns:1fr 1fr}article{padding:4px 18px 20px}}
@media print{.nav,aside{display:none}.layout{display:block}article,.hero{border:0}}
"""


def pagina(n, corpo, figs, cod, existentes):
    e = C.ETAPAS[n]
    rot, cls = SELO[ETAPA_STATUS[n]]
    tarefas = [t for t in C.T if t["etapa"] == n]
    concl = sum(1 for t in tarefas if t["status"] == "done")
    if cod:
        tiles = [(f"{concl}/{len(tarefas)}", "tarefas concluídas"), (len(cod["commits"]), "commits na etapa"),
                 (f"{cod['testes']:,}".replace(",", "."), "testes automáticos"), (cod["modulos"], "módulos Elixir")]
    else:
        tiles = [(f"{concl}/{len(tarefas)}", "documentos"), (15, "requisitos"), (8, "critérios"), (5, "projetos de teste")]
    cor_res = {"ok": "var(--ok)", "warn": "var(--warn)", "bad": "var(--bad)"}[cls]
    nav = "".join(f'<a class="{"atual" if k == n else ""}" href="{arquivo(k)}">E{k}</a>' for k in existentes)
    texto_res = re.search(r"## Em 30 segundos\s*\n(.*?)\n## ", open(os.path.join(PASTA, "fonte", f"E{n}.md"), encoding="utf-8").read(), re.S)
    resumo = re.sub(r"^[-*]\s*", "", re.sub(r"[*`>]", "", texto_res.group(1)).strip().split("\n")[0]) if texto_res else ""
    return f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Roteiro E{n} — {html.escape(e['pt'])}</title><style>{CSS}</style>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
</head><body>
<div class="topo"><img src="{figs['faixa']}" alt="Linha do tempo das etapas"></div>
<nav class="nav"><a href="index.html">Início</a>{nav}</nav>
<div class="layout"><aside><h4>Nesta página</h4>{indice(corpo)}</aside><main>
<section class="hero"><div class="k">ROTEIRO DE ESTUDO · ETAPA {n} DE 10</div><h1>{html.escape(e['pt'])}</h1>
<span class="selo {cls}">{rot}</span> <span style="color:var(--muted);margin-left:8px">{e['datas']} · branch <code>etapa/{e['slug']}</code></span>
<div class="duas"><div class="bloco" style="background:var(--navy)"><small>PROPOSTA DO PLANO</small><b>{html.escape(e['entrega_pt'])}</b></div>
<div class="bloco" style="background:{cor_res}"><small>{rot.upper()}</small><b>{html.escape(resumo)}</b></div></div>
<div class="tiles">{''.join(f'<div class="tile"><div class="v">{v}</div><div class="l">{l}</div></div>' for v, l in tiles)}</div>
<div class="figs"><figure><img src="{figs['mapa']}" alt="Camadas"><figcaption>Onde esta etapa entra no sistema</figcaption></figure>
<figure><img src="{figs['diag']}" alt="Diagrama"><figcaption>Como funciona, em uma figura</figcaption></figure></div></section>
<article>{corpo}</article></main></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/elixir.min.js"></script>
<script>document.querySelectorAll('pre code:not(.language-mermaid)').forEach(b=>{{try{{hljs.highlightElement(b)}}catch(e){{}}}});</script>
<script type="module">import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
mermaid.initialize({{startOnLoad:true,theme:"neutral",securityLevel:"loose",flowchart:{{htmlLabels:true}}}});</script>
</body></html>"""


def indice_geral(existentes):
    cards = ""
    for n in existentes:
        e = C.ETAPAS[n]
        rot, cls = SELO[ETAPA_STATUS[n]]
        cards += (f'<a class="card" href="{arquivo(n)}"><div class="k">ETAPA {n}</div><h3>{html.escape(e["pt"])}</h3>'
                  f'<p>{html.escape(e["entrega_pt"])}</p><span class="selo {cls}">{rot}</span></a>')
    return f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Roteiros de estudo — TCC</title><style>{CSS}
.grade{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;max-width:1100px;margin:30px auto;padding:0 20px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px 22px;text-decoration:none;color:var(--ink)}}
.card:hover{{border-color:var(--acc)}}.card h3{{margin:4px 0 8px;font-family:Cambria,Georgia,serif;font-size:22px;color:var(--navy)}}
.card .k{{font-size:12px;letter-spacing:.12em;color:var(--muted);font-weight:700}}.card p{{color:var(--ink2);font-size:15px}}
h1.t{{text-align:center;font-family:Cambria,Georgia,serif;color:var(--navy);margin:36px 16px 4px}}p.s{{text-align:center;color:var(--muted);margin:0 16px}}</style></head>
<body><h1 class="t">Roteiros de estudo por etapa</h1><p class="s">Fábrica de Software Multi-Agente — material de preparação para as apresentações ao orientador</p>
<div class="grade">{cards}</div></body></html>"""


def gerar(n, existentes):
    md = open(os.path.join(PASTA, "fonte", f"E{n}.md"), encoding="utf-8").read()
    corpo = converter(md)
    d = tempfile.mkdtemp()
    caminhos = {k: os.path.join(d, k + ".png") for k in ("faixa", "mapa", "diag")}
    F.faixa(n, ETAPA_STATUS, caminhos["faixa"])
    F.escada(n, caminhos["mapa"])
    F.diagrama(n, caminhos["diag"])
    figs = {k: b64(v) for k, v in caminhos.items()}
    cod = M.codigo(n) if n >= 2 else None
    destino = os.path.join(PASTA, arquivo(n))
    open(destino, "w", encoding="utf-8").write(pagina(n, corpo, figs, cod, existentes))
    print("ok", destino)


if __name__ == "__main__":
    existentes = [n for n in range(1, 8) if os.path.exists(os.path.join(PASTA, "fonte", f"E{n}.md"))]
    alvo = [int(a) for a in sys.argv[1:]] or existentes
    for n in alvo:
        gerar(n, existentes)
    open(os.path.join(PASTA, "index.html"), "w", encoding="utf-8").write(indice_geral(existentes))
