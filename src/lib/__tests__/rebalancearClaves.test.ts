import { describe, expect, it } from "vitest";
import { rebalancearClaves } from "@/lib/rebalancearClaves";

type P = Parameters<typeof rebalancearClaves>[0][number];

const pregunta = (n: number, correcta: number, opciones?: string[]): P => ({
  enunciado: `Enunciado ${n}`,
  opciones: (opciones ?? [`o${n}a`, `o${n}b`, `o${n}c`, `o${n}d`]) as P["opciones"],
  correcta,
});

const conteo = (ps: P[]) => [0, 1, 2, 3].map((l) => ps.filter((p) => p.correcta === l).length);

/** RNG determinista (mulberry32) para que los tests no sean aleatorios. */
function rngSemilla(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("rebalancearClaves", () => {
  it("10 preguntas todas con la B: queda 2-3 de cada letra", () => {
    for (let semilla = 1; semilla <= 50; semilla++) {
      const entrada = Array.from({ length: 10 }, (_, i) => pregunta(i + 1, 1));
      const salida = rebalancearClaves(entrada, rngSemilla(semilla));
      conteo(salida).forEach((c) => { expect(c).toBeGreaterThanOrEqual(2); expect(c).toBeLessThanOrEqual(3); });
    }
  });

  it("5 preguntas: ninguna letra correcta se repite más de 2 veces", () => {
    for (let semilla = 1; semilla <= 50; semilla++) {
      const salida = rebalancearClaves(Array.from({ length: 5 }, (_, i) => pregunta(i + 1, 2)), rngSemilla(semilla));
      conteo(salida).forEach((c) => expect(c).toBeLessThanOrEqual(2));
    }
  });

  it("la opción correcta sigue siendo la misma respuesta (mismo texto) y no se pierde ni cambia ninguna opción", () => {
    const entrada = Array.from({ length: 10 }, (_, i) => pregunta(i + 1, i % 2));
    const salida = rebalancearClaves(entrada, rngSemilla(7));
    salida.forEach((p, i) => {
      expect(p.opciones[p.correcta]).toBe(entrada[i].opciones[entrada[i].correcta]);
      expect([...p.opciones].sort()).toEqual([...entrada[i].opciones].sort());
      expect(p.enunciado).toBe(entrada[i].enunciado);
    });
  });

  it("no altera la lista original (devuelve copias)", () => {
    const entrada = Array.from({ length: 10 }, (_, i) => pregunta(i + 1, 0));
    const copia = JSON.parse(JSON.stringify(entrada));
    rebalancearClaves(entrada, rngSemilla(3));
    expect(entrada).toEqual(copia);
  });

  it("no deja más de 2 respuestas iguales seguidas", () => {
    for (let semilla = 1; semilla <= 50; semilla++) {
      const salida = rebalancearClaves(Array.from({ length: 10 }, (_, i) => pregunta(i + 1, 0)), rngSemilla(semilla));
      for (let i = 2; i < salida.length; i++) {
        expect(salida[i].correcta === salida[i - 1].correcta && salida[i].correcta === salida[i - 2].correcta).toBe(false);
      }
    }
  });

  it("deja quietas las preguntas cuyas opciones se citan entre sí, y balancea el resto contando esas", () => {
    const fija = pregunta(1, 3, ["Solo el 1", "Solo el 2", "Ninguna de las anteriores es cierta", "Ambas son correctas"]);
    const entrada = [fija, ...Array.from({ length: 9 }, (_, i) => pregunta(i + 2, 0))];
    const salida = rebalancearClaves(entrada, rngSemilla(11));
    expect(salida[0]).toEqual(fija);
    conteo(salida).forEach((c) => { expect(c).toBeGreaterThanOrEqual(2); expect(c).toBeLessThanOrEqual(3); });
  });

  it("con menos de 2 preguntas movibles no toca nada", () => {
    const entrada = [pregunta(1, 2)];
    expect(rebalancearClaves(entrada)).toEqual(entrada);
  });
});
