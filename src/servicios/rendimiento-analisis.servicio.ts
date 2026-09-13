import { pool } from '../infraestructura/db.js';
import { calcularMetricasTecnicasReglas, type MetricaTecnicaRegla } from './metricas-reglas.servicio.js';

export interface OpcionesRendimientoAnalisis {
  ligaApiId?: string;
  temporada?: number;
  muestra?: number;
  limite?: number;
}

export interface RendimientoRegla {
  codigo: string;
  nombre: string;
  categoria: string;
  evaluaciones: number;
  utilizables: number;
  limitadas: number;
  descartadas: number;
  coberturaPromedioPct: number;
  utilizablesPct: number;
  salud: 'ALTA' | 'MEDIA' | 'BAJA';
}

export interface RendimientoCategoria {
  categoria: string;
  reglas: number;
  evaluaciones: number;
  utilizables: number;
  limitadas: number;
  descartadas: number;
  coberturaPromedioPct: number;
  utilizablesPct: number;
  salud: 'ALTA' | 'MEDIA' | 'BAJA';
}

export interface RendimientoLiga {
  ligaApiId: string;
  liga: string;
  temporada: number;
  partidosProcesados: number;
  coberturaPromedioPct: number;
  utilizablesPct: number;
}

export interface ResultadoRendimientoAnalisis {
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
    reglasEvaluadas: number;
    evaluacionesTotales: number;
    utilizablesPct: number;
    limitadasPct: number;
    descartadasPct: number;
    coberturaPromedioPct: number;
  };
  categorias: RendimientoCategoria[];
  reglas: RendimientoRegla[];
  ligas: RendimientoLiga[];
  aviso: string;
}

type Acumulado = {
  nombre: string;
  categoria: string;
  evaluaciones: number;
  utilizables: number;
  limitadas: number;
  descartadas: number;
  coberturaSuma: number;
};

const red = (n: number, d = 1): number => Number(n.toFixed(d));
const pct = (n: number, total: number): number => total > 0 ? red((n / total) * 100) : 0;
const salud = (utilizablesPct: number, cobertura: number): 'ALTA' | 'MEDIA' | 'BAJA' => {
  if (utilizablesPct >= 75 && cobertura >= 75) return 'ALTA';
  if (utilizablesPct >= 45 && cobertura >= 45) return 'MEDIA';
  return 'BAJA';
};

function sumarEstado(a: Acumulado, m: MetricaTecnicaRegla): void {
  a.evaluaciones++;
  a.coberturaSuma += Number(m.coberturaPct || 0);
  if (m.estadoDatos === 'UTILIZABLE') a.utilizables++;
  else if (m.estadoDatos === 'LIMITADO') a.limitadas++;
  else a.descartadas++;
}

/**
 * Resume la SALUD DE DATOS del motor histórico por regla/categoría/liga.
 * No evalúa aciertos deportivos, rentabilidad, cuotas ni recomendaciones.
 */
export async function calcularRendimientoAnalisis(
  opciones: OpcionesRendimientoAnalisis = {},
): Promise<ResultadoRendimientoAnalisis> {
  const muestra = Math.max(5, Math.min(50, Math.trunc(opciones.muestra ?? 20)));
  const limite = Math.max(1, Math.min(100, Math.trunc(opciones.limite ?? 40)));

  const valores: unknown[] = [];
  const where: string[] = ["p.estado IN ('FT','AET','PEN','FINALIZADO')", 'p.fecha < NOW()'];
  if (opciones.ligaApiId) {
    valores.push(opciones.ligaApiId);
    where.push(`p.liga_api_id = $${valores.length}`);
  }
  if (opciones.temporada !== undefined) {
    valores.push(opciones.temporada);
    where.push(`p.temporada = $${valores.length}`);
  }
  valores.push(limite);

  const { rows } = await pool.query(`
    SELECT p.fixture_api_id, p.fecha, p.liga_api_id, p.temporada,
           COALESCE(l.nombre, p.liga_api_id) AS liga
      FROM partidos_historial_deportivo p
 LEFT JOIN ligas l ON l.api_id::text = p.liga_api_id
     WHERE ${where.join(' AND ')}
  ORDER BY p.fecha DESC
     LIMIT $${valores.length}
  `, valores);

  const porRegla = new Map<string, Acumulado>();
  const porCategoria = new Map<string, Acumulado>();
  const porLiga = new Map<string, { ligaApiId: string; liga: string; temporada: number; partidos: number; coberturaSuma: number; utilizables: number; evaluaciones: number }>();
  let procesados = 0;
  let omitidos = 0;

  // Secuencial para no generar una ráfaga de consultas a PostgreSQL.
  for (const fila of rows) {
    const fixtureId = String(fila.fixture_api_id);
    const resultado = await calcularMetricasTecnicasReglas(fixtureId, muestra);
    if (!resultado) { omitidos++; continue; }
    procesados++;

    const claveLiga = `${fila.liga_api_id}:${fila.temporada}`;
    const liga = porLiga.get(claveLiga) ?? {
      ligaApiId: String(fila.liga_api_id ?? ''),
      liga: String(fila.liga ?? fila.liga_api_id ?? ''),
      temporada: Number(fila.temporada),
      partidos: 0,
      coberturaSuma: 0,
      utilizables: 0,
      evaluaciones: 0,
    };
    liga.partidos++;

    for (const m of resultado.metricas) {
      let r = porRegla.get(m.codigo);
      if (!r) {
        r = { nombre: m.nombre, categoria: m.categoria, evaluaciones: 0, utilizables: 0, limitadas: 0, descartadas: 0, coberturaSuma: 0 };
        porRegla.set(m.codigo, r);
      }
      sumarEstado(r, m);

      let c = porCategoria.get(m.categoria);
      if (!c) {
        c = { nombre: m.categoria, categoria: m.categoria, evaluaciones: 0, utilizables: 0, limitadas: 0, descartadas: 0, coberturaSuma: 0 };
        porCategoria.set(m.categoria, c);
      }
      sumarEstado(c, m);

      liga.coberturaSuma += Number(m.coberturaPct || 0);
      liga.evaluaciones++;
      if (m.estadoDatos === 'UTILIZABLE') liga.utilizables++;
    }
    porLiga.set(claveLiga, liga);
  }

  const reglas: RendimientoRegla[] = [...porRegla.entries()].map(([codigo, a]) => {
    const coberturaPromedioPct = a.evaluaciones ? red(a.coberturaSuma / a.evaluaciones) : 0;
    const utilizablesPct = pct(a.utilizables, a.evaluaciones);
    return {
      codigo,
      nombre: a.nombre,
      categoria: a.categoria,
      evaluaciones: a.evaluaciones,
      utilizables: a.utilizables,
      limitadas: a.limitadas,
      descartadas: a.descartadas,
      coberturaPromedioPct,
      utilizablesPct,
      salud: salud(utilizablesPct, coberturaPromedioPct),
    };
  }).sort((a, b) => a.utilizablesPct - b.utilizablesPct || a.coberturaPromedioPct - b.coberturaPromedioPct || a.codigo.localeCompare(b.codigo));

  const reglasPorCategoria = new Map<string, number>();
  for (const r of reglas) reglasPorCategoria.set(r.categoria, (reglasPorCategoria.get(r.categoria) ?? 0) + 1);

  const categorias: RendimientoCategoria[] = [...porCategoria.entries()].map(([categoria, a]) => {
    const coberturaPromedioPct = a.evaluaciones ? red(a.coberturaSuma / a.evaluaciones) : 0;
    const utilizablesPct = pct(a.utilizables, a.evaluaciones);
    return {
      categoria,
      reglas: reglasPorCategoria.get(categoria) ?? 0,
      evaluaciones: a.evaluaciones,
      utilizables: a.utilizables,
      limitadas: a.limitadas,
      descartadas: a.descartadas,
      coberturaPromedioPct,
      utilizablesPct,
      salud: salud(utilizablesPct, coberturaPromedioPct),
    };
  }).sort((a, b) => a.utilizablesPct - b.utilizablesPct || a.categoria.localeCompare(b.categoria));

  const ligas: RendimientoLiga[] = [...porLiga.values()].map((l) => ({
    ligaApiId: l.ligaApiId,
    liga: l.liga,
    temporada: l.temporada,
    partidosProcesados: l.partidos,
    coberturaPromedioPct: l.evaluaciones ? red(l.coberturaSuma / l.evaluaciones) : 0,
    utilizablesPct: pct(l.utilizables, l.evaluaciones),
  })).sort((a, b) => a.utilizablesPct - b.utilizablesPct || a.liga.localeCompare(b.liga));

  const totalEval = reglas.reduce((s, r) => s + r.evaluaciones, 0);
  const totalUtil = reglas.reduce((s, r) => s + r.utilizables, 0);
  const totalLim = reglas.reduce((s, r) => s + r.limitadas, 0);
  const totalDesc = reglas.reduce((s, r) => s + r.descartadas, 0);
  const coberturaSuma = [...porRegla.values()].reduce((s, r) => s + r.coberturaSuma, 0);

  return {
    parametros: {
      ligaApiId: opciones.ligaApiId ?? null,
      temporada: opciones.temporada ?? null,
      muestra,
      limite,
    },
    resumen: {
      partidosSolicitados: rows.length,
      partidosProcesados: procesados,
      partidosOmitidos: omitidos,
      reglasEvaluadas: reglas.length,
      evaluacionesTotales: totalEval,
      utilizablesPct: pct(totalUtil, totalEval),
      limitadasPct: pct(totalLim, totalEval),
      descartadasPct: pct(totalDesc, totalEval),
      coberturaPromedioPct: totalEval ? red(coberturaSuma / totalEval) : 0,
    },
    categorias,
    reglas,
    ligas,
    aviso: 'Panel de salud y cobertura histórica del motor. No mide aciertos, ganancias, probabilidades ni genera recomendaciones deportivas.',
  };
}
