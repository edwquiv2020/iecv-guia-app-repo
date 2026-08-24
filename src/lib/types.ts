// Tipos compartidos entre el formulario, la generación de contenido con IA
// y el armado del documento Word.

export type Clei = "III" | "IV" | "V" | "VI";

/**
 * Íconos reales de Microsoft (Fluent UI System Icons) disponibles para
 * insertar al frente de un paso numerado que hace una acción concreta de
 * Windows/Office — ver assets/iconos/. Lista cerrada: si un paso no
 * corresponde a ninguno, se entrega "ninguno" y el paso queda sin ícono
 * (nunca bloquea la generación por un ícono faltante).
 */
export const ICONOS_PASOS = [
  "guardar", "negrita", "cursiva", "subrayado",
  "alinear_izquierda", "alinear_centro", "alinear_derecha",
  "cortar", "copiar", "pegar", "deshacer", "rehacer",
  "imprimir", "insertar_tabla", "insertar_imagen", "lista_vinetas",
] as const;
export type IconoPaso = (typeof ICONOS_PASOS)[number];

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
  /** Id del curso en el catálogo (Supabase) — si viene, se usa para consultar los tipos de taller usados recientemente y no repetirlos. Opcional por compatibilidad. */
  cursoId?: string;
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
  /** 3 logros concretos y verificables que el estudiante puede hacer solo al terminar (recuadro "OBJETIVO DE LA GUÍA"). */
  objetivoGuia: string[];
  reflexionInicial: string;
  /** Conecta el tema con algo que el estudiante adulto ya sabe de su vida cotidiana (recuadro "PARTE DE LO QUE YA SABES"). */
  parteDeLoQueYaSabes: string;
  subtemas: Array<{
    titulo: string;
    funcion: string; // explicación técnica del subtema
    /** Solo cuando el subtema es un procedimiento de Windows/Office: pasos numerados, cada uno con su ícono si corresponde a una acción conocida. */
    pasos?: Array<{ texto: string; icono: IconoPaso | "ninguno" }>;
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
  /** Checklist que el estudiante revisa antes de entregar (recuadro "LISTA DE VERIFICACIÓN ANTES DE ENTREGAR"). */
  listaVerificacion: string[];
  /** Pregunta reflexiva de cierre, conecta el tema con la vida real del estudiante (recuadro "ANTES DE CERRAR"). */
  antesDeCerrarPregunta: string;
  /** 2-4 conceptos clave de la semana con una frase de resumen cada uno (recuadro "FICHA RESUMEN"). */
  fichaResumen: Array<{ concepto: string; resumen: string }>;
  bibliografia: Array<{
    autor: string;
    anio: string;
    titulo: string;
  }>;
  /** Clave del banco de fotos motivacionales (ver py_scripts/gen_imagen_motivacional_v2.py) elegida para esta semana. */
  fotoMotivacionalClave: string;
}

/** Bibliografía teórica fija que respalda los elementos de andragogía/visuales — se agrega siempre, después de la del tema. */
export const BIBLIOGRAFIA_TEORICA_ESTANDAR = [
  { autor: "Paivio, A.", anio: "1971", titulo: "Imagery and Verbal Processes — base de los apoyos visuales (mapa, capturas anotadas, ficha resumen) de esta guía" },
  { autor: "Mayer, R.", anio: "2009", titulo: "Multimedia Learning — base del principio de aprender mejor de imágenes + palabras que solo de palabras" },
  { autor: "Knowles, M.", anio: "1980", titulo: "The Modern Practice of Adult Education — base de los ajustes de contexto adulto" },
];

/**
 * Contenido de la guía DUA — generado en una SEGUNDA llamada encadenada,
 * a partir del contenido ya generado de la Estándar (mismo tema, misma
 * competencia de fondo), tomando solo el subtema A y convirtiéndolo en un
 * procedimiento repetible con apoyo decreciente (4 repeticiones). Todos los
 * textos van reescritos más cortos/explícitos — no se reutilizan verbatim
 * salvo el video, la foto motivacional y las imágenes del subtema.
 */
export interface ContenidoDua {
  saludoMotivacion: string;
  introduccion: string;
  competencia: string;
  desempeno: string;
  /** Una sola frase fluida (no una lista numerada como en Estándar). */
  objetivoGuia: string;
  reflexionInicial: string;
  parteDeLoQueYaSabes: string;
  subtemaTitulo: string;
  /** Explicación muy explícita y simple del procedimiento (reemplaza "Función:"). */
  funcionExplicita: string;
  /** Exactamente 4 repeticiones del mismo procedimiento, cambiando solo el dato de entrada. La primera (índice 0) es el ejemplo ya resuelto. */
  repeticiones: Array<{ instruccion: string }>;
  tallerSituacionPropia: { opcionA: string; opcionB: string };
  rubricaCriteriosEspecificos: Array<{
    criterio: string;
    superior: string;
    alto: string;
    basico: string;
    bajo: string;
  }>;
  listaVerificacion: string[];
  antesDeCerrarPregunta: string;
  /** Una sola frase de cierre tipo "ciclo completo" (no una tabla de conceptos como en Estándar). */
  fichaResumen: string;
  bibliografia: Array<{ autor: string; anio: string; titulo: string }>;
}

export const CRITERIO_PARTICIPACION_DUA = [
  "Participación",
  "Realiza las repeticiones con acompañamiento mínimo.",
  "Realiza casi todas, con algún acompañamiento puntual.",
  "Realiza las repeticiones con acompañamiento constante.",
  "No completa las repeticiones incluso con acompañamiento.",
];

export const BIBLIOGRAFIA_TEORICA_DUA = [
  { autor: "CAST (Center for Applied Special Technology)", anio: "2018", titulo: "Universal Design for Learning Guidelines version 2.2" },
  { autor: "Paivio, A.", anio: "1971", titulo: "Imagery and Verbal Processes — base de los apoyos visuales de esta guía" },
  { autor: "Knowles, M.", anio: "1980", titulo: "The Modern Practice of Adult Education — base de los ajustes de contexto adulto" },
];

/** Imagen subida manualmente por el docente para un subtema (captura real u otra ilustración). */
export interface ImagenSubtema {
  subtemaIndex: number;
  buffer: Buffer;
  tipo: "png" | "jpg";
  esCapturaOffice: boolean;
}

/** Tiempos permitidos por Kahoot (segundos) — cualquier otro valor cae a 20s automáticamente al importar. */
export const TIEMPOS_KAHOOT = [5, 10, 20, 30, 60, 120] as const;

/**
 * Cuestionario Kahoot de 10 preguntas — generado en una llamada encadenada
 * a partir del contenido ya generado de la Estándar, para que las preguntas
 * salgan solo de lo que trae la guía de esa semana (nunca temas inventados).
 * 7 preguntas de selección múltiple (4 opciones) + 3 de Verdadero/Falso.
 */
export interface ContenidoKahoot {
  preguntas: Array<{
    pregunta: string; // máx 95 caracteres
    respuestas: string[]; // 4 para selección múltiple, 2 ("Verdadero","Falso") para V/F — máx 60 caracteres c/u
    tiempoSeg: (typeof TIEMPOS_KAHOOT)[number];
    /** Índices (1-indexado) de la(s) respuesta(s) correcta(s), ej. [2] o [1,3]. */
    correctas: number[];
  }>;
}

// ---------------------------------------------------------------------------
// Exámenes: Diagnóstico (FTO-EDU-FOR-82, al inicio del período, conocimiento
// general de Tecnología e Informática, sin curso específico) e
// Intermedio/Final (FTO-EDU-FOR-98, uno por curso, a mitad y al final de las
// semanas de ese curso). Selección múltiple con única respuesta, 4 opciones,
// calificados con la hoja de respuestas tipo óvalos del formato físico.
// ---------------------------------------------------------------------------

export type TipoExamen = "diagnostico" | "intermedio" | "final";

/** Cantidad de preguntas por examen según la jornada — regla dada por el docente: 10 entre semana, 5 sábado. */
export function cantidadPreguntasPorJornada(diasJornada: string): number {
  return /s[áa]bado/i.test(diasJornada) ? 5 : 10;
}

/** Datos que el docente llena en el formulario para UN examen (Diagnóstico, Intermedio o Final). */
export interface ParametrosExamen {
  tipo: TipoExamen;
  clei: Clei;
  grupoCleiJornada: string; // ej. "6-7/III/SEMANAL 1"
  jornada: string; // ej. "SEMANAL 1", "SABADO 1"
  cantidadPreguntas: number; // derivada de la jornada
  valoracionPregunta: number; // 5.0 / cantidadPreguntas
  semana: number; // semana académica en que se aplica
  fechaAplicacion: string; // dd/mm/aaaa
  sede: string;
  docente: string;
  /** Solo intermedio/final — Diagnóstico no evalúa un curso específico. */
  cursoId?: string;
  cursoNombre?: string;
}

/** Imagen de apoyo subida por el docente para UNA pregunta, con su descripción (da el contexto exacto a la IA). */
export interface PreguntaExamenInput {
  index: number; // 1-indexado, coincide con el número de la pregunta
  imagen?: { buffer: Buffer; tipo: "png" | "jpg" };
  descripcionImagen?: string;
}

/**
 * Contenido de un examen — mismo tipo para Diagnóstico, Intermedio y Final.
 * Cuando el docente adjuntó una imagen de apoyo para una pregunta (ver
 * PreguntaExamenInput), el enunciado se redacta a partir de la descripción
 * que el docente dio de esa imagen, para que coincidan exactamente.
 */
export interface ContenidoExamen {
  preguntas: Array<{
    enunciado: string;
    opciones: [string, string, string, string]; // A, B, C, D
    /** Índice (0-3) de la opción correcta. */
    correcta: number;
  }>;
}
