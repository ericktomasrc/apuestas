-- =====================================================================
--  Migración 010 — SOLO DATOS DEL PROVEEDOR
--
--  Las suites automáticas crean ligas, partidos y usuarios propios.
--  Antes usaban identificadores con texto —«tmtbsay5b_liga»— que se
--  mezclaban con el catálogo real en el panel.
--
--  Ahora nacen ocultas y con identificadores numéricos altos, pero las
--  corridas anteriores dejaron rastro. Esto lo limpia.
--
--  ⚠️ Nada con dinero detrás se borra. Una sala que llegó a mover
--  movimientos se conserva aunque su liga fuera de prueba: quitarla
--  dejaría el libro apuntando a la nada.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Ocultar todo lo que no vino del proveedor
--
--  Se reconoce por el identificador: el proveedor usa números del 1 al
--  ~1300. Cualquier otra cosa —texto, o un número por encima de
--  900.000.000— es de las pruebas.
-- ---------------------------------------------------------------------

UPDATE ligas SET oculta = TRUE
 WHERE eliminado_en IS NULL
   AND NOT oculta
   AND (api_id !~ '^\d+$' OR api_id::BIGINT > 500000);

-- Sus mercados: una liga oculta con mercados seguiría contando como
-- activa y consumiendo cuota del proveedor.
UPDATE mercados_por_liga m
   SET eliminado_en = now()
  FROM ligas l
 WHERE m.liga_id = l.id AND l.oculta AND m.eliminado_en IS NULL;

-- ---------------------------------------------------------------------
-- 2. Partidos de esas ligas, salvo los que tengan dinero
-- ---------------------------------------------------------------------

UPDATE partidos p
   SET eliminado_en = now()
  FROM ligas l
 WHERE p.liga_id = l.id
   AND l.oculta
   AND p.eliminado_en IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM movimientos mo
       JOIN salas s ON s.id = mo.sala_id
      WHERE s.partido_id = p.id);

-- ---------------------------------------------------------------------
-- 3. Salas que quedaron sin partido
--
--  Se anulan en vez de borrarse: ANULADA es información, un registro
--  desaparecido no.
-- ---------------------------------------------------------------------

UPDATE salas
   SET estado = 'ANULADA', motivo_anulacion = 'DATO_NO_DISPONIBLE'
 WHERE eliminado_en IS NULL
   AND estado IN ('ABIERTA','CUENTA_REGRESIVA','CERRADA','EN_JUEGO')
   AND EXISTS (SELECT 1 FROM partidos p
                WHERE p.id = salas.partido_id AND p.eliminado_en IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM movimientos m WHERE m.sala_id = salas.id);

-- ---------------------------------------------------------------------
-- 4. La restricción admite los identificadores de prueba
--
--  El CHECK de la 007 solo aceptaba dígitos, y eso rompía las suites
--  automáticas. Ahora piden números altos —900.000.000 en adelante—
--  que nunca chocan con el proveedor y quedan fuera del panel por
--  estar ocultas.
-- ---------------------------------------------------------------------

ALTER TABLE ligas DROP CONSTRAINT IF EXISTS api_id_numerico;
ALTER TABLE ligas
    ADD CONSTRAINT api_id_numerico CHECK (api_id ~ '^\d+$') NOT VALID;

COMMENT ON CONSTRAINT api_id_numerico ON ligas IS
    'El proveedor exige enteros. Una liga con texto hace que rechace la consulta entera y ninguna reciba partidos.';

-- ---------------------------------------------------------------------
-- Comprobación
-- ---------------------------------------------------------------------
DO $$
DECLARE visibles INT; ocultas INT; huerfanos INT;
BEGIN
    SELECT count(*) INTO visibles FROM v_ligas;
    SELECT count(*) INTO ocultas  FROM ligas WHERE oculta;
    RAISE NOTICE '% liga(s) del proveedor visibles, % ocultas.', visibles, ocultas;

    -- Ninguna liga visible puede tener identificador de prueba.
    SELECT count(*) INTO huerfanos
      FROM v_ligas WHERE api_id !~ '^\d+$' OR api_id::BIGINT > 500000;
    IF huerfanos > 0 THEN
        RAISE EXCEPTION 'Quedan % liga(s) de prueba visibles', huerfanos;
    END IF;

    -- Y el dinero sigue completo.
    SELECT count(*) INTO huerfanos
      FROM movimientos m JOIN salas s ON s.id = m.sala_id
     WHERE s.eliminado_en IS NOT NULL;
    IF huerfanos > 0 THEN
        RAISE EXCEPTION 'Hay % movimiento(s) en salas borradas', huerfanos;
    END IF;
END $$;

COMMIT;
