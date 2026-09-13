import { pool } from '../infraestructura/db.js';
import { analizarCompatibilidadReglas, type EstadoDatosRegla, type SenalAnalisis } from './analisis-reglas.servicio.js';

export type EstadoBacktestingRegla = 'ROBUSTO' | 'ACEPTABLE' | 'DEBIL' | 'SIN_MUESTRA';

export interface FiltrosBacktestingReglas {
  ligaApiId?: string;
  temporada?: number;
  muestra?: number;
  limite?: number;
}

interface FixtureHistorico {
  fixture_api_id: string;
  liga_api_id: string;
  temporada: number;
  fecha: Date | string;
  equipo_local: string;
  equipo_visitante: string;
}

interface AcumuladorRegla {
  codigo: string;
  nombre: string;
  categoria: string;
  senales: Set<SenalAnalisis>;
  evaluaciones: number;
  utilizables: number;
  limitadas: number;
  descartadas: number;
  noImplementadas: number;
  coberturas: number[];
}

const red = (n: number): number => Number(n.toFixed(1));
const pct = (n: number, d: number): number => d > 0 ? red(n * 100 / d) : 0;

function promedio(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

function desviacion(xs: number[]): number {
  if (xs.length < 2) return 0;
  const p = promedio(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - p) ** 2, 0) / xs.length);
}

function clasificar(evaluaciones: number, utilizablePct: number, coberturaPromedioPct: number, desviacionCoberturaPct: number, noImplementadas: number): EstadoBacktestingRegla {
  if (!evaluaciones) return 'SIN_MUESTRA';
  if (evaluaciones >= 10 && utilizablePct >= 75 && coberturaPromedioPct >= 70 && desviacionCoberturaPct <= 20 && noImplementadas === 0) return 'ROBUSTO';
  if (utilizablePct >= 50 && coberturaPromedioPct >= 50 && desviacionCoberturaPct <= 30) return 'ACEPTABLE';
  return 'DEBIL';
}

/**
 * Backtesting técnico punto-en-tiempo de las reglas activas.
 *
 * Importante: no intenta predecir el resultado del partido ni compara
 * ganancias/pérdidas. Para cada fixture histórico reconstruye el análisis
 * usando únicamente información anterior a la fecha del propio fixture y
 * mide cobertura, estabilidad y suficiencia de datos por regla.
 */
export async function ejecutarBacktesting79Reglas(
  filtros: FiltrosBacktestingReglas = {},
): Promise<any> {
  const muestra = Math.max(5, Math.min(50, Number(filtros.muestra ?? 20)));
  const limite = Math.max(1, Math.min(200, Number(filtros.limite ?? 50)));
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

  const { rows } = await pool.query<FixtureHistorico>(`
    SELECT p.fixture_api_id, p.liga_api_id, p.temporada, p.fecha,
           p.equipo_local, p.equipo_visitante
      FROM partidos_historial_deportivo p
     WHERE ${where.join(' AND ')}
     ORDER BY p.fecha DESC
     LIMIT $${valores.length}
  `, valores);

  const mapa = new Map<string, AcumuladorRegla>();
  let procesados = 0;
  let omitidos = 0;
  let incidenciasCorteTemporal = 0;
  const errores: Array<{ fixtureId: string; mensaje: string }> = [];

  // Secuencial intencionalmente para no generar ráfagas contra PostgreSQL.
  for (const fixture of rows) {
    try {
      const analisis = await analizarCompatibilidadReglas(String(fixture.fixture_api_id), muestra);
      if (!analisis) {
        omitidos++;
        continue;
      }
      procesados++;

      const fechaObjetivo = new Date(fixture.fecha).getTime();
      const fechaCorte = new Date(analisis.fechaCorte).getTime();
      if (Number.isFinite(fechaObjetivo) && Number.isFinite(fechaCorte) && fechaCorte > fechaObjetivo) {
        incidenciasCorteTemporal++;
      }

      for (const regla of analisis.reglas) {
        let acc = mapa.get(regla.codigo);
        if (!acc) {
          acc = {
            codigo: regla.codigo,
            nombre: regla.nombre,
            categoria: regla.categoria,
            senales: new Set<SenalAnalisis>(),
            evaluaciones: 0,
            utilizables: 0,
            limitadas: 0,
            descartadas: 0,
            noImplementadas: 0,
            coberturas: [],
          };
          mapa.set(regla.codigo, acc);
        }
        for (const s of regla.senales) acc.senales.add(s);
        acc.evaluaciones++;
        acc.coberturas.push(Number(regla.coberturaPct || 0));
        const estado: EstadoDatosRegla = regla.estadoDatos;
        if (estado === 'UTILIZABLE') acc.utilizables++;
        else if (estado === 'LIMITADO') acc.limitadas++;
        else if (estado === 'DESCARTADO') acc.descartadas++;
        else acc.noImplementadas++;
      }
    } catch (e) {
      omitidos++;
      if (errores.length < 20) {
        errores.push({
          fixtureId: String(fixture.fixture_api_id),
          mensaje: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  const reglas = [...mapa.values()].map((x) => {
    const coberturaPromedioPct = red(promedio(x.coberturas));
    const coberturaMedianaPct = red(mediana(x.coberturas));
    const desviacionCoberturaPct = red(desviacion(x.coberturas));
    const utilizablePct = pct(x.utilizables, x.evaluaciones);
    const estabilidadCoberturaPct = red(Math.max(0, 100 - Math.min(100, desviacionCoberturaPct * 2)));
    const estado = clasificar(x.evaluaciones, utilizablePct, coberturaPromedioPct, desviacionCoberturaPct, x.noImplementadas);
    return {
      codigo: x.codigo,
      nombre: x.nombre,
      categoria: x.categoria,
      senales: [...x.senales],
      evaluaciones: x.evaluaciones,
      utilizables: x.utilizables,
      limitadas: x.limitadas,
      descartadas: x.descartadas,
      noImplementadas: x.noImplementadas,
      utilizablePct,
      coberturaPromedioPct,
      coberturaMedianaPct,
      coberturaMinPct: x.coberturas.length ? red(Math.min(...x.coberturas)) : 0,
      coberturaMaxPct: x.coberturas.length ? red(Math.max(...x.coberturas)) : 0,
      desviacionCoberturaPct,
      estabilidadCoberturaPct,
      estado,
    };
  }).sort((a, b) => a.codigo.localeCompare(b.codigo));

  const categorias = [...new Set(reglas.map((r) => r.categoria))].sort().map((categoria) => {
    const rr = reglas.filter((r) => r.categoria === categoria);
    return {
      categoria,
      reglas: rr.length,
      robustas: rr.filter((r) => r.estado === 'ROBUSTO').length,
      aceptables: rr.filter((r) => r.estado === 'ACEPTABLE').length,
      debiles: rr.filter((r) => r.estado === 'DEBIL').length,
      sinMuestra: rr.filter((r) => r.estado === 'SIN_MUESTRA').length,
      utilizablePctPromedio: rr.length ? red(promedio(rr.map((r) => r.utilizablePct))) : 0,
      coberturaPromedioPct: rr.length ? red(promedio(rr.map((r) => r.coberturaPromedioPct))) : 0,
      estabilidadPromedioPct: rr.length ? red(promedio(rr.map((r) => r.estabilidadCoberturaPct))) : 0,
    };
  });

  return {
    generadoEn: new Date().toISOString(),
    filtros: {
      ligaApiId: filtros.ligaApiId ?? null,
      temporada: filtros.temporada ?? null,
      muestra,
      limite,
    },
    resumen: {
      partidosSolicitados: rows.length,
      partidosProcesados: procesados,
      partidosOmitidos: omitidos,
      reglasEvaluadas: reglas.length,
      robustas: reglas.filter((r) => r.estado === 'ROBUSTO').length,
      aceptables: reglas.filter((r) => r.estado === 'ACEPTABLE').length,
      debiles: reglas.filter((r) => r.estado === 'DEBIL').length,
      sinMuestra: reglas.filter((r) => r.estado === 'SIN_MUESTRA').length,
      incidenciasCorteTemporal,
      corteTemporalOk: incidenciasCorteTemporal === 0,
    },
    categorias,
    reglas,
    errores,
    aviso: 'Backtesting técnico de calidad y estabilidad de datos usando únicamente información anterior a cada partido. No mide rentabilidad, no calcula probabilidades, cuotas, montos ni recomendaciones deportivas.',
  };
}
