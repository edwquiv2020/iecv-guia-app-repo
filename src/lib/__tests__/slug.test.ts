import { describe, expect, it } from "vitest";
import { clave, slugLibre, slugify } from "@/lib/slug";

describe("slug", () => {
  it("slugify quita tildes, símbolos y espacios", () => {
    expect(slugify("Educación Física")).toBe("educacion-fisica");
    expect(slugify("  Pensamiento Computacional (Python) ")).toBe("pensamiento-computacional-python");
    expect(slugify("Ñandú & Cía.")).toBe("nandu-cia");
  });
  it("clave compara sin tildes, mayúsculas ni espacios repetidos", () => {
    expect(clave("  Matemáticas  ")).toBe(clave("matematicas"));
    expect(clave("Inglés   Básico")).toBe("ingles basico");
  });
  it("slugLibre agrega -2, -3… si el slug ya existe", () => {
    expect(slugLibre("excel", new Set())).toBe("excel");
    expect(slugLibre("excel", new Set(["excel"]))).toBe("excel-2");
    expect(slugLibre("excel", new Set(["excel", "excel-2"]))).toBe("excel-3");
    expect(slugLibre("", new Set())).toBe("item");
  });
});
