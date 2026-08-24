import { describe, expect, it } from "vitest";
import { sumarDias } from "@/app/horarios/page";

// Protege el intervalo configurable del modo automático de /horarios — antes
// era siempre 7 días fijo, ahora es un parámetro (7 semanal, 15 quincenal…).
describe("sumarDias", () => {
  it("suma 7 días (patrón semanal)", () => {
    expect(sumarDias("2026-08-01", 7)).toBe("2026-08-08");
  });

  it("suma 15 días (patrón quincenal)", () => {
    expect(sumarDias("2026-08-01", 15)).toBe("2026-08-16");
  });

  it("cruza el fin de mes correctamente", () => {
    expect(sumarDias("2026-08-25", 7)).toBe("2026-09-01");
  });

  it("con 0 días devuelve la misma fecha", () => {
    expect(sumarDias("2026-08-01", 0)).toBe("2026-08-01");
  });
});
