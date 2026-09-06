-- 014_publicacion_manual_salas.sql
-- Sala creada != sala publicada.
BEGIN;

ALTER TABLE salas
  ADD COLUMN IF NOT EXISTS publicada_en TIMESTAMPTZ NULL;

COMMENT ON COLUMN salas.publicada_en IS
  'Fecha en que el anfitrión publicó manualmente la sala en el Muro. NULL = no publicada.';

CREATE INDEX IF NOT EXISTS ix_salas_publicada_en
  ON salas (publicada_en)
  WHERE publicada_en IS NOT NULL;

COMMIT;
