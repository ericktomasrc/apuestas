import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../infraestructura/db.js';
import type { Sesion } from './auth.js';

type ConPermiso = (peticion: FastifyRequest, permiso: string) => Promise<Sesion>;

export function registrarRutasHistorialDeportivo(app: FastifyInstance, conPermiso: ConPermiso): void {
  app.get('/admin/historico-deportivo/ligas', async (peticion) => {
    await conPermiso(peticion, 'deportes.ver');
    const { rows } = await pool.query(`
      SELECT p.liga_api_id,
             COALESCE(l.nombre, 'Liga ' || p.liga_api_id) AS liga,
             l.logo_url,
             count(*)::int AS partidos,
             count(*) FILTER (WHERE p.estadisticas_completas)::int AS con_estadisticas,
             min(p.temporada)::int AS temporada_desde,
             max(p.temporada)::int AS temporada_hasta,
             max(p.actualizado_en) AS ultima_actualizacion
        FROM partidos_historial_deportivo p
   LEFT JOIN ligas l ON l.api_id::text = p.liga_api_id
       GROUP BY p.liga_api_id, l.nombre, l.logo_url
       ORDER BY liga
    `);
    return { ligas: rows };
  });

  app.get('/admin/historico-deportivo/temporadas', async (peticion) => {
    await conPermiso(peticion, 'deportes.ver');
    const q = z.object({ ligaApiId: z.string().min(1).max(40) }).parse(peticion.query);
    const { rows } = await pool.query(`
      SELECT temporada,
             count(*)::int AS partidos,
             count(*) FILTER (WHERE estadisticas_completas)::int AS con_estadisticas,
             max(actualizado_en) AS ultima_actualizacion
        FROM partidos_historial_deportivo
       WHERE liga_api_id = $1
       GROUP BY temporada
       ORDER BY temporada DESC
    `, [q.ligaApiId]);
    return { temporadas: rows };
  });

  app.get('/admin/historico-deportivo/partidos', async (peticion) => {
    await conPermiso(peticion, 'deportes.ver');
    const q = z.object({
      ligaApiId: z.string().min(1).max(40),
      temporada: z.coerce.number().int().min(1900).max(2200),
      buscar: z.string().trim().max(100).optional(),
      limite: z.coerce.number().int().min(1).max(300).default(100),
    }).parse(peticion.query);

    const buscar = q.buscar ? `%${q.buscar}%` : null;
    const { rows } = await pool.query(`
      SELECT fixture_api_id, ronda, fecha, estado,
             equipo_local, equipo_visitante, logo_local, logo_visitante,
             goles_local, goles_visitante, estadisticas_completas
        FROM partidos_historial_deportivo
       WHERE liga_api_id = $1
         AND temporada = $2
         AND ($3::text IS NULL OR equipo_local ILIKE $3 OR equipo_visitante ILIKE $3 OR ronda ILIKE $3)
       ORDER BY fecha DESC
       LIMIT $4
    `, [q.ligaApiId, q.temporada, buscar, q.limite]);
    return { partidos: rows };
  });

  app.get('/admin/historico-deportivo/partidos/:fixtureId', async (peticion, respuesta) => {
    await conPermiso(peticion, 'deportes.ver');
    const { fixtureId } = z.object({ fixtureId: z.string().min(1).max(40) }).parse(peticion.params);
    const partido = await pool.query(`
      SELECT fixture_api_id, liga_api_id, temporada, ronda, fecha, estado,
             equipo_local_api_id, equipo_visitante_api_id, equipo_local, equipo_visitante,
             logo_local, logo_visitante, goles_local, goles_visitante,
             goles_descanso_local, goles_descanso_visitante,
             goles_prorroga_local, goles_prorroga_visitante,
             penales_local, penales_visitante, estadisticas_completas, actualizado_en
        FROM partidos_historial_deportivo
       WHERE fixture_api_id = $1
    `, [fixtureId]);
    if (!partido.rowCount) return respuesta.code(404).send({ error: 'Partido no encontrado' });

    const stats = await pool.query(`
      SELECT equipo_api_id, equipo, es_local, tiros, tiros_arco, tiros_fuera, tiros_bloqueados,
             posesion, corners, faltas, amarillas, rojas, fueras_juego, pases,
             pases_correctos, precision_pases, atajadas
        FROM estadisticas_partido_deportivo
       WHERE fixture_api_id = $1
       ORDER BY es_local DESC
    `, [fixtureId]);

    return { partido: partido.rows[0], estadisticas: stats.rows };
  });
}
