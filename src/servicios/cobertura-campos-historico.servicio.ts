import { pool } from '../infraestructura/db.js';

export type EstadoCoberturaCampo = 'LISTO' | 'PARCIAL' | 'BAJO' | 'SIN_DATOS';

export interface FiltrosCoberturaCampos {
  ligaApiId?: string;
  temporada?: number;
  limite?: number;
}

type CampoBase = {
  clave: string;
  nombre: string;
  categoria: string;
  nivel: 'PARTIDO' | 'EQUIPO';
  disponibles: number;
  esperados: number;
};

const pct = (n: number, d: number): number => d > 0 ? Number((n * 100 / d).toFixed(1)) : 0;

function estado(porcentaje: number, disponibles: number): EstadoCoberturaCampo {
  if (!disponibles) return 'SIN_DATOS';
  if (porcentaje >= 90) return 'LISTO';
  if (porcentaje >= 60) return 'PARCIAL';
  return 'BAJO';
}

export async function calcularCoberturaCamposHistoricos(
  filtros: FiltrosCoberturaCampos = {},
): Promise<any> {
  const limite = Math.max(1, Math.min(5000, Number(filtros.limite ?? 1000)));
  const valores: unknown[] = [];
  const where = [`p.estado IN ('FT','AET','PEN','FINALIZADO')`, 'p.fecha < NOW()'];

  if (filtros.ligaApiId) {
    valores.push(String(filtros.ligaApiId));
    where.push(`p.liga_api_id = $${valores.length}`);
  }
  if (filtros.temporada != null) {
    valores.push(Number(filtros.temporada));
    where.push(`p.temporada = $${valores.length}`);
  }
  valores.push(limite);

  const { rows } = await pool.query<any>(`
    WITH base AS (
      SELECT p.*
        FROM partidos_historial_deportivo p
       WHERE ${where.join(' AND ')}
       ORDER BY p.fecha DESC
       LIMIT $${valores.length}
    ), stats AS (
      SELECT s.*
        FROM estadisticas_partido_deportivo s
        JOIN base b ON b.fixture_api_id = s.fixture_api_id
    ), eventos AS (
      SELECT e.fixture_api_id, COUNT(*)::int AS cantidad
        FROM eventos_partido_deportivo e
        JOIN base b ON b.fixture_api_id = e.fixture_api_id
       GROUP BY e.fixture_api_id
    )
    SELECT
      (SELECT COUNT(*)::int FROM base) AS partidos,
      (SELECT COUNT(*)::int FROM stats) AS filas_stats,
      (SELECT COUNT(*)::int FROM base WHERE goles_local IS NOT NULL AND goles_visitante IS NOT NULL) AS marcador,
      (SELECT COUNT(*)::int FROM base WHERE goles_descanso_local IS NOT NULL AND goles_descanso_visitante IS NOT NULL) AS descanso,
      (SELECT COUNT(*)::int FROM base WHERE estadisticas_completas = true) AS stats_completas,
      (SELECT COUNT(*)::int FROM base WHERE eventos_completos = true) AS eventos_completos,
      (SELECT COUNT(*)::int FROM base b WHERE b.eventos_completos = true AND EXISTS (SELECT 1 FROM eventos e WHERE e.fixture_api_id=b.fixture_api_id AND e.cantidad>0)) AS eventos_con_filas,
      (SELECT COUNT(*)::int FROM stats WHERE tiros IS NOT NULL) AS tiros,
      (SELECT COUNT(*)::int FROM stats WHERE tiros_arco IS NOT NULL) AS tiros_arco,
      (SELECT COUNT(*)::int FROM stats WHERE tiros_fuera IS NOT NULL) AS tiros_fuera,
      (SELECT COUNT(*)::int FROM stats WHERE tiros_bloqueados IS NOT NULL) AS tiros_bloqueados,
      (SELECT COUNT(*)::int FROM stats WHERE posesion IS NOT NULL) AS posesion,
      (SELECT COUNT(*)::int FROM stats WHERE corners IS NOT NULL) AS corners,
      (SELECT COUNT(*)::int FROM stats WHERE faltas IS NOT NULL) AS faltas,
      (SELECT COUNT(*)::int FROM stats WHERE amarillas IS NOT NULL) AS amarillas,
      (SELECT COUNT(*)::int FROM stats WHERE rojas IS NOT NULL) AS rojas,
      (SELECT COUNT(*)::int FROM stats WHERE fueras_juego IS NOT NULL) AS fueras_juego,
      (SELECT COUNT(*)::int FROM stats WHERE pases IS NOT NULL) AS pases,
      (SELECT COUNT(*)::int FROM stats WHERE pases_correctos IS NOT NULL) AS pases_correctos,
      (SELECT COUNT(*)::int FROM stats WHERE precision_pases IS NOT NULL) AS precision_pases,
      (SELECT COUNT(*)::int FROM stats WHERE atajadas IS NOT NULL) AS atajadas
  `, valores);

  const r = rows[0] ?? {};
  const partidos = Number(r.partidos || 0);
  const filasStats = Number(r.filas_stats || 0);
  // En un partido normal esperamos dos filas de estadísticas, una por equipo.
  const esperadosEquipo = partidos * 2;

  const camposBase: CampoBase[] = [
    { clave: 'MARCADOR_FINAL', nombre: 'Marcador final', categoria: 'Marcador', nivel: 'PARTIDO', disponibles: Number(r.marcador || 0), esperados: partidos },
    { clave: 'MARCADOR_DESCANSO', nombre: 'Marcador al descanso', categoria: 'Tiempos', nivel: 'PARTIDO', disponibles: Number(r.descanso || 0), esperados: partidos },
    { clave: 'ESTADISTICAS_COMPLETAS', nombre: 'Estadísticas marcadas completas', categoria: 'Control', nivel: 'PARTIDO', disponibles: Number(r.stats_completas || 0), esperados: partidos },
    { clave: 'EVENTOS_COMPLETOS', nombre: 'Cronología de eventos completa', categoria: 'Eventos', nivel: 'PARTIDO', disponibles: Number(r.eventos_completos || 0), esperados: partidos },
    { clave: 'EVENTOS_CON_FILAS', nombre: 'Cronología con eventos almacenados', categoria: 'Eventos', nivel: 'PARTIDO', disponibles: Number(r.eventos_con_filas || 0), esperados: partidos },
    { clave: 'CORNERS', nombre: 'Córners', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.corners || 0), esperados: esperadosEquipo },
    { clave: 'AMARILLAS', nombre: 'Tarjetas amarillas', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.amarillas || 0), esperados: esperadosEquipo },
    { clave: 'ROJAS', nombre: 'Tarjetas rojas', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.rojas || 0), esperados: esperadosEquipo },
    { clave: 'TIROS', nombre: 'Tiros totales', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.tiros || 0), esperados: esperadosEquipo },
    { clave: 'TIROS_ARCO', nombre: 'Tiros al arco', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.tiros_arco || 0), esperados: esperadosEquipo },
    { clave: 'TIROS_FUERA', nombre: 'Tiros fuera', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.tiros_fuera || 0), esperados: esperadosEquipo },
    { clave: 'TIROS_BLOQUEADOS', nombre: 'Tiros bloqueados', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.tiros_bloqueados || 0), esperados: esperadosEquipo },
    { clave: 'POSESION', nombre: 'Posesión', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.posesion || 0), esperados: esperadosEquipo },
    { clave: 'FALTAS', nombre: 'Faltas', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.faltas || 0), esperados: esperadosEquipo },
    { clave: 'FUERAS_JUEGO', nombre: 'Fueras de juego', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.fueras_juego || 0), esperados: esperadosEquipo },
    { clave: 'PASES', nombre: 'Pases totales', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.pases || 0), esperados: esperadosEquipo },
    { clave: 'PASES_CORRECTOS', nombre: 'Pases correctos', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.pases_correctos || 0), esperados: esperadosEquipo },
    { clave: 'PRECISION_PASES', nombre: 'Precisión de pases', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.precision_pases || 0), esperados: esperadosEquipo },
    { clave: 'ATAJADAS', nombre: 'Atajadas', categoria: 'Estadísticas', nivel: 'EQUIPO', disponibles: Number(r.atajadas || 0), esperados: esperadosEquipo },
  ];

  const campos = camposBase.map((c) => {
    const coberturaPct = pct(c.disponibles, c.esperados);
    return { ...c, coberturaPct, faltantes: Math.max(0, c.esperados - c.disponibles), estado: estado(coberturaPct, c.disponibles) };
  });

  const categorias = [...new Set(campos.map((c) => c.categoria))].map((categoria) => {
    const cc = campos.filter((c) => c.categoria === categoria);
    return {
      categoria,
      campos: cc.length,
      listos: cc.filter((c) => c.estado === 'LISTO').length,
      parciales: cc.filter((c) => c.estado === 'PARCIAL').length,
      bajos: cc.filter((c) => c.estado === 'BAJO').length,
      sinDatos: cc.filter((c) => c.estado === 'SIN_DATOS').length,
      coberturaPromedioPct: cc.length ? Number((cc.reduce((s, c) => s + c.coberturaPct, 0) / cc.length).toFixed(1)) : 0,
    };
  });

  return {
    generadoEn: new Date().toISOString(),
    filtros: { ligaApiId: filtros.ligaApiId ?? null, temporada: filtros.temporada ?? null, limite },
    resumen: {
      partidos,
      filasEstadisticas: filasStats,
      filasEstadisticasEsperadas: esperadosEquipo,
      campos: campos.length,
      listos: campos.filter((c) => c.estado === 'LISTO').length,
      parciales: campos.filter((c) => c.estado === 'PARCIAL').length,
      bajos: campos.filter((c) => c.estado === 'BAJO').length,
      sinDatos: campos.filter((c) => c.estado === 'SIN_DATOS').length,
      coberturaPromedioPct: campos.length ? Number((campos.reduce((s, c) => s + c.coberturaPct, 0) / campos.length).toFixed(1)) : 0,
    },
    categorias,
    campos,
    aviso: 'Cobertura técnica por campo histórico. Un campo LISTO indica presencia suficiente del dato en la muestra; no representa probabilidad ni recomendación deportiva.',
  };
}
