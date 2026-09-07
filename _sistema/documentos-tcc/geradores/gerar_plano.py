# -*- coding: utf-8 -*-
"""Monta o PLANO DE DESENVOLVIMENTO = plano_base + plano_corpo.

Mesma convencao do gerar7.py: concatena as partes e executa, para que o corpo
possa usar os helpers da base sem import.

Uso:  python gerar_plano.py            -> grava no destino oficial (raiz da fabrica)
      python gerar_plano.py <caminho>  -> grava no caminho dado (quando o oficial
                                          esta aberto no Word e nao pode ser escrito)

As figuras precisam existir; rode antes:  python figuras_plano.py
Para conferir a paginacao:                python medir_paginas.py <arquivo>
"""
import io
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
resumido = "--resumido" in args
args = [a for a in args if a != "--resumido"]

corpo = "plano_corpo_resumido.py" if resumido else "plano_corpo.py"
montado = "plano_resumido.py" if resumido else "plano.py"
fonte = "\n".join(io.open(os.path.join(AQUI, n), encoding="utf-8").read()
                  for n in ["plano_base.py", corpo])
io.open(os.path.join(AQUI, montado), "w", encoding="utf-8").write(fonte)

if resumido:
    fonte = fonte.replace('"fabrica-multi-agente-plano-de-desenvolvimento.docx"',
                          '"fabrica-multi-agente-plano-de-desenvolvimento-resumido.docx"')

if args:
    destino = os.path.abspath(args[0])
    fonte = re.sub(r'^DESTINO = os\.path\.join\(RAIZ, ".*"\)$',
                   lambda m: "DESTINO = r" + repr(destino).replace("'", '"'),
                   fonte, count=1, flags=re.M)

exec(compile(fonte, montado, "exec"),
     {"__name__": "__main__", "__file__": os.path.join(AQUI, montado)})
