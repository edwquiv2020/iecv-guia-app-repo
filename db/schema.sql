-- Catálogo académico: cursos/ciclos desacoplados (many-to-many), temas por
-- curso al tamaño de una semana/guía (con su video y kahoot ya asociados,
-- igual que la malla real en Excel del docente), y la capa de programación
-- (calendario_clases) que asigna un tema a una fecha/ciclo/jornada concretos.

drop table if exists guias cascade;
drop table if exists calendario_clases cascade;
drop table if exists horario_bloques cascade;
drop table if exists jornadas cascade;
drop table if exists temas cascade;
drop table if exists curso_ciclos cascade;
drop table if exists ciclos cascade;
drop table if exists cursos cascade;
drop table if exists actividades cascade;
drop table if exists malla_items cascade;
drop table if exists tematicas cascade;

-- Catálogo de tipos de actividad semanal (qué es cada semana del calendario:
-- clase normal, examen, día institucional, etc.) — lista abierta, se amplía
-- agregando filas aquí, sin tocar código ni el esquema.
create table actividades (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table cursos (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nombre text not null,
  descripcion text,
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
  tipo text not null check (tipo in ('estandar','dua')),
  estado text not null default 'pendiente' check (estado in ('pendiente','generada','publicada')),
  archivo_path text,
  -- Tipos de taller usados (solo tipo='estandar') — permite pedirle a la IA
  -- que no repita siempre la misma combinación en guías consecutivas del
  -- mismo curso.
  talleres_tipos text[],
  generado_en timestamptz,
  created_at timestamptz not null default now(),
  unique (calendario_clase_id, tipo)
);

create index temas_curso_idx on temas (curso_id, numero);
create index calendario_clases_lookup_idx on calendario_clases (ciclo_id, jornada_id, semana_academica);
