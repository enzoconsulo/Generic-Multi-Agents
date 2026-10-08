# -*- coding: utf-8 -*-
"""Métricas por branch do repositório do TCC (sem checkout) + dados reais do processo.

Código: medido com `git ls-tree`/`git show` na ponta de cada branch.
Processo: custo medido nas rodadas do painel e execuções (tentativas) das tarefas reais do
fabrica-v2, somados pelas tarefas FAB que as agrupam (`catalogo.origem`).
"""
import glob
import json
import os
import re
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, AQUI)
import catalogo as C  # noqa: E402

REPO = os.path.join(RAIZ, "projetos", "fabrica-tcc")
V2 = os.path.join(RAIZ, "projetos", "fabrica-v2")
JOBS = os.path.join(RAIZ, "painel", "dados", "jobs")
BRANCH = {n: f"etapa/{e['slug']}" for n, e in C.ETAPAS.items()}


def git(*a, cwd=REPO):
    return subprocess.run(["git", *a], cwd=cwd, capture_output=True, text=True, encoding="utf-8",
                          errors="replace").stdout


def existe(branch):
    if not os.path.isdir(REPO):
        return False
    return bool(git("rev-parse", "--verify", "--quiet", branch).strip())


def codigo(n):
    """Números do código na ponta da branch da etapa n."""
    b = BRANCH[n]
    if not existe(b):
        return None
    arquivos = git("ls-tree", "-r", "--name-only", b).splitlines()
    lib = [f for f in arquivos if f.startswith("lib/") and f.endswith(".ex")]
    testes = [f for f in arquivos if f.startswith("test/") and f.endswith(".exs")]
    linhas = 0
    for f in lib:
        linhas += git("show", f"{b}:{f}").count("\n")
    n_testes = 0
    for f in testes:
        n_testes += len(re.findall(r'^\s*(?:test|property)\s+"', git("show", f"{b}:{f}"), re.M))
    modulos = sum(len(re.findall(r"^\s*defmodule\s", git("show", f"{b}:{f}"), re.M)) for f in lib)
    anterior = BRANCH.get(n - 1, "main")
    commits = git("log", "--format=%h\t%s", f"{anterior}..{b}").splitlines() if existe(anterior) else []
    return {"arquivos_lib": len(lib), "linhas_lib": linhas, "arquivos_teste": len(testes),
            "testes": n_testes, "modulos": modulos,
            "commits": [c.split("\t", 1) for c in reversed(commits)]}


def processo():
    """Custo e execuções reais por tarefa FAB (somando as tarefas reais que ela agrupa)."""
    custo = {}
    for f in glob.glob(os.path.join(JOBS, "*.json")):
        try:
            j = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
        if j.get("escopo") != "projeto:fabrica-v2":
            continue
        for c in (j.get("resultado") or {}).get("custoPorTarefa") or []:
            custo[c["tarefa"]] = custo.get(c["tarefa"], 0) + float(c.get("custoUsd") or 0)
    tent = {}
    for f in glob.glob(os.path.join(V2, "_gestao", "tarefas", "T-*.md")):
        s = open(f, encoding="utf-8", errors="replace").read()
        tid = re.search(r"^id: (\S+)", s, re.M).group(1)
        m = re.search(r"^tentativas: (\d+)", s, re.M)
        tent[tid] = max(int(m.group(1)) if m else 1, 1)
    out = {}
    for t in C.T:
        if not t["origem"]:
            continue
        out[t["key"]] = {"custo_usd": round(sum(custo.get(o, 0) for o in t["origem"]), 2),
                         "execucoes": sum(tent.get(o, 1) for o in t["origem"]),
                         "subtarefas": len(t["origem"])}
    return out


if __name__ == "__main__":
    print(json.dumps({n: codigo(n) for n in C.ETAPAS}, indent=1, ensure_ascii=False)[:2000])
