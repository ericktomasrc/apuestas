import {
  construirDatasetAnalisis,
  type DatasetAnalisisHistorico,
  type ResumenEquipoHistorico,
} from './analisis-historico.servicio.js';

/**
 * PASO 3 — motor de dificultad/confianza.
 *
 * IMPORTANTE:
 * - NO calcula cuotas.
 * - NO recomienda apuestas.
 * - NO calcula montos ni premios.
 * - `confianza` describe CALIDAD DEL DATO, no probabilidad de que ocurra algo.
 * - `dificultad` describe qué tan difícil es sacar una conclusión estable con
 *   el histórico disponible: 0 = datos muy consistentes, 100 = datos muy
 *   contradictorios o incompletos.
 */

export type NivelDificultad = 'BAJA' | 'MEDIA' | 'ALTA' | 'MUY_ALTA';
export type EstadoDato = 'UTILIZABLE' | 'LIMITADO' | 'DESCARTADO';

export interface DiagnosticoCondicion {
  clave: string;
  nombre: string;
  categoria: 'RESULTADO' | 'GOLES' | 'AMBOS_MARCAN' | 'CORNERS' | 'TARJETAS' | 'TIROS';
  dificultad: number;
  nivel: NivelDificultad;
  confianzaDatos: number;
  estadoDato: EstadoDato;
  muestra: number;
  cobertura: number;
  consistencia: number;
  indicadores: Record<string, number | null>;
  explicacion: string;
}

export interface ResultadoMotorDificultad {
  fixtureId: string;
  fechaCorte: string;
  partido: DatasetAnalisisHistorico['partido'];
  calidadGeneral: DatasetAnalisisHistorico['calidad'];
  resumen: {
    condicionesAnalizadas: number;
    utilizables: number;
    limitadas: number;
    descartadas: number;
    confianzaDatosGeneral: number;
  };
  condiciones: DiagnosticoCondicion[];
  aviso: string;
}

const limitar = (v: number, min = 0, max = 100): number => Math.max(min, Math.min(max, v));
const red = (v: number, dec = 1): number => Number(v.toFixed(dec));
const promedio = (...valores: Array<number | null | undefined>): number | null => {
  const xs = valores.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

function nivel(d: number): NivelDificultad {
  if (d < 30) return 'BAJA';
  if (d < 55) return 'MEDIA';
  if (d < 75) return 'ALTA';
  return 'MUY_ALTA';
}

function confianzaBase(dataset: DatasetAnalisisHistorico, requiereStats: boolean): number {
  const muestra = dataset.calidad.coberturaPartidosPct;
  const stats = dataset.calidad.coberturaEstadisticasPct;
  const h2h = limitar(dataset.enfrentamientosDirectos.partidos * 10);
  // Confianza = calidad/volumen del dato, nunca probabilidad deportiva.
  const valor = requiereStats
    ? muestra * 0.45 + stats * 0.45 + h2h * 0.10
    : muestra * 0.75 + h2h * 0.25;
  return red(limitar(valor));
}

function estadoDato(confianza: number, muestra: number): EstadoDato {
  if (muestra < 6 || confianza < 35) return 'DESCARTADO';
  if (confianza < 65) return 'LIMITADO';
  return 'UTILIZABLE';
}

function consistenciaEntre(a: number | null, b: number | null, escala = 100): number {
  if (a === null || b === null) return 0;
  const diferencia = Math.abs(a - b);
  return red(limitar(100 - (diferencia / escala) * 100));
}

function dificultadDesde(consistencia: number, confianza: number): number {
  // A mayor contradicción y menor calidad del dato, mayor dificultad de análisis.
  return red(limitar((100 - consistencia) * 0.62 + (100 - confianza) * 0.38));
}

function muestraMin(a: ResumenEquipoHistorico, b: ResumenEquipoHistorico): number {
  return Math.min(a.partidosAnalizados, b.partidosAnalizados);
}

function diagnosticoResultado(
  dataset: DatasetAnalisisHistorico,
  clave: 'RESULTADO_LOCAL' | 'RESULTADO_EMPATE' | 'RESULTADO_VISITANTE',
): DiagnosticoCondicion {
  const l = dataset.localEnCasa.partidosAnalizados ? dataset.localEnCasa : dataset.local;
  const v = dataset.visitanteFuera.partidosAnalizados ? dataset.visitanteFuera : dataset.visitante;
  const muestra = muestraMin(l, v);
  const conf = confianzaBase(dataset, false);

  const tasa = (x: number, total: number) => total ? x * 100 / total : null;
  let a: number | null;
  let b: number | null;
  let nombre: string;

  if (clave === 'RESULTADO_LOCAL') {
    a = tasa(l.victorias, l.partidosAnalizados);
    b = tasa(v.derrotas, v.partidosAnalizados);
    nombre = 'Comportamiento histórico favorable al local';
  } else if (clave === 'RESULTADO_VISITANTE') {
    a = tasa(v.victorias, v.partidosAnalizados);
    b = tasa(l.derrotas, l.partidosAnalizados);
    nombre = 'Comportamiento histórico favorable al visitante';
  } else {
    a = tasa(l.empates, l.partidosAnalizados);
    b = tasa(v.empates, v.partidosAnalizados);
    nombre = 'Comportamiento histórico de empate';
  }

  const cons = consistenciaEntre(a, b, 100);
  const dif = dificultadDesde(cons, conf);
  const estado = estadoDato(conf, muestra);
  return {
    clave,
    nombre,
    categoria: 'RESULTADO',
    dificultad: estado === 'DESCARTADO' ? Math.max(dif, 80) : dif,
    nivel: nivel(estado === 'DESCARTADO' ? Math.max(dif, 80) : dif),
    confianzaDatos: conf,
    estadoDato: estado,
    muestra,
    cobertura: dataset.calidad.coberturaPartidosPct,
    consistencia: cons,
    indicadores: { indicadorLocalPct: a === null ? null : red(a), indicadorVisitantePct: b === null ? null : red(b) },
    explicacion: estado === 'DESCARTADO'
      ? 'No hay una muestra histórica suficiente para comparar ambos perfiles con estabilidad.'
      : `La dificultad refleja cuánto coinciden los perfiles históricos de ambos equipos; la confianza (${conf}%) mide solo calidad y volumen de datos.`,
  };
}

function diagnosticoPorcentaje(
  dataset: DatasetAnalisisHistorico,
  cfg: {
    clave: string;
    nombre: string;
    categoria: DiagnosticoCondicion['categoria'];
    local: number | null;
    visitante: number | null;
    requiereStats?: boolean;
    cobertura?: number;
  },
): DiagnosticoCondicion {
  const muestra = Math.min(dataset.local.partidosAnalizados, dataset.visitante.partidosAnalizados);
  const conf = confianzaBase(dataset, Boolean(cfg.requiereStats));
  const cons = consistenciaEntre(cfg.local, cfg.visitante, 100);
  let dif = dificultadDesde(cons, conf);
  const estado = estadoDato(conf, muestra);
  if (estado === 'DESCARTADO') dif = Math.max(dif, 80);
  return {
    clave: cfg.clave,
    nombre: cfg.nombre,
    categoria: cfg.categoria,
    dificultad: red(dif),
    nivel: nivel(dif),
    confianzaDatos: conf,
    estadoDato: estado,
    muestra,
    cobertura: cfg.cobertura ?? (cfg.requiereStats ? dataset.calidad.coberturaEstadisticasPct : dataset.calidad.coberturaPartidosPct),
    consistencia: cons,
    indicadores: { local: cfg.local, visitante: cfg.visitante },
    explicacion: estado === 'DESCARTADO'
      ? 'Condición descartada para análisis automático porque la cobertura o la muestra son insuficientes.'
      : `Los dos historiales tienen una consistencia de ${cons}%. La confianza (${conf}%) representa únicamente suficiencia de datos.`,
  };
}

function diagnosticoPromedio(
  dataset: DatasetAnalisisHistorico,
  cfg: {
    clave: string;
    nombre: string;
    categoria: DiagnosticoCondicion['categoria'];
    local: number | null;
    visitante: number | null;
    escala: number;
  },
): DiagnosticoCondicion {
  const muestra = Math.min(dataset.local.partidosAnalizados, dataset.visitante.partidosAnalizados);
  const conf = confianzaBase(dataset, true);
  const cons = consistenciaEntre(cfg.local, cfg.visitante, cfg.escala);
  let dif = dificultadDesde(cons, conf);
  const estado = estadoDato(conf, muestra);
  if (estado === 'DESCARTADO') dif = Math.max(dif, 80);
  return {
    clave: cfg.clave,
    nombre: cfg.nombre,
    categoria: cfg.categoria,
    dificultad: red(dif),
    nivel: nivel(dif),
    confianzaDatos: conf,
    estadoDato: estado,
    muestra,
    cobertura: dataset.calidad.coberturaEstadisticasPct,
    consistencia: cons,
    indicadores: { promedioLocal: cfg.local, promedioVisitante: cfg.visitante },
    explicacion: estado === 'DESCARTADO'
      ? 'No se usa automáticamente porque faltan estadísticas suficientes en el histórico.'
      : `La dificultad aumenta cuando los promedios históricos son contradictorios o la cobertura estadística es baja.`,
  };
}

export function evaluarDataset(dataset: DatasetAnalisisHistorico): ResultadoMotorDificultad {
  const condiciones: DiagnosticoCondicion[] = [
    diagnosticoResultado(dataset, 'RESULTADO_LOCAL'),
    diagnosticoResultado(dataset, 'RESULTADO_EMPATE'),
    diagnosticoResultado(dataset, 'RESULTADO_VISITANTE'),
    diagnosticoPorcentaje(dataset, {
      clave: 'MAS_1_5_GOLES', nombre: 'Histórico de 2+ goles', categoria: 'GOLES',
      local: dataset.local.mas15GolesPct, visitante: dataset.visitante.mas15GolesPct,
    }),
    diagnosticoPorcentaje(dataset, {
      clave: 'MAS_2_5_GOLES', nombre: 'Histórico de 3+ goles', categoria: 'GOLES',
      local: dataset.local.mas25GolesPct, visitante: dataset.visitante.mas25GolesPct,
    }),
    diagnosticoPorcentaje(dataset, {
      clave: 'MAS_3_5_GOLES', nombre: 'Histórico de 4+ goles', categoria: 'GOLES',
      local: dataset.local.mas35GolesPct, visitante: dataset.visitante.mas35GolesPct,
    }),
    diagnosticoPorcentaje(dataset, {
      clave: 'AMBOS_MARCAN', nombre: 'Histórico de ambos equipos marcando', categoria: 'AMBOS_MARCAN',
      local: dataset.local.ambosMarcanPct, visitante: dataset.visitante.ambosMarcanPct,
    }),
    diagnosticoPromedio(dataset, {
      clave: 'CORNERS', nombre: 'Consistencia histórica de córners', categoria: 'CORNERS',
      local: dataset.local.cornersTotalesPromedio, visitante: dataset.visitante.cornersTotalesPromedio, escala: 12,
    }),
    diagnosticoPromedio(dataset, {
      clave: 'TARJETAS', nombre: 'Consistencia histórica de tarjetas', categoria: 'TARJETAS',
      local: dataset.local.tarjetasPromedio, visitante: dataset.visitante.tarjetasPromedio, escala: 8,
    }),
    diagnosticoPromedio(dataset, {
      clave: 'TIROS', nombre: 'Consistencia histórica de tiros', categoria: 'TIROS',
      local: dataset.local.tirosPromedio, visitante: dataset.visitante.tirosPromedio, escala: 25,
    }),
    diagnosticoPromedio(dataset, {
      clave: 'TIROS_ARCO', nombre: 'Consistencia histórica de tiros al arco', categoria: 'TIROS',
      local: dataset.local.tirosArcoPromedio, visitante: dataset.visitante.tirosArcoPromedio, escala: 12,
    }),
  ];

  const utilizables = condiciones.filter((x) => x.estadoDato === 'UTILIZABLE').length;
  const limitadas = condiciones.filter((x) => x.estadoDato === 'LIMITADO').length;
  const descartadas = condiciones.filter((x) => x.estadoDato === 'DESCARTADO').length;
  const confianza = promedio(...condiciones.map((x) => x.confianzaDatos)) ?? 0;

  return {
    fixtureId: dataset.fixtureId,
    fechaCorte: dataset.fechaCorte,
    partido: dataset.partido,
    calidadGeneral: dataset.calidad,
    resumen: {
      condicionesAnalizadas: condiciones.length,
      utilizables,
      limitadas,
      descartadas,
      confianzaDatosGeneral: red(confianza),
    },
    condiciones,
    aviso: 'Dificultad = estabilidad del análisis histórico. Confianza = calidad/cobertura del dato. Ninguno de los dos valores es una probabilidad deportiva ni una recomendación.',
  };
}

export async function analizarDificultadHistorica(
  fixtureId: string,
  muestra = 20,
): Promise<ResultadoMotorDificultad | null> {
  const dataset = await construirDatasetAnalisis(fixtureId, muestra);
  return dataset ? evaluarDataset(dataset) : null;
}
