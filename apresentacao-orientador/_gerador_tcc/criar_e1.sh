#!/usr/bin/env bash
# Cria o repositório do TCC do zero: main + branch da E1 (só documentos).
# Seguro: aborta no primeiro erro e confere que está DENTRO do repositório novo antes de cada git.
set -euo pipefail

FAB=/c/Users/enzoconsulo/Documents/Generic-Multi-Agents
R=$FAB/projetos/fabrica-tcc
G=$FAB/apresentacao-orientador/_gerador_tcc

cd "$FAB/projetos"
if [ -e "$R/.git" ]; then echo "ERRO: $R já tem .git — apague à mão antes"; exit 1; fi
mkdir -p "$R"
cd "$R"
git init -q -b main
[ "$(git rev-parse --show-toplevel)" = "$(cd "$R" && pwd -W 2>/dev/null || pwd)" ] || [ "$(git rev-parse --show-toplevel)" = "C:/Users/enzoconsulo/Documents/Generic-Multi-Agents/projetos/fabrica-tcc" ] || { echo "ERRO: toplevel inesperado: $(git rev-parse --show-toplevel)"; exit 1; }
git config core.autocrlf false
git config user.name "Enzo Consulo"
git config user.email "enzoconsulo@gmail.com"

c() { git add -A && git commit -q -m "$1"; }

cp "$FAB/projetos/_tcc-alvo/.gitignore" .
printf '# Fábrica de Software Multi-Agente\n\nTrabalho de Conclusão de Curso — Enzo Consulo.\n\nUm sistema que recebe a descrição de um projeto em linguagem natural e o constrói de ponta a ponta com agentes especializados, com as regras de governança impostas pela estrutura do programa.\n\nO desenvolvimento segue o plano em cascata: **cada etapa é uma branch** (`etapa/e1-planejamento`, `etapa/e2-fundacao`, …), integrada à `main` no dia da sua apresentação.\n' > README.md
c "chore: initial commit"

git checkout -q -b etapa/e1-planejamento
mkdir -p docs/planejamento docs/etapas
cp "$G/e1/requisitos.md" docs/planejamento/
c "docs: add requirements R1-R15 (FAB-101)"
cp "$FAB/originalidade-resumo.pdf" docs/planejamento/estado-da-arte-resumo.pdf
cp "$FAB/originalidade-completo.pdf" docs/planejamento/estado-da-arte-completo.pdf
c "docs: add state-of-the-art comparison (FAB-102)"
cp "$G/e1/arquitetura.md" docs/planejamento/
c "docs: add architecture: layers, task lifecycle and failure ladder (FAB-103)"
cp "$G/e1/criterios-de-desempenho.md" docs/planejamento/
cp "$FAB/fabrica-multi-agente-plano-de-desenvolvimento.docx" docs/planejamento/plano-de-desenvolvimento.docx
python "$G/tarefas.py" . 1 >/dev/null
c "docs: add development plan, performance criteria and E2-E7 backlog (FAB-104)"
cp "$G/e1/projetos-de-teste.md" docs/planejamento/
c "docs: propose the five test projects (FAB-105)"
python "$G/doc_etapa.py" 1 docs/etapas/E1-planejamento.docx >/dev/null
c "docs: add E1 stage report"

git log --oneline --all --graph
