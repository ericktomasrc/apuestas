import { pool } from '../infraestructura/db.js';
import { ejecutarBacktesting79Reglas } from './backtesting-reglas.servicio.js';

export interface FiltrosComparacionLigas {
  ligaApiIds?: string[];
  temporada?: number;
  muestra?: number;
  limite?: number;
  maxLigas?: number;
}

type NivelComparabilidad = 'ALTA' | 'MEDIA' | 'BAJA' | 'SIN_MUESTRA';

interface LigaDisponible {
  ligaApiId: string;
  liga: string;
  temporadas: number[];
  partidos: number;
  temporadaReciente: number | null;
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

async function listarLigasDisponibles(): Promise<LigaDisponible[]> {
  const { rows } = await pool.query<any>(`
    SELECT p.liga_api_id,
           COALESCE(MAX(l.nombre), MAX(NULLIF(p.liga_api_id, '')), p.liga_api_id) AS liga,
           array_agg(DISTINCT p.temporada ORDER BY p.temporada DESC) AS temporadas,
           count(*)::int AS partidos,
           max(p.temporada)::int AS temporada_reciente,
           min(p.fecha) AS desde,
           max(p.fecha) AS hasta
      FROM partidos_historial_deportivo p
      LEFT JOIN ligas l ON l.api_id::text = p.liga_api_id
     WHERE p.estado IN ('FT','AET','PEN','FINALIZADO')
     GROUP BY p.liga_api_id
     ORDER BY count(*) DESC, p.liga_api_id
  `);

  return rows.map((r) => ({
    ligaApiId: String(r.liga_api_id),
    liga: String(r.liga ?? r.liga_api_id),
    temporadas: Array.isArray(r.temporadas) ? r.temporadas.map(Number).filter(Number.isFinite) : [],
    partidos: Number(r.partidos ?? 0),
    temporadaReciente: r.temporada_reciente == null ? null : Number(r.temporada_reciente),
    desde: r.desde ? new Date(r.desde).toISOString() : null,
    hasta: r.hasta ? new Date(r.hasta).toISOString() : null,
  }));
}

/**
 * Compara exclusivamente la ESTRUCTURA Y CALIDAD DE DATOS históricos entre ligas.
 * No compara fortaleza deportiva, no estima resultados, probabilidades, cuotas,
 * rentabilidad ni genera recomendaciones.
 */
export async function compararLigasHistoricas(filtros: FiltrosComparacionLigas = {}): Promise<any> {
  const muestra = Math.max(5, Math.min(50, Number(filtros.muestra ?? 20)));
  const limite = Math.max(1, Math.min(100, Number(filtros.limite ?? 40)));
  const maxLigas = Math.max(2, Math.min(10, Number(filtros.maxLigas ?? 5)));
  const temporadaSolicitada = filtros.temporada == null ? undefined : Number(filtros.temporada);

  const disponibles = await listarLigasDisponibles();
  const mapaDisponibles = new Map(disponibles.map((x) => [x.ligaApiId, x]));
  const solicitadas = (filtros.ligaApiIds ?? [])
    .map(String)
    .filter((x) => mapaDisponibles.has(x));

  const seleccionadas = (solicitadas.length ? [...new Set(solicitadas)] : disponibles.map((x) => x.ligaApiId))
    .slice(0, maxLigas)
    .map((ligaApiId) => mapaDisponibles.get(ligaApiId)!)
    .filter(Boolean);

  if (seleccionadas.length < 2) {
    return {
      generadoEn: new Date().toISOString(),
      ligasDisponibles: disponibles,
      ligasAnalizadas: [],
      referencia: null,
      comparaciones: [],
      categorias: [],
      estado: 'SIN_MUESTRA',
      aviso: 'Se necesitan al menos dos ligas con histórico disponible para comparar estructura y calidad de datos.',
    };
  }

  const resultados: any[] = [];
  const errores: Array<{ ligaApiId: string; liga: string; error: string }> = [];

  // Secuencial a propósito: cada backtesting realiza varias consultas de BD.
  for (const liga of seleccionadas) {
    const temporada = temporadaSolicitada != null
      ? (liga.temporadas.includes(temporadaSolicitada) ? temporadaSolicitada : null)
      : liga.temporadaReciente;

    if (temporada == null) {
      errores.push({
        ligaApiId: liga.ligaApiId,
        liga: liga.liga,
        error: temporadaSolicitada != null
          ? `La temporada ${temporadaSolicitada} no existe en el histórico de esta liga.`
          : 'No hay temporada histórica disponible.',
      });
      continue;
    }

    try {
      const bt = await ejecutarBacktesting79Reglas({
        ligaApiId: liga.ligaApiId,
        temporada,
        muestra,
        limite,
      });
      resultados.push({
        ligaApiId: liga.ligaApiId,
        liga: liga.liga,
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
      errores.push({
        ligaApiId: liga.ligaApiId,
        liga: liga.liga,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (resultados.length < 2) {
    return {
      generadoEn: new Date().toISOString(),
      filtros: { temporada: temporadaSolicitada ?? null, muestra, limite, maxLigas },
      ligasDisponibles: disponibles,
      ligasAnalizadas: resultados,
      referencia: resultados[0] ?? null,
      comparaciones: [],
      categorias: [],
      errores,
      estado: 'SIN_MUESTRA',
      aviso: 'No fue posible obtener al menos dos ligas procesables para la comparación técnica.',
    };
  }

  // Si el usuario indicó ligas, la primera indicada es la referencia. Si no,
  // se usa la liga con mayor cantidad de partidos procesados para evitar una base débil.
  const referencia = solicitadas.length
    ? (resultados.find((x) => x.ligaApiId === solicitadas[0]) ?? resultados[0]!)
    : [...resultados].sort((a, b) => b.partidosProcesados - a.partidosProcesados)[0]!;

  const categoriasReferencia = new Map<string, any>(
    referencia.categorias.map((c: any) => [String(c.categoria), c]),
  );
  const categoriasAcumuladas = new Map<string, any[]>();

  for (const liga of resultados) {
    for (const c of liga.categorias) {
      const k = String(c.categoria);
      const arr = categoriasAcumuladas.get(k) ?? [];
      arr.push({ ligaApiId: liga.ligaApiId, liga: liga.liga, temporada: liga.temporada, ...c });
      categoriasAcumuladas.set(k, arr);
    }
  }

  const comparaciones = resultados
    .filter((x) => x.ligaApiId !== referencia.ligaApiId)
    .map((liga) => {
      const pares: any[] = [];
      for (const c of liga.categorias) {
        const base = categoriasReferencia.get(String(c.categoria));
        if (!base) continue;
        const deltaCobertura = red(Math.abs(Number(c.coberturaPromedioPct ?? 0) - Number(base.coberturaPromedioPct ?? 0)));
        const deltaEstabilidad = red(Math.abs(Number(c.estabilidadPromedioPct ?? 0) - Number(base.estabilidadPromedioPct ?? 0)));
        const deltaUtilizable = red(Math.abs(Number(c.utilizablePctPromedio ?? 0) - Number(base.utilizablePctPromedio ?? 0)));
        const conMuestra = Number(c.reglasEvaluadas ?? 0) > 0 && Number(base.reglasEvaluadas ?? 0) > 0;
        pares.push({
          categoria: String(c.categoria),
          coberturaReferenciaPct: Number(base.coberturaPromedioPct ?? 0),
          coberturaLigaPct: Number(c.coberturaPromedioPct ?? 0),
          estabilidadReferenciaPct: Number(base.estabilidadPromedioPct ?? 0),
          estabilidadLigaPct: Number(c.estabilidadPromedioPct ?? 0),
          utilizableReferenciaPct: Number(base.utilizablePctPromedio ?? 0),
          utilizableLigaPct: Number(c.utilizablePctPromedio ?? 0),
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
        ligaApiId: liga.ligaApiId,
        liga: liga.liga,
        temporada: liga.temporada,
        referenciaLigaApiId: referencia.ligaApiId,
        referenciaLiga: referencia.liga,
        referenciaTemporada: referencia.temporada,
        partidosProcesados: liga.partidosProcesados,
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
      ligasConMuestra: conMuestra.length,
      coberturaMinPct: conMuestra.length ? red(Math.min(...conMuestra.map((x) => Number(x.coberturaPromedioPct ?? 0)))) : 0,
      coberturaMaxPct: conMuestra.length ? red(Math.max(...conMuestra.map((x) => Number(x.coberturaPromedioPct ?? 0)))) : 0,
      coberturaPromedioPct: conMuestra.length ? red(promedio(conMuestra.map((x) => Number(x.coberturaPromedioPct ?? 0)))) : 0,
      estabilidadPromedioPct: conMuestra.length ? red(promedio(conMuestra.map((x) => Number(x.estabilidadPromedioPct ?? 0)))) : 0,
      ligas: xs,
    };
  }).sort((a, b) => a.categoria.localeCompare(b.categoria));

  const niveles = comparaciones.map((x) => x.comparabilidadGeneral as NivelComparabilidad);
  const estado: NivelComparabilidad = niveles.includes('BAJA')
    ? 'BAJA'
    : niveles.includes('MEDIA')
      ? 'MEDIA'
      : niveles.length > 0 && niveles.every((x) => x === 'ALTA')
        ? 'ALTA'
        : 'SIN_MUESTRA';

  return {
    generadoEn: new Date().toISOString(),
    filtros: {
      temporada: temporadaSolicitada ?? null,
      muestra,
      limite,
      maxLigas,
    },
    ligasDisponibles: disponibles,
    ligasAnalizadas: resultados,
    referencia: {
      ligaApiId: referencia.ligaApiId,
      liga: referencia.liga,
      temporada: referencia.temporada,
      partidosProcesados: referencia.partidosProcesados,
    },
    estado,
    comparaciones,
    categorias,
    errores,
    aviso: 'Comparación técnica entre ligas basada exclusivamente en cobertura, estabilidad y suficiencia de datos históricos. No compara nivel deportivo de las competiciones y no constituye pronóstico ni recomendación.',
  };
}
