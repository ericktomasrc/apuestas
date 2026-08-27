-- =====================================================================
--  Migración 008 — ORDENAR LAS LIGAS POR IMPORTANCIA
--
--  El catálogo del proveedor viene alfabético. Con 1248 ligas eso
--  significa que lo primero que se ve son «1. Deild (Faroe-Islands)» y
--  «1a Divisió (Andorra)», mientras que la Liga 1 peruana queda
--  enterrada a mitad de la lista.
--
--  Se agrega una relevancia numérica: cuanto más alta, más arriba. Es
--  un dato, no código, así que se ajusta desde el panel sin desplegar
--  nada.
--
--  El criterio para un producto peruano:
--    100  Liga 1 y copas donde juegan equipos peruanos
--     80  Ligas sudamericanas grandes
--     60  Competiciones europeas de primer nivel
--     40  Segundas divisiones de países grandes
--      0  todo lo demás
-- =====================================================================

BEGIN;

ALTER TABLE ligas
    ADD COLUMN IF NOT EXISTS relevancia SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN ligas.relevancia IS
    'Cuanto más alta, más arriba en la lista. Se ajusta desde el panel.';

-- La vista congela sus columnas al crearse: sin recrearla no vería la
-- que acabamos de agregar.
DROP VIEW IF EXISTS v_ligas CASCADE;
CREATE VIEW v_ligas AS SELECT * FROM ligas WHERE eliminado_en IS NULL;

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

-- ---------------------------------------------------------------------
--  Los identificadores son los del proveedor y no cambian.
-- ---------------------------------------------------------------------

-- Lo que un usuario peruano busca primero.
UPDATE ligas SET relevancia = 100 WHERE api_id IN (
    '281',   -- Liga 1 · Primera División
    '13',    -- Copa Libertadores
    '11',    -- Copa Sudamericana
    '282',   -- Liga 2
    '503'    -- Copa Perú
);

-- Sudamérica: las ligas de donde vienen los rivales conocidos.
UPDATE ligas SET relevancia = 80 WHERE api_id IN (
    '71',    -- Brasileirão Serie A
    '128',   -- Liga Profesional Argentina
    '265',   -- Primera División de Chile
    '239',   -- Primera A de Colombia
    '242',   -- Liga Pro de Ecuador
    '250',   -- Primera División de Paraguay
    '268',   -- Primera División de Uruguay
    '299',   -- Liga FUTVE de Venezuela
    '344',   -- División Profesional de Bolivia
    '15',    -- Mundial de Clubes
    '9'      -- Copa América
);

-- Europa de primer nivel: se ven en televisión y la gente las conoce.
UPDATE ligas SET relevancia = 60 WHERE api_id IN (
    '2',     -- Champions League
    '3',     -- Europa League
    '39',    -- Premier League
    '140',   -- LaLiga
    '135',   -- Serie A
    '78',    -- Bundesliga
    '61',    -- Ligue 1
    '94',    -- Primeira Liga
    '88',    -- Eredivisie
    '1'      -- Copa del Mundo
);

-- Segundas divisiones de países grandes.
UPDATE ligas SET relevancia = 40 WHERE api_id IN (
    '72',    -- Brasileirão Serie B
    '129',   -- Primera Nacional argentina
    '40',    -- Championship
    '141',   -- LaLiga 2
    '136'    -- Serie B italiana
);

CREATE INDEX IF NOT EXISTS idx_ligas_relevancia
    ON ligas (relevancia DESC, nombre) WHERE eliminado_en IS NULL;

-- ---------------------------------------------------------------------
-- Comprobación
-- ---------------------------------------------------------------------
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM information_schema.columns
     WHERE table_name = 'v_ligas' AND column_name = 'relevancia';
    IF n <> 1 THEN RAISE EXCEPTION 'v_ligas no ve la columna relevancia'; END IF;

    SELECT count(*) INTO n FROM v_ligas WHERE relevancia > 0;
    RAISE NOTICE '% liga(s) marcadas como relevantes.', n;
END $$;

COMMIT;
