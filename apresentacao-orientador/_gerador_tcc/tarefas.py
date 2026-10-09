# -*- coding: utf-8 -*-
"""Gera as tarefas (estilo Jira) em PT e EN dentro do repositório do TCC.

    python tarefas.py <destino> <etapa_da_branch>

Na branch da etapa N: tickets das etapas <= N saem com o status real; os de etapas > N saem
"A fazer". O conteúdo explicativo vem de tickets_detalhe.json (E2–E7) e tickets_e1.py (E1);
os commits de cada ticket vêm do git do repositório do TCC (assunto termina com "(FAB-xxx)").
"""
import json
import os
import re
import subprocess
import sys
import unicodedata

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import catalogo as C  # noqa: E402
from tickets_e1 import E1  # noqa: E402

REPO = os.path.join(os.path.dirname(os.path.dirname(AQUI)), "projetos", "fabrica-tcc")
DET = dict(E1)
_det = os.path.join(AQUI, "tickets_detalhe.json")
if os.path.exists(_det):
    DET.update(json.load(open(_det, encoding="utf-8")))

TIPO = {"pt": {"Story": "História", "Milestone": "Marco", "Spike": "Investigação", "Doc": "Documento"},
        "en": {"Story": "Story", "Milestone": "Milestone", "Spike": "Spike", "Doc": "Document"}}
STATUS = {"pt": {"todo": "⬜ A fazer", "done": "✅ Concluída", "blocked": "⛔ Bloqueada", "in_progress": "🔄 Em andamento"},
          "en": {"todo": "⬜ To do", "done": "✅ Done", "blocked": "⛔ Blocked", "in_progress": "🔄 In progress"}}
L = {"pt": {"etapa": "Etapa", "pacote": "Pacote", "o_que": "O que é", "porque": "Por que existe", "como": "Como foi feito",
            "exemplo": "Exemplo", "crit": "Critérios de aceite", "verif": "Como verificar", "onde": "Onde está no código",
            "commits": "Commits", "indice": "Quadro de tarefas", "chave": "Chave", "titulo": "Título", "tipo": "Tipo",
            "status": "Status", "proposta": "Proposta da etapa", "progresso": "Progresso", "fez": "O que fez",
            "geral": "Visão geral", "etapa_col": "Etapa",
            "legenda": "Cada tarefa corresponde a um pacote do plano de desenvolvimento. Abaixo, o resumo de todas; clique na chave para ver os detalhes."},
     "en": {"etapa": "Stage", "pacote": "Package", "o_que": "What it is", "porque": "Why it exists", "como": "How it was built",
            "exemplo": "Example", "crit": "Acceptance criteria", "verif": "How to verify", "onde": "Where it lives in the code",
            "commits": "Commits", "indice": "Task board", "chave": "Key", "titulo": "Title", "tipo": "Type",
            "status": "Status", "proposta": "Stage goal", "progresso": "Progress", "fez": "What it did",
            "geral": "Overview", "etapa_col": "Stage",
            "legenda": "Each task is one package of the development plan. Below is a summary of every task; click a key for the details."}}


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:50]


def commits_por_ticket():
    try:
        out = subprocess.run(["git", "log", "--reverse", "--format=%s", "etapa/e7-painel"], cwd=REPO,
                             capture_output=True, text=True, encoding="utf-8").stdout
    except Exception:
        return {}
    por = {}
    for s in out.splitlines():
        m = re.search(r"\((FAB-\d{3})\)$", s)
        if m:
            por.setdefault(m.group(1), []).append(s)
    return por


def barra(feitas, total):
    n = round(10 * feitas / total) if total else 0
    return "🟩" * n + "⬜" * (10 - n) + f" {feitas}/{total}"


def gerar(destino, etapa_branch):
    commits = commits_por_ticket()
    for lg in ("pt", "en"):
        base = os.path.join(destino, "docs", "tasks", lg)
        indice = [f"# {L[lg]['indice']}", "", L[lg]["legenda"], "", f"## {L[lg]['geral']}", "",
                  f"| {L[lg]['etapa_col']} | {L[lg]['proposta']} | {L[lg]['progresso']} |", "|---|---|---|"]
        for n, e in C.ETAPAS.items():
            tks = [x for x in C.T if x["etapa"] == n]
            feitas = sum(1 for x in tks if n <= etapa_branch and x["status"] == "done")
            indice.append(f"| **E{n}** {e[lg]} | {e['entrega_pt'] if lg == 'pt' else e['entrega_en']} | {barra(feitas, len(tks))} |")
        indice.append("")
        for n, e in C.ETAPAS.items():
            pasta = f"E{n}-{slug(e[lg])}"
            os.makedirs(os.path.join(base, pasta), exist_ok=True)
            tks = [x for x in C.T if x["etapa"] == n]
            sts = [x["status"] if n <= etapa_branch else "todo" for x in tks]
            entrega = e["entrega_pt"] if lg == "pt" else e["entrega_en"]
            indice += [f"## E{n} — {e[lg]}", "",
                       f"**{L[lg]['proposta']}:** {entrega}  ", f"**{L[lg]['progresso']}:** {barra(sts.count('done'), len(tks))}", "",
                       f"| {L[lg]['chave']} | {L[lg]['titulo']} | {L[lg]['fez']} | {L[lg]['status']} |", "|---|---|---|---|"]
            for t, st in zip(tks, sts):
                tx = t[lg]
                titulo = tx["titulo"] if lg == "pt" else tx["title"]
                arq = f"{t['key']}-{slug(titulo)}.md"
                det = DET.get(t["key"], {})
                d = det.get(lg, {})
                selo = [STATUS[lg][st], f"{L[lg]['etapa']} **E{n} — {e[lg]}**", f"{L[lg]['pacote']} {t['pacote']}", TIPO[lg][t["tipo"]]]
                if t["req"]:
                    selo.append(", ".join(t["req"]))
                linhas = [f"# {t['key']} · {titulo}", "", "> " + " · ".join(selo), ""]
                linhas += [f"## {L[lg]['o_que']}", "", d.get("resumo") or tx["desc"], ""]
                if d.get("porque"):
                    linhas += [f"## {L[lg]['porque']}", "", d["porque"], ""]
                if d.get("como"):
                    linhas += [f"## {L[lg]['como']}", ""] + [f"- {c}" for c in d["como"]]
                    if d.get("exemplo"):
                        linhas += ["", f"**{L[lg]['exemplo']}:** {d['exemplo']}"]
                    linhas.append("")
                marca = "x" if st == "done" else " "
                linhas += [f"## {L[lg]['crit']}", ""] + [f"- [{marca}] {c}" for c in tx["crit"]] + [""]
                if det.get("verificar"):
                    cmds = [v.strip("`") for v in det["verificar"]]
                    codigo = [c for c in cmds if c.startswith("mix ")]
                    outros = [c for c in cmds if not c.startswith("mix ")]
                    linhas += [f"## {L[lg]['verif']}", ""]
                    if codigo:
                        linhas += ["```bash"] + codigo + ["```"]
                    linhas += [f"- `{c}`" for c in outros]
                    linhas.append("")
                if det.get("modulos"):
                    linhas += [f"## {L[lg]['onde']}", "", " · ".join(f"`{m}`" for m in det["modulos"]), ""]
                if st != "todo" and commits.get(t["key"]):
                    linhas += [f"## {L[lg]['commits']}", ""] + [f"- {s}" for s in commits[t["key"]]] + [""]
                open(os.path.join(base, pasta, arq), "w", encoding="utf-8", newline="\n").write("\n".join(linhas))
                indice.append(f"| [{t['key']}]({pasta}/{arq}) | **{titulo}** | {tx['desc']} | {STATUS[lg][st]} |")
            indice.append("")
        open(os.path.join(base, "README.md"), "w", encoding="utf-8", newline="\n").write("\n".join(indice))


if __name__ == "__main__":
    gerar(sys.argv[1], int(sys.argv[2]))
    print("ok")
