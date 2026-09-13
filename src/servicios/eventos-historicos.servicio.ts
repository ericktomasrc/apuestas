import { pool } from '../infraestructura/db.js';

export interface EventoHistorico {
  orden: number;
  minuto: number | null;
  minutoExtra: number | null;
  equipoApiId: string | null;
  equipo: string | null;
  jugadorApiId: string | null;
  jugador: string | null;
  asistenteApiId: string | null;
  asistente: string | null;
  tipo: string | null;
  detalle: string | null;
  comentarios: string | null;
}

export interface CronologiaPartidoHistorico {
  fixtureId: string;
  eventosCompletos: boolean;
  totalEventos: number;
  totalGoles: number;
  totalTarjetas: number;
  primerGol: EventoHistorico | null;
  ultimoGol: EventoHistorico | null;
  eventos: EventoHistorico[];
}

function mapear(r: Record<string, any>): EventoHistorico {
  return {
    orden: Number(r.orden_evento),
    minuto: r.minuto == null ? null : Number(r.minuto),
    minutoExtra: r.minuto_extra == null ? null : Number(r.minuto_extra),
    equipoApiId: r.equipo_api_id == null ? null : String(r.equipo_api_id),
    equipo: r.equipo ?? null,
    jugadorApiId: r.jugador_api_id == null ? null : String(r.jugador_api_id),
    jugador: r.jugador ?? null,
    asistenteApiId: r.asistente_api_id == null ? null : String(r.asistente_api_id),
    asistente: r.asistente ?? null,
    tipo: r.tipo ?? null,
    detalle: r.detalle ?? null,
    comentarios: r.comentarios ?? null,
  };
}

export async function obtenerCronologiaHistorica(
  fixtureId: string,
): Promise<CronologiaPartidoHistorico | null> {
  const partido = await pool.query(
    `SELECT fixture_api_id, coalesce(eventos_completos,false) AS eventos_completos
       FROM partidos_historial_deportivo
      WHERE fixture_api_id = $1`,
    [fixtureId],
  );
  if (!partido.rowCount) return null;

  const { rows } = await pool.query(
    `SELECT orden_evento, minuto, minuto_extra, equipo_api_id, equipo,
            jugador_api_id, jugador, asistente_api_id, asistente,
            tipo, detalle, comentarios
       FROM eventos_partido_deportivo
      WHERE fixture_api_id = $1
      ORDER BY coalesce(minuto, 999), coalesce(minuto_extra, 0), orden_evento`,
    [fixtureId],
  );

  const eventos = rows.map(mapear);
  const goles = eventos.filter((e) => String(e.tipo ?? '').toLowerCase() === 'goal');
  const tarjetas = eventos.filter((e) => String(e.tipo ?? '').toLowerCase() === 'card');

  return {
    fixtureId,
    eventosCompletos: partido.rows[0].eventos_completos === true,
    totalEventos: eventos.length,
    totalGoles: goles.length,
    totalTarjetas: tarjetas.length,
    primerGol: goles[0] ?? null,
    ultimoGol: goles[goles.length - 1] ?? null,
    eventos,
  };
}
