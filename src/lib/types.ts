// Tipos compartidos entre el formulario, la generación de contenido con IA
// y el armado del documento Word.

export type Clei = "III" | "IV" | "V" | "VI";

/** Datos que el docente llena en el formulario para UNA guía semanal. */
export interface ParametrosGuia {
  clei: Clei;
  grupoCleiJornada: string; // ej. "6-7/III/SEMANAL 1"
  jornada: string; // ej. "SEMANAL 1", "SABADO 1"
  semana: number;
  guia: number;
  fechaClase: string; // dd/mm/aa
  fechaClaseLarga: string; // dd/mm/aaaa
  tema: string; // MAYÚSCULAS
  subtemas: string[]; // lista de subtemas (A, B, C…) a desarrollar
  fechaCargue: string; // dd/mm/aaaa
  horaMaxima: string; // "23:59"
  // Video de apoyo: el docente lo aporta manualmente (verificar que exista y
  // sea apropiado es responsabilidad humana — ver nota en SKILL.md original).
  videoApoyo: {
    titulo: string;
    canal: string;
    duracion: string;
    url: string;
  };
}

/** Duración/máximo de páginas derivados del CLEI (regla fija de la skill original). */
export function duracionPorClei(clei: Clei): { duracion: string; maxPaginas: string; numTalleres: number } {
  if (clei === "III") {
    return { duracion: "1 hora (60 minutos).", maxPaginas: "Máximo 3", numTalleres: 2 };
  }
  return { duracion: "2 horas (120 minutos).", maxPaginas: "Máximo 5", numTalleres: 3 };
}

/** Contenido pedagógico generado por el modelo de IA a partir del tema/subtemas. */
export interface ContenidoGuia {
  saludoMotivacion: string;
  introduccion: string;
  competencia: string;
  desempeno: string;
  reflexionInicial: string;
  subtemas: Array<{
    titulo: string;
    funcion: string; // explicación técnica del subtema
  }>;
  talleres: Array<{
    tipo: string; // "cuestionario", "emparejamiento", "caso de estudio", "ejercicio guiado", "producto entregable"
    instrucciones: string;
    items: string[]; // preguntas o pasos numerados
  }>;
  rubricaCriteriosEspecificos: Array<{
    criterio: string;
    superior: string;
    alto: string;
    basico: string;
    bajo: string;
  }>;
  bibliografia: Array<{
    autor: string;
    anio: string;
    titulo: string;
  }>;
  /** Clave del banco de fotos motivacionales (ver py_scripts/gen_imagen_motivacional_v2.py) elegida para esta semana. */
  fotoMotivacionalClave: string;
}
