BEGIN;

CREATE TABLE IF NOT EXISTS calibracion_calidad_reglas (
  categoria varchar(120) PRIMARY KEY,
  umbral_utilizable numeric(5,2) NOT NULL CHECK (umbral_utilizable >= 0 AND umbral_utilizable <= 100),
  umbral_limitado numeric(5,2) NOT NULL CHECK (umbral_limitado >= 0 AND umbral_limitado <= 100),
  origen varchar(30) NOT NULL DEFAULT 'BACKTESTING',
  muestra_partidos integer NOT NULL DEFAULT 0,
  reglas_evaluadas integer NOT NULL DEFAULT 0,
  cobertura_promedio numeric(5,2),
  estabilidad_promedio numeric(5,2),
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (umbral_limitado < umbral_utilizable)
);

CREATE INDEX IF NOT EXISTS idx_calibracion_calidad_reglas_actualizado
  ON calibracion_calidad_reglas(actualizado_en DESC);

COMMIT;
