import { describe, expect, it } from "vitest";
import { agregarRegistros, CRITERIOS_SEGUIMIENTO, IDS_PERSONAL, IDS_SOCIAL } from "@/lib/seguimiento";

describe("CRITERIOS_SEGUIMIENTO", () => {
  it("trae exactamente 5 criterios personales y 5 sociales", () => {
    expect(IDS_PERSONAL).toHaveLength(5);
    expect(IDS_SOCIAL).toHaveLength(5);
    expect(CRITERIOS_SEGUIMIENTO).toHaveLength(10);
  });
});

describe("agregarRegistros", () => {
  it("sin registros, todo queda en null", () => {
    const r = agregarRegistros([]);
    expect(r.registros).toBe(0);
    expect(r.personal).toBeNull();
    expect(r.social).toBeNull();
    expect(r.definitiva).toBeNull();
  });

  it("promedia cada criterio por separado y luego personal/social/definitiva", () => {
    const filas = [
      { puntualidad: 4, presentacion: 5, comunicacion: 4 },
      { puntualidad: 2, asistencia: 3, comunicacion: 2 },
    ];
    const r = agregarRegistros(filas);
    expect(r.registros).toBe(2);
    expect(r.porCriterio.puntualidad).toBe(3); // (4+2)/2
    expect(r.porCriterio.presentacion).toBe(5); // solo un dato
    expect(r.porCriterio.asistencia).toBe(3);
    expect(r.porCriterio.responsabilidad).toBeNull(); // nunca diligenciado
    expect(r.porCriterio.comunicacion).toBe(3); // (4+2)/2
    // personal = promedio de los criterios personales que sí tienen dato: puntualidad(3), presentacion(5), asistencia(3)
    expect(r.personal).toBeCloseTo((3 + 5 + 3) / 3);
    // social = promedio de los criterios sociales que sí tienen dato: solo comunicacion(3)
    expect(r.social).toBe(3);
    expect(r.definitiva).toBeCloseTo((r.personal! + r.social!) / 2);
  });

  it("un registro parcial no distorsiona frente a uno completo (promedia por criterio, no por registro)", () => {
    const completo = { puntualidad: 5, presentacion: 5, asistencia: 5, responsabilidad: 5, participacion: 5 };
    const parcial = { puntualidad: 1 };
    const r = agregarRegistros([completo, parcial]);
    // puntualidad promedia (5+1)/2=3, el resto de criterios personales quedan en 5 (un solo dato cada uno)
    expect(r.porCriterio.puntualidad).toBe(3);
    expect(r.porCriterio.presentacion).toBe(5);
    expect(r.personal).toBeCloseTo((3 + 5 + 5 + 5 + 5) / 5);
  });

  it("ignora valores no numéricos (null/undefined) al promediar un criterio", () => {
    const filas = [{ puntualidad: 4 }, { puntualidad: null }, { puntualidad: undefined }];
    const r = agregarRegistros(filas);
    expect(r.porCriterio.puntualidad).toBe(4);
  });
});
