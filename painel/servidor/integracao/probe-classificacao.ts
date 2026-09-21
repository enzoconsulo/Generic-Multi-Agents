/** Classifica uma saída REAL capturada em disco. Prova o conserto pelo caminho real. */
import { readFile } from "node:fs/promises";
import { classificarFalha } from "../src/pipeline/criterios.js";

const arquivo = process.argv[2] as string;
const saida = await readFile(arquivo, "utf8");
const classe = classificarFalha({
  argv: ["mix", "test"],
  saida,
  code: 1,
  signal: null,
  estourouNossoTeto: false,
  existeNoDisco: () => true,
});
console.log(`classe: ${classe}`);
console.log(classe === "ambiente"
  ? "-> inconclusivo: NAO reprova a tarefa, vai para julgamento (+1 reexecucao)"
  : "-> REPROVA a tarefa e devolve ao construtor");
