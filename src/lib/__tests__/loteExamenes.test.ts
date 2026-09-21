import { describe, expect, it } from "vitest";
import { cleiDesdeCiclo, formatearFechaLarga, gradosATexto, motivoNoGenerable, paramsExamenIntermedio, rutaEnZip, type FilaLote } from "@/lib/loteExamenes";

const fila = (extra: Partial<FilaLote> = {}): FilaLote => ({
  id: "cc1", semana: 31, fecha: "2026-09-16", cursoId: "curso-1", cursoNombre: "Internet y Comunicación Digital", nivel: "basico",
  examenGenerado: false, cicloId: "ciclo-3", cicloNombre: "Ciclo III", cicloGrados: ["6°", "7°"],
  jornadaId: "j1", jornadaNombre: "Semanal 1", jornadaDias: "Lunes a viernes", ...extra,
});

describe("loteExamenes", () => {
  it("cleiDesdeCiclo / gradosATexto / formatearFechaLarga", () => {
    expect(cleiDesdeCiclo("Ciclo VI")).toBe("VI");
    expect(cleiDesdeCiclo("Ciclo II")).toBe("II");
    expect(cleiDesdeCiclo("Ciclo X")).toBeNull();
    expect(gradosATexto(["8°", "9°"])).toBe("8-9");
    expect(formatearFechaLarga("2026-09-16")).toBe("16/09/2026");
    expect(formatearFechaLarga("2026-09-16T00:00:00.000Z")).toBe("16/09/2026");
  });

  it("los parámetros son los mismos que arma el formulario de Exámenes (10 preguntas entre semana → 0.5)", () => {
    expect(paramsExamenIntermedio(fila(), { sede: "CALI", docente: "EDWARD" })).toEqual({
      tipo: "intermedio", clei: "III", grupoCleiJornada: "6-7/III/SEMANAL 1", jornada: "SEMANAL 1",
      cantidadPreguntas: 10, valoracionPregunta: 0.5, semana: 31, fechaAplicacion: "16/09/2026",
      sede: "CALI", docente: "EDWARD", cicloId: "ciclo-3", jornadaId: "j1", cursoId: "curso-1",
      cursoNombre: "Internet y Comunicación Digital", nivel: "basico",
    });
  });

  it("los sábados son 5 preguntas de 1.0, y respeta el nivel de la semana", () => {
    const p = paramsExamenIntermedio(fila({ jornadaNombre: "Sábado 2", jornadaDias: "Sábado", nivel: "avanzado", cicloNombre: "Ciclo IV", cicloGrados: ["8°", "9°"] }), { sede: "CALI", docente: "X" });
    expect(p.cantidadPreguntas).toBe(5);
    expect(p.valoracionPregunta).toBe(1);
    expect(p.nivel).toBe("avanzado");
    expect(p.grupoCleiJornada).toBe("8-9/IV/SÁBADO 2");
  });

  it("un nivel desconocido cae a básico", () => {
    expect(paramsExamenIntermedio(fila({ nivel: "raro" }), { sede: "S", docente: "D" }).nivel).toBe("basico");
  });

  it("sin curso o con ciclo sin CLEI no se puede generar (y lanza al armar los parámetros)", () => {
    expect(motivoNoGenerable(fila())).toBeNull();
    expect(motivoNoGenerable(fila({ cursoId: null }))).toMatch(/sin curso/);
    expect(motivoNoGenerable(fila({ cicloNombre: "Ciclo Z" }))).toMatch(/sin CLEI/);
    expect(() => paramsExamenIntermedio(fila({ cursoId: null }), { sede: "S", docente: "D" })).toThrow(/sin curso/);
  });

  it("rutaEnZip ordena por ciclo y jornada, sin caracteres peligrosos", () => {
    expect(rutaEnZip("Ciclo III", "Sábado 1", "FTO-EDU-FOR-98_V1_Examen.docx")).toBe("Ciclo III/Sábado 1/FTO-EDU-FOR-98_V1_Examen.docx");
    expect(rutaEnZip("Ciclo/III", 'Jor:nada*', "a?b.docx")).toBe("Ciclo-III/Jor-nada-/a-b.docx");
  });
});
