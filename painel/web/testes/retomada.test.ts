import { describe, expect, it } from "vitest";
import {
  avisoAntesDeRetomar,
  confirmacaoDeRetomada,
  ofertaDeRetomada,
} from "../src/lib/retomada";
import type { Job } from "../src/lib/tipos";

/**
 * A pergunta que estes testes protegem é literal, do usuário: *"colo exatamente o mesmo do
 * meu primeiro prompt na mesma ação que não foi finalizada?"*. A resposta é sempre não, e
 * a tela tem de DIZER isso — por isso há teste sobre o texto da promessa, e não só sobre o
 * modo. Texto que some é o mesmo defeito que o botão veio consertar.
 */

function job(over: Partial<Job> = {}): Job {
  return {
    id: "abc",
    tipo: "claude",
    titulo: "/ideia no banco-imobiliario",
    escopo: "global",
    usaClaude: true,
    params: { tetoUsd: 6 },
    estado: "falhou",
    criadoEm: "2026-08-16T21:39:03.758Z",
    sessionId: "748eeb59",
    ...over,
  } as Job;
}

describe("ofertaDeRetomada", () => {
  it("job claude com sessão oferece continuar a MESMA conversa", () => {
    const o = ofertaDeRetomada(job());
    expect(o?.modo).toBe("sessao");
    expect(o?.rotulo).toBe("Retomar de onde parou");
  });

  it("a promessa responde à dúvida do usuário: não precisa colar o pedido de novo", () => {
    for (const j of [job(), job({ sessionId: undefined }), job({ tipo: "pipeline" })]) {
      const o = ofertaDeRetomada(j);
      expect(o).not.toBeNull();
      expect(o?.promessa.toLowerCase()).toMatch(/não precisa (colar|redigitá)/);
    }
  });

  it("pipeline oferece a rodada, não a sessão — ele abre várias e não há 'a' sessão", () => {
    const o = ofertaDeRetomada(job({ tipo: "pipeline", sessionId: undefined }));
    expect(o?.modo).toBe("disco");
    expect(o?.rotulo).toBe("Retomar a rodada");
  });

  it("claude antigo sem sessão avisa que parte do caminho será refeita", () => {
    const o = ofertaDeRetomada(job({ sessionId: undefined }));
    expect(o?.modo).toBe("disco");
    expect(o?.promessa).toContain("refeita");
  });

  for (const estado of ["na-fila", "executando", "aguardando-input"] as const) {
    it(`não oferece nada para job ${estado}: ele não precisa de retomada`, () => {
      expect(ofertaDeRetomada(job({ estado }))).toBeNull();
    });
  }

  it("não oferece para job de CI — não é fluxo de agente", () => {
    expect(ofertaDeRetomada(job({ tipo: "ci" }))).toBeNull();
  });
});

/**
 * O teto NÃO é calculado na web — vem do servidor, que consulta a tabela de guardrails
 * atual. A tela só o repete depois do clique. Uma segunda cópia daquela tabela aqui
 * divergiria na primeira recalibragem, e anunciar um teto diferente do que o job recebeu
 * seria pior que não anunciar nenhum.
 */
describe("confirmacaoDeRetomada", () => {
  it("mostra o teto que o servidor resolveu", () => {
    expect(confirmacaoDeRetomada({ tetoUsd: 6 })).toContain("US$ 6.00");
  });

  it("diz explicitamente quando o job novo não tem teto", () => {
    expect(confirmacaoDeRetomada({})).toContain("sem teto");
    expect(confirmacaoDeRetomada({ tetoUsd: "6" })).toContain("sem teto");
  });

  it("sempre aponta onde a execução nova aparece", () => {
    expect(confirmacaoDeRetomada({ tetoUsd: 6 })).toContain("topo da lista");
  });
});

describe("avisoAntesDeRetomar", () => {
  it("com hora anunciada, manda esperar por ela", () => {
    expect(avisoAntesDeRetomar("7:50pm")).toContain("7:50pm");
  });

  it("sem hora, diz que o provedor não anunciou — nunca inventa um horário", () => {
    const texto = avisoAntesDeRetomar(null);
    expect(texto).toContain("não anunciou");
    expect(texto).not.toMatch(/\d+:\d+/);
  });
});
