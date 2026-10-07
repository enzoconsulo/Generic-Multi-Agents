# -*- coding: utf-8 -*-
"""Gera a pasta da apresentação ao orientador a partir do repositório REAL.

    python apresentacao-orientador/_gerador/gerar.py

Lê: projetos/fabrica-v2 (tarefas, git, testes) e painel/dados/jobs (custo medido das
rodadas). Escreve, para cada etapa: NOTAS.md, slides.html, dados.json, tarefas/ (cópia dos
arquivos de tarefa) e arquivos/ (os fontes da etapa no commit que a fechou). E na raiz:
apresentacao.html (o deck inteiro), dados.json e PAINEL.md.

Reexecutável: rode de novo depois de uma rodada da fábrica e os números se atualizam.
"""
import datetime
import glob
import html
import json
import os
import re
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.dirname(AQUI)
RAIZ = os.path.dirname(SAIDA)
PROJ = os.path.join(RAIZ, "projetos", "fabrica-v2")
JOBS = os.path.join(RAIZ, "painel", "dados", "jobs")
EVID = os.path.join(SAIDA, "_evidencias-brutas")

sys.path.insert(0, AQUI)
import conteudo as C  # noqa: E402

STATUS_LEG = {"concluida": "concluída", "em-execucao": "em execução", "em-teste": "em teste",
              "em-revisao": "em revisão", "pronta": "pronta", "backlog": "backlog",
              "bloqueada": "bloqueada", "cancelada": "cancelada"}


def git(*args, cwd=PROJ):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace").stdout


def git_bytes(*args):
    r = subprocess.run(["git", *args], cwd=PROJ, capture_output=True)
    return r.stdout if r.returncode == 0 else None


# ---------------------------------------------------------------- tarefas
def ler_tarefas():
    tarefas = {}
    for f in sorted(glob.glob(os.path.join(PROJ, "_gestao", "tarefas", "T-*.md"))):
        txt = open(f, encoding="utf-8", errors="replace").read()
        m = re.match(r"---\n(.*?)\n---\n(.*)", txt, re.S)
        if not m:
            continue
        fm, corpo = m.groups()
        d = {}
        for linha in fm.splitlines():
            if ":" in linha and not linha.startswith(" "):
                k, v = linha.split(":", 1)
                d[k.strip()] = v.strip().strip('"')
        lista = lambda s: [x.strip() for x in s.strip("[]").split(",") if x.strip()]  # noqa: E731
        obj = re.search(r"## Objetivo\n(.*?)(\n\n|\n## )", corpo, re.S)
        tarefas[d["id"]] = {
            "id": d["id"], "titulo": d.get("titulo", ""), "status": d.get("status", "?"),
            "versao": d.get("versao", ""), "tentativas": int(d.get("tentativas", "0") or 0),
            "criada": d.get("criada", ""), "atualizada": d.get("atualizada", ""),
            "areas": lista(d.get("areas", "")), "dependencias": lista(d.get("dependencias", "")),
            "objetivo": " ".join(obj.group(1).split()) if obj else "",
            "arquivo": f,
        }
    return tarefas


ORDEM = {}  # hash -> posição no git log (0 = mais recente); datas empatam, a ordem não


def commits_por_tarefa():
    out = git("log", "--format=%H\t%ad\t%s", "--date=short")
    por = {}
    for k, linha in enumerate(out.splitlines()):
        h, data, assunto = linha.split("\t", 2)
        ORDEM[h] = k
        m = re.match(r"(T-\d{3}[a-z]?)[: ]", assunto)
        if m:
            por.setdefault(m.group(1), []).append((h, data, assunto))
    return por  # mais recente primeiro


def custos_por_tarefa():
    custo, desp, jobs, total = {}, {}, 0, 0.0
    for f in glob.glob(os.path.join(JOBS, "*.json")):
        try:
            j = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        if j.get("escopo") != "projeto:fabrica-v2":
            continue
        cpt = (j.get("resultado") or {}).get("custoPorTarefa") or []
        if cpt:
            jobs += 1
        for c in cpt:
            t = c.get("tarefa")
            custo[t] = custo.get(t, 0) + float(c.get("custoUsd") or 0)
            desp[t] = desp.get(t, 0) + int(c.get("despachos") or 0)
            total += float(c.get("custoUsd") or 0)
    return custo, desp, jobs, total


def conta_testes(src):
    return len(re.findall(r'^\s*(?:test|property)\s+"', src, re.M))


# ---------------------------------------------------------------- evidência
def ler_evidencia(nome):
    p = os.path.join(EVID, nome + ".txt")
    if not os.path.exists(p):
        return None
    txt = open(p, encoding="utf-8", errors="replace").read()
    m = re.search(r"(\d+) tests?, (\d+) failures?(?:, (\d+) excluded)?", txt)
    t = re.search(r"Finished in ([\d.]+) seconds", txt)
    real = re.search(r"real\s+(\S+)", txt)
    return {"testes": int(m.group(1)) if m else None, "falhas": int(m.group(2)) if m else None,
            "segundos": t.group(1) if t else None, "real": real.group(1) if real else None,
            "bruto": txt}


# ---------------------------------------------------------------- dados por etapa
def montar():
    tarefas = ler_tarefas()
    commits = commits_por_tarefa()
    custo, desp, njobs, custo_total = custos_por_tarefa()
    atribuidas = set()
    etapas = []
    for e in C.ETAPAS:
        ids = [t for _, _, ts, _ in e["pacotes"] for t in ts]
        atribuidas.update(ids)
        linhas = []
        for t in ids:
            if t not in tarefas:
                continue
            tk = tarefas[t]
            cs = commits.get(t, [])
            linhas.append({**{k: tk[k] for k in ("id", "titulo", "status", "tentativas", "areas", "objetivo")},
                           "commits": len(cs), "ultimo_commit": cs[0][0][:7] if cs else None,
                           "concluida_em": cs[0][1] if cs else None,
                           "custo_usd": round(custo.get(t, 0), 2), "despachos": desp.get(t, 0)})
        # commit que fecha a etapa: o mais recente entre as tarefas concluídas dela
        fech = None
        for t in ids:
            for h, data, _ in commits.get(t, [])[:1]:
                if tarefas.get(t, {}).get("status") == "concluida" and (fech is None or ORDEM[h] < ORDEM[fech[0]]):
                    fech = (h, data)
        if e["status"] in ("em-andamento", "bloqueada"):
            fech = (git("rev-parse", "HEAD").strip(), datetime.date.today().isoformat())
        # arquivos da etapa (fora de _gestao), no commit de fechamento
        arquivos = set()
        for a in {a for l in linhas for a in l["areas"] if not a.startswith("_gestao") and "*" not in a}:
            if fech:
                arquivos.update(x for x in git("ls-tree", "-r", "--name-only", fech[0], "--", a.rstrip("/")).splitlines() if x)
        arquivos = sorted(arquivos)
        testes = linhas_lib = 0
        presentes = []
        for a in arquivos:
            b = git_bytes("show", f"{fech[0]}:{a}") if fech else None
            if b is None:
                continue
            presentes.append(a)
            src = b.decode("utf-8", "replace")
            if a.startswith("test/"):
                testes += conta_testes(src)
            elif a.startswith("lib/"):
                linhas_lib += src.count("\n")
        concl = [l for l in linhas if l["status"] == "concluida"]
        etapas.append({
            "def": e, "tarefas": linhas, "fechamento": fech, "arquivos": presentes,
            "n_tarefas": len(linhas), "n_concluidas": len(concl),
            "commits": sum(l["commits"] for l in linhas), "testes": testes, "linhas_lib": linhas_lib,
            "custo_usd": round(sum(l["custo_usd"] for l in linhas), 2),
            "despachos": sum(l["despachos"] for l in linhas),
            "primeira": sum(1 for l in concl if l["tentativas"] <= 1),
            "tent_media": round(sum(max(l["tentativas"], 1) for l in concl) / len(concl), 2) if concl else None,
            "evidencia": ler_evidencia(e["evid_cmd"]) if e.get("evid_cmd") else None,
            "marco_status": tarefas.get(e["marco"], {}).get("status") if e.get("marco") else None,
        })
    nao_atrib = sorted(set(tarefas) - atribuidas - C.FORA_DA_APRESENTACAO)
    if nao_atrib:
        print("AVISO: tarefas sem etapa:", ", ".join(nao_atrib))
    presentes = [t for t in tarefas if t not in C.FORA_DA_APRESENTACAO]
    lib_total = sum(open(f, encoding="utf-8", errors="replace").read().count("\n")
                    for f in glob.glob(os.path.join(PROJ, "lib", "**", "*.ex"), recursive=True))
    testes_total = sum(conta_testes(open(f, encoding="utf-8", errors="replace").read())
                       for f in glob.glob(os.path.join(PROJ, "test", "**", "*.exs"), recursive=True))
    geral = {
        "gerado_em": datetime.datetime.now().strftime("%d/%m/%Y %H:%M"),
        "head": git("rev-parse", "--short", "HEAD").strip(),
        "commits_total": int(git("rev-list", "--count", "HEAD").strip() or 0),
        "tarefas_total": len(presentes),
        "concluidas": sum(1 for t in presentes if tarefas[t]["status"] == "concluida"),
        "por_status": {s: sum(1 for t in presentes if tarefas[t]["status"] == s)
                       for s in STATUS_LEG},
        "linhas_lib": lib_total, "testes_total": testes_total,
        "arquivos_lib": len(glob.glob(os.path.join(PROJ, "lib", "**", "*.ex"), recursive=True)),
        "arquivos_teste": len(glob.glob(os.path.join(PROJ, "test", "**", "*.exs"), recursive=True)),
        "custo_medido_usd": round(custo_total, 2), "rodadas_medidas": njobs,
        "suite": ler_evidencia("suite"),
        "nao_atribuidas": nao_atrib,
    }
    return tarefas, etapas, geral


# ---------------------------------------------------------------- HTML
def esc(s):
    return html.escape(str(s))


def md_inline(s):
    s = esc(s)
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", s)


CSS = """
:root{--bg:#f6f5f2;--card:#ffffff;--ink:#16161a;--ink2:#4e4d4a;--ink3:#86847f;--line:#e3e1dc;
--acc:#2a78d6;--acc-soft:#e6effa;--ok:#0f7b3f;--ok-soft:#e3f3e8;--warn:#a86200;--warn-soft:#fbf0dc;
--bad:#b42323;--bad-soft:#f9e3e3;--bar:#2a78d6;--code:#f0efeb}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#121214;--card:#1c1c1f;
--ink:#f2f1ec;--ink2:#c3c2b7;--ink3:#8d8b84;--line:#2e2e32;--acc:#5b9cf0;--acc-soft:#1b2a3d;
--ok:#4cc27b;--ok-soft:#16301f;--warn:#e0a03a;--warn-soft:#33270f;--bad:#ef6b6b;--bad-soft:#3a1717;
--bar:#3987e5;--code:#26262a}}
:root[data-theme="dark"]{--bg:#121214;--card:#1c1c1f;--ink:#f2f1ec;--ink2:#c3c2b7;--ink3:#8d8b84;
--line:#2e2e32;--acc:#5b9cf0;--acc-soft:#1b2a3d;--ok:#4cc27b;--ok-soft:#16301f;--warn:#e0a03a;
--warn-soft:#33270f;--bad:#ef6b6b;--bad-soft:#3a1717;--bar:#3987e5;--code:#26262a}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);
font-family:"Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
.slide{display:none;min-height:100vh;padding:5vh 6vw 9vh;flex-direction:column;gap:2.2vh}
.slide.ativo{display:flex}
h1{font-size:clamp(28px,4.6vw,64px);margin:0;line-height:1.08;letter-spacing:-.02em}
h2{font-size:clamp(22px,2.9vw,40px);margin:0;letter-spacing:-.01em}
h3{font-size:clamp(15px,1.4vw,20px);margin:0 0 .6em;color:var(--ink2);font-weight:600}
p,li{font-size:clamp(14px,1.45vw,21px);line-height:1.45}
.kicker{font-size:clamp(12px,1.1vw,16px);text-transform:uppercase;letter-spacing:.12em;color:var(--acc);font-weight:700}
.sub{color:var(--ink2);font-size:clamp(16px,1.8vw,26px);margin:0}
.grid{display:grid;gap:1.6vw}.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}
.g4{grid-template-columns:repeat(4,1fr)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1.6vw 1.8vw}
.kpi .v{font-size:clamp(26px,3.6vw,54px);font-weight:700;letter-spacing:-.02em;line-height:1}
.kpi .l{color:var(--ink2);font-size:clamp(12px,1.1vw,16px);margin-top:.5em}
.pill{display:inline-flex;align-items:center;gap:.4em;padding:.25em .8em;border-radius:99px;font-weight:600;
font-size:clamp(12px,1.1vw,16px);white-space:nowrap}
.ok{background:var(--ok-soft);color:var(--ok)}.warn{background:var(--warn-soft);color:var(--warn)}
.bad{background:var(--bad-soft);color:var(--bad)}.neutro{background:var(--acc-soft);color:var(--acc)}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:.55em .7em;border-bottom:1px solid var(--line);
font-size:clamp(12px,1.15vw,17px);vertical-align:top}th{color:var(--ink3);font-weight:600}
code{font-family:Consolas,"Cascadia Mono",monospace;background:var(--code);padding:.08em .35em;border-radius:5px;font-size:.92em}
pre{background:var(--code);border-radius:10px;padding:1em 1.2em;overflow:auto;font-size:clamp(12px,1.1vw,16px);margin:0;
white-space:pre-wrap;word-break:break-word}
ul{margin:.2em 0;padding-left:1.2em}li{margin:.25em 0}
.ids{color:var(--ink3);font-size:.85em}
.rodape{position:fixed;left:0;right:0;bottom:0;display:flex;justify-content:space-between;align-items:center;
padding:1.2vh 2vw;color:var(--ink3);font-size:13px;background:linear-gradient(transparent,var(--bg) 40%)}
.rodape button{background:var(--card);border:1px solid var(--line);color:var(--ink2);border-radius:8px;padding:.35em .8em;cursor:pointer;font:inherit}
.prog{position:fixed;top:0;left:0;height:3px;background:var(--acc);transition:width .2s}
.timeline{display:grid;grid-template-columns:repeat(10,1fr);gap:4px;margin-top:1vh}
.timeline div{padding:.6em .3em;border-radius:8px;text-align:center;font-size:clamp(11px,1vw,15px);font-weight:600;background:var(--card);border:1px solid var(--line);color:var(--ink3)}
.timeline .t-ok{background:var(--ok-soft);color:var(--ok);border-color:transparent}
.timeline .t-warn{background:var(--warn-soft);color:var(--warn);border-color:transparent}
.timeline .t-bad{background:var(--bad-soft);color:var(--bad);border-color:transparent}
.timeline .agora{outline:3px solid var(--acc);outline-offset:2px}
img.tela{width:100%;border-radius:10px;border:1px solid var(--line)}
svg text{fill:var(--ink2);font-size:13px}svg .val{fill:var(--ink);font-weight:600}
.muted{color:var(--ink3)}
@media (max-width:800px){.g2,.g3,.g4{grid-template-columns:1fr}.slide{padding:4vh 16px 10vh}}
@media print{.slide{display:flex!important;page-break-after:always;min-height:auto}.rodape,.prog{display:none}}
"""

JS = """
const S=[...document.querySelectorAll('.slide')];let i=0;
function ir(n){i=Math.max(0,Math.min(S.length-1,n));S.forEach((s,k)=>s.classList.toggle('ativo',k===i));
document.getElementById('cont').textContent=(i+1)+' / '+S.length;
document.querySelector('.prog').style.width=((i+1)/S.length*100)+'%';
try{history.replaceState(null,'','#'+(i+1))}catch(e){}}
document.addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();ir(i+1)}
if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();ir(i-1)}if(e.key==='Home')ir(0);if(e.key==='End')ir(S.length-1);
if(e.key==='f')document.documentElement.requestFullscreen?.();
if(e.key==='t'){const r=document.documentElement;r.dataset.theme=r.dataset.theme==='dark'?'light':'dark'}});
document.getElementById('ant').onclick=()=>ir(i-1);document.getElementById('prox').onclick=()=>ir(i+1);
ir(parseInt(location.hash.slice(1)||'1')-1);
"""


def pagina(titulo, slides):
    return f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(titulo)}</title>
<style>{CSS}</style></head><body><div class="prog"></div>
{''.join(slides)}
<div class="rodape"><span>{esc(C.PROJETO_TITULO)} · {esc(C.AUTOR)}</span>
<span>← → navega · F tela cheia · T tema</span>
<span><button id="ant">‹</button> <span id="cont"></span> <button id="prox">›</button></span></div>
<script>{JS}</script></body></html>"""


def pill_status(st, txt=None):
    cls = {"concluida": "ok", "entregue-com-pendencia": "warn", "bloqueada": "bad",
           "em-andamento": "warn", "pronta": "neutro", "backlog": "neutro", "em-teste": "warn",
           "em-revisao": "warn", "em-execucao": "warn", "ok": "ok", "parcial": "warn",
           "pendente": "bad"}.get(st, "neutro")
    ico = {"ok": "✓", "warn": "◐", "bad": "✕", "neutro": "○"}[cls]
    return f'<span class="pill {cls}">{ico} {esc(txt or STATUS_LEG.get(st, st))}</span>'


def barras(itens, unidade="", largura=900, alt_linha=26):
    """Barras horizontais, uma série, rótulo direto no fim da barra; tooltip por <title>."""
    if not itens:
        return ""
    mx = max(v for _, v in itens) or 1
    esq, dir_ = 120, 90
    h = alt_linha * len(itens) + 6
    out = [f'<svg viewBox="0 0 {largura} {h}" width="100%" role="img">']
    for k, (rot, v) in enumerate(itens):
        y = k * alt_linha + 3
        w = max(2, (largura - esq - dir_) * v / mx)
        val = f"{v:.2f}".replace(".", ",") if isinstance(v, float) else str(v)
        out.append(f'<g><title>{esc(rot)}: {val}{unidade}</title>'
                   f'<text x="{esq - 8}" y="{y + alt_linha * .62}" text-anchor="end">{esc(rot)}</text>'
                   f'<rect x="{esq}" y="{y + 4}" width="{w:.1f}" height="{alt_linha - 10}" rx="4" fill="var(--bar)"/>'
                   f'<text class="val" x="{esq + w + 6:.1f}" y="{y + alt_linha * .62}">{val}{unidade}</text></g>')
    out.append("</svg>")
    return "".join(out)


def timeline(atual):
    cls = {1: "t-warn", 2: "t-ok", 3: "t-ok", 4: "t-ok", 5: "t-ok", 6: "t-bad", 7: "t-warn"}
    cel = []
    for n in range(1, 11):
        c = cls.get(n, "")
        if n == atual:
            c += " agora"
        cel.append(f'<div class="{c}">E{n}</div>')
    return f'<div class="timeline">{"".join(cel)}</div>'


def fmt_usd(v):
    return "US$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def slides_etapa(et, geral, prefixo_img=""):
    e = et["def"]
    n = e["n"]
    sl = []
    # 1. capa
    sl.append(f"""<section class="slide"><div class="kicker">Etapa E{n} · {esc(e['fase'])} · {esc(e['datas'])}</div>
<h1>E{n} — {esc(e['nome'])}</h1><p class="sub">Entrega combinada: <b>{esc(e['entrega'])}</b></p>
<div>{pill_status(e['status'], e['status_txt'])}</div>{timeline(n)}
<p class="muted">Verde: entrega aprovada · amarelo: construída com pendência · vermelho: entrega bloqueada · contorno: esta etapa</p></section>""")
    # 2. combinado × feito
    linhas = []
    tmap = {t["id"]: t for t in et["tarefas"]}
    for cod, nome, ids, desc in e["pacotes"]:
        sts = [tmap[i]["status"] for i in ids if i in tmap]
        if not ids:
            st = "concluida" if n == 1 else "neutro"
            stx = "feito"
        elif all(s == "concluida" for s in sts):
            st, stx = "concluida", f"{len(sts)}/{len(sts)} concluídas"
        else:
            c = sum(1 for s in sts if s == "concluida")
            st = "bloqueada" if any(s == "bloqueada" for s in sts) else "em-andamento"
            stx = f"{c}/{len(sts)} concluídas"
        linhas.append(f"<tr><td><b>{esc(cod)}</b></td><td>{esc(nome)}<div class='ids'>{esc(desc)}</div></td>"
                      f"<td>{pill_status(st, stx)}</td><td class='ids'>{esc(', '.join(ids))}</td></tr>")
    sl.append(f"""<section class="slide"><div class="kicker">E{n} · o combinado × o feito</div>
<h2>Os pacotes do plano, e o que existe no código</h2>
<div class="card"><table><tr><th>Pacote</th><th>O que é</th><th>Situação</th><th>Tarefas</th></tr>{''.join(linhas)}</table></div></section>""")
    # 3. números
    if et["n_tarefas"]:
        kp = [(f"{et['n_concluidas']}/{et['n_tarefas']}", "tarefas concluídas"),
              (str(et["commits"]), "commits das tarefas"),
              (str(et["testes"]), "testes nos arquivos da etapa"),
              (f"{et['linhas_lib']:,}".replace(",", "."), "linhas de código (lib/)")]
        kp2 = [(f"{et['primeira']}/{et['n_concluidas']}", "aprovadas na 1ª execução"),
               (str(et["tent_media"] or "—").replace(".", ","), "execuções por tarefa (média)"),
               (fmt_usd(et["custo_usd"]) if et["custo_usd"] else "—", "custo medido nas rodadas do painel*"),
               (str(et["despachos"] or "—"), "despachos de agente medidos*")]
        tiles = "".join(f'<div class="card kpi"><div class="v">{esc(v)}</div><div class="l">{esc(l)}</div></div>'
                        for v, l in kp + kp2)
        chart_itens = [(t["id"], max(t["tentativas"], 1)) for t in et["tarefas"] if t["status"] == "concluida"]
        sl.append(f"""<section class="slide"><div class="kicker">E{n} · números reais do repositório</div>
<h2>O que a etapa produziu, medido</h2><div class="grid g4">{tiles}</div>
<p class="muted">* custo e despachos contam só as rodadas registradas pelo painel (dólar-equivalente da cota, não fatura).
Commit de fechamento: <code>{esc((et['fechamento'] or ('',))[0][:7])}</code>.</p></section>""")
        if chart_itens:
            dist = {}
            for _, k in chart_itens:
                dist[k] = dist.get(k, 0) + 1
            itens = [(f"{k} execuç" + ("ão" if k == 1 else "ões"), dist[k]) for k in sorted(dist)]
            refeitas = [f"{i} ({k}×)" for i, k in chart_itens if k > 1]
            sl.append(f"""<section class="slide"><div class="kicker">E{n} · retrabalho</div>
<h2>Quantas execuções cada tarefa precisou até concluir</h2>
<div class="grid g2"><div class="card"><h3>Tarefas concluídas, por número de execuções</h3>{barras(itens, ' tarefas', largura=640, alt_linha=44)}</div>
<div class="card"><h3>Refeitas depois de uma reprovação</h3><p>{esc(', '.join(refeitas)) or 'nenhuma — todas aprovadas de primeira'}</p>
<p class="muted">Critério de desempenho “pouco retrabalho”: média ≤ 2 execuções por tarefa. Nesta etapa: <b>{str(et['tent_media']).replace('.', ',')}</b>.</p></div></div></section>""")
    # 4. requisitos + prova
    if e["requisitos"] or e.get("demo"):
        req = "".join(f"<tr><td><b>{r}</b></td><td>{esc(C.REQUISITOS[r][0])}<div class='ids'>{md_inline(como)}</div></td>"
                      f"<td>{pill_status(s, {'ok': 'atendido', 'parcial': 'parcial', 'pendente': 'pendente'}[s])}</td></tr>"
                      for r, s, como in e["requisitos"])
        ev = et["evidencia"]
        evh = ""
        if ev and ev["testes"] is not None:
            evh = (f'<p>{pill_status("ok" if ev["falhas"] == 0 else "pendente", str(ev["testes"]) + " testes, " + str(ev["falhas"]) + " falhas")}'
                   f' &nbsp;rodado nesta máquina em {esc(geral["gerado_em"][:10])}'
                   f'{" em " + esc(ev["segundos"]).replace(".", ",") + " s" if ev["segundos"] else ""}</p>')
        demo = f"<h3>Como demonstrar ao vivo</h3><pre>{esc(e['demo'])}</pre>{evh}" if e.get("demo") else ""
        sl.append(f"""<section class="slide"><div class="kicker">E{n} · requisitos e prova</div>
<h2>O que foi prometido, e como se prova</h2>
<div class="grid g2"><div class="card">{'<table>' + req + '</table>' if req else '<p class="muted">Sem requisito de sistema nesta etapa.</p>'}</div>
<div class="card">{demo or '<p class="muted">Sem demonstração executável nesta etapa.</p>'}</div></div></section>""")
    # 5. destaques
    sl.append(f"""<section class="slide"><div class="kicker">E{n} · destaques</div><h2>O que vale contar</h2>
<div class="card"><ul>{''.join('<li>' + md_inline(d) + '</li>' for d in e['destaques'])}</ul></div></section>""")
    # 6. imagens
    for img in e.get("imagens", []):
        sl.append(f"""<section class="slide"><div class="kicker">E{n} · evidência visual</div>
<h2>{esc(img.replace('.png', ''))}</h2><img class="tela" src="{prefixo_img}evidencias/{esc(img)}" alt="{esc(img)}"></section>""")
    # 7. pendente e próxima
    pend = "".join(f"<li>{md_inline(p)}</li>" for p in e["pendente"]) or "<li>Nada pendente.</li>"
    prox = "".join(f"<li>{md_inline(p)}</li>" for p in e["proxima"])
    sl.append(f"""<section class="slide"><div class="kicker">E{n} · o que falta</div><h2>Pendências e próxima rodada</h2>
<div class="grid g2"><div class="card"><h3>Pendente nesta etapa</h3><ul>{pend}</ul></div>
<div class="card"><h3>Próxima rodada</h3><ul>{prox}</ul></div></div></section>""")
    return sl


def slides_abertura(etapas, geral):
    ps = geral["por_status"]
    tiles = [(f"{geral['concluidas']}/{geral['tarefas_total']}", "tarefas concluídas"),
             (f"{geral['commits_total']}", "commits no repositório"),
             (f"{(geral['suite'] or {}).get('testes') or geral['testes_total']:,}".replace(",", "."), "testes automáticos"),
             (f"{geral['linhas_lib']:,}".replace(",", "."), "linhas de código (lib/)")]
    st = geral.get("suite")
    regras = "".join(f"<tr><td>{esc(a)}</td><td>{esc(b)}</td></tr>" for a, b in C.REGRAS)
    resumo = "".join(f"<tr><td><b>E{et['def']['n']}</b></td><td>{esc(et['def']['nome'])}</td>"
                     f"<td>{pill_status(et['def']['status'], et['def']['status_txt'])}</td></tr>" for et in etapas)
    chart = barras([(f"E{et['def']['n']}", et["n_concluidas"]) for et in etapas if et["n_tarefas"]], " concl.")
    sl = [f"""<section class="slide" style="justify-content:center"><div class="kicker">{esc(C.SUBTITULO)}</div>
<h1>{esc(C.PROJETO_TITULO)}</h1><p class="sub">{esc(C.AUTOR)} · dados de {esc(geral['gerado_em'])} · commit <code>{esc(geral['head'])}</code></p>
<div class="card" style="max-width:1100px"><p style="margin:0">{esc(C.IDEIA_CENTRAL)}</p></div></section>""",
          f"""<section class="slide"><div class="kicker">A tese</div><h2>Cada regra mora na estrutura, não no pedido</h2>
<div class="card"><table><tr><th>A regra</th><th>Onde ela mora</th></tr>{regras}</table></div></section>""",
          f"""<section class="slide"><div class="kicker">Onde estamos</div><h2>Calendário: estamos na E3. Código: E2–E5 provadas, E6–E7 construídas</h2>
{timeline(3)}<div class="grid g4" style="margin-top:2vh">{''.join(f'<div class="card kpi"><div class="v">{esc(v)}</div><div class="l">{esc(l)}</div></div>' for v, l in tiles)}</div>
<p class="muted">Status das tarefas: {', '.join(f'{STATUS_LEG[k]} {v}' for k, v in ps.items() if v)}.
{('Suíte completa nesta máquina: ' + str(st['testes']) + ' testes, ' + str(st['falhas']) + ' falhas.') if st and st['testes'] else ''}</p></section>""",
          f"""<section class="slide"><div class="kicker">Resumo por etapa</div><h2>As etapas e a situação de cada entrega</h2>
<div class="grid g2"><div class="card"><table>{resumo}</table></div><div class="card"><h3>Tarefas concluídas por etapa</h3>{chart}</div></div></section>"""]
    return sl


def slides_fechamento(geral):
    p = C.PROXIMA_RODADA_GERAL
    itens = "".join(f"<tr><td><b>{esc(a)}</b></td><td>{esc(b)}</td></tr>" for a, b in p["itens"])
    crit = "".join(f"<tr><td>{esc(a)}</td><td>{esc(b)}</td><td>{pill_status('pendente', 'a medir')}</td></tr>"
                   for a, b in C.CRITERIOS)
    return [f"""<section class="slide"><div class="kicker">Próxima rodada</div><h2>{esc(p['nome'])}</h2>
<p class="sub">{esc(p['datas'])}</p><div class="card"><table>{itens}</table></div></section>""",
            f"""<section class="slide"><div class="kicker">A régua</div><h2>Os 8 critérios de desempenho — medidos a partir da E8</h2>
<div class="card"><table><tr><th>Critério</th><th>Atingido quando</th><th></th></tr>{crit}</table></div></section>"""]


# ---------------------------------------------------------------- NOTAS.md
def notas(et, geral):
    e = et["def"]
    n = e["n"]
    L = [f"# E{n} — {e['nome']}", "",
         f"**Plano:** {e['datas']} · fase {e['fase']}" + (f" · no repositório: versão `{e['versao']}`" if e['versao'] else ""),
         f"**Entrega combinada no plano:** {e['entrega']}",
         f"**Situação hoje ({geral['gerado_em']}):** {e['status_txt']}", "",
         "> Arquivo gerado por `_gerador/gerar.py` a partir do repositório real. Não edite à mão:",
         "> edite `_gerador/conteudo.py` (texto) e rode o gerador de novo.", "",
         "## O que tem nesta pasta", "",
         "| item | o que é |", "|---|---|",
         "| `slides.html` | a apresentação desta etapa (abra no navegador; ← → navega) |",
         "| `NOTAS.md` | este arquivo: o que está feito, o que falta e a próxima rodada |",
         "| `dados.json` | os números desta etapa, extraídos do repositório |"]
    if et["tarefas"]:
        L += ["| `tarefas/` | cópia dos arquivos de tarefa desta etapa (objetivo, critérios, verificação, revisão) |",
              f"| `arquivos/` | os {len(et['arquivos'])} arquivos de código/teste desta etapa, no estado do commit `{(et['fechamento'] or ('',))[0][:7]}` |"]
    if e.get("imagens"):
        L.append("| `evidencias/` | capturas de tela das telas desta etapa |")
    if n == 1:
        L.append("| `documentos/` | os documentos de planejamento (plano, arquitetura, originalidade, estado da arte) |")
    if et.get("evidencia"):
        L.append("| `evidencia-marco.txt` | saída real do teste do marco, rodado nesta máquina na geração |")
    L += ["", "## O combinado × o feito", "", "| pacote | o que é | tarefas | situação |", "|---|---|---|---|"]
    tmap = {t["id"]: t for t in et["tarefas"]}
    for cod, nome, ids, desc in e["pacotes"]:
        sts = [f"{i} {STATUS_LEG.get(tmap[i]['status'], '?')}" for i in ids if i in tmap]
        L.append(f"| {cod} {nome} | {desc} | {', '.join(ids) or '—'} | {'; '.join(sts) or 'documento'} |")
    if et["tarefas"]:
        L += ["", "## Números (do repositório)", "",
              f"- tarefas: **{et['n_concluidas']}/{et['n_tarefas']} concluídas**; aprovadas de primeira: {et['primeira']}; execuções por tarefa (média): {et['tent_media']}",
              f"- commits das tarefas: {et['commits']} · testes nos arquivos da etapa: {et['testes']} · linhas em `lib/`: {et['linhas_lib']}",
              f"- custo medido nas rodadas do painel: {fmt_usd(et['custo_usd'])} em {et['despachos']} despachos (dólar-equivalente de cota; tarefas feitas no chat não entram)"]
        L += ["", "## Tarefas", "", "| tarefa | título | status | execuções | concluída em | custo medido |", "|---|---|---|---|---|---|"]
        for t in et["tarefas"]:
            L.append(f"| {t['id']} | {t['titulo']} | {STATUS_LEG.get(t['status'], t['status'])} | {max(t['tentativas'], 1)} | "
                     f"{t['concluida_em'] or '—'} | {fmt_usd(t['custo_usd']) if t['custo_usd'] else '—'} |")
    if e["requisitos"]:
        L += ["", "## Requisitos desta etapa", "", "| req | requisito | situação | como se prova |", "|---|---|---|---|"]
        for r, s, como in e["requisitos"]:
            L.append(f"| {r} | {C.REQUISITOS[r][0]} | {s} | {como} |")
    L += ["", "## Destaques (o que vale contar)", ""] + [f"- {d}" for d in e["destaques"]]
    L += ["", "## O que está feito / o que falta", "", "**Pendente nesta etapa:**", ""]
    L += [f"- {p}" for p in e["pendente"]] or ["- nada"]
    L += ["", "**Próxima rodada:**", ""] + [f"- {p}" for p in e["proxima"]]
    if e.get("demo"):
        L += ["", "## Como demonstrar ao vivo", "", "Na pasta `projetos/fabrica-v2`, com o Postgres de pé:", "",
              "```", e["demo"], "```"]
        ev = et.get("evidencia")
        if ev and ev["testes"] is not None:
            L.append(f"\nResultado na geração: **{ev['testes']} testes, {ev['falhas']} falhas** (saída completa em `evidencia-marco.txt`).")
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------- escrita
def limpar(p):
    if os.path.isdir(p):
        shutil.rmtree(p)
    os.makedirs(p)


def escrever():
    tarefas, etapas, geral = montar()
    todos = slides_abertura(etapas, geral)
    for et in etapas:
        e = et["def"]
        d = os.path.join(SAIDA, e["slug"])
        os.makedirs(d, exist_ok=True)
        for sub in ("tarefas", "arquivos", "evidencias"):
            if os.path.isdir(os.path.join(d, sub)):
                shutil.rmtree(os.path.join(d, sub))
        if et["tarefas"]:
            os.makedirs(os.path.join(d, "tarefas"))
            for t in et["tarefas"]:
                shutil.copy2(tarefas[t["id"]]["arquivo"], os.path.join(d, "tarefas"))
            for a in et["arquivos"]:
                b = git_bytes("show", f"{et['fechamento'][0]}:{a}")
                destino = os.path.join(d, "arquivos", *a.split("/"))
                os.makedirs(os.path.dirname(destino), exist_ok=True)
                open(destino, "wb").write(b)
        for img in e.get("imagens", []):
            src = os.path.join(PROJ, "_gestao", "evidencias", img)
            if os.path.exists(src):
                os.makedirs(os.path.join(d, "evidencias"), exist_ok=True)
                shutil.copy2(src, os.path.join(d, "evidencias"))
        if et.get("evidencia"):
            open(os.path.join(d, "evidencia-marco.txt"), "w", encoding="utf-8").write(et["evidencia"]["bruto"])
        if e["n"] == 1:
            docs = os.path.join(d, "documentos")
            os.makedirs(docs, exist_ok=True)
            for f in ["fabrica-multi-agente-plano-de-desenvolvimento.docx", "fabrica-multi-agente-arquitetura-7.docx",
                      "originalidade-resumo.pdf", "originalidade-completo.pdf", "_sistema/ESTADO_DA_ARTE.md"]:
                src = os.path.join(RAIZ, *f.split("/"))
                if os.path.exists(src):
                    shutil.copy2(src, docs)
        sl = slides_etapa(et, geral)
        open(os.path.join(d, "slides.html"), "w", encoding="utf-8").write(
            pagina(f"E{e['n']} {e['nome']}", sl))
        open(os.path.join(d, "NOTAS.md"), "w", encoding="utf-8").write(notas(et, geral))
        dj = {k: v for k, v in et.items() if k not in ("def", "evidencia")}
        json.dump(dj, open(os.path.join(d, "dados.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        todos += slides_etapa(et, geral, prefixo_img=e["slug"] + "/")
    todos += slides_fechamento(geral)
    open(os.path.join(SAIDA, "apresentacao.html"), "w", encoding="utf-8").write(pagina("Apresentação ao orientador", todos))
    g = {k: v for k, v in geral.items() if k != "suite"}
    g["suite"] = {k: v for k, v in (geral["suite"] or {}).items() if k != "bruto"} or None
    g["etapas"] = [{"etapa": f"E{et['def']['n']}", "nome": et["def"]["nome"], "status": et["def"]["status"],
                    **{k: et[k] for k in ("n_tarefas", "n_concluidas", "commits", "testes", "linhas_lib",
                                          "custo_usd", "despachos", "primeira", "tent_media", "marco_status")}}
                   for et in etapas]
    json.dump(g, open(os.path.join(SAIDA, "dados.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"ok: {len(todos)} slides no deck; {geral['concluidas']}/{geral['tarefas_total']} tarefas; HEAD {geral['head']}")


if __name__ == "__main__":
    escrever()
