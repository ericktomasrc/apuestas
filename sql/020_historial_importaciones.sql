-- Paso 14: historial persistente de ejecuciones de importación histórica
CREATE TABLE IF NOT EXISTS trabajos_importacion_historica (
  id uuid PRIMARY KEY,
  estado varchar(30) NOT NULL DEFAULT 'EN_COLA',
  usuario_id varchar(100) NULL,
  usuario_alias varchar(160) NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  iniciado_en timestamptz NULL,
  finalizado_en timestamptz NULL,
  actual integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  error text NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trabajos_importacion_historial_creado
  ON trabajos_importacion_historica (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_trabajos_importacion_historial_estado
  ON trabajos_importacion_historica (estado, creado_en DESC);

CREATE TABLE IF NOT EXISTS objetivos_trabajo_importacion_historica (
  trabajo_id uuid NOT NULL REFERENCES trabajos_importacion_historica(id) ON DELETE CASCADE,
  orden integer NOT NULL,
  liga_api_id varchar(40) NOT NULL,
  temporada integer NOT NULL,
  liga varchar(160) NULL,
  estado varchar(30) NOT NULL DEFAULT 'EN_COLA',
  error text NULL,
  iniciado_en timestamptz NULL,
  finalizado_en timestamptz NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trabajo_id, orden)
);

CREATE INDEX IF NOT EXISTS idx_objetivos_trabajo_importacion_liga_temp
  ON objetivos_trabajo_importacion_historica (liga_api_id, temporada);
