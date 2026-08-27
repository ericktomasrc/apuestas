-- =====================================================================
--  Migración 006 — CATÁLOGO COMPLETO DE LIGAS
--
--  El proveedor ofrece más de mil competiciones y traerlas todas
--  cuesta UNA petición. Conviene tenerlas: buscar una liga en el panel
--  es más cómodo que averiguar su identificador a mano.
--
--  Lo que NO conviene es sincronizarlas todas. Cada liga cuesta una
--  petición diaria, y el plan gratuito da 100 al día.
--
--  De ahí la regla: **una liga registrada no se sincroniza hasta que
--  tenga mercados habilitados**. Registrar es gratis, activar cuesta.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Si la liga cubre estadísticas por partido
--
--  Sin `statistics_fixtures`, el proveedor no da córners ni tarjetas.
--  Habilitar esos mercados en una liga así condena cada sala a
--  anularse a las 72 horas por falta de dato, y cada anulación es
--  comisión que no se cobra.
--
--  Se guarda al importar el catálogo para poder avisarlo en el panel
--  antes de que alguien los habilite.
-- ---------------------------------------------------------------------

ALTER TABLE ligas
    ADD COLUMN IF NOT EXISTS tiene_estadisticas BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ligas.tiene_estadisticas IS
    'Si el proveedor da córners y tarjetas de esta liga. En false, esos mercados se anularían solos.';

-- Recrear la vista: PostgreSQL congela las columnas de un SELECT * al
-- crearla, y no vería la que acabamos de agregar.
DROP VIEW IF EXISTS v_ligas CASCADE;
CREATE VIEW v_ligas AS SELECT * FROM ligas WHERE eliminado_en IS NULL;

-- ---------------------------------------------------------------------
-- 2. Índice único para poder reimportar sin duplicar
--
--  El importador usa ON CONFLICT para actualizar en vez de insertar.
--  Sin un índice único que coincida exactamente con esa cláusula,
--  PostgreSQL responde «no unique or exclusion constraint matching».
-- ---------------------------------------------------------------------

DROP INDEX IF EXISTS uq_ligas_api;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ligas_api ON ligas (api_id) WHERE eliminado_en IS NULL;

-- ---------------------------------------------------------------------
-- 3. Qué ligas están realmente activas
--
--  «Activa» significa con mercados habilitados: son las únicas que se
--  sincronizan y las únicas que aparecen en la app.
-- ---------------------------------------------------------------------

DROP VIEW IF EXISTS v_ligas_activas CASCADE;
CREATE VIEW v_ligas_activas AS
SELECT l.*,
       (SELECT count(*)::int FROM mercados_por_liga m
         WHERE m.liga_id = l.id AND m.eliminado_en IS NULL) AS mercados,
       (SELECT count(*)::int FROM v_partidos p
         WHERE p.liga_id = l.id AND p.estado = 'PROGRAMADO') AS partidos
  FROM v_ligas l
 WHERE EXISTS (SELECT 1 FROM mercados_por_liga m
                WHERE m.liga_id = l.id AND m.eliminado_en IS NULL);

COMMENT ON VIEW v_ligas_activas IS
    'Ligas con mercados habilitados. Solo estas se sincronizan con el proveedor y consumen cuota.';

-- ---------------------------------------------------------------------
-- Comprobación
-- ---------------------------------------------------------------------
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_name = 'ligas' AND column_name = 'tiene_estadisticas';
    IF n <> 1 THEN RAISE EXCEPTION 'Falta ligas.tiene_estadisticas'; END IF;

    -- La vista tiene que ver la columna nueva. Si no la recreamos,
    -- seguiría devolviendo la lista vieja.
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_name = 'v_ligas' AND column_name = 'tiene_estadisticas';
    IF n <> 1 THEN RAISE EXCEPTION 'v_ligas no ve la columna nueva'; END IF;
END $$;

COMMIT;
