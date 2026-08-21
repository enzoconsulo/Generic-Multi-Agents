# -*- coding: utf-8 -*-
"""Monta a documentacao COMPLETA (v7) = base + corpo7a + corpo7b + corpo7c.

Uso:  python gerar7.py            -> grava no destino oficial
      python gerar7.py <caminho>  -> grava no caminho dado (quando o oficial
                                     esta aberto no Word)
"""
import io, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
partes = ["documento7_base.py", "corpo7a.py", "corpo7b.py", "corpo7c.py"]
fonte = "\n".join(io.open(os.path.join(AQUI, n), encoding="utf-8").read() for n in partes)
io.open(os.path.join(AQUI, "documento7.py"), "w", encoding="utf-8").write(fonte)

if len(sys.argv) > 1:
    destino = os.path.abspath(sys.argv[1])
    fonte = re.sub(r'^DESTINO = r".*"$', "DESTINO = r" + repr(destino).replace("'", '"'),
                   fonte, count=1, flags=re.M)

exec(compile(fonte, "documento7.py", "exec"),
     {"__name__": "__main__", "__file__": os.path.join(AQUI, "documento7.py")})
