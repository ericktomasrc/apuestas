-- 013_logo_ligas.sql
-- Guarda el logo oficial de la competición que entrega API-Football.
-- Es nullable porque las ligas creadas a mano o proveedores futuros
-- podrían no traer una imagen.

BEGIN;

ALTER TABLE ligas
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN ligas.logo_url IS
  'URL del logo de la liga/competición entregada por el proveedor deportivo.';

COMMIT;
