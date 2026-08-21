# -*- coding: utf-8 -*-
"""Deriva documento7_en_base.py e gerar7_en.py dos originais em portugues."""
import io, re

s = io.open("documento7_base.py", encoding="utf-8").read()
s = s.replace('FIGS = os.path.join(AQUI, "figs3")', 'FIGS = os.path.join(AQUI, "figs_en")')
novo = ('DESTINO = r"C:' + chr(92) + 'Users' + chr(92) + 'enzoc' + chr(92) + 'OneDrive' + chr(92)
        + 'Documentos' + chr(92) + 'Gerador_de_projetos' + chr(92)
        + 'multi-agent-software-factory-COMPLETE-en.docx"')
s = re.sub(r'^DESTINO = r".*"$', lambda m: novo, s, count=1, flags=re.M)
s = s.replace(chr(34)+"PARTE "+chr(34), chr(34)+"PART "+chr(34))
io.open("documento7_en_base.py", "w", encoding="utf-8").write(s)

g = io.open("gerar7.py", encoding="utf-8").read()
g = g.replace('"documento7_base.py", "corpo7a.py", "corpo7b.py", "corpo7c.py"',
              '"documento7_en_base.py", "corpo7a_en.py", "corpo7b_en.py", "corpo7c_en.py"')
g = g.replace('"documento7.py"', '"documento7_en.py"')
io.open("gerar7_en.py", "w", encoding="utf-8").write(g)

print([l for l in s.splitlines() if "FIGS =" in l or "DESTINO =" in l])
