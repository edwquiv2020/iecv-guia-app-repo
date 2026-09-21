/** "Educación Física" -> "educacion-fisica" (sin tildes, minúsculas, guiones). */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Normaliza un nombre para compararlo (sin tildes, sin mayúsculas, sin espacios repetidos). */
export function clave(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Primer slug libre a partir de `base`: base, base-2, base-3… (`ocupados` = slugs que ya existen). */
export function slugLibre(base: string, ocupados: Set<string>): string {
  const raiz = base || "item";
  if (!ocupados.has(raiz)) return raiz;
  for (let n = 2; ; n++) {
    const candidato = `${raiz}-${n}`;
    if (!ocupados.has(candidato)) return candidato;
  }
}
