# -*- coding: utf-8 -*-
"""Regrava docs/tasks e docs/etapas/*.docx em todo o histórico do repositório do TCC.

Cada commit recebe o quadro de tarefas da etapa em que ele está (descoberto pelo quadro antigo que
ele carregava) e os relatórios Word atuais. Código e datas não mudam. Faz backup em bundle antes.

    python reescrever_docs.py <pasta_temporaria>
"""
import os
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(os.path.dirname(os.path.dirname(AQUI)), "projetos", "fabrica-tcc")
TMP = sys.argv[1]
BR = ["etapa/e1-planejamento", "etapa/e2-fundacao", "etapa/e3-agente", "etapa/e4-linha-de-producao",
      "etapa/e5-paralelismo", "etapa/e6-memoria", "etapa/e7-painel"]
DOCX = ["E1-planejamento", "E2-fundacao", "E3-agente", "E4-linha-de-producao", "E5-paralelismo", "E6-memoria", "E7-painel"]


def git(*a, env=None, check=True):
    r = subprocess.run(["git", *a], cwd=REPO, capture_output=True, text=True, encoding="utf-8", env=env)
    if check and r.returncode != 0:
        raise SystemExit(f"git {' '.join(a)} falhou: {r.stderr}")
    return r.stdout.strip()


assert git("rev-parse", "--show-toplevel").replace("\\", "/").endswith("projetos/fabrica-tcc")
assert git("status", "--porcelain") == "", "árvore suja"
BRANCH_ATUAL = git("branch", "--show-current") or "main"
os.makedirs(TMP, exist_ok=True)
git("bundle", "create", os.path.join(TMP, "antes-docs.bundle"), "--all")

# 1. quadro antigo → etapa (pelos commits que geraram cada quadro)
quadro_etapa = {}
for n, b in enumerate(BR, 1):
    for linha in git("log", "--format=%H %s", b).splitlines():
        h, s = linha.split(" ", 1)
        if s.startswith(f"docs: update task board for E{n}") or (n == 1 and "(FAB-104)" in s):
            quadro_etapa[git("rev-parse", f"{h}:docs/tasks")] = n

# 2. quadros novos (um tree por etapa) e relatórios Word novos (blobs)
sys.path.insert(0, AQUI)
import tarefas  # noqa: E402
import doc_etapa  # noqa: E402
novo_quadro = {}
for n in range(1, 8):
    d = os.path.join(TMP, f"quadro-{n}")
    shutil.rmtree(d, ignore_errors=True)
    tarefas.gerar(d, n)
    env = dict(os.environ, GIT_INDEX_FILE=os.path.join(TMP, f"idx-{n}"), GIT_DIR=os.path.join(REPO, ".git"), GIT_WORK_TREE=d)
    subprocess.run(["git", "add", "-A", "."], cwd=d, env=env, check=True, capture_output=True)
    raiz = subprocess.run(["git", "write-tree"], cwd=d, env=env, capture_output=True, text=True, check=True).stdout.strip()
    novo_quadro[n] = git("rev-parse", f"{raiz}:docs/tasks")
blobs = {}
for n, nome in enumerate(DOCX, 1):
    caminho = os.path.join(TMP, nome + ".docx")
    doc_etapa.gerar(n, caminho)
    blobs[nome] = git("hash-object", "-w", caminho)

# 3. filtro: troca o quadro pelo da mesma etapa e os .docx pelos novos
mapa = "\n".join(f"{t} {novo_quadro[n]}" for t, n in quadro_etapa.items())
filtro = os.path.join(TMP, "filtro.sh")
with open(filtro, "w", newline="\n") as f:
    f.write("#!/bin/sh\n")
    f.write("old=$(git rev-parse --verify -q \"$GIT_COMMIT:docs/tasks\")\n")
    f.write("if [ -n \"$old\" ]; then\n  case \"$old\" in\n")
    for t, n in quadro_etapa.items():
        f.write(f"    {t}) new={novo_quadro[n]} ;;\n")
    f.write("    *) echo \"quadro desconhecido em $GIT_COMMIT\" >&2; exit 1 ;;\n  esac\n")
    f.write("  git rm -r -q --cached docs/tasks && git read-tree --prefix=docs/tasks/ \"$new\"\nfi\n")
    for nome, b in blobs.items():
        f.write(f"git ls-files --error-unmatch docs/etapas/{nome}.docx >/dev/null 2>&1 && "
                f"git update-index --cacheinfo 100644,{b},docs/etapas/{nome}.docx\n")
    f.write("true\n")
env = dict(os.environ, FILTER_BRANCH_SQUELCH_WARNING="1")
r = subprocess.run(["git", "filter-branch", "-f", "--index-filter", f"sh '{filtro}'", "--", "main", *BR],
                   cwd=REPO, env=env, capture_output=True, text=True)
print(r.stdout[-400:], r.stderr[-400:])
if r.returncode != 0:
    raise SystemExit("filter-branch falhou — restaure com o bundle")
for ref in git("for-each-ref", "--format=%(refname)", "refs/original").splitlines():
    git("update-ref", "-d", ref)
git("reflog", "expire", "--expire=now", "--all")
git("gc", "-q", "--prune=now")
git("checkout", "-q", BRANCH_ATUAL)
print("ok:", len(quadro_etapa), "quadros mapeados;", len(blobs), "relatórios")
