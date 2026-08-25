import { describe, expect, it } from "vitest";
import {
  ESPERA_CEGA_MS,
  ESPERA_MAXIMA_MS,
  ESPERA_MINIMA_MS,
  esperaDeRearme,
  interpretarReabertura,
} from "../../src/jobs/piloto/reabertura.js";

/**
 * A hora de reabertura da cota vem em TEXTO LIVRE (`horaDeReabertura` só recorta o que vem
 * depois de "resets"). Estes casos são as formas que o provedor já usou, mais as que
 * quebrariam o parser — e o teste da janela sã é o que impede um anúncio mal lido de virar
 * rajada contra a parede ou sono de um dia inteiro.
 */

const MEIO_DIA = new Date("2026-08-24T12:00:00");

describe("interpretarReabertura", () => {
  it("lê hora com am/pm e devolve a próxima ocorrência local", () => {
    const alvo = interpretarReabertura("5pm", MEIO_DIA);
    expect(alvo?.getHours()).toBe(17);
    expect(alvo?.getDate()).toBe(MEIO_DIA.getDate());
  });

  it("hora que já passou hoje é a de amanhã", () => {
    const alvo = interpretarReabertura("5am", MEIO_DIA);
    expect(alvo?.getHours()).toBe(5);
    expect(alvo?.getDate()).toBe(MEIO_DIA.getDate() + 1);
  });

  it("lê minutos e ignora o fuso entre parênteses (ver o cabeçalho do módulo)", () => {
    const alvo = interpretarReabertura("10:30pm (America/Sao_Paulo)", MEIO_DIA);
    expect(alvo?.getHours()).toBe(22);
    expect(alvo?.getMinutes()).toBe(30);
  });

  it("12am é meia-noite e 12pm é meio-dia", () => {
    expect(interpretarReabertura("12am", MEIO_DIA)?.getHours()).toBe(0);
    expect(interpretarReabertura("12:30pm", MEIO_DIA)?.getHours()).toBe(12);
  });

  it("aceita 24h sem sufixo", () => {
    expect(interpretarReabertura("18:45", MEIO_DIA)?.getHours()).toBe(18);
  });

  it("devolve null para texto sem hora nenhuma e para valores impossíveis", () => {
    expect(interpretarReabertura(null, MEIO_DIA)).toBeNull();
    expect(interpretarReabertura("em breve", MEIO_DIA)).toBeNull();
    expect(interpretarReabertura("99am", MEIO_DIA)).toBeNull();
    expect(interpretarReabertura("10:99", MEIO_DIA)).toBeNull();
  });
});

describe("esperaDeRearme", () => {
  it("sem anúncio interpretável, tenta de novo depois da espera cega", () => {
    expect(esperaDeRearme(null, MEIO_DIA)).toBe(ESPERA_CEGA_MS);
    expect(esperaDeRearme("em breve", MEIO_DIA)).toBe(ESPERA_CEGA_MS);
  });

  it("espera até a hora anunciada, com margem", () => {
    const ms = esperaDeRearme("13:00", MEIO_DIA);
    expect(ms).toBeGreaterThan(60 * 60 * 1000);
    expect(ms).toBeLessThan(65 * 60 * 1000);
  });

  it("nunca fica fora da janela sã, por pior que seja o anúncio", () => {
    // Hora que acabou de passar: sem o piso, o rearme seria imediato — a mesma parede.
    const agora = new Date("2026-08-24T12:00:30");
    expect(esperaDeRearme("12:00", agora)).toBeGreaterThanOrEqual(ESPERA_MINIMA_MS);
    // ~23h à frente: sem o teto, o piloto dormiria o dia inteiro por um parser otimista.
    expect(esperaDeRearme("11:00", MEIO_DIA)).toBe(ESPERA_MAXIMA_MS);
  });
});
