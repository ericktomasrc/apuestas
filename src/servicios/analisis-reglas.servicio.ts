import { pool } from '../infraestructura/db.js';
import { construirDatasetAnalisis, type DatasetAnalisisHistorico, type ResumenEquipoHistorico } from './analisis-historico.servicio.js';
import { cargarUmbralesCalibracion, umbralCategoria, type UmbralCategoriaRegla } from './calibracion-reglas.servicio.js';

export type SenalAnalisis =
  | 'RESULTADO_FINAL'
  | 'GOLES_FINAL'
  | 'PRIMER_TIEMPO'
  | 'SEGUNDO_TIEMPO'
  | 'EVENTOS_CRONOLOGICOS'
  | 'TARJETAS'
  | 'ROJAS'
  | 'CORNERS'
  | 'TIROS'
  | 'TIROS_ARCO'
  | 'POSESION'
  | 'FALTAS'
  | 'FUERAS_JUEGO';

export type EstadoDatosRegla = 'UTILIZABLE' | 'LIMITADO' | 'DESCARTADO' | 'NO_IMPLEMENTADO';

type ReglaDb = {
  codigo: string;
  nombre: string;
  categoria: string;
  ejemplo: string;
  fuente_validacion: 'RESULTADO' | 'EVENTOS' | 'ESTADISTICAS';
  usa_cantidad: boolean;
  activa: boolean;
};

export interface CompatibilidadReglaAnalisis {
  codigo: string;
  nombre: string;
  categoria: string;
  ejemplo: string;
  fuenteValidacion: string;
  senales: SenalAnalisis[];
  estadoDatos: EstadoDatosRegla;
  coberturaPct: number;
  muestraConDato: number;
  muestraTotal: number;
  faltantes: string[];
  motivo: string;
  calibracion: { umbralUtilizable: number; umbralLimitado: number; origen: 'DEFAULT' | 'BACKTESTING' };
}

export interface ResultadoCompatibilidadReglas {
  fixtureId: string;
  fechaCorte: string;
  partido: DatasetAnalisisHistorico['partido'];
  resumen: {
    reglasActivas: number;
    utilizables: number;
    limitadas: number;
    descartadas: number;
    noImplementadas: number;
  };
  reglas: CompatibilidadReglaAnalisis[];
  aviso: string;
}

const red = (v: number): number => Number(v.toFixed(1));

function numeroRegla(codigo: string): number | null {
  const m = /^R(\d{3})_/.exec(codigo);
  return m ? Number(m[1]) : null;
}

/**
 * Mapea las 79 reglas actuales a la señal deportiva mínima que necesitan.
 * No calcula probabilidad, cuota, premio ni recomendación.
 */
export function senalesDeRegla(codigo: string): SenalAnalisis[] | null {
  const n = numeroRegla(codigo);
  if (!n) return null;
  if (n >= 1 && n <= 39) return n === 1 || n === 2 || n === 3 || n === 4 || n === 5
    ? ['RESULTADO_FINAL']
    : ['GOLES_FINAL'];
  if (n >= 40 && n <= 46) return ['PRIMER_TIEMPO'];
  if (n >= 47 && n <= 52) return ['SEGUNDO_TIEMPO'];
  if (n >= 53 && n <= 60) return ['EVENTOS_CRONOLOGICOS'];
  if (n >= 61 && n <= 65) return ['TARJETAS'];
  if (n === 66 || n === 67) return ['ROJAS'];
  if (n >= 68 && n <= 73) return ['CORNERS'];
  if (n === 74 || n === 76) return ['TIROS'];
  if (n === 75) return ['TIROS_ARCO'];
  if (n === 77) return ['POSESION'];
  if (n === 78) return ['FALTAS'];
  if (n === 79) return ['FUERAS_JUEGO'];
  return null;
}

function conteo(e: ResumenEquipoHistorico, senal: SenalAnalisis): number {
  switch (senal) {
    case 'RESULTADO_FINAL':
    case 'GOLES_FINAL': return e.coberturaCampos.golesFinales;
    case 'PRIMER_TIEMPO': return e.coberturaCampos.descanso;
    case 'SEGUNDO_TIEMPO': return Math.min(e.coberturaCampos.descanso, e.coberturaCampos.golesFinales);
    case 'TARJETAS': return e.coberturaCampos.tarjetas;
    case 'ROJAS': return e.coberturaCampos.rojas;
    case 'CORNERS': return e.coberturaCampos.corners;
    case 'TIROS': return e.coberturaCampos.tiros;
    case 'TIROS_ARCO': return e.coberturaCampos.tirosArco;
    case 'POSESION': return e.coberturaCampos.posesion;
    case 'FALTAS': return e.coberturaCampos.faltas;
    case 'FUERAS_JUEGO': return e.coberturaCampos.fuerasJuego;
    case 'EVENTOS_CRONOLOGICOS': return e.coberturaCampos.eventosCronologicos;
  }
}

function etiqueta(s: SenalAnalisis): string {
  const m: Record<SenalAnalisis, string> = {
    RESULTADO_FINAL: 'resultado final',
    GOLES_FINAL: 'goles finales',
    PRIMER_TIEMPO: 'marcador al descanso',
    SEGUNDO_TIEMPO: 'marcador final + descanso',
    EVENTOS_CRONOLOGICOS: 'eventos cronológicos por minuto',
    TARJETAS: 'tarjetas',
    ROJAS: 'tarjetas rojas',
    CORNERS: 'córners',
    TIROS: 'tiros',
    TIROS_ARCO: 'tiros al arco',
    POSESION: 'posesión',
    FALTAS: 'faltas',
    FUERAS_JUEGO: 'fueras de juego',
  };
  return m[s];
}

function evaluarRegla(regla: ReglaDb, dataset: DatasetAnalisisHistorico, umbral: UmbralCategoriaRegla): CompatibilidadReglaAnalisis {
  const senales = senalesDeRegla(regla.codigo);
  const total = dataset.local.partidosAnalizados + dataset.visitante.partidosAnalizados;

  if (!senales) {
    return {
      codigo: regla.codigo, nombre: regla.nombre, categoria: regla.categoria, ejemplo: regla.ejemplo,
      fuenteValidacion: regla.fuente_validacion, senales: [], estadoDatos: 'NO_IMPLEMENTADO',
      coberturaPct: 0, muestraConDato: 0, muestraTotal: total,
      faltantes: ['La regla no tiene mapeo de análisis'],
      motivo: 'Regla personalizada o fuera del catálogo R001–R079: necesita definir sus señales antes de analizarla.',
      calibracion: { umbralUtilizable: umbral.umbralUtilizable, umbralLimitado: umbral.umbralLimitado, origen: umbral.origen },
    };
  }

  const conteos = senales.map((s) => ({
    senal: s,
    conDato: conteo(dataset.local, s) + conteo(dataset.visitante, s),
  }));
  const minimo = conteos.length ? Math.min(...conteos.map((x) => x.conDato)) : 0;
  const cobertura = total > 0 ? red(minimo * 100 / total) : 0;
  const faltantes = conteos.filter((x) => x.conDato < total).map((x) => `${etiqueta(x.senal)}: ${x.conDato}/${total}`);

  let estado: EstadoDatosRegla;
  if (cobertura >= umbral.umbralUtilizable && dataset.calidad.estado !== 'INSUFICIENTE') estado = 'UTILIZABLE';
  else if (cobertura >= umbral.umbralLimitado) estado = 'LIMITADO';
  else estado = 'DESCARTADO';

  return {
    codigo: regla.codigo, nombre: regla.nombre, categoria: regla.categoria, ejemplo: regla.ejemplo,
    fuenteValidacion: regla.fuente_validacion, senales, estadoDatos: estado,
    coberturaPct: cobertura, muestraConDato: minimo, muestraTotal: total, faltantes,
    motivo: estado === 'UTILIZABLE'
      ? `Hay cobertura histórica suficiente para procesar esta regla como señal descriptiva (umbral ${umbral.umbralUtilizable}%).`
      : estado === 'LIMITADO'
        ? `La regla tiene datos parciales; debe mostrarse con advertencia de cobertura (umbral limitado ${umbral.umbralLimitado}%).`
        : `La cobertura está por debajo del umbral limitado de ${umbral.umbralLimitado}%.`,
    calibracion: { umbralUtilizable: umbral.umbralUtilizable, umbralLimitado: umbral.umbralLimitado, origen: umbral.origen },
  };
}

export async function analizarCompatibilidadReglas(
  fixtureId: string,
  muestra = 20,
): Promise<ResultadoCompatibilidadReglas | null> {
  const dataset = await construirDatasetAnalisis(fixtureId, muestra);
  if (!dataset) return null;
  const { rows } = await pool.query<ReglaDb>(`
    SELECT codigo, nombre, categoria, ejemplo, fuente_validacion, usa_cantidad, activa
      FROM reglas_juego
     WHERE activa = true
     ORDER BY orden, nombre`);

  const umbrales = await cargarUmbralesCalibracion();
  const reglas = rows.map((r) => evaluarRegla(r, dataset, umbralCategoria(r.categoria, umbrales)));
  return {
    fixtureId,
    fechaCorte: dataset.fechaCorte,
    partido: dataset.partido,
    resumen: {
      reglasActivas: reglas.length,
      utilizables: reglas.filter((x) => x.estadoDatos === 'UTILIZABLE').length,
      limitadas: reglas.filter((x) => x.estadoDatos === 'LIMITADO').length,
      descartadas: reglas.filter((x) => x.estadoDatos === 'DESCARTADO').length,
      noImplementadas: reglas.filter((x) => x.estadoDatos === 'NO_IMPLEMENTADO').length,
    },
    reglas,
    aviso: 'Este endpoint solo comprueba disponibilidad y cobertura de datos deportivos por regla. No devuelve probabilidades, cuotas, montos ni recomendaciones.',
  };
}
