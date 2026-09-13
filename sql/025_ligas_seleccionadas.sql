-- 025_ligas_seleccionadas.sql
-- Selección inicial de competiciones para sincronización de datos deportivos.
-- Se ejecuta una sola vez: si ya existe al menos una liga seleccionada,
-- conserva exactamente las elecciones actuales del administrador.

ALTER TABLE ligas
  ADD COLUMN IF NOT EXISTS seleccionada_panel BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM ligas
     WHERE seleccionada_panel = TRUE
       AND eliminado_en IS NULL
  ) THEN
    WITH prioridades(pais_patron, nombre_patron, prioridad) AS (
      VALUES
        -- Inglaterra
        ('England', 'Premier League', 1),
        ('England', 'Championship', 2),
        ('England', 'League One', 3),
        ('England', 'League Two', 4),

        -- España
        ('Spain', 'La Liga', 5),
        ('Spain', 'Segunda División', 6),

        -- Italia
        ('Italy', 'Serie A', 7),
        ('Italy', 'Serie B', 8),

        -- Alemania
        ('Germany', 'Bundesliga', 9),
        ('Germany', '2. Bundesliga', 10),

        -- Francia
        ('France', 'Ligue 1', 11),
        ('France', 'Ligue 2', 12),

        -- Europa
        ('Portugal', 'Primeira Liga', 13),
        ('Netherlands', 'Eredivisie', 14),
        ('Belgium', 'Jupiler Pro League', 15),
        ('Turkey', 'Süper Lig', 16),
        ('Scotland', 'Premiership', 17),
        ('Greece', 'Super League 1', 18),
        ('Austria', 'Bundesliga', 19),
        ('Switzerland', 'Super League', 20),
        ('Denmark', 'Superliga', 21),
        ('Norway', 'Eliteserien', 22),
        ('Sweden', 'Allsvenskan', 23),
        ('Poland', 'Ekstraklasa', 24),

        -- América
        ('Argentina', 'Liga Profesional Argentina', 25),
        ('Argentina', 'Primera Nacional', 26),
        ('Brazil', 'Serie A', 27),
        ('Brazil', 'Serie B', 28),
        ('Peru', 'Primera División', 29),
        ('Peru', 'Segunda División', 30),
        ('Colombia', 'Primera A', 31),
        ('Chile', 'Primera División', 32),
        ('Ecuador', 'Liga Pro', 33),
        ('Uruguay', 'Primera División', 34),
        ('Paraguay', 'Division Profesional', 35),
        ('Mexico', 'Liga MX', 36),
        ('USA', 'Major League Soccer', 37),

        -- Asia / Oceanía
        ('Japan', 'J1 League', 38),
        ('South-Korea', 'K League 1', 39),
        ('Saudi-Arabia', 'Pro League', 40),
        ('Australia', 'A-League', 41),

        -- Torneos internacionales de clubes
        ('World', 'UEFA Champions League', 42),
        ('World', 'UEFA Europa League', 43),
        ('World', 'UEFA Europa Conference League', 44),
        ('World', 'CONMEBOL Libertadores', 45),
        ('World', 'CONMEBOL Sudamericana', 46),

        -- Selecciones: quedan activas aunque hoy no tengan fixtures
        ('World', 'World Cup', 47),
        ('World', 'Euro Championship', 48),
        ('World', 'Copa America', 49),

        -- Copa internacional adicional para completar 50
        ('World', 'FIFA Club World Cup', 50)
    ),
    candidatos AS (
      SELECT DISTINCT ON (p.prioridad)
             l.id,
             p.prioridad
        FROM prioridades p
        JOIN ligas l
          ON l.eliminado_en IS NULL
         AND lower(l.nombre) = lower(p.nombre_patron)
         AND (
              lower(COALESCE(l.pais,'')) = lower(p.pais_patron)
              OR p.pais_patron = 'World'
         )
       ORDER BY p.prioridad, l.id
    )
    UPDATE ligas l
       SET seleccionada_panel = TRUE
      FROM candidatos c
     WHERE l.id = c.id;

    -- Si el proveedor usa una variante de nombre y no se alcanzan 50,
    -- completa únicamente los cupos faltantes por relevancia.
    WITH faltan AS (
      SELECT GREATEST(
        0,
        50 - (SELECT count(*) FROM ligas WHERE seleccionada_panel = TRUE AND eliminado_en IS NULL)
      )::int AS n
    ),
    completar AS (
      SELECT l.id
        FROM ligas l
        CROSS JOIN faltan f
       WHERE l.eliminado_en IS NULL
         AND l.seleccionada_panel = FALSE
       ORDER BY l.relevancia DESC NULLS LAST, l.nombre
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
