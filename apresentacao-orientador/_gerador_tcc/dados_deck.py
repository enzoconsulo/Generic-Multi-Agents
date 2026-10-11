# -*- coding: utf-8 -*-
"""Junta tudo o que a apresentação principal mostra num JSON (lido por deck.js).

    python dados_deck.py <saida.json>
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalogo as C  # noqa: E402
import metricas as M  # noqa: E402
from textos_etapas import TEXTOS  # noqa: E402

REQ_STATUS = {  # situação real de cada requisito hoje
    "R1": ("parcial", "implementado; pedido real na validação"), "R2": ("ok", "teste do marco E4"),
    "R3": ("ok", "dois portões, teste do marco E4"), "R4": ("parcial", "escada pronta e testada; o laço automático ainda não a chama"),
    "R5": ("parcial", "limite de 3 ciclos definido e testado; ainda não acionado automaticamente"), "R6": ("ok", "teste do marco E5"),
    "R7": ("pendente", "bloco ainda não chega ao agente"), "R8": ("parcial", "tela pronta; projeto inteiro pendente"),
    "R9": ("parcial", "busca medida; pico com 3 em paralelo a medir"), "R10": ("ok", "consumos em cota e US$"),
    "R11": ("ok", "confinamento + sandbox"), "R12": ("ok", "teste do marco E2"),
    "R13": ("ok", "teste do marco E5"), "R14": ("parcial", "regra do teto testada; o piloto (E7) para por gasto acumulado"),
    "R15": ("ok", "dois adaptadores, mesma fronteira"),
}
REQ_TXT = {
    "R1": "Pedido → especificação, plano e tarefas", "R2": "Seis estados com relatório e custo",
    "R3": "Dois julgamentos independentes", "R4": "Decidir como refazer", "R5": "Retrabalho limitado",
    "R6": "Paralelismo sem disputa", "R7": "Histórico citado com fonte", "R8": "Andamento e custo ao vivo",
    "R9": "Cabe em 8 GB / 4 núcleos", "R10": "Custo em cota e dinheiro", "R11": "Nada escrito fora do projeto",
    "R12": "Testes sem internet e sem cota", "R13": "Queda isolada, sem perda", "R14": "Nunca passa do teto",
    "R15": "Fornecedor trocável",
}


def main(saida):
    etapas = []
    for n, e in C.ETAPAS.items():
        tarefas = [t for t in C.T if t["etapa"] == n]
        marco = next((t for t in tarefas if t["tipo"] == "Milestone"), None)
        if n == 1:
            status = "parcial"
        elif marco and marco["status"] == "done":
            status = "ok"
        elif marco and marco["status"] == "blocked":
            status = "bloqueada"
        else:
            status = "andamento"
        cod = M.codigo(n) if n >= 2 else None
        etapas.append({
            "n": n, "nome": e["pt"], "datas": e["datas"], "branch": f"etapa/{e['slug']}",
            "entrega": e["entrega_pt"], "status": status, "texto": TEXTOS[n],
            "tarefas": len(tarefas), "concluidas": sum(1 for t in tarefas if t["status"] == "done"),
            "lista": [{"key": t["key"], "titulo": t["pt"]["titulo"], "status": t["status"]} for t in tarefas],
            "codigo": cod,
            "reqs": sorted({r for t in tarefas for r in t["req"]}, key=lambda x: int(x[1:])),
        })
    req = [{"r": r, "txt": REQ_TXT[r], "status": s, "como": c} for r, (s, c) in REQ_STATUS.items()]
    json.dump({"etapas": etapas, "requisitos": req}, open(saida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("ok", saida)


if __name__ == "__main__":
    main(sys.argv[1])
