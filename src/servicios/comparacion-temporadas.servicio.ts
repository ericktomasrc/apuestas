import { pool } from '../infraestructura/db.js';
import { ejecutarBacktesting79Reglas } from './backtesting-reglas.servicio.js';

export interface FiltrosComparacionTemporadas {
  ligaApiId: string;
  temporadas?: number[];
  muestra?: number;
  limite?: number;
  maxTemporadas?: number;
}

type NivelComparabilidad = 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_MUESTRA';

interface TemporadaDisponible {
  temporada: number;
  partidos: number;
  desde: string | null;
  hasta: string | null;
}

const red = (n: number): number => Number(n.toFixed(1));
const promedio = (xs: number[]): number => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

function nivelComparabilidad(deltaCobertura: number, deltaEstabilidad: number, deltaUtilizable: number, conMuestra: boolean): NivelComparabilidad {
  if (!conMuestra) return 'SIN_MUESTRA';
  if (deltaCobertura <= 10 && deltaEstabilidad <= 12 && deltaUtilizable <= 15) return 'ALTA';
  if (deltaCobertura <= 20 && deltaEstabilidad <= 20 && deltaUtilizable <= 25) return 'MEDIA';
  return 'BAJA';
}

async function listarTemporadasDisponibles(ligaApiId: string): Promise<TemporadaDisponible[]> {
  const { rows } = await pool.query<any>(`
    SELECT temporada,
           count(*)::int AS partidos,
           min(fecha) AS desde,
           max(fecha) AS hasta
      FROM partidos_historial_deportivo
     WHERE liga_api_id = $1
       AND estado IN ('FT','AET','PEN','FINALIZADO')
     GROUP BY temporada
     ORDER BY temporada DESC
  `, [ligaApiId]);

  return rows.map((r) => ({
    temporada: Number(r.temporada),
    partidos: Number(r.partidos ?? 0),
    desde: r.desde ? new Date(r.desde).toISOString() : null,
    hasta: r.hasta ? new Date(r.hasta).toISOString() : null,
  }));
}

/**
 * Compara exclusivamente CALIDAD, COBERTURA y ESTABILIDAD del histórico
 * entre temporadas de una misma liga. No estima resultados deportivos,
 * probabilidades, cuotas, rentabilidad ni recomendaciones.
 */
export async function compararTemporadasHistoricas(filtros: FiltrosComparacionTemporadas): Promise<any> {
  const ligaApiId = String(filtros.ligaApiId);
  const muestra = Math.max(5, Math.min(50, Number(filtros.muestra ?? 20)));
  const limite = Math.max(1, Math.min(100, Number(filtros.limite ?? 40)));
  const maxTemporadas = Math.max(2, Math.min(8, Number(filtros.maxTemporadas ?? 5)));

  const disponibles = await listarTemporadasDisponibles(ligaApiId);
  const permitidas = new Set(disponibles.map((x) => x.temporada));
  const solicitadas = (filtros.temporadas ?? [])
    .map(Number)
    .filter((x) => Number.isInteger(x) && permitidas.has(x));

  const temporadas = (solicitadas.length ? [...new Set(solicitadas)] : disponibles.map((x) => x.temporada))
    .sort((a, b) => b - a)
    .slice(0, maxTemporadas);

  if (temporadas.length < 2) {
    return {
      generadoEn: new Date().toISOString(),
      ligaApiId,
      temporadasDisponibles: disponibles,
      temporadasAnalizadas: [],
      referencia: null,
      comparaciones: [],
      categorias: [],
      estado: 'SIN_MUESTRA',
      aviso: 'Se necesitan al menos dos temporadas históricas de la misma liga para comparar calidad y estabilidad de datos.',
    };
  }

  const resultados: any[] = [];
  const errores: Array<{ temporada: number; error: string }> = [];

  // Secuencial a propósito: cada backtesting ya realiza trabajo intensivo en BD.
  for (const temporada of temporadas) {
    try {
      const bt = await ejecutarBacktesting79Reglas({ ligaApiId, temporada, muestra, limite });
      resultados.push({
        temporada,
        partidosProcesados: Number(bt.resumen?.partidosProcesados ?? 0),
        partidosOmitidos: Number(bt.resumen?.partidosOmitidos ?? 0),
        robustas: Number(bt.resumen?.robustas ?? 0),
        aceptables: Number(bt.resumen?.aceptables ?? 0),
        debiles: Number(bt.resumen?.debiles ?? 0),
        sinMuestra: Number(bt.resumen?.sinMuestra ?? 0),
        corteTemporalOk: Boolean(bt.resumen?.corteTemporalOk),
        categorias: Array.isArray(bt.categorias) ? bt.categorias : [],
      });
    } catch (e) {
      errores.push({ temporada, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (resultados.length < 2) {
    return {
      generadoEn: new Date().toISOString(),
      ligaApiId,
      temporadasDisponibles: disponibles,
      temporadasAnalizadas: resultados,
      referencia: resultados[0]?.temporada ?? null,
      comparaciones: [],
      categorias: [],
      errores,
      estado: 'SIN_MUESTRA',
      aviso: 'No fue posible obtener al menos dos temporadas procesables para la comparación técnica.',
    };
  }

  const referencia = resultados[0]!; // la más reciente de las procesadas
  const categoriasReferencia = new Map<string, any>(referencia.categorias.map((c: any) => [String(c.categoria), c]));
  const categoriasAcumuladas = new Map<string, any[]>();

  for (const t of resultados) {
    for (const c of t.categorias) {
      const k = String(c.categoria);
      const arr = categoriasAcumuladas.get(k) ?? [];
      arr.push({ temporada: t.temporada, ...c });
      categoriasAcumuladas.set(k, arr);
    }
  }

  const comparaciones = resultados.slice(1).map((t) => {
    const pares: any[] = [];
    for (const c of t.categorias) {
      const base = categoriasReferencia.get(String(c.categoria));
      if (!base) continue;
      const deltaCobertura = red(Math.abs(Number(c.coberturaPromedioPct ?? 0) - Number(base.coberturaPromedioPct ?? 0)));
      const deltaEstabilidad = red(Math.abs(Number(c.estabilidadPromedioPct ?? 0) - Number(base.estabilidadPromedioPct ?? 0)));
      const deltaUtilizable = red(Math.abs(Number(c.utilizablePctPromedio ?? 0) - Number(base.utilizablePctPromedio ?? 0)));
      const conMuestra = Number(c.reglasEvaluadas ?? 0) > 0 && Number(base.reglasEvaluadas ?? 0) > 0;
      pares.push({
        categoria: String(c.categoria),
        coberturaReferenciaPct: Number(base.coberturaPromedioPct ?? 0),
        coberturaTemporadaPct: Number(c.coberturaPromedioPct ?? 0),
        estabilidadReferenciaPct: Number(base.estabilidadPromedioPct ?? 0),
        estabilidadTemporadaPct: Number(c.estabilidadPromedioPct ?? 0),
        utilizableReferenciaPct: Number(base.utilizablePctPromedio ?? 0),
        utilizableTemporadaPct: Number(c.utilizablePctPromedio ?? 0),
        deltaCoberturaPct: deltaCobertura,
        deltaEstabilidadPct: deltaEstabilidad,
        deltaUtilizablePct: deltaUtilizable,
        comparabilidad: nivelComparabilidad(deltaCobertura, deltaEstabilidad, deltaUtilizable, conMuestra),
      });
    }

    const utiles = pares.filter((x) => x.comparabilidad !== 'SIN_MUESTRA');
    const dCob = red(promedio(utiles.map((x) => x.deltaCoberturaPct)));
    const dEst = red(promedio(utiles.map((x) => x.deltaEstabilidadPct)));
    const dUti = red(promedio(utiles.map((x) => x.deltaUtilizablePct)));

    return {
      temporada: t.temporada,
      referencia: referencia.temporada,
      partidosProcesados: t.partidosProcesados,
      deltaCoberturaPromedioPct: dCob,
      deltaEstabilidadPromedioPct: dEst,
      deltaUtilizablePromedioPct: dUti,
      comparabilidadGeneral: nivelComparabilidad(dCob, dEst, dUti, utiles.length > 0),
      categorias: pares,
    };
  });

  const categorias = [...categoriasAcumuladas.entries()].map(([categoria, xs]) => {
    const conMuestra = xs.filter((x) => Number(x.reglasEvaluadas ?? 0) > 0);
    return {
      categoria,
      temporadasConMuestra: conMuestra.length,
      coberturaMinPct: conMuestra.length ? red(Math.min(...conMuestra.map((x) => Number(x.coberturaPromedioPct ?? 0)))) : 0,
      coberturaMaxPct: conMuestra.length ? red(Math.max(...conMuestra.map((x) => Number(x.coberturaPromedioPct ?? 0)))) : 0,
      coberturaPromedioPct: conMuestra.length ? red(promedio(conMuestra.map((x) => Number(x.coberturaPromedioPct ?? 0)))) : 0,
      estabilidadPromedioPct: conMuestra.length ? red(promedio(conMuestra.map((x) => Number(x.estabilidadPromedioPct ?? 0)))) : 0,
      temporadas: xs,
    };
  }).sort((a, b) => a.categoria.localeCompare(b.categoria));

  const niveles = comparaciones.map((x) => x.comparabilidadGeneral as NivelComparabilidad);
  const estado: NivelComparabilidad = niveles.includes('BAJA')
    ? 'BAJA'
    : niveles.includes('MEDIA')
      ? 'MEDIA'
      : niveles.every((x) => x === 'ALTA')
        ? 'ALTA'
        : 'SIN_MUESTRA';

  return {
    generadoEn: new Date().toISOString(),
    ligaApiId,
    filtros: { muestra, limite, maxTemporadas },
    temporadasDisponibles: disponibles,
    temporadasAnalizadas: resultados,
    referencia: referencia.temporada,
    estado,
    comparaciones,
    categorias,
    errores,
    aviso: 'Comparación técnica entre temporadas basada en cobertura, estabilidad y suficiencia de datos históricos. Una comparabilidad baja no implica rendimiento deportivo distinto y no constituye pronóstico ni recomendación.',
  };
}
