-- 015_cuentas_casa_operadores.sql
-- Separa "puede operar casa" de "recibe financiamiento de plataforma".
-- Conserva historial: una cuenta se ACTIVA/DESACTIVA, no se borra.

CREATE TABLE IF NOT EXISTS cuentas_casa_operador (
  usuario_id UUID PRIMARY KEY REFERENCES usuarios(id),
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  origen_fondos VARCHAR(16) NOT NULL DEFAULT 'PROPIOS'
    CHECK (origen_fondos IN ('PROPIOS','PLATAFORMA','MIXTO')),
  es_casa_oficial BOOLEAN NOT NULL DEFAULT FALSE,
  nota_transparencia VARCHAR(200),
  declarada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  declarada_por UUID NULL REFERENCES usuarios(id),
  desactivada_en TIMESTAMPTZ NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo_ultima_accion VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS ix_cuentas_casa_operador_activa
  ON cuentas_casa_operador(activa);

-- Compatibilidad con instalaciones que ya tenían cuentas declaradas.
INSERT INTO cuentas_casa_operador (
  usuario_id, activa, origen_fondos, es_casa_oficial,
  nota_transparencia, motivo_ultima_accion
)
SELECT
  u.id,
  TRUE,
  CASE
    WHEN u.financiada_por_plataforma THEN 'PLATAFORMA'
    ELSE 'PROPIOS'
  END,
  u.es_casa_oficial,
  u.nota_transparencia,
  'Migración de declaración existente'
FROM usuarios u
WHERE (u.es_casa_oficial OR u.financiada_por_plataforma)
ON CONFLICT (usuario_id) DO NOTHING;
