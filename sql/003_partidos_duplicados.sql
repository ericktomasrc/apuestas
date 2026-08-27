-- =====================================================================
--  Migración 003 — DUPLICADOS DE PARTIDOS CARGADOS A MANO
--
--  `uq_partidos_api` impide dos partidos con el mismo identificador del
--  proveedor, y funciona bien para lo que llega sincronizado.
--
--  Pero al cargar un partido a mano sin identificador, el código
--  inventa uno con la hora actual:
--
--      manual:mfk2p9
--
--  Es único por definición, así que el índice nunca se dispara y el
--  mismo partido se puede cargar cuatro veces sin que nada se queje.
--
--  Y la consecuencia es peor que ver la lista repetida: `api_id`
--  también es la clave con la que se piden los resultados. Un partido
--  `manual:` no existe para el proveedor, así que sus mercados se
--  quedan en ESPERANDO_DATO hasta que la anulación por falta de dato
--  los devuelva a las 72 horas.
--
--  Con el proveedor simulado no se nota. Con uno real, **cada partido
--  cargado a mano queda condenado a anularse**, y cada anulación es
--  comisión que no se cobra.
--
--  La solución es un índice sobre lo que identifica de verdad a un
--  partido: liga, equipos y hora de inicio. Atrapa el duplicado sin
--  depender de que alguien escriba el identificador.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Limpiar los duplicados que ya existen
--
--  Se conserva el más antiguo de cada grupo, que es el que puede tener
--  salas colgando. Los demás se marcan como eliminados, no se borran:
--  la tabla no admite DELETE.
-- ---------------------------------------------------------------------

WITH duplicados AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY liga_id, lower(trim(equipo_local)),
                          lower(trim(equipo_visitante)), inicia_en
             ORDER BY fecha_crea
           ) AS puesto
      FROM partidos
     WHERE eliminado_en IS NULL
)
UPDATE partidos p
   SET eliminado_en = now()
  FROM duplicados d
 WHERE p.id = d.id
   AND d.puesto > 1
   -- Un partido con salas activas NO se toca: habría dinero
   -- comprometido apuntando a un partido borrado.
   AND NOT EXISTS (
     SELECT 1 FROM salas s
      WHERE s.partido_id = p.id
        AND s.eliminado_en IS NULL
        AND s.estado IN ('ABIERTA','CUENTA_REGRESIVA','CERRADA','EN_JUEGO')
   );

-- ---------------------------------------------------------------------
-- 1b. Comprobar ANTES de crear el índice
--
--  Si queda algún duplicado con salas activas, el CREATE UNIQUE INDEX
--  fallaría con un mensaje de Postgres que no explica qué hacer:
--
--    ERROR: could not create unique index "uq_partido_natural"
--    DETAIL: Key (liga_id, lower(btrim(equipo_local)), ...) is duplicated.
--
--  Comprobar aquí permite decir qué pasa y cómo resolverlo.
-- ---------------------------------------------------------------------

DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n
      FROM (SELECT liga_id, lower(trim(equipo_local)) a,
                   lower(trim(equipo_visitante)) b, inicia_en
              FROM partidos WHERE eliminado_en IS NULL
             GROUP BY 1,2,3,4 HAVING count(*) > 1) x;
    IF n > 0 THEN
        RAISE EXCEPTION USING
          MESSAGE = format('Quedan %s partido(s) duplicados con salas activas.', n),
          HINT = 'Anula esas salas desde el panel (Salas) y vuelve a correr esta migración. No se borran solos porque habría dinero comprometido apuntando a un partido inexistente.';
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 2. Impedir que vuelva a pasar
--
--  Dos equipos no juegan dos veces en la misma liga a la misma hora.
--  Se normaliza el nombre para que «Botafogo» y «botafogo » cuenten
--  como el mismo equipo.
-- ---------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS uq_partido_natural
    ON partidos (liga_id, lower(trim(equipo_local)),
                 lower(trim(equipo_visitante)), inicia_en)
 WHERE eliminado_en IS NULL;

COMMENT ON INDEX uq_partido_natural IS
    'Evita cargar dos veces el mismo partido cuando no hay identificador del proveedor.';

-- ---------------------------------------------------------------------
-- 3. Marcar los que nunca van a recibir resultado
--
--  Un partido cuyo `api_id` empieza en `manual:` no existe para el
--  proveedor. Hay que poder distinguirlos para avisarlo en el panel,
--  en vez de que alguien descubra el problema cuando sus salas se
--  anulen solas.
-- ---------------------------------------------------------------------

DROP VIEW IF EXISTS v_partidos_sin_proveedor CASCADE;
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

COMMENT ON VIEW v_partidos_sin_proveedor IS
    'Partidos cargados a mano sin identificador. Sus resultados no llegan solos: hay que resolverlos desde el panel o se anularán a las 72 horas.';

COMMIT;
