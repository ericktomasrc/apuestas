/**
 * Incorpora/actualiza partidos recientes finalizados en el histórico deportivo.
 *
 * - Solo consulta ligas activas: ligas.seleccionada_panel = TRUE.
 * - Es idempotente por fixture_api_id.
 * - No elimina histórico.
 * - No toca saldos ni lógica económica.
 * - Por defecto revisa hoy y ayer para no perder partidos que terminaron
 *   después de la hora de una ejecución diaria.
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../infraestructura/db.js';

const BASE = (process.env.API_FOOTBALL_URL ?? 'https://v3.football.api-sports.io').replace(/\/$/, '');
const DIAS_RECIENTES = Math.max(
  1,
  Math.min(7, Math.trunc(Number(process.env.HISTORICO_SINCRONIZAR_DIAS ?? 2))),
);

export type ResumenSincronizacionHistoricoReciente = {
  ligasActivas: number;
  diasConsultados: number;
  consultas: number;
  fixturesRecibidos: number;
  finalizadosEncontrados: number;
  incorporadosOActualizados: number;
};

function fechaUtcConDesfase(diasAtras: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - diasAtras);
  return d.toISOString().slice(0, 10);
}

async function pedir(
  ruta: string,
  params: Record<string, string | number>,
): Promise<any[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('Falta API_FOOTBALL_KEY');

  const q = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  );

  const r = await fetch(`${BASE}/${ruta}?${q}`, {
    headers: { 'x-apisports-key': key },
    signal: AbortSignal.timeout(30_000),
  });

  if (!r.ok) throw new Error(`API-Football respondió HTTP ${r.status}`);

  const j: any = await r.json();
  return Array.isArray(j?.response) ? j.response : [];
}

export async function sincronizarHistoricoDeportivoReciente(
  opciones: { dias?: number } = {},
): Promise<ResumenSincronizacionHistoricoReciente> {
  const dias = Math.max(
    1,
    Math.min(7, Math.trunc(opciones.dias ?? DIAS_RECIENTES)),
  );

  const { rows: ligas } = await pool.query(`
    SELECT DISTINCT l.api_id
      FROM v_ligas l
      JOIN ligas bl ON bl.id = l.id
     WHERE bl.seleccionada_panel = TRUE
       AND bl.eliminado_en IS NULL
     ORDER BY l.api_id
  `);

  const resumen: ResumenSincronizacionHistoricoReciente = {
    ligasActivas: ligas.length,
    diasConsultados: dias,
    consultas: 0,
    fixturesRecibidos: 0,
    finalizadosEncontrados: 0,
    incorporadosOActualizados: 0,
  };

  for (let desplazamiento = 0; desplazamiento < dias; desplazamiento += 1) {
    const fecha = fechaUtcConDesfase(desplazamiento);

    for (const l of ligas) {
      const fixtures = await pedir('fixtures', {
        league: String(l.api_id),
        date: fecha,
      });

      resumen.consultas += 1;
      resumen.fixturesRecibidos += fixtures.length;

      for (const f of fixtures) {
        if (!['FT', 'AET', 'PEN'].includes(f.fixture?.status?.short)) continue;
        resumen.finalizadosEncontrados += 1;

        const liga = await pool.query(
          `SELECT id FROM v_ligas WHERE api_id::text=$1 LIMIT 1`,
          [String(f.league.id)],
        );

        await pool.query(
          `INSERT INTO partidos_historial_deportivo(
             fixture_api_id, liga_id, liga_api_id, temporada, ronda, fecha, estado,
             equipo_local_api_id, equipo_visitante_api_id, equipo_local, equipo_visitante,
             logo_local, logo_visitante, goles_local, goles_visitante,
             payload_fixture, actualizado_en
           )
           VALUES(
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,now()
           )
           ON CONFLICT(fixture_api_id)
           DO UPDATE SET
             liga_id=COALESCE(EXCLUDED.liga_id, partidos_historial_deportivo.liga_id),
             liga_api_id=EXCLUDED.liga_api_id,
             temporada=EXCLUDED.temporada,
             ronda=EXCLUDED.ronda,
             fecha=EXCLUDED.fecha,
             estado=EXCLUDED.estado,
             equipo_local_api_id=EXCLUDED.equipo_local_api_id,
             equipo_visitante_api_id=EXCLUDED.equipo_visitante_api_id,
             equipo_local=EXCLUDED.equipo_local,
             equipo_visitante=EXCLUDED.equipo_visitante,
             logo_local=COALESCE(EXCLUDED.logo_local, partidos_historial_deportivo.logo_local),
             logo_visitante=COALESCE(EXCLUDED.logo_visitante, partidos_historial_deportivo.logo_visitante),
             goles_local=EXCLUDED.goles_local,
             goles_visitante=EXCLUDED.goles_visitante,
             payload_fixture=EXCLUDED.payload_fixture,
             actualizado_en=now()`,
          [
            String(f.fixture.id),
            liga.rows[0]?.id ?? null,
            String(f.league.id),
            Number(f.league.season),
            f.league.round ?? null,
            new Date(f.fixture.date),
            f.fixture.status.short,
            f.teams.home?.id == null ? null : String(f.teams.home.id),
            f.teams.away?.id == null ? null : String(f.teams.away.id),
            f.teams.home?.name ?? '',
            f.teams.away?.name ?? '',
            f.teams.home?.logo ?? null,
            f.teams.away?.logo ?? null,
            f.goals?.home ?? null,
            f.goals?.away ?? null,
            JSON.stringify(f),
          ],
        );

        resumen.incorporadosOActualizados += 1;
      }
    }
  }

  return resumen;
}

const ejecutadoDirectamente =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (ejecutadoDirectamente) {
  sincronizarHistoricoDeportivoReciente()
    .then((r) => {
      console.log(
        `✓ ${r.incorporadosOActualizados} partidos finalizados incorporados/actualizados ` +
        `(${r.ligasActivas} ligas, ${r.diasConsultados} día(s), ${r.consultas} consultas).`,
      );
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end().catch(() => undefined);
    });
}
