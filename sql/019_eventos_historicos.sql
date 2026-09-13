-- TandaBet · Paso 7
-- Cronología histórica de eventos deportivos para análisis descriptivo.
-- No toca saldo, ledger, pagos ni liquidación.

ALTER TABLE partidos_historial_deportivo
  ADD COLUMN IF NOT EXISTS eventos_completos boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS eventos_partido_deportivo (
  fixture_api_id varchar(40) NOT NULL
    REFERENCES partidos_historial_deportivo(fixture_api_id) ON DELETE CASCADE,
  orden_evento integer NOT NULL,
  minuto integer,
  minuto_extra integer,
  equipo_api_id varchar(40),
  equipo varchar(160),
  jugador_api_id varchar(40),
  jugador varchar(160),
  asistente_api_id varchar(40),
  asistente varchar(160),
  tipo varchar(60),
  detalle varchar(160),
  comentarios text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_api_id, orden_evento)
);

CREATE INDEX IF NOT EXISTS ix_eventos_partido_minuto
  ON eventos_partido_deportivo(fixture_api_id, minuto, minuto_extra, orden_evento);

CREATE INDEX IF NOT EXISTS ix_eventos_equipo_tipo
  ON eventos_partido_deportivo(equipo_api_id, tipo, fixture_api_id);
