# -*- coding: utf-8 -*-
"""Monta o PLANO DE DESENVOLVIMENTO = plano_base + plano_corpo.

Mesma convencao do gerar7.py: concatena as partes e executa, para que o corpo
possa usar os helpers da base sem import.

Uso:  python gerar_plano.py            -> grava no destino oficial (raiz da fabrica)
      python gerar_plano.py <caminho>  -> grava no caminho dado (quando o oficial
                                          esta aberto no Word e nao pode ser escrito)

As figuras precisam existir; rode antes:  python figuras_plano.py
"""
import io
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
partes = ["plano_base.py", "plano_corpo.py"]
fonte = "\n".join(io.open(os.path.join(AQUI, n), encoding="utf-8").read() for n in partes)
io.open(os.path.join(AQUI, "plano.py"), "w", encoding="utf-8").write(fonte)

if len(sys.argv) > 1:
    destino = os.path.abspath(sys.argv[1])
    fonte = re.sub(r'^DESTINO = os\.path\.join\(RAIZ, ".*"\)$',
                   lambda m: "DESTINO = r" + repr(destino).replace("'", '"'),
                   fonte, count=1, flags=re.M)

exec(compile(fonte, "plano.py", "exec"),
     {"__name__": "__main__", "__file__": os.path.join(AQUI, "plano.py")})
