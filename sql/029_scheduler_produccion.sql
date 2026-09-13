-- FASE 10
-- Registro persistente de ranuras automáticas.
-- Idempotente: no borra ni modifica datos existentes.

CREATE TABLE IF NOT EXISTS ejecuciones_procesos_automaticos (
    proceso        TEXT NOT NULL,
    ranura         TEXT NOT NULL,
    estado         TEXT NOT NULL
                   CHECK (estado IN ('EJECUTANDO','COMPLETADO','ERROR','OMITIDO')),
    iniciado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalizado_en  TIMESTAMPTZ,
    duracion_ms    INTEGER,
    error          TEXT,
    detalle        JSONB,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (proceso, ranura)
);

CREATE INDEX IF NOT EXISTS idx_ejecuciones_procesos_automaticos_iniciado
    ON ejecuciones_procesos_automaticos (proceso, iniciado_en DESC);
