import { describe, expect, it } from "vitest";
import { buildKahootXlsx } from "@/lib/buildKahoot";
import type { ContenidoKahoot, ParametrosGuia } from "@/lib/types";

const params: ParametrosGuia = {
  asignatura: "Tecnología e Informática",
  clei: "III",
  grupoCleiJornada: "6-7/III/SEMANAL 1",
  jornada: "SEMANAL 1",
  semana: 21,
  guia: 21,
  fechaClase: "15/07/26",
  fechaClaseLarga: "15/07/2026",
  tema: "INTRODUCCIÓN A INTERNET",
  subtemas: ["Navegadores web"],
  fechaCargue: "15/07/2026",
  horaMaxima: "23:59",
  videoApoyo: { titulo: "¿Qué es Internet?", canal: "Prueba", duracion: "3:45", url: "https://youtube.com/watch?v=x" },
};

const contenido: ContenidoKahoot = {
  preguntas: [
    { pregunta: "¿Qué es un navegador?", respuestas: ["Un programa", "Un cable", "Un teclado", "Un mouse"], tiempoSeg: 20, correctas: [1] },
    { pregunta: "Internet es útil para buscar información.", respuestas: ["Verdadero", "Falso"], tiempoSeg: 10, correctas: [1] },
  ],
};

describe("buildKahootXlsx", () => {
  it("arma un .xlsx válido (zip) sin lanzar excepción", async () => {
    const buf = await buildKahootXlsx(params, contenido);

    // Un .xlsx también es un .zip — misma firma "PK".
    expect(buf.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(buf.length).toBeGreaterThan(1_000);
  });
});
