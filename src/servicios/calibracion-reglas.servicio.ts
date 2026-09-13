import { pool } from '../infraestructura/db.js';
import { ejecutarBacktesting79Reglas, type FiltrosBacktestingReglas } from './backtesting-reglas.servicio.js';

export interface UmbralCategoriaRegla {
  categoria: string;
  umbralUtilizable: number;
  umbralLimitado: number;
  origen: 'DEFAULT' | 'BACKTESTING';
  muestraPartidos: number;
  reglasEvaluadas: number;
  coberturaPromedio: number | null;
  estabilidadPromedio: number | null;
  actualizadoEn: string | null;
}

export interface PropuestaCalibracionCategoria extends UmbralCategoriaRegla {
  umbralUtilizableActual: number;
  umbralLimitadoActual: number;
  cambioUtilizable: number;
  cambioLimitado: number;
  suficienteMuestra: boolean;
  motivo: string;
}

const DEFAULT_UTILIZABLE = 70;
const DEFAULT_LIMITADO = 40;
const red = (n: number): number => Number(n.toFixed(1));
const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

function percentil(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const pos = (a.length - 1) * p;
  const i = Math.floor(pos);
  const f = pos - i;
  return a[i]! + ((a[i + 1] ?? a[i]!) - a[i]!) * f;
}

export async function cargarUmbralesCalibracion(): Promise<Map<string, UmbralCategoriaRegla>> {
  const mapa = new Map<string, UmbralCategoriaRegla>();
  try {
    const { rows } = await pool.query<any>(`
      SELECT categoria, umbral_utilizable, umbral_limitado, origen,
             muestra_partidos, reglas_evaluadas, cobertura_promedio,
             estabilidad_promedio, actualizado_en
        FROM calibracion_calidad_reglas
    `);
    for (const r of rows) {
      mapa.set(String(r.categoria), {
        categoria: String(r.categoria),
        umbralUtilizable: Number(r.umbral_utilizable),
        umbralLimitado: Number(r.umbral_limitado),
        origen: 'BACKTESTING',
        muestraPartidos: Number(r.muestra_partidos ?? 0),
        reglasEvaluadas: Number(r.reglas_evaluadas ?? 0),
        coberturaPromedio: r.cobertura_promedio == null ? null : Number(r.cobertura_promedio),
        estabilidadPromedio: r.estabilidad_promedio == null ? null : Number(r.estabilidad_promedio),
        actualizadoEn: r.actualizado_en ? new Date(r.actualizado_en).toISOString() : null,
      });
    }
  } catch (e: any) {
    // Permite que el motor siga usando 70/40 si todavía no se ejecutó la migración 023.
    if (e?.code !== '42P01') throw e;
  }
  return mapa;
}

export function umbralCategoria(categoria: string, mapa?: Map<string, UmbralCategoriaRegla>): UmbralCategoriaRegla {
  const encontrado = mapa?.get(categoria);
  if (encontrado) return encontrado;
  return {
    categoria,
    umbralUtilizable: DEFAULT_UTILIZABLE,
    umbralLimitado: DEFAULT_LIMITADO,
    origen: 'DEFAULT',
    muestraPartidos: 0,
    reglasEvaluadas: 0,
    coberturaPromedio: null,
    estabilidadPromedio: null,
    actualizadoEn: null,
  };
}

/**
 * Genera umbrales de CALIDAD DE DATOS por categoría a partir del backtesting.
 * No calibra probabilidad deportiva, cuotas, rentabilidad ni recomendaciones.
 *
 * El algoritmo es conservador: nunca baja UTILIZABLE de 65 ni LIMITADO de 40.
 * Con poca muestra mantiene 70/40.
 */
export async function generarPropuestaCalibracionReglas(
  filtros: FiltrosBacktestingReglas = {},
): Promise<any> {
  const backtest = await ejecutarBacktesting79Reglas(filtros);
  const activos = await cargarUmbralesCalibracion();
  const propuestas: PropuestaCalibracionCategoria[] = [];

  for (const cat of backtest.categorias as any[]) {
    const reglas = (backtest.reglas as any[]).filter((r) => r.categoria === cat.categoria && r.evaluaciones > 0);
    const actual = umbralCategoria(cat.categoria, activos);
    const evaluacionesTotales = reglas.reduce((s, r) => s + Number(r.evaluaciones || 0), 0);
    const suficienteMuestra = reglas.length >= 2 && evaluacionesTotales >= 30 && backtest.resumen.partidosProcesados >= 10;

    let utilizable = actual.umbralUtilizable;
    let limitado = actual.umbralLimitado;
    let motivo = 'Muestra insuficiente: se conservan los umbrales actuales.';

    if (suficienteMuestra) {
      const coberturas = reglas.map((r) => Number(r.coberturaPromedioPct || 0));
      const estabilidades = reglas.map((r) => Number(r.estabilidadCoberturaPct || 0));
      const medCob = mediana(coberturas);
      const q25Cob = percentil(coberturas, 0.25);
      const medEst = mediana(estabilidades);

      // Categorías estables pueden aceptar un umbral cercano a su mediana;
      // categorías volátiles exigen más cobertura. Nunca relajamos demasiado.
      const penalizacionVolatilidad = medEst < 60 ? 8 : medEst < 75 ? 4 : 0;
      utilizable = red(clamp(Math.round(medCob + penalizacionVolatilidad), 65, 85));
      limitado = red(clamp(Math.round(q25Cob - 10), 40, Math.max(40, utilizable - 15)));
      if (limitado >= utilizable) limitado = Math.max(40, utilizable - 15);
      motivo = `Calibrado con ${evaluacionesTotales} evaluaciones técnicas; mediana de cobertura ${red(medCob)}% y mediana de estabilidad ${red(medEst)}%.`;
    }

    propuestas.push({
      categoria: cat.categoria,
      umbralUtilizable: utilizable,
      umbralLimitado: limitado,
      origen: 'BACKTESTING',
      muestraPartidos: Number(backtest.resumen.partidosProcesados || 0),
      reglasEvaluadas: reglas.length,
      coberturaPromedio: Number(cat.coberturaPromedioPct || 0),
      estabilidadPromedio: Number(cat.estabilidadPromedioPct || 0),
      actualizadoEn: null,
      umbralUtilizableActual: actual.umbralUtilizable,
      umbralLimitadoActual: actual.umbralLimitado,
      cambioUtilizable: red(utilizable - actual.umbralUtilizable),
      cambioLimitado: red(limitado - actual.umbralLimitado),
      suficienteMuestra,
      motivo,
    });
  }

  return {
    generadoEn: new Date().toISOString(),
    filtros: backtest.filtros,
    resumenBacktesting: backtest.resumen,
    propuestas,
    aviso: 'Calibración exclusiva de umbrales de suficiencia y cobertura de datos. No representa probabilidad deportiva, pronóstico, cuota ni recomendación.',
  };
}

export async function aplicarPropuestaCalibracionReglas(
  filtros: FiltrosBacktestingReglas = {},
): Promise<any> {
  const propuesta = await generarPropuestaCalibracionReglas(filtros);
  const aplicables = propuesta.propuestas.filter((p: PropuestaCalibracionCategoria) => p.suficienteMuestra);

  for (const p of aplicables) {
    await pool.query(`
      INSERT INTO calibracion_calidad_reglas(
        categoria, umbral_utilizable, umbral_limitado, origen,
        muestra_partidos, reglas_evaluadas, cobertura_promedio,
        estabilidad_promedio, parametros, actualizado_en
      ) VALUES ($1,$2,$3,'BACKTESTING',$4,$5,$6,$7,$8::jsonb,now())
      ON CONFLICT (categoria) DO UPDATE SET
        umbral_utilizable = EXCLUDED.umbral_utilizable,
        umbral_limitado = EXCLUDED.umbral_limitado,
        origen = EXCLUDED.origen,
        muestra_partidos = EXCLUDED.muestra_partidos,
        reglas_evaluadas = EXCLUDED.reglas_evaluadas,
        cobertura_promedio = EXCLUDED.cobertura_promedio,
        estabilidad_promedio = EXCLUDED.estabilidad_promedio,
        parametros = EXCLUDED.parametros,
        actualizado_en = now()
    `, [
      p.categoria,
      p.umbralUtilizable,
      p.umbralLimitado,
      p.muestraPartidos,
      p.reglasEvaluadas,
      p.coberturaPromedio,
      p.estabilidadPromedio,
      JSON.stringify(propuesta.filtros),
    ]);
  }

  return {
    aplicadoEn: new Date().toISOString(),
    categoriasAplicadas: aplicables.length,
    categoriasOmitidas: propuesta.propuestas.length - aplicables.length,
    propuestas: propuesta.propuestas,
    aviso: propuesta.aviso,
  };
}

export async function listarCalibracionReglasActiva(): Promise<any> {
  const mapa = await cargarUmbralesCalibracion();
  return {
    generadoEn: new Date().toISOString(),
    defaults: { umbralUtilizable: DEFAULT_UTILIZABLE, umbralLimitado: DEFAULT_LIMITADO },
    categorias: [...mapa.values()].sort((a, b) => a.categoria.localeCompare(b.categoria)),
    aviso: 'Estos umbrales controlan únicamente suficiencia de datos históricos para el motor técnico.',
  };
}
