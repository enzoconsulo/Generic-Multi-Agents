import { describe, expect, it } from "vitest";
import { avisoDespachoEmVoo, avisoDespachoFundo } from "../src/lib/avisos-job";

describe("avisoDespachoFundo", () => {
  it("não avisa quando todo despacho foi bloqueante", () => {
    expect(avisoDespachoFundo({ despachosFundo: 0 })).toBeNull();
    expect(avisoDespachoFundo({})).toBeNull();
    expect(avisoDespachoFundo(null)).toBeNull();
    expect(avisoDespachoFundo(undefined)).toBeNull();
  });

  it("avisa com a contagem, nomeia a causa e diz o que conferir", () => {
    const texto = avisoDespachoFundo({ despachosFundo: 2 });
    expect(texto).toContain("2 despacho(s)");
    // Nomear a flag é o ponto: a versão anterior dizia só "em segundo plano", e o leitor
    // não tinha como saber que a OMISSÃO já era o problema.
    expect(texto).toContain("run_in_background: false");
    expect(texto).toContain("padrão da ferramenta");
    expect(texto).toContain("Confira os artefatos");
  });

  // Resultado vem do disco (`dados/jobs/*.json`), então é dado externo: campo torto não
  // pode virar "NaN agente(s)" na tela.
  it("valor não numérico não vira aviso", () => {
    expect(avisoDespachoFundo({ despachosFundo: Number.NaN })).toBeNull();
    expect(avisoDespachoFundo({ despachosFundo: -1 })).toBeNull();
  });
});

describe("avisoDespachoEmVoo", () => {
  it("não avisa quando todo despacho devolveu resultado", () => {
    expect(avisoDespachoEmVoo({ despachosEmVoo: 0 })).toBeNull();
    expect(avisoDespachoEmVoo({})).toBeNull();
    expect(avisoDespachoEmVoo(null)).toBeNull();
    expect(avisoDespachoEmVoo(undefined)).toBeNull();
  });

  // Diferente do aviso de risco, este AFIRMA — despacho sem `tool_result` quando a sessão
  // fecha não tem outra leitura possível. Texto que hesita aqui faz o usuário dar por bom
  // um job que destruiu trabalho, que foi exatamente o que aconteceu em 30/07 e em 01/08.
  it("afirma a perda em vez de sugerir, e desqualifica o job como entrega", () => {
    const texto = avisoDespachoEmVoo({ despachosEmVoo: 1 });
    expect(texto).toContain("TRABALHO ABANDONADO");
    expect(texto).toContain("1 agente(s)");
    expect(texto).toContain("NÃO");
    expect(texto).toContain("mesmo marcado como concluído");
  });

  it("valor não numérico não vira aviso", () => {
    expect(avisoDespachoEmVoo({ despachosEmVoo: Number.NaN })).toBeNull();
    expect(avisoDespachoEmVoo({ despachosEmVoo: -1 })).toBeNull();
  });

  // Os dois avisos são independentes: um job pode ter despachado com `false` (fundo = 0) e
  // ainda assim ser cortado por cota/watchdog com o agente em voo.
  it("independe de despachosFundo", () => {
    expect(avisoDespachoEmVoo({ despachosFundo: 0, despachosEmVoo: 3 })).not.toBeNull();
    expect(avisoDespachoFundo({ despachosFundo: 0, despachosEmVoo: 3 })).toBeNull();
  });
});
