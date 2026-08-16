import { describe, expect, it } from "vitest";
import { avisoParede, paredeDeCota } from "../src/lib/cota";
import type { Job } from "../src/lib/tipos";

const T = (h: number, m = 0): string =>
  `2026-08-16T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
const AGORA = Date.parse(T(3));

function job(id: string, terminadoEm: string, resultado: unknown): Job {
  return {
    id,
    tipo: "pipeline",
    titulo: "/trabalhar alfa",
    escopo: "projeto:alfa",
    usaClaude: true,
    params: {},
    estado: "concluido",
    criadoEm: terminadoEm,
    terminadoEm,
    resultado,
  };
}

/**
 * A sequência é a REAL do banco-imobiliario, lida em `dados/jobs/` sem gastar modelo:
 * cota às 21:09 (T-038 fechou e ficou), duas tentativas contra a parede às 23:47 e 23:56
 * (16s e US$ 0,00 cada), e a T-046 concluída às 00:24. O módulo existe para poupar as duas
 * do meio.
 */
describe("paredeDeCota", () => {
  it("sem cota nenhuma, não há parede", () => {
    expect(paredeDeCota([job("a", T(1), { encerrouPor: "sem-trabalho" })], AGORA)).toBeNull();
    expect(paredeDeCota([], AGORA)).toBeNull();
  });

  it("reconhece os DOIS vocabulários — o do pipeline e o do runner Claude", () => {
    expect(paredeDeCota([job("a", T(2), { encerrouPor: "cota" })], AGORA)?.jobId).toBe("a");
    expect(paredeDeCota([job("b", T(2), { motivo: "limite-uso" })], AGORA)?.jobId).toBe("b");
  });

  it("guarda a hora de reabertura quando o provedor anuncia", () => {
    const p = paredeDeCota([job("a", T(2), { encerrouPor: "cota", reabreEm: "2:40pm" })], AGORA);
    expect(p?.reabreEm).toBe("2:40pm");
  });

  it("`sem hora anunciada` não é hora — não vira frase falsa na tela", () => {
    const p = paredeDeCota(
      [job("a", T(2), { encerrouPor: "cota", limiteDeUso: "sem hora anunciada" })],
      AGORA,
    );
    expect(p?.reabreEm).toBeNull();
  });

  /** PROVA OBSERVADA vence relógio: não dá para interpretar "2:40pm" sem inventar fuso. */
  it("job posterior que ENTREGOU derruba a parede", () => {
    const jobs = [
      job("cota", T(1), { encerrouPor: "cota" }),
      job("depois", T(2), { encerrouPor: "sem-trabalho", tarefasConcluidas: ["T-046"] }),
    ];
    expect(paredeDeCota(jobs, AGORA)).toBeNull();
  });

  it("job posterior que gastou também derruba a parede", () => {
    const jobs = [
      job("cota", T(1), { encerrouPor: "cota" }),
      job("depois", T(2), { custoUsd: 1.92 }),
    ];
    expect(paredeDeCota(jobs, AGORA)).toBeNull();
  });

  it("mas tentativa posterior que NÃO entregou nada mantém a parede de pé", () => {
    // As duas rodadas de 16s e US$ 0,00: bater na parede não é prova de que ela caiu.
    const jobs = [
      job("cota1", T(1), { encerrouPor: "cota" }),
      job("cota2", T(2), { encerrouPor: "cota", despachos: 1, custoUsd: 0 }),
    ];
    expect(paredeDeCota(jobs, AGORA)?.jobId).toBe("cota2");
  });

  it("cota velha demais deixa de valer sozinha", () => {
    const jobs = [job("cota", "2026-08-15T10:00:00.000Z", { encerrouPor: "cota" })];
    expect(paredeDeCota(jobs, AGORA)).toBeNull();
  });

  it("usa a batida MAIS RECENTE, independente da ordem da lista", () => {
    const jobs = [
      job("nova", T(2, 30), { encerrouPor: "cota" }),
      job("velha", T(1), { encerrouPor: "cota" }),
    ];
    expect(paredeDeCota(jobs, AGORA)?.jobId).toBe("nova");
  });

  it("resultado ausente ou estranho não quebra", () => {
    for (const r of [undefined, null, "x", 7]) {
      expect(() => paredeDeCota([job("a", T(2), r)], AGORA)).not.toThrow();
    }
  });
});

describe("avisoParede", () => {
  it("diz a hora quando existe e afirma que o trabalho está preservado", () => {
    const t = avisoParede({ jobId: "a", em: T(2), reabreEm: "2:40pm" });
    expect(t).toContain("2:40pm");
    expect(t).toContain("retoma de onde parou");
  });

  it("sem hora, não inventa uma", () => {
    const t = avisoParede({ jobId: "a", em: T(2), reabreEm: null });
    expect(t).toContain("não anunciou a hora");
    expect(t).not.toContain("reabre:");
  });
});
