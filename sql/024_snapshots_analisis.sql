-- Paso 38: snapshots reproducibles de trazabilidad técnica.
CREATE TABLE IF NOT EXISTS snapshots_analisis_historico (
  id uuid PRIMARY KEY,
  fixture_id varchar(40) NOT NULL,
  familia varchar(24) NOT NULL,
  muestra integer NOT NULL,
  analisis_huella varchar(64) NOT NULL,
  version_huella varchar(64),
  calibracion_huella varchar(64),
  integridad_temporal varchar(20) NOT NULL,
  snapshot jsonb NOT NULL,
  creado_por_usuario_id text,
  creado_por_alias text,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_analisis_fixture ON snapshots_analisis_historico(fixture_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_analisis_huella ON snapshots_analisis_historico(analisis_huella);
