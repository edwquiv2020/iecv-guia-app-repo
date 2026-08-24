import { describe, expect, it } from "vitest";
import { cantidadPreguntasPorJornada, duracionPorClei } from "@/lib/types";

describe("duracionPorClei", () => {
  it("CLEI III: 1 hora, 3 páginas máx, 2 talleres", () => {
    expect(duracionPorClei("III")).toEqual({
      duracion: "1 hora (60 minutos).",
      maxPaginas: "Máximo 3",
      numTalleres: 2,
    });
  });

  it.each(["IV", "V", "VI"] as const)("CLEI %s: 2 horas, 5 páginas máx, 3 talleres", (clei) => {
    expect(duracionPorClei(clei)).toEqual({
      duracion: "2 horas (120 minutos).",
      maxPaginas: "Máximo 5",
      numTalleres: 3,
    });
  });
});

describe("cantidadPreguntasPorJornada", () => {
  it("5 preguntas para jornadas de sábado (mayúsculas, minúsculas, con o sin tilde)", () => {
    expect(cantidadPreguntasPorJornada("Sábado")).toBe(5);
    expect(cantidadPreguntasPorJornada("sabado")).toBe(5);
    expect(cantidadPreguntasPorJornada("SÁBADO 1")).toBe(5);
  });

  it("10 preguntas para jornadas entre semana", () => {
    expect(cantidadPreguntasPorJornada("Lunes a viernes")).toBe(10);
    expect(cantidadPreguntasPorJornada("Semanal 1")).toBe(10);
  });
});
