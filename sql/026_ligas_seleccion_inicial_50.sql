-- 026_ligas_seleccion_inicial_50.sql
-- CORRECCIÓN:
-- La migración 025 ya podía haber quedado registrada como ejecutada.
-- Esta 026 inicializa las 50 competiciones SOLO si actualmente no hay
-- ninguna liga seleccionada, sin borrar partidos, histórico ni mercados.

ALTER TABLE ligas
  ADD COLUMN IF NOT EXISTS seleccionada_panel BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
  seleccionadas_actuales integer;
BEGIN
  SELECT count(*)::int
    INTO seleccionadas_actuales
    FROM ligas
   WHERE seleccionada_panel = TRUE
     AND eliminado_en IS NULL;

  -- No pisar elecciones manuales existentes.
  IF seleccionadas_actuales = 0 THEN

    WITH prioridades(pais_patron, nombre_patron, prioridad) AS (
      VALUES
        ('England',       'Premier League',                 1),
        ('England',       'Championship',                   2),
        ('England',       'League One',                     3),
        ('England',       'League Two',                     4),
        ('Spain',         'La Liga',                        5),
        ('Spain',         'Segunda División',               6),
        ('Italy',         'Serie A',                        7),
        ('Italy',         'Serie B',                        8),
        ('Germany',       'Bundesliga',                     9),
        ('Germany',       '2. Bundesliga',                 10),
        ('France',        'Ligue 1',                       11),
        ('France',        'Ligue 2',                       12),
        ('Portugal',      'Primeira Liga',                 13),
        ('Netherlands',   'Eredivisie',                    14),
        ('Belgium',       'Jupiler Pro League',            15),
        ('Turkey',        'Süper Lig',                     16),
        ('Scotland',      'Premiership',                   17),
        ('Greece',        'Super League 1',                18),
        ('Austria',       'Bundesliga',                    19),
        ('Switzerland',   'Super League',                  20),
        ('Denmark',       'Superliga',                     21),
        ('Norway',        'Eliteserien',                   22),
        ('Sweden',        'Allsvenskan',                   23),
        ('Poland',        'Ekstraklasa',                   24),
        ('Argentina',     'Liga Profesional Argentina',    25),
        ('Argentina',     'Primera Nacional',              26),
        ('Brazil',        'Serie A',                       27),
        ('Brazil',        'Serie B',                       28),
        ('Peru',          'Primera División',              29),
        ('Peru',          'Segunda División',              30),
        ('Colombia',      'Primera A',                     31),
        ('Chile',         'Primera División',              32),
        ('Ecuador',       'Liga Pro',                      33),
        ('Uruguay',       'Primera División',              34),
        ('Paraguay',      'Division Profesional',          35),
        ('Mexico',        'Liga MX',                       36),
        ('USA',           'Major League Soccer',           37),
        ('Japan',         'J1 League',                     38),
        ('South-Korea',   'K League 1',                    39),
        ('Saudi-Arabia',  'Pro League',                    40),
        ('Australia',     'A-League',                      41),
        ('World',         'UEFA Champions League',         42),
        ('World',         'UEFA Europa League',            43),
        ('World',         'UEFA Europa Conference League', 44),
        ('World',         'CONMEBOL Libertadores',         45),
        ('World',         'CONMEBOL Sudamericana',         46),
        ('World',         'World Cup',                     47),
        ('World',         'Euro Championship',             48),
        ('World',         'Copa America',                  49),
        ('World',         'FIFA Club World Cup',           50)
    ),
    candidatos AS (
      SELECT DISTINCT ON (p.prioridad)
             l.id,
             p.prioridad
        FROM prioridades p
        JOIN ligas l
          ON l.eliminado_en IS NULL
         AND translate(lower(l.nombre),
                       'áéíóúüñÁÉÍÓÚÜÑ',
                       'aeiouunAEIOUUN')
             =
             translate(lower(p.nombre_patron),
                       'áéíóúüñÁÉÍÓÚÜÑ',
                       'aeiouunAEIOUUN')
         AND (
              p.pais_patron = 'World'
              OR translate(lower(COALESCE(l.pais,'')),
                           'áéíóúüñÁÉÍÓÚÜÑ',
                           'aeiouunAEIOUUN')
                 =
                 translate(lower(p.pais_patron),
                           'áéíóúüñÁÉÍÓÚÜÑ',
                           'aeiouunAEIOUUN')
         )
       ORDER BY p.prioridad, l.id
    )
    UPDATE ligas l
       SET seleccionada_panel = TRUE
      FROM candidatos c
     WHERE l.id = c.id;

    -- Si API-Football usa una variante de nombre, completa hasta 50
    -- usando la relevancia ya calculada por v_ligas.
    WITH faltan AS (
      SELECT GREATEST(
        0,
        50 - (
          SELECT count(*)
            FROM ligas
           WHERE seleccionada_panel = TRUE
             AND eliminado_en IS NULL
        )
      )::int AS n
    ),
    completar AS (
      SELECT vl.id
        FROM v_ligas vl
        JOIN ligas bl ON bl.id = vl.id
       CROSS JOIN faltan f
       WHERE bl.eliminado_en IS NULL
         AND bl.seleccionada_panel = FALSE
       ORDER BY vl.relevancia DESC NULLS LAST, vl.nombre
       LIMIT (SELECT n FROM faltan)
    )
    UPDATE ligas l
       SET seleccionada_panel = TRUE
      FROM completar c
     WHERE l.id = c.id;

  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_ligas_seleccionada_panel
  ON ligas (seleccionada_panel)
  WHERE eliminado_en IS NULL;
