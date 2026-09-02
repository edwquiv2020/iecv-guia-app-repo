-- Catálogo académico: cursos/ciclos desacoplados (many-to-many), temas por
-- curso al tamaño de una semana/guía (con su video y kahoot ya asociados,
-- igual que la malla real en Excel del docente), y la capa de programación
-- (calendario_clases) que asigna un tema a una fecha/ciclo/jornada concretos.

drop table if exists generaciones_log cascade;
drop table if exists seguimiento_registros cascade;
drop table if exists estudiantes cascade;
drop table if exists docente_asignaturas cascade;
drop table if exists usuarios_autorizados cascade;
drop table if exists guia_archivos cascade;
drop table if exists guias cascade;
drop table if exists calendario_clases cascade;
drop table if exists horario_bloques cascade;
drop table if exists jornadas cascade;
drop table if exists temas cascade;
drop table if exists curso_ciclos cascade;
drop table if exists ciclos cascade;
drop table if exists cursos cascade;
drop table if exists asignaturas cascade;
drop table if exists actividades cascade;
drop table if exists malla_items cascade;
drop table if exists tematicas cascade;

-- Docentes con permiso para entrar a la app (login con Google) — sin dominio
-- institucional propio, el control de acceso es esta lista explícita en vez
-- de un filtro por dominio de correo. Agregar un docente nuevo es una fila
-- acá, no un cambio de código.
create table usuarios_autorizados (
  email text primary key,
  nombre text,
  activo boolean not null default true,
  -- 'admin' puede administrar mallas (crear/editar/borrar temas del
  -- catálogo); 'docente' solo puede leerlas. Todo lo demás (generar guías,
  -- exámenes, cargar horarios) es igual para ambos roles.
  rol text not null default 'docente' check (rol in ('docente', 'admin')),
  created_at timestamptz not null default now()
);

-- Catálogo de tipos de actividad semanal (qué es cada semana del calendario:
-- clase normal, examen, día institucional, etc.) — lista abierta, se amplía
-- agregando filas aquí, sin tocar código ni el esquema.
create table actividades (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

-- Asignaturas reales del plan de estudios (Español, Inglés, Matemáticas,
-- Física, Tecnología e Informática, etc.) — lista abierta, se amplía
-- agregando filas aquí, igual que `actividades`. Es el nivel al que se
-- asocia cada docente (ver docente_asignaturas); `cursos` son los
-- temas/módulos concretos dentro de una asignatura — hoy solo Tecnología e
-- Informática tiene cursos cargados, ver GET /api/catalogo.
create table asignaturas (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nombre text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

-- Temas/módulos concretos que se pueden generar como guía (Canva, Excel,
-- Python...) — todos pertenecen hoy a la asignatura "Tecnología e
-- Informática"; asignatura_id nullable porque un curso podría cargarse
-- antes de que exista su asignatura en el catálogo.
create table cursos (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nombre text not null,
  descripcion text,
  asignatura_id uuid references asignaturas(id),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table ciclos (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nombre text not null,
  grados text[] not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table curso_ciclos (
  curso_id uuid not null references cursos(id) on delete cascade,
  ciclo_id uuid not null references ciclos(id) on delete cascade,
  primary key (curso_id, ciclo_id)
);

-- A qué asignaturas está asociado cada docente (asignado desde
-- /admin/usuarios) — filtra el selector de curso en / y /examenes para
-- rol='docente' (solo ve cursos cuya asignatura tiene asignada); un admin
-- sigue viendo el catálogo completo sin importar esta tabla (ver GET
-- /api/catalogo).
create table docente_asignaturas (
  email text not null references usuarios_autorizados(email) on delete cascade,
  asignatura_id uuid not null references asignaturas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (email, asignatura_id)
);

create table temas (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references cursos(id) on delete cascade,
  numero int not null,
  tema text not null,
  subtemas text not null,
  url_video text,
  archivo_kahoot text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (curso_id, numero)
);

create table jornadas (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nombre text not null,
  dias text not null,
  hora_inicio time not null,
  hora_fin time not null,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table horario_bloques (
  id uuid primary key default gen_random_uuid(),
  jornada_id uuid not null references jornadas(id) on delete cascade,
  numero_bloque int not null,
  hora_inicio time not null,
  hora_fin time not null,
  tipo text not null check (tipo in ('clase','descanso')),
  duracion_min int not null,
  created_at timestamptz not null default now()
);

create table calendario_clases (
  id uuid primary key default gen_random_uuid(),
  fecha_clase date not null,
  semana_academica int not null,
  guia_numero int not null,
  ciclo_id uuid not null references ciclos(id),
  jornada_id uuid not null references jornadas(id),
  -- Nullable: semanas administrativas (MATRÍCULAS, DÍA DEL PROFESOR, etc.)
  -- no tienen curso asociado.
  curso_id uuid references cursos(id),
  -- Nullable: al cargar el horario se resuelve automáticamente por orden
  -- dentro del lote según temas.numero; si el curso no tiene más temas que
  -- semanas cargadas, queda en null para asignarlo después.
  tema_id uuid references temas(id),
  actividad_id uuid not null references actividades(id),
  -- 'horario' = cargada desde /horarios (auto o manual). 'ad_hoc' = creada
  -- al vuelo desde la pantalla de generar guía, para un caso puntual sin
  -- horario oficial todavía. Sirve para avisar antes de sobrescribir una
  -- fila 'ad_hoc' cuando después se carga el horario oficial real.
  origen text not null default 'horario' check (origen in ('horario', 'ad_hoc')),
  created_at timestamptz not null default now(),
  unique (ciclo_id, jornada_id, semana_academica)
);

create table guias (
  id uuid primary key default gen_random_uuid(),
  calendario_clase_id uuid not null references calendario_clases(id) on delete cascade,
  tipo text not null check (tipo in ('estandar','dua','diagnostico','intermedio','final')),
  estado text not null default 'pendiente' check (estado in ('pendiente','generada','publicada')),
  archivo_path text,
  -- Tipos de taller usados (solo tipo='estandar') — permite pedirle a la IA
  -- que no repita siempre la misma combinación en guías consecutivas del
  -- mismo curso.
  talleres_tipos text[],
  -- Contenido pedagógico generado por la IA (ContenidoGuia/ContenidoDua/
  -- ContenidoExamen según `tipo`) — queda auditable y reusable sin volver a
  -- llamar la IA. kahoot_contenido solo aplica a tipo='estandar'.
  contenido jsonb,
  kahoot_contenido jsonb,
  generado_en timestamptz,
  created_at timestamptz not null default now(),
  unique (calendario_clase_id, tipo)
);

-- Binarios reales (.docx/.xlsx) generados para una guía — guardados en
-- Supabase Storage (bucket privado 'guia-archivos'), aquí solo la ruta.
-- Una guía tipo 'estandar' produce 3 (guía + kahoot + kit), 'dua' 1,
-- exámenes/diagnóstico 2 (examen + kit).
create table guia_archivos (
  id uuid primary key default gen_random_uuid(),
  guia_id uuid not null references guias(id) on delete cascade,
  nombre_archivo text not null,
  mime_type text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- Un registro por cada intento real de generación con IA (POST a
-- /api/generar-guia o /api/generar-examen, sin importar si terminó en
-- éxito o error) — solo para el límite diario por docente (ver
-- src/lib/rateLimit.ts), protege contra un costo de API disparado por un
-- bug de reintento en bucle o una cuenta comprometida. No se borra nunca
-- desde la app; si crece mucho, es seguro purgar filas viejas a mano.
create table generaciones_log (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ruta text not null,
  created_at timestamptz not null default now()
);

create index temas_curso_idx on temas (curso_id, numero);
create index calendario_clases_lookup_idx on calendario_clases (ciclo_id, jornada_id, semana_academica);
create index guia_archivos_guia_idx on guia_archivos (guia_id);
create index generaciones_log_email_ruta_idx on generaciones_log (email, ruta, created_at);

-- Seguimiento de estudiantes: aspectos personales y sociales por fuera de
-- lo cognitivo (puntualidad, presentación, convivencia...), calificados de
-- 1 a 5 clase a clase — ver src/lib/seguimiento.ts para la lista fija de
-- criterios y la agregación en nota definitiva por período. Privado por
-- docente: docente_email en ambas tablas, nunca compartido entre cuentas
-- (a diferencia del catálogo académico de arriba).
create table estudiantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  ciclo_id uuid references ciclos(id),
  jornada_id uuid references jornadas(id),
  docente_email text not null references usuarios_autorizados(email) on delete cascade,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Un registro = una clase puntual para un estudiante, no una evaluación de
-- período completo — el docente va calificando clase a clase (incluso
-- parcial, no los 10 criterios siempre) y la nota definitiva de un período
-- se calcula agregando todos sus registros con ese `periodo` (ver
-- agregarRegistros en src/lib/seguimiento.ts). `periodo` es texto libre
-- (ej. "Periodo 2 · 2026"), no una tabla de catálogo — se agrupa por su
-- valor literal, igual que hoy se agrupan las guías por semana_academica.
create table seguimiento_registros (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references estudiantes(id) on delete cascade,
  periodo text not null,
  fecha date not null,
  docente_email text not null references usuarios_autorizados(email) on delete cascade,
  puntualidad smallint check (puntualidad between 1 and 5),
  presentacion smallint check (presentacion between 1 and 5),
  asistencia smallint check (asistencia between 1 and 5),
  responsabilidad smallint check (responsabilidad between 1 and 5),
  participacion smallint check (participacion between 1 and 5),
  comunicacion smallint check (comunicacion between 1 and 5),
  convivencia smallint check (convivencia between 1 and 5),
  conducto smallint check (conducto between 1 and 5),
  relacionamiento smallint check (relacionamiento between 1 and 5),
  pertenencia smallint check (pertenencia between 1 and 5),
  nota text,
  created_at timestamptz not null default now(),
  constraint seguimiento_registros_algun_criterio check (
    num_nonnulls(
      puntualidad, presentacion, asistencia, responsabilidad, participacion,
      comunicacion, convivencia, conducto, relacionamiento, pertenencia
    ) > 0
  )
);

create index estudiantes_docente_idx on estudiantes (docente_email);
create index seguimiento_registros_estudiante_periodo_idx on seguimiento_registros (estudiante_id, periodo);
create index seguimiento_registros_docente_idx on seguimiento_registros (docente_email);
