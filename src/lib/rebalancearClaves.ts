import type { ContenidoExamen } from "./types";

type Pregunta = ContenidoExamen["preguntas"][number];

// Una opción que se refiere a otras ("A y B", "Ambas", "Todas las anteriores")
// deja de tener sentido si se cambia el orden: esas preguntas no se mueven.
const REFERENCIA_A_OPCIONES = /\b(anteriores|ambas|ambos|todas|todos|ninguna|ninguno)\b|\b[A-D]\s*(y|o|,)\s*[A-D]\b|\b(opci[oó]n|literal|inciso)\s+[A-D]\b/i;

function mezclar<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hayRacha(letras: number[], largo = 3): boolean {
  for (let i = 0; i + largo <= letras.length; i++) {
    if (letras.slice(i, i + largo).every((l) => l === letras[i])) return true;
  }
  return false;
}

/**
 * La IA tiende a concentrar la respuesta correcta en unas pocas letras. Esto
 * reparte las letras correctas de forma pareja (10 preguntas → 2-3 de cada
 * una; 5 → como máximo 2 de cada una) intercambiando la opción correcta con
 * la que ocupa la letra destino. No cambia el texto de ninguna opción ni de
 * ningún enunciado, y deja quietas las preguntas cuyas opciones se citan entre sí.
 */
export function rebalancearClaves(preguntas: Pregunta[], rng: () => number = Math.random): Pregunta[] {
  const n = preguntas.length;
  const movibles = preguntas.map((p, i) => (p.opciones.some((o) => REFERENCIA_A_OPCIONES.test(o)) ? -1 : i)).filter((i) => i >= 0);
  if (movibles.length < 2) return preguntas;

  // Cupo parejo por letra para todo el examen; el resto lo aleatoriza (qué letras se quedan con la unidad extra).
  const cupo = [0, 0, 0, 0];
  const extra = mezclar([0, 1, 2, 3], rng);
  for (let i = 0; i < n; i++) cupo[i < n - (n % 4) ? i % 4 : extra[i - (n - (n % 4))]]++;
  // Las preguntas fijas ya ocupan parte del cupo.
  preguntas.forEach((p, i) => {
    if (!movibles.includes(i) && cupo[p.correcta] > 0) cupo[p.correcta]--;
  });
  const bolsa: number[] = [];
  cupo.forEach((c, letra) => bolsa.push(...Array<number>(c).fill(letra)));
  while (bolsa.length < movibles.length) bolsa.push(Math.floor(rng() * 4));

  // Sin más de 2 respuestas iguales seguidas (con unos pocos reintentos).
  let destino = mezclar(bolsa, rng).slice(0, movibles.length);
  for (let intento = 0; intento < 20; intento++) {
    const completo = preguntas.map((p) => p.correcta);
    movibles.forEach((idx, k) => (completo[idx] = destino[k]));
    if (!hayRacha(completo)) break;
    destino = mezclar(bolsa, rng).slice(0, movibles.length);
  }

  const resultado = preguntas.map((p) => ({ ...p, opciones: [...p.opciones] as Pregunta["opciones"] }));
  movibles.forEach((idx, k) => {
    const p = resultado[idx];
    const t = destino[k];
    if (p.correcta === t) return;
    [p.opciones[p.correcta], p.opciones[t]] = [p.opciones[t], p.opciones[p.correcta]];
    p.correcta = t;
  });
  return resultado;
}
