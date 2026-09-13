import { pool } from '../infraestructura/db.js';
import { analizarDificultadHistorica, type ResultadoMotorDificultad } from './motor-dificultad.servicio.js';

export interface FiltrosPartidosAnalisis {
  fecha?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  ligaApiId?: string;
  buscar?: string;
  limite?: number;
}

export interface PartidoAnalizable {
  partidoId: string;
  fixtureId: string;
  ligaApiId: string;
  liga: string;
  iniciaEn: string;
  local: string;
  visitante: string;
  logoLocal: string | null;
  logoVisitante: string | null;
  estado: string;
}

export async function listarPartidosAnalizables(filtros: FiltrosPartidosAnalisis = {}): Promise<PartidoAnalizable[]> {
  const limite = Math.max(1, Math.min(2000, filtros.limite ?? 500));
  const valores: unknown[] = [];
  const where: string[] = [
    "p.estado = 'PROGRAMADO'",
    "p.api_id NOT LIKE 'manual:%'",
    "bl.seleccionada_panel = TRUE",
    "bl.eliminado_en IS NULL",
  ];

  if (filtros.fechaDesde || filtros.fechaHasta) {
    if (filtros.fechaDesde) {
      valores.push(filtros.fechaDesde);
      where.push(`p.inicia_en::date >= $${valores.length}::date`);
    }
    if (filtros.fechaHasta) {
      valores.push(filtros.fechaHasta);
      where.push(`p.inicia_en::date <= $${valores.length}::date`);
    }
  } else if (filtros.fecha) {
    valores.push(filtros.fecha);
    where.push(`p.inicia_en::date = $${valores.length}::date`);
  }
  if (filtros.ligaApiId) {
    valores.push(filtros.ligaApiId);
    where.push(`l.api_id = $${valores.length}`);
  }
  if (filtros.buscar) {
    valores.push(`%${filtros.buscar.trim()}%`);
    where.push(`(p.equipo_local ILIKE $${valores.length} OR p.equipo_visitante ILIKE $${valores.length} OR l.nombre ILIKE $${valores.length})`);
  }
  valores.push(limite);

  const { rows } = await pool.query(`
    SELECT p.id AS partido_id,
           p.api_id AS fixture_id,
           l.api_id AS liga_api_id,
           l.nombre AS liga,
           p.inicia_en,
           p.equipo_local,
           p.equipo_visitante,
           p.logo_local,
           p.logo_visitante,
           p.estado
      FROM v_partidos p
      JOIN v_ligas l ON l.id = p.liga_id
      JOIN ligas bl ON bl.id = l.id
     WHERE ${where.join(' AND ')}
     ORDER BY p.inicia_en, l.nombre, p.equipo_local
     LIMIT $${valores.length}`, valores);

  return rows.map((r) => ({
    partidoId: String(r.partido_id),
    fixtureId: String(r.fixture_id),
    ligaApiId: String(r.liga_api_id),
    liga: String(r.liga),
    iniciaEn: new Date(r.inicia_en).toISOString(),
    local: String(r.equipo_local),
    visitante: String(r.equipo_visitante),
    logoLocal: r.logo_local ?? null,
    logoVisitante: r.logo_visitante ?? null,
    estado: String(r.estado),
  }));
}

export interface ResultadoLoteAnalisis {
  fixtureId: string;
  ok: boolean;
  analisis?: ResultadoMotorDificultad;
  error?: string;
}

export async function analizarLotePartidos(fixtureIds: string[], muestra = 20): Promise<ResultadoLoteAnalisis[]> {
  // Secuencial a propósito: evita lanzar decenas de consultas pesadas a la vez
  // contra PostgreSQL cuando el administrador usa "Seleccionar todos".
  const salida: ResultadoLoteAnalisis[] = [];
  for (const fixtureId of fixtureIds) {
    try {
      const analisis = await analizarDificultadHistorica(fixtureId, muestra);
      if (!analisis) salida.push({ fixtureId, ok: false, error: 'Partido no encontrado' });
      else salida.push({ fixtureId, ok: true, analisis });
    } catch (e) {
      salida.push({
        fixtureId,
        ok: false,
        error: e instanceof Error ? e.message : 'No se pudo analizar el partido',
      });
    }
  }
  return salida;
}
