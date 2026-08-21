# -*- coding: utf-8 -*-
"""Monta o documento v5 = helpers (documento6_base.py) + conteudo (corpo6.py).

Uso:  python gerar5.py            -> grava no destino oficial
      python gerar5.py <caminho>  -> grava no caminho dado (util quando o
                                     arquivo oficial esta aberto no Word)
"""
import io, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
base = io.open(os.path.join(AQUI, "documento6_base.py"), encoding="utf-8").read()
corpo = io.open(os.path.join(AQUI, "corpo6.py"), encoding="utf-8").read()
fonte = base + "\n" + corpo
io.open(os.path.join(AQUI, "documento6.py"), "w", encoding="utf-8").write(fonte)

if len(sys.argv) > 1:
    destino = os.path.abspath(sys.argv[1])
    fonte = re.sub(r'^DESTINO = r".*"$', "DESTINO = r" + repr(destino).replace("'", '"'),
                   fonte, count=1, flags=re.M)

exec(compile(fonte, "documento6.py", "exec"),
     {"__name__": "__main__", "__file__": os.path.join(AQUI, "documento6.py")})
