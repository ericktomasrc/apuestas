-- =====================================================================
--  Migración 005 — LA TASA CONGELADA ES LA QUE SE COBRA
--
--  ⚠️ CAMBIO DE REGLA DE NEGOCIO. Contradice la Especificación
--     funcional v1.4, sección 3.5, que hay que actualizar.
--
--  ANTES: `tasa_mostrada` se guardaba solo para poder mostrar el
--  desglose. La que se aplicaba era la vigente al liquidar.
--
--  AHORA: se aplica la guardada al apostar.
--
--  Por qué cambió: entre apostar y liquidar pasan horas o días. En
--  ese rato el plan puede vencer, o alguien puede cambiar la comisión
--  desde Membresías. Con la regla anterior, la persona veía 4% en el
--  desglose y se le cobraba 7% al ganar — justo lo que ese desglose
--  previo existe para evitar.
--
--  El modo casa ya funcionaba así desde el principio. Ahora los dos
--  motores cobran con el mismo criterio.
--
--  Consecuencia: `tasa_mostrada` dejó de ser informativa y pasó a ser
--  la fuente del dinero. Necesita las mismas protecciones que tenía
--  `planes.tasa_comision`.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. El comentario del esquema decía lo contrario
-- ---------------------------------------------------------------------

COMMENT ON COLUMN posiciones.tasa_mostrada IS
    'La tasa que se le mostró al apostar. ES LA QUE SE COBRA al liquidar: cambiar una membresía no afecta apuestas ya hechas.';

COMMENT ON COLUMN apuestas_casa.tasa_mostrada IS
    'La tasa que se le mostró al apostar. ES LA QUE SE COBRA al liquidar.';

-- ---------------------------------------------------------------------
-- 2. Comprobar ANTES de imponer el rango
--
--  `ADD CONSTRAINT ... CHECK` valida las filas existentes en el acto.
--  Si alguna está fuera de rango, Postgres corta con su propio
--  mensaje:
--
--    ERROR: check constraint "tasa_mostrada_piso" of relation
--           "posiciones" is violated by some row
--
--  Y eso no dice cuáles son ni qué hacer. Una tasa fuera de rango en
--  una apuesta viva no se arregla borrando: hay que decidir qué se le
--  cobra a esa persona.
-- ---------------------------------------------------------------------

DO $$
DECLARE n INT; detalle TEXT;
BEGIN
    SELECT count(*), string_agg(x.origen || ' ' || x.id::text || ' → ' ||
                                x.tasa_mostrada::text, ', ')
      INTO n, detalle
      FROM (
        SELECT 'posicion' AS origen, id, tasa_mostrada FROM posiciones
         WHERE tasa_mostrada < 0.03 OR tasa_mostrada > 0.20
        UNION ALL
        SELECT 'apuesta_casa', id, tasa_mostrada FROM apuestas_casa
         WHERE tasa_mostrada < 0.03 OR tasa_mostrada > 0.20
      ) x;

    IF n > 0 THEN
        RAISE EXCEPTION USING
          MESSAGE = format('Hay %s apuesta(s) con tasa fuera del rango 3%%-20%%: %s', n, detalle),
          HINT = 'Decide qué tasa corresponde a cada una y corrígela con UPDATE antes de volver a correr. No las borres: son apuestas con dinero real detrás.';
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 3. El mismo rango que protege a los planes
--
--  El piso del 3% existe para que ningún plan deje el ingreso en cero
--  justo en quienes más juegan. Mientras la tasa venía de `planes`,
--  ese CHECK bastaba.
--
--  Ahora la tasa sale de esta columna, y el motor rechaza cualquier
--  valor fuera de rango con TASA_FUERA_DE_RANGO. Un valor malo aquí ya
--  no se corrige solo al liquidar: deja el mercado sin poder
--  resolverse, con el dinero congelado hasta la anulación por falta de
--  dato a las 72 horas.
-- ---------------------------------------------------------------------

-- Se quitan primero para poder correr esto dos veces.
--
-- `ADD CONSTRAINT` no tiene `IF NOT EXISTS`, así que reaplicar la
-- migración fallaba con «constraint already exists» y revertía todo,
-- incluidos los COMMENT que sí habían pasado. Una migración tiene que
-- poder repetirse sin romperse.
ALTER TABLE posiciones
    DROP CONSTRAINT IF EXISTS tasa_mostrada_piso,
    DROP CONSTRAINT IF EXISTS tasa_mostrada_techo;

ALTER TABLE posiciones
    ADD CONSTRAINT tasa_mostrada_piso  CHECK (tasa_mostrada >= 0.03),
    ADD CONSTRAINT tasa_mostrada_techo CHECK (tasa_mostrada <= 0.20);

ALTER TABLE apuestas_casa
    DROP CONSTRAINT IF EXISTS tasa_casa_piso,
    DROP CONSTRAINT IF EXISTS tasa_casa_techo;

ALTER TABLE apuestas_casa
    ADD CONSTRAINT tasa_casa_piso  CHECK (tasa_mostrada >= 0.03),
    ADD CONSTRAINT tasa_casa_techo CHECK (tasa_mostrada <= 0.20);

-- ---------------------------------------------------------------------
-- Comprobación final
-- ---------------------------------------------------------------------
DO $$
DECLARE n INT;
BEGIN
    -- Las dos columnas siguen siendo NOT NULL. Si dejaran de serlo,
    -- una apuesta sin tasa no se podría liquidar.
    SELECT count(*) INTO n
      FROM information_schema.columns
     WHERE table_name IN ('posiciones','apuestas_casa')
       AND column_name = 'tasa_mostrada'
       AND is_nullable = 'YES';
    IF n > 0 THEN
        RAISE EXCEPTION 'tasa_mostrada dejó de ser NOT NULL en % tabla(s)', n;
    END IF;

    -- Los cuatro CHECK quedaron puestos.
    SELECT count(*) INTO n
      FROM pg_constraint
     WHERE conname IN ('tasa_mostrada_piso','tasa_mostrada_techo',
                       'tasa_casa_piso','tasa_casa_techo');
    IF n <> 4 THEN
        RAISE EXCEPTION 'Faltan restricciones de rango: hay % de 4', n;
    END IF;
END $$;

COMMIT;
