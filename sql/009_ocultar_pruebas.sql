-- =====================================================================
--  Migración 009 — OCULTAR LO QUE NO SE PUEDE BORRAR
--
--  La 007 dejó la «Liga test» en pie porque tenía partidos con salas
--  que llegaron a mover dinero. Borrarla dejaría movimientos
--  apuntando a la nada, así que no se toca.
--
--  Pero seguir viéndola en el panel confunde: parece que el catálogo
--  real trae basura. La solución es distinguir dos cosas que hasta
--  ahora eran una:
--
--    - un registro BORRADO no existe
--    - un registro OCULTO existe, conserva su historia, y no se
--      muestra ni se sincroniza
--
--  Es la misma idea que ya usa el sistema para los usuarios
--  suspendidos: se conservan, pero no participan.
-- =====================================================================

BEGIN;

ALTER TABLE ligas
    ADD COLUMN IF NOT EXISTS oculta BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ligas.oculta IS
    'No se muestra ni se sincroniza, pero conserva su historia. Para ligas de prueba que ya movieron dinero.';

DROP VIEW IF EXISTS v_ligas CASCADE;
CREATE VIEW v_ligas AS
    SELECT * FROM ligas WHERE eliminado_en IS NULL AND NOT oculta;

-- La vista de activas se apoya en v_ligas, así que hereda el filtro.
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

-- Recrear las vistas que dependen de v_ligas.
--
-- El `DROP VIEW ... CASCADE` de arriba se lleva por delante todo lo
-- que la usa. Sin volver a crearlas, la ruta que las consulta falla
-- con «relation does not exist» — y eso no se descubre hasta que
-- alguien abre esa pantalla.
DROP VIEW IF EXISTS v_partidos_sin_proveedor;
CREATE VIEW v_partidos_sin_proveedor AS
SELECT p.id, p.equipo_local, p.equipo_visitante, p.inicia_en, p.estado,
       l.nombre AS liga,
       (SELECT count(*)::int FROM v_salas s
         WHERE s.partido_id = p.id
           AND s.estado IN ('ABIERTA','CUENTA_REGRESIVA','CERRADA','EN_JUEGO')
       ) AS salas_en_riesgo
  FROM v_partidos p
  JOIN v_ligas l ON l.id = p.liga_id
 WHERE p.api_id LIKE 'manual:%'
   AND p.estado = 'PROGRAMADO';


-- ---------------------------------------------------------------------
-- Ocultar lo que quedó de las pruebas
-- ---------------------------------------------------------------------

UPDATE ligas SET oculta = TRUE
 WHERE eliminado_en IS NULL
   AND (api_id !~ '^\d+$' OR nombre ILIKE '%test%');

-- Sus mercados también: una liga oculta con mercados habilitados
-- seguiría contando como «activa» en los conteos.
UPDATE mercados_por_liga m
   SET eliminado_en = now()
  FROM ligas l
 WHERE m.liga_id = l.id
   AND l.oculta
   AND m.eliminado_en IS NULL;

-- Y sus partidos futuros: nadie debería poder crear una sala sobre
-- un partido de una liga que ya no existe para el sistema.
UPDATE partidos p
   SET eliminado_en = now()
  FROM ligas l
 WHERE p.liga_id = l.id
   AND l.oculta
   AND p.eliminado_en IS NULL
   AND p.estado = 'PROGRAMADO'
   AND NOT EXISTS (
     SELECT 1 FROM movimientos mo
       JOIN salas s ON s.id = mo.sala_id
      WHERE s.partido_id = p.id);

-- ---------------------------------------------------------------------
-- Comprobación
-- ---------------------------------------------------------------------
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM v_ligas WHERE api_id !~ '^\d+$';
    IF n > 0 THEN
        RAISE EXCEPTION 'Quedan % liga(s) no numéricas visibles', n;
    END IF;

    SELECT count(*) INTO n FROM ligas WHERE oculta;
    RAISE NOTICE '% liga(s) ocultas. Conservan su historia.', n;

    -- Las vistas que dependen de v_ligas siguen existiendo.
    SELECT count(*) INTO n FROM information_schema.views
     WHERE table_name IN ('v_ligas','v_ligas_activas','v_partidos_sin_proveedor');
    IF n <> 3 THEN
        RAISE EXCEPTION 'Falta alguna vista tras el CASCADE: hay % de 3', n;
    END IF;

    -- Lo que no puede pasar: perder movimientos.
    SELECT count(*) INTO n
      FROM movimientos mo
      JOIN salas s ON s.id = mo.sala_id
     WHERE s.eliminado_en IS NOT NULL;
    IF n > 0 THEN
        RAISE EXCEPTION 'Hay % movimiento(s) en salas borradas', n;
    END IF;
END $$;

COMMIT;
