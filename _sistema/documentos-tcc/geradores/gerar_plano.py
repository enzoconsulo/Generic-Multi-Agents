# -*- coding: utf-8 -*-
"""Monta o PLANO DE DESENVOLVIMENTO = plano_base + plano_corpo.

Mesma convencao do gerar7.py: concatena as partes e executa, para que o corpo
possa usar os helpers da base sem import.

Uso:  python gerar_plano.py            -> grava no destino oficial (raiz da fabrica)
      python gerar_plano.py <caminho>  -> grava no caminho dado (quando o oficial
                                          esta aberto no Word e nao pode ser escrito)

Antes:   python figuras_plano.py        (as figuras precisam existir)
Depois:  python medir_paginas.py <arquivo>

O corpo chama conferir() antes de gravar: se o documento quebrar uma das regras
(sigla fora do padrao, etapa inexistente, tabela larga demais), nada e gravado.
"""
import io
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
# O corpo importa calendario_plano. Garante o import mesmo rodando de outra pasta.
if AQUI not in sys.path:
    sys.path.insert(0, AQUI)

args = sys.argv[1:]
montado = "plano.py"
fonte = "\n".join(io.open(os.path.join(AQUI, n), encoding="utf-8").read()
                  for n in ["plano_base.py", "plano_corpo.py"])
io.open(os.path.join(AQUI, montado), "w", encoding="utf-8").write(fonte)

if args:
    destino = os.path.abspath(args[0])
    fonte = re.sub(r'^DESTINO = os\.path\.join\(RAIZ, ".*"\)$',
                   lambda m: "DESTINO = r" + repr(destino).replace("'", '"'),
                   fonte, count=1, flags=re.M)

exec(compile(fonte, montado, "exec"),
     {"__name__": "__main__", "__file__": os.path.join(AQUI, montado)})
