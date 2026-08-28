-- =====================================================================
--  Migración 011 — ESCUDOS DE LOS EQUIPOS
--
--  El proveedor los manda en cada partido y el código los descartaba:
--
--      "teams": { "home": { "logo": "https://media.api-sports.io/..." } }
--
--  Se guarda la URL, no la imagen. Si el proveedor cambia el escudo de
--  un equipo, se actualiza solo. Descargarlas obligaría a mantener un
--  almacenamiento propio y a detectar cuándo cambian.
--
--  Las imágenes se piden directo desde el navegador, así que NO
--  consumen peticiones de la cuota diaria.
-- =====================================================================

BEGIN;

ALTER TABLE partidos
    ADD COLUMN IF NOT EXISTS logo_local     TEXT,
    ADD COLUMN IF NOT EXISTS logo_visitante TEXT;

COMMENT ON COLUMN partidos.logo_local IS
    'URL del escudo en el CDN del proveedor. Puede ser NULL: no todas las ligas los tienen.';

ALTER TABLE ligas
    ADD COLUMN IF NOT EXISTS logo TEXT;

COMMENT ON COLUMN ligas.logo IS
    'URL del logo de la competición.';

-- Las vistas congelan sus columnas al crearse: sin recrearlas no
-- verían las que acabamos de agregar. Es la trampa que ya nos hizo
-- fallar dos migraciones.
DROP VIEW IF EXISTS v_partidos CASCADE;
CREATE VIEW v_partidos AS SELECT * FROM partidos WHERE eliminado_en IS NULL;

DROP VIEW IF EXISTS v_ligas CASCADE;
CREATE VIEW v_ligas AS
    SELECT * FROM ligas WHERE eliminado_en IS NULL AND NOT oculta;

-- Y las que dependían de ellas.
CREATE VIEW v_ligas_activas AS
SELECT l.*,
       (SELECT count(*)::int FROM mercados_por_liga m
         WHERE m.liga_id = l.id AND m.eliminado_en IS NULL) AS mercados,
       (SELECT count(*)::int FROM v_partidos p
         WHERE p.liga_id = l.id AND p.estado = 'PROGRAMADO') AS partidos
  FROM v_ligas l
 WHERE EXISTS (SELECT 1 FROM mercados_por_liga m
                WHERE m.liga_id = l.id AND m.eliminado_en IS NULL);

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

-- También depende de v_partidos, así que el CASCADE se la llevó.
CREATE VIEW v_casa_oficial_publico AS
SELECT
    c.id             AS casa_id,
    c.codigo,
    c.estado,
    c.presupuesto_centavos,
    c.fecha_crea     AS creada_en,
    c.liquidada_en,
    p.equipo_local,
    p.equipo_visitante,
    p.inicia_en,
    l.presupuesto_centavos     AS liq_presupuesto,
    l.cubierto_centavos        AS liq_cubierto,
    l.resultado_casa_centavos  AS resultado,
    l.comision_casa_centavos   AS comision_pagada,
    (SELECT o.etiqueta FROM opciones_casa o WHERE o.id = l.opcion_ganadora_id)
                               AS opcion_que_ocurrio
FROM v_casas c
JOIN v_partidos p ON p.id = c.partido_id
LEFT JOIN liquidaciones_casa l ON l.casa_id = c.id
WHERE c.es_oficial
ORDER BY c.fecha_crea DESC;

-- ---------------------------------------------------------------------
-- Comprobación
-- ---------------------------------------------------------------------
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_name = 'v_partidos' AND column_name = 'logo_local';
    IF n <> 1 THEN RAISE EXCEPTION 'v_partidos no ve logo_local'; END IF;

    -- Las tres vistas que tumbó el CASCADE siguen existiendo.
    SELECT count(*) INTO n FROM information_schema.views
     WHERE table_name IN ('v_partidos','v_ligas','v_ligas_activas',
                          'v_partidos_sin_proveedor','v_casa_oficial_publico');
    IF n <> 5 THEN
        RAISE EXCEPTION 'Falta alguna vista tras el CASCADE: hay % de 5', n;
    END IF;
END $$;

COMMIT;
