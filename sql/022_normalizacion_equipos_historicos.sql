BEGIN;

CREATE OR REPLACE FUNCTION normalizar_nombre_equipo(valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      lower(translate(coalesce(valor, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

CREATE TABLE IF NOT EXISTS equipos_historicos (
  equipo_api_id varchar(40) PRIMARY KEY,
  nombre_canonico varchar(160) NOT NULL,
  logo varchar(500),
  primera_fecha timestamptz,
  ultima_fecha timestamptz,
  partidos integer NOT NULL DEFAULT 0,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alias_equipo_historico (
  id bigserial PRIMARY KEY,
  equipo_api_id varchar(40) NOT NULL REFERENCES equipos_historicos(equipo_api_id) ON DELETE CASCADE,
  alias varchar(160) NOT NULL,
  alias_normalizado varchar(180) NOT NULL,
  primera_fecha timestamptz,
  ultima_fecha timestamptz,
  apariciones integer NOT NULL DEFAULT 0,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (equipo_api_id, alias_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_alias_equipo_historico_normalizado
  ON alias_equipo_historico(alias_normalizado);
CREATE INDEX IF NOT EXISTS idx_alias_equipo_historico_equipo
  ON alias_equipo_historico(equipo_api_id);

-- Carga inicial desde el histórico ya guardado.
WITH apariciones AS (
  SELECT equipo_local_api_id AS equipo_api_id, equipo_local AS nombre, logo_local AS logo, fecha
  FROM partidos_historial_deportivo
  WHERE equipo_local_api_id IS NOT NULL AND trim(equipo_local_api_id)<>''
  UNION ALL
  SELECT equipo_visitante_api_id, equipo_visitante, logo_visitante, fecha
  FROM partidos_historial_deportivo
  WHERE equipo_visitante_api_id IS NOT NULL AND trim(equipo_visitante_api_id)<>''
), resumen AS (
  SELECT equipo_api_id,
         min(fecha) AS primera_fecha,
         max(fecha) AS ultima_fecha,
         count(*)::int AS partidos
  FROM apariciones
  GROUP BY equipo_api_id
), ultimo AS (
  SELECT DISTINCT ON (equipo_api_id)
         equipo_api_id, nombre, logo
  FROM apariciones
  ORDER BY equipo_api_id, fecha DESC
)
INSERT INTO equipos_historicos(equipo_api_id,nombre_canonico,logo,primera_fecha,ultima_fecha,partidos,actualizado_en)
SELECT r.equipo_api_id, u.nombre, u.logo, r.primera_fecha, r.ultima_fecha, r.partidos, now()
FROM resumen r
JOIN ultimo u USING (equipo_api_id)
ON CONFLICT (equipo_api_id) DO UPDATE SET
  nombre_canonico=EXCLUDED.nombre_canonico,
  logo=COALESCE(EXCLUDED.logo,equipos_historicos.logo),
  primera_fecha=LEAST(equipos_historicos.primera_fecha,EXCLUDED.primera_fecha),
  ultima_fecha=GREATEST(equipos_historicos.ultima_fecha,EXCLUDED.ultima_fecha),
  partidos=EXCLUDED.partidos,
  actualizado_en=now();

WITH apariciones AS (
  SELECT equipo_local_api_id AS equipo_api_id, equipo_local AS nombre, fecha
  FROM partidos_historial_deportivo
  WHERE equipo_local_api_id IS NOT NULL AND trim(equipo_local_api_id)<>''
  UNION ALL
  SELECT equipo_visitante_api_id, equipo_visitante, fecha
  FROM partidos_historial_deportivo
  WHERE equipo_visitante_api_id IS NOT NULL AND trim(equipo_visitante_api_id)<>''
), aliases AS (
  SELECT equipo_api_id,
         nombre AS alias,
         normalizar_nombre_equipo(nombre) AS alias_normalizado,
         min(fecha) AS primera_fecha,
         max(fecha) AS ultima_fecha,
         count(*)::int AS apariciones
  FROM apariciones
  WHERE normalizar_nombre_equipo(nombre)<>''
  GROUP BY equipo_api_id,nombre,normalizar_nombre_equipo(nombre)
)
INSERT INTO alias_equipo_historico(equipo_api_id,alias,alias_normalizado,primera_fecha,ultima_fecha,apariciones,actualizado_en)
SELECT equipo_api_id,alias,alias_normalizado,primera_fecha,ultima_fecha,apariciones,now()
FROM aliases
ON CONFLICT (equipo_api_id,alias_normalizado) DO UPDATE SET
  alias=EXCLUDED.alias,
  primera_fecha=LEAST(alias_equipo_historico.primera_fecha,EXCLUDED.primera_fecha),
  ultima_fecha=GREATEST(alias_equipo_historico.ultima_fecha,EXCLUDED.ultima_fecha),
  apariciones=EXCLUDED.apariciones,
  actualizado_en=now();

COMMIT;
