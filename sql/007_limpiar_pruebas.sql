-- =====================================================================
--  Migración 007 — QUITAR LOS DATOS DE PRUEBA
--
--  Durante el desarrollo quedaron ligas y partidos inventados: la
--  «Liga test» de las suites automáticas y los que se cargaron a mano
--  desde el panel.
--
--  Molestan por algo concreto, no por estética: sus identificadores no
--  son numéricos, y el proveedor rechaza la consulta ENTERA si recibe
--  uno así —«The League field must contain an integer»—, dejando sin
--  partidos también a las ligas buenas.
--
--  ⚠️ Solo se quita lo que NO tiene dinero detrás. Una sala activa o
--  liquidada se conserva aunque su partido sea de prueba: borrarla
--  dejaría movimientos apuntando a la nada.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Comprobar qué se puede tocar
-- ---------------------------------------------------------------------

DO $$
DECLARE con_dinero INT;
BEGIN
    SELECT count(*) INTO con_dinero
      FROM v_salas s
      JOIN v_partidos p ON p.id = s.partido_id
      JOIN v_ligas l    ON l.id = p.liga_id
     WHERE (l.api_id !~ '^\d+$' OR p.api_id LIKE 'manual:%')
       AND EXISTS (SELECT 1 FROM movimientos m WHERE m.sala_id = s.id);

    IF con_dinero > 0 THEN
        RAISE NOTICE 'Hay % sala(s) de prueba con movimientos. Se conservan.', con_dinero;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. Partidos cargados a mano, sin salas con dinero
-- ---------------------------------------------------------------------

UPDATE partidos p
   SET eliminado_en = now()
 WHERE p.eliminado_en IS NULL
   AND p.api_id LIKE 'manual:%'
   AND NOT EXISTS (
     SELECT 1 FROM movimientos m
       JOIN v_salas s ON s.id = m.sala_id
      WHERE s.partido_id = p.id);

-- ---------------------------------------------------------------------
-- 3. Ligas con identificador no numérico
--
--  Son las que rompen la sincronización. Primero sus partidos, después
--  ellas: el orden importa porque hay una clave foránea.
-- ---------------------------------------------------------------------

UPDATE partidos p
   SET eliminado_en = now()
  FROM ligas l
 WHERE p.liga_id = l.id
   AND p.eliminado_en IS NULL
   AND l.api_id !~ '^\d+$'
   AND NOT EXISTS (
     SELECT 1 FROM movimientos m
       JOIN v_salas s ON s.id = m.sala_id
      WHERE s.partido_id = p.id);

UPDATE ligas
   SET eliminado_en = now()
 WHERE eliminado_en IS NULL
   AND api_id !~ '^\d+$'
   AND NOT EXISTS (
     SELECT 1 FROM v_partidos p WHERE p.liga_id = ligas.id);

-- ---------------------------------------------------------------------
-- 4. Salas huérfanas
--
--  Las que quedaron apuntando a un partido borrado y nunca tuvieron
--  dinero. Se anulan en vez de borrarse: el estado ANULADA es
--  información, un registro desaparecido no.
-- ---------------------------------------------------------------------

UPDATE salas
   SET estado = 'ANULADA',
       motivo_anulacion = 'DATO_NO_DISPONIBLE'
 WHERE eliminado_en IS NULL
   AND estado IN ('ABIERTA','CUENTA_REGRESIVA','CERRADA','EN_JUEGO')
   AND EXISTS (SELECT 1 FROM partidos p
                WHERE p.id = salas.partido_id AND p.eliminado_en IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM movimientos m WHERE m.sala_id = salas.id);

-- ---------------------------------------------------------------------
-- 5. Impedir que vuelva a pasar
--
--  Una liga sin identificador numérico no sirve: el proveedor no la
--  reconoce y rompe la sincronización de todas las demás.
-- ---------------------------------------------------------------------

ALTER TABLE ligas DROP CONSTRAINT IF EXISTS api_id_numerico;
ALTER TABLE ligas
    ADD CONSTRAINT api_id_numerico CHECK (api_id ~ '^\d+$') NOT VALID;

COMMENT ON CONSTRAINT api_id_numerico ON ligas IS
    'El proveedor exige enteros. Una liga con otro formato hace que rechace la consulta entera.';

-- ---------------------------------------------------------------------
-- Comprobación
-- ---------------------------------------------------------------------
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM v_ligas WHERE api_id !~ '^\d+$';
    IF n > 0 THEN
        RAISE NOTICE '% liga(s) no numéricas siguen ahí: tienen partidos con dinero.', n;
    END IF;

    SELECT count(*) INTO n FROM v_partidos WHERE api_id LIKE 'manual:%';
    IF n > 0 THEN
        RAISE NOTICE '% partido(s) manuales conservados: tienen salas con dinero.', n;
    END IF;

    -- Lo que no puede quedar: dinero apuntando a algo borrado.
    SELECT count(*) INTO n
      FROM movimientos m
      JOIN salas s ON s.id = m.sala_id
     WHERE s.eliminado_en IS NOT NULL;
    IF n > 0 THEN
        RAISE EXCEPTION 'Hay % movimiento(s) en salas borradas', n;
    END IF;
END $$;

COMMIT;
