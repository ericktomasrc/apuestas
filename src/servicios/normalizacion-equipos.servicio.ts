import { pool } from '../infraestructura/db.js';

export interface ResumenNormalizacionEquipos {
  equipos: number;
  aliases: number;
  aliasesAmbiguos: number;
  programadosSinResolver: number;
  actualizadoEn: string | null;
}

export interface EquipoNormalizado {
  equipoApiId: string;
  nombreCanonico: string;
  logo: string | null;
  partidos: number;
  aliases: string[];
  primeraFecha: string | null;
  ultimaFecha: string | null;
}

const normalizar = (valor: string): string => valor
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export async function sincronizarNormalizacionEquipos(): Promise<ResumenNormalizacionEquipos> {
  await pool.query(`
    WITH apariciones AS (
      SELECT equipo_local_api_id AS equipo_api_id, equipo_local AS nombre, logo_local AS logo, fecha
      FROM partidos_historial_deportivo
      WHERE equipo_local_api_id IS NOT NULL AND trim(equipo_local_api_id)<>''
      UNION ALL
      SELECT equipo_visitante_api_id, equipo_visitante, logo_visitante, fecha
      FROM partidos_historial_deportivo
      WHERE equipo_visitante_api_id IS NOT NULL AND trim(equipo_visitante_api_id)<>''
    ), resumen AS (
      SELECT equipo_api_id,min(fecha) primera_fecha,max(fecha) ultima_fecha,count(*)::int partidos
      FROM apariciones GROUP BY equipo_api_id
    ), ultimo AS (
      SELECT DISTINCT ON (equipo_api_id) equipo_api_id,nombre,logo
      FROM apariciones ORDER BY equipo_api_id,fecha DESC
    )
    INSERT INTO equipos_historicos(equipo_api_id,nombre_canonico,logo,primera_fecha,ultima_fecha,partidos,actualizado_en)
    SELECT r.equipo_api_id,u.nombre,u.logo,r.primera_fecha,r.ultima_fecha,r.partidos,now()
    FROM resumen r JOIN ultimo u USING(equipo_api_id)
    ON CONFLICT(equipo_api_id) DO UPDATE SET
      nombre_canonico=EXCLUDED.nombre_canonico,
      logo=COALESCE(EXCLUDED.logo,equipos_historicos.logo),
      primera_fecha=LEAST(equipos_historicos.primera_fecha,EXCLUDED.primera_fecha),
      ultima_fecha=GREATEST(equipos_historicos.ultima_fecha,EXCLUDED.ultima_fecha),
      partidos=EXCLUDED.partidos,
      actualizado_en=now()`);

  await pool.query(`
    WITH apariciones AS (
      SELECT equipo_local_api_id AS equipo_api_id,equipo_local AS nombre,fecha
      FROM partidos_historial_deportivo
      WHERE equipo_local_api_id IS NOT NULL AND trim(equipo_local_api_id)<>''
      UNION ALL
      SELECT equipo_visitante_api_id,equipo_visitante,fecha
      FROM partidos_historial_deportivo
      WHERE equipo_visitante_api_id IS NOT NULL AND trim(equipo_visitante_api_id)<>''
    ), aliases AS (
      SELECT equipo_api_id,nombre AS alias,normalizar_nombre_equipo(nombre) alias_normalizado,
             min(fecha) primera_fecha,max(fecha) ultima_fecha,count(*)::int apariciones
      FROM apariciones
      WHERE normalizar_nombre_equipo(nombre)<>''
      GROUP BY equipo_api_id,nombre,normalizar_nombre_equipo(nombre)
    )
    INSERT INTO alias_equipo_historico(equipo_api_id,alias,alias_normalizado,primera_fecha,ultima_fecha,apariciones,actualizado_en)
    SELECT equipo_api_id,alias,alias_normalizado,primera_fecha,ultima_fecha,apariciones,now() FROM aliases
    ON CONFLICT(equipo_api_id,alias_normalizado) DO UPDATE SET
      alias=EXCLUDED.alias,
      primera_fecha=LEAST(alias_equipo_historico.primera_fecha,EXCLUDED.primera_fecha),
      ultima_fecha=GREATEST(alias_equipo_historico.ultima_fecha,EXCLUDED.ultima_fecha),
      apariciones=EXCLUDED.apariciones,
      actualizado_en=now()`);

  return obtenerResumenNormalizacionEquipos();
}

export async function obtenerResumenNormalizacionEquipos(): Promise<ResumenNormalizacionEquipos> {
  const [base, ambiguos, sinResolver] = await Promise.all([
    pool.query(`SELECT (SELECT count(*)::int FROM equipos_historicos) equipos,
                       (SELECT count(*)::int FROM alias_equipo_historico) aliases,
                       (SELECT max(actualizado_en) FROM equipos_historicos) actualizado_en`),
    pool.query(`SELECT count(*)::int total FROM (
      SELECT alias_normalizado FROM alias_equipo_historico GROUP BY alias_normalizado HAVING count(DISTINCT equipo_api_id)>1
    ) x`),
    pool.query(`SELECT count(*)::int total FROM (
      SELECT p.api_id, p.equipo_local AS nombre FROM v_partidos p WHERE p.estado='PROGRAMADO'
      UNION ALL
      SELECT p.api_id, p.equipo_visitante FROM v_partidos p WHERE p.estado='PROGRAMADO'
    ) q WHERE NOT EXISTS (
      SELECT 1 FROM alias_equipo_historico a WHERE a.alias_normalizado=normalizar_nombre_equipo(q.nombre)
    )`),
  ]);
  const x = base.rows[0] ?? {};
  return {
    equipos: Number(x.equipos ?? 0), aliases: Number(x.aliases ?? 0),
    aliasesAmbiguos: Number(ambiguos.rows[0]?.total ?? 0),
    programadosSinResolver: Number(sinResolver.rows[0]?.total ?? 0),
    actualizadoEn: x.actualizado_en ? new Date(x.actualizado_en).toISOString() : null,
  };
}

export async function listarEquiposNormalizados(buscar = '', limite = 100): Promise<EquipoNormalizado[]> {
  const texto = buscar.trim();
  const { rows } = await pool.query(`
    SELECT e.equipo_api_id,e.nombre_canonico,e.logo,e.partidos,e.primera_fecha,e.ultima_fecha,
           COALESCE(array_agg(DISTINCT a.alias ORDER BY a.alias) FILTER (WHERE a.alias IS NOT NULL),'{}') aliases
    FROM equipos_historicos e
    LEFT JOIN alias_equipo_historico a ON a.equipo_api_id=e.equipo_api_id
    WHERE ($1='' OR e.nombre_canonico ILIKE '%'||$1||'%' OR EXISTS(
      SELECT 1 FROM alias_equipo_historico ax WHERE ax.equipo_api_id=e.equipo_api_id AND ax.alias ILIKE '%'||$1||'%'
    ))
    GROUP BY e.equipo_api_id,e.nombre_canonico,e.logo,e.partidos,e.primera_fecha,e.ultima_fecha
    ORDER BY e.partidos DESC,e.nombre_canonico
    LIMIT $2`, [texto, Math.max(1, Math.min(300, limite))]);
  return rows.map((r) => ({
    equipoApiId: String(r.equipo_api_id), nombreCanonico: String(r.nombre_canonico), logo: r.logo ? String(r.logo) : null,
    partidos: Number(r.partidos ?? 0), aliases: Array.isArray(r.aliases) ? r.aliases.map(String) : [],
    primeraFecha: r.primera_fecha ? new Date(r.primera_fecha).toISOString() : null,
    ultimaFecha: r.ultima_fecha ? new Date(r.ultima_fecha).toISOString() : null,
  }));
}

export async function resolverEquipoApiIdNormalizado(nombre: string, antesDe: Date, ligaApiId?: string): Promise<string | null> {
  const clave = normalizar(nombre);
  if (!clave) return null;
  const { rows } = await pool.query(`
    SELECT a.equipo_api_id,
      EXISTS(
        SELECT 1 FROM partidos_historial_deportivo p
        WHERE p.fecha<$2 AND ($3::text IS NULL OR p.liga_api_id=$3)
          AND (p.equipo_local_api_id=a.equipo_api_id OR p.equipo_visitante_api_id=a.equipo_api_id)
      ) AS coincide_liga,
      a.ultima_fecha
    FROM alias_equipo_historico a
    WHERE a.alias_normalizado=$1
    ORDER BY coincide_liga DESC,a.ultima_fecha DESC NULLS LAST,a.apariciones DESC
    LIMIT 2`, [clave, antesDe, ligaApiId ?? null]);
  if (!rows.length) return null;
  if (rows.length > 1 && Boolean(rows[0].coincide_liga) === Boolean(rows[1].coincide_liga)) return null;
  return String(rows[0].equipo_api_id);
}
