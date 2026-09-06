-- TandaBet: almacén local de resultados y estadísticas deportivas.
-- Independiente de saldos/ledger. Idempotente.
CREATE TABLE IF NOT EXISTS partidos_historial_deportivo (
  id bigserial PRIMARY KEY,
  fixture_api_id varchar(40) NOT NULL UNIQUE,
  liga_id uuid REFERENCES ligas(id),
  liga_api_id varchar(40) NOT NULL,
  temporada integer NOT NULL,
  ronda varchar(160),
  fecha timestamptz NOT NULL,
  estado varchar(30) NOT NULL,
  equipo_local_api_id varchar(40),
  equipo_visitante_api_id varchar(40),
  equipo_local varchar(160) NOT NULL,
  equipo_visitante varchar(160) NOT NULL,
  logo_local varchar(500),
  logo_visitante varchar(500),
  goles_local integer,
  goles_visitante integer,
  goles_descanso_local integer,
  goles_descanso_visitante integer,
  goles_prorroga_local integer,
  goles_prorroga_visitante integer,
  penales_local integer,
  penales_visitante integer,
  payload_fixture jsonb NOT NULL DEFAULT '{}'::jsonb,
  estadisticas_completas boolean NOT NULL DEFAULT false,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_historial_liga_temporada_fecha
  ON partidos_historial_deportivo(liga_api_id, temporada, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_historial_equipos_fecha
  ON partidos_historial_deportivo(equipo_local_api_id, equipo_visitante_api_id, fecha DESC);

CREATE TABLE IF NOT EXISTS estadisticas_partido_deportivo (
  fixture_api_id varchar(40) NOT NULL REFERENCES partidos_historial_deportivo(fixture_api_id) ON DELETE CASCADE,
  equipo_api_id varchar(40) NOT NULL,
  equipo varchar(160) NOT NULL,
  es_local boolean NOT NULL,
  tiros integer,
  tiros_arco integer,
  tiros_fuera integer,
  tiros_bloqueados integer,
  posesion numeric(5,2),
  corners integer,
  faltas integer,
  amarillas integer,
  rojas integer,
  fueras_juego integer,
  pases integer,
  pases_correctos integer,
  precision_pases numeric(5,2),
  atajadas integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_api_id, equipo_api_id)
);

CREATE TABLE IF NOT EXISTS importaciones_historial_deportivo (
  id bigserial PRIMARY KEY,
  liga_api_id varchar(40) NOT NULL,
  temporada integer NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'PENDIENTE',
  fixtures_guardados integer NOT NULL DEFAULT 0,
  estadisticas_guardadas integer NOT NULL DEFAULT 0,
  error text,
  iniciado_en timestamptz,
  finalizado_en timestamptz,
  UNIQUE(liga_api_id, temporada)
);
