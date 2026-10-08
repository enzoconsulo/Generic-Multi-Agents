# -*- coding: utf-8 -*-
"""Gera as tarefas (estilo Jira) em PT e EN dentro do repositório do TCC.

    python tarefas.py <repo> <etapa_da_branch> [extras.json]

Na branch da etapa N: tarefas das etapas <= N saem com o status real; as de etapas > N saem como
"A fazer". `extras.json` (opcional) traz, por chave FAB, `verify` (comandos) e `commits` (hashes).
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalogo as C  # noqa: E402

TIPO = {"pt": {"Story": "História", "Milestone": "Marco", "Spike": "Investigação", "Doc": "Documento"},
        "en": {"Story": "Story", "Milestone": "Milestone", "Spike": "Spike", "Doc": "Document"}}
STATUS = {"pt": {"todo": "⬜ A fazer", "done": "✅ Concluída", "blocked": "⛔ Bloqueada", "in_progress": "🔄 Em andamento"},
          "en": {"todo": "⬜ To do", "done": "✅ Done", "blocked": "⛔ Blocked", "in_progress": "🔄 In progress"}}
L = {"pt": {"etapa": "Etapa", "pacote": "Pacote do plano", "tipo": "Tipo", "status": "Status", "req": "Requisitos",
            "desc": "Descrição", "crit": "Critérios de aceite", "verif": "Como verificar", "entregue": "Entregue em",
            "branch": "branch", "indice": "Tarefas", "chave": "Chave", "titulo": "Título"},
     "en": {"etapa": "Stage", "pacote": "Plan package", "tipo": "Type", "status": "Status", "req": "Requirements",
            "desc": "Description", "crit": "Acceptance criteria", "verif": "How to verify", "entregue": "Delivered in",
            "branch": "branch", "indice": "Tasks", "chave": "Key", "titulo": "Title"}}


def slug(s):
    import re
    import unicodedata
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:50]


def status_na_branch(t, etapa_branch):
    return t["status"] if t["etapa"] <= etapa_branch else "todo"


def gerar(repo, etapa_branch, extras):
    for lg in ("pt", "en"):
        base = os.path.join(repo, "docs", "tasks", lg)
        indice = [f"# {L[lg]['indice']}\n"]
        for n, e in C.ETAPAS.items():
            nome = e[lg]
            pasta = f"E{n}-{slug(e[lg])}"
            os.makedirs(os.path.join(base, pasta), exist_ok=True)
            indice += [f"\n## E{n} — {nome}\n", f"| {L[lg]['chave']} | {L[lg]['titulo']} | {L[lg]['tipo']} | {L[lg]['status']} |",
                       "|---|---|---|---|"]
            for t in [x for x in C.T if x["etapa"] == n]:
                tx = t[lg]
                titulo = tx["titulo"] if lg == "pt" else tx["title"]
                st = status_na_branch(t, etapa_branch)
                arq = f"{t['key']}-{slug(titulo)}.md"
                marca = "x" if st == "done" else " "
                ex = extras.get(t["key"], {})
                linhas = [f"# {t['key']} · {titulo}", "",
                          f"| | |", "|---|---|",
                          f"| **{L[lg]['etapa']}** | E{n} — {nome} |",
                          f"| **{L[lg]['pacote']}** | {t['pacote']} |",
                          f"| **{L[lg]['tipo']}** | {TIPO[lg][t['tipo']]} |",
                          f"| **{L[lg]['status']}** | {STATUS[lg][st]} |"]
                if t["req"]:
                    linhas.append(f"| **{L[lg]['req']}** | {', '.join(t['req'])} |")
                linhas += ["", f"## {L[lg]['desc']}", "", tx["desc"], "", f"## {L[lg]['crit']}", ""]
                linhas += [f"- [{marca}] {c}" for c in tx["crit"]]
                if ex.get("verify"):
                    linhas += ["", f"## {L[lg]['verif']}", "", "```bash"] + ex["verify"] + ["```"]
                if st == "done" and ex.get("commits"):
                    linhas += ["", f"## {L[lg]['entregue']}", "",
                               f"{L[lg]['branch']} `etapa/{e['slug']}` · " + ", ".join(f"`{h}`" for h in ex["commits"])]
                open(os.path.join(base, pasta, arq), "w", encoding="utf-8", newline="\n").write("\n".join(linhas) + "\n")
                indice.append(f"| [{t['key']}]({pasta}/{arq}) | {titulo} | {TIPO[lg][t['tipo']]} | {STATUS[lg][st]} |")
        open(os.path.join(base, "README.md"), "w", encoding="utf-8", newline="\n").write("\n".join(indice) + "\n")


if __name__ == "__main__":
    extras = json.load(open(sys.argv[3], encoding="utf-8")) if len(sys.argv) > 3 else {}
    gerar(sys.argv[1], int(sys.argv[2]), extras)
    print("ok")
