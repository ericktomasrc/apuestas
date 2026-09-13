-- Paso 17: telemetría persistente de consumo API-Football.
-- Guarda únicamente metadatos técnicos de llamadas; nunca guarda API keys.

CREATE TABLE IF NOT EXISTS consumo_api_football (
  id bigserial PRIMARY KEY,
  solicitado_en timestamptz NOT NULL DEFAULT now(),
  ruta varchar(100) NOT NULL,
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado_http integer,
  exito boolean NOT NULL DEFAULT false,
  duracion_ms integer NOT NULL DEFAULT 0,
  restantes integer,
  limite integer,
  retry_after_seg integer,
  codigo_error varchar(80),
  detalle_error varchar(500)
);

CREATE INDEX IF NOT EXISTS idx_consumo_api_football_fecha
  ON consumo_api_football (solicitado_en DESC);
CREATE INDEX IF NOT EXISTS idx_consumo_api_football_ruta_fecha
  ON consumo_api_football (ruta, solicitado_en DESC);
CREATE INDEX IF NOT EXISTS idx_consumo_api_football_error_fecha
  ON consumo_api_football (exito, solicitado_en DESC);
