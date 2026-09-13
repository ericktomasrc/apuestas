import { pool } from '../infraestructura/db.js';
import { construirDatasetAnalisis } from './analisis-historico.servicio.js';
import { evaluarDataset } from './motor-dificultad.servicio.js';

/**
 * PASO 4 — backtesting de CALIDAD del pipeline histórico.
 *
 * Este módulo NO calcula rentabilidad, cuotas, montos, premios ni recomienda
 * resultados. Su objetivo es comprobar que el analizador puede reconstruir
 * partidos terminados usando exclusivamente información ANTERIOR a cada
 * encuentro y medir cobertura/estabilidad del dataset.
 */

export interface BacktestPartidoCalidad {
  fixtureId: string;
  fecha: string;
  ligaApiId: string;
  temporada: number;
  local: string;
  visitante: string;
  muestraLocal: number;
  muestraVisitante: number;
  coberturaPartidosPct: number;
  coberturaEstadisticasPct: number;
  estadoCalidad: 'SUFICIENTE' | 'LIMITADA' | 'INSUFICIENTE';
  condicionesAnalizadas: number;
  utilizables: number;
  limitadas: number;
  descartadas: number;
  confianzaDatosGeneral: number;
  sinFugaTemporal: boolean;
}

export interface ResultadoBacktestCalidad {
  parametros: {
    ligaApiId: string | null;
    temporada: number | null;
    muestra: number;
    limite: number;
  };
  resumen: {
    partidosSolicitados: number;
    partidosProcesados: number;
    partidosOmitidos: number;
    calidadSuficiente: number;
    calidadLimitada: number;
    calidadInsuficiente: number;
    coberturaPartidosPromedio: number;
    coberturaEstadisticasPromedio: number;
    confianzaDatosPromedio: number;
    fugasTemporalesDetectadas: number;
  };
  partidos: BacktestPartidoCalidad[];
  aviso: string;
}

export interface OpcionesBacktestCalidad {
  ligaApiId?: string;
  temporada?: number;
  muestra?: number;
  limite?: number;
}

const red = (v: number, dec = 1): number => Number(v.toFixed(dec));
const prom = (xs: number[]): number => xs.length ? red(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;

export async function ejecutarBacktestCalidad(
  opciones: OpcionesBacktestCalidad = {},
): Promise<ResultadoBacktestCalidad> {
  const muestra = Math.max(5, Math.min(50, Math.trunc(opciones.muestra ?? 20)));
  const limite = Math.max(1, Math.min(200, Math.trunc(opciones.limite ?? 50)));
  const valores: unknown[] = [];
  const where: string[] = ["estado IN ('FT','AET','PEN','FINALIZADO')", 'fecha < NOW()'];

  if (opciones.ligaApiId) {
    valores.push(opciones.ligaApiId);
    where.push(`liga_api_id = $${valores.length}`);
  }
  if (opciones.temporada !== undefined) {
    valores.push(opciones.temporada);
    where.push(`temporada = $${valores.length}`);
  }
  valores.push(limite);

  const { rows } = await pool.query(`
    SELECT fixture_api_id, fecha, liga_api_id, temporada, equipo_local, equipo_visitante
    FROM partidos_historial_deportivo
    WHERE ${where.join(' AND ')}
    ORDER BY fecha DESC
    LIMIT $${valores.length}
  `, valores);

  const partidos: BacktestPartidoCalidad[] = [];
  let omitidos = 0;

  // Secuencial a propósito: evita disparar muchas consultas a PostgreSQL a la vez.
  for (const fila of rows) {
    const fixtureId = String(fila.fixture_api_id);
    const dataset = await construirDatasetAnalisis(fixtureId, muestra);
    if (!dataset) { omitidos++; continue; }

    const analisis = evaluarDataset(dataset);
    const fechaPartido = new Date(fila.fecha);
    const fechaCorte = new Date(dataset.fechaCorte);

    // construirDatasetAnalisis usa p.fecha < fechaCorte. Esta bandera deja
    // visible la garantía para detectar regresiones futuras en el pipeline.
    const sinFugaTemporal = fechaCorte.getTime() === fechaPartido.getTime();

    partidos.push({
      fixtureId,
      fecha: fechaPartido.toISOString(),
      ligaApiId: String(fila.liga_api_id ?? ''),
      temporada: Number(fila.temporada),
      local: String(fila.equipo_local ?? ''),
      visitante: String(fila.equipo_visitante ?? ''),
      muestraLocal: dataset.calidad.muestraLocal,
      muestraVisitante: dataset.calidad.muestraVisitante,
      coberturaPartidosPct: dataset.calidad.coberturaPartidosPct,
      coberturaEstadisticasPct: dataset.calidad.coberturaEstadisticasPct,
      estadoCalidad: dataset.calidad.estado,
      condicionesAnalizadas: analisis.resumen.condicionesAnalizadas,
      utilizables: analisis.resumen.utilizables,
      limitadas: analisis.resumen.limitadas,
      descartadas: analisis.resumen.descartadas,
      confianzaDatosGeneral: analisis.resumen.confianzaDatosGeneral,
      sinFugaTemporal,
    });
  }

  return {
    parametros: {
      ligaApiId: opciones.ligaApiId ?? null,
      temporada: opciones.temporada ?? null,
      muestra,
      limite,
    },
    resumen: {
      partidosSolicitados: rows.length,
      partidosProcesados: partidos.length,
      partidosOmitidos: omitidos,
      calidadSuficiente: partidos.filter((x) => x.estadoCalidad === 'SUFICIENTE').length,
      calidadLimitada: partidos.filter((x) => x.estadoCalidad === 'LIMITADA').length,
      calidadInsuficiente: partidos.filter((x) => x.estadoCalidad === 'INSUFICIENTE').length,
      coberturaPartidosPromedio: prom(partidos.map((x) => x.coberturaPartidosPct)),
      coberturaEstadisticasPromedio: prom(partidos.map((x) => x.coberturaEstadisticasPct)),
      confianzaDatosPromedio: prom(partidos.map((x) => x.confianzaDatosGeneral)),
      fugasTemporalesDetectadas: partidos.filter((x) => !x.sinFugaTemporal).length,
    },
    partidos,
    aviso: 'Backtesting de calidad: valida cobertura, estabilidad y corte temporal del dataset. No mide rentabilidad ni genera recomendaciones deportivas.',
  };
}
