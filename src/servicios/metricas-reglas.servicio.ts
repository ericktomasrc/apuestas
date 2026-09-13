import { construirDatasetAnalisis, type DatasetAnalisisHistorico, type ResumenEquipoHistorico } from './analisis-historico.servicio.js';
import { analizarCompatibilidadReglas, type EstadoDatosRegla } from './analisis-reglas.servicio.js';

export type ValorMetrica = number | string | null | Record<string, number | null>;

export interface MetricaTecnicaRegla {
  codigo: string;
  nombre: string;
  categoria: string;
  estadoDatos: EstadoDatosRegla;
  coberturaPct: number;
  tipoMetrica: string;
  unidad: string;
  local: ValorMetrica;
  visitante: ValorMetrica;
  contextoLocal: ValorMetrica;
  contextoVisitante: ValorMetrica;
  h2h: ValorMetrica;
  detalle: string;
}

export interface ResultadoMetricasReglas {
  fixtureId: string;
  fechaCorte: string;
  partido: DatasetAnalisisHistorico['partido'];
  calidad: DatasetAnalisisHistorico['calidad'];
  resumen: {
    reglas: number;
    conMetrica: number;
    utilizables: number;
    limitadas: number;
    descartadas: number;
  };
  metricas: MetricaTecnicaRegla[];
  aviso: string;
}

function numeroRegla(codigo: string): number | null {
  const m = /^R(\d{3})_/.exec(codigo);
  return m ? Number(m[1]) : null;
}

function balance(e: ResumenEquipoHistorico): Record<string, number | null> {
  return { victorias: e.victorias, empates: e.empates, derrotas: e.derrotas };
}

function goles(e: ResumenEquipoHistorico): Record<string, number | null> {
  return { favorPromedio: e.golesFavorPromedio, contraPromedio: e.golesContraPromedio };
}

function golesTotales(e: ResumenEquipoHistorico): number | null {
  if (e.golesFavorPromedio == null || e.golesContraPromedio == null) return null;
  return Number((e.golesFavorPromedio + e.golesContraPromedio).toFixed(2));
}

function primerTiempo(e: ResumenEquipoHistorico): Record<string, number | null> {
  return {
    favorPromedio: e.golesPrimerTiempoFavorPromedio,
    contraPromedio: e.golesPrimerTiempoContraPromedio,
  };
}

function segundoTiempo(e: ResumenEquipoHistorico): Record<string, number | null> {
  return {
    favorPromedio: e.golesSegundoTiempoFavorPromedio,
    contraPromedio: e.golesSegundoTiempoContraPromedio,
  };
}

function eventos(e: ResumenEquipoHistorico): Record<string, number | null> {
  return {
    partidosAnalizados: e.partidosAnalizados,
    partidosConCronologia: e.partidosConEventos,
  };
}

function h2hBase(d: DatasetAnalisisHistorico): Record<string, number | null> {
  return {
    partidos: d.enfrentamientosDirectos.partidos,
    ganaLocalActual: d.enfrentamientosDirectos.ganaLocalActual,
    empates: d.enfrentamientosDirectos.empates,
    ganaVisitanteActual: d.enfrentamientosDirectos.ganaVisitanteActual,
    golesPromedio: d.enfrentamientosDirectos.golesPromedio,
  };
}

function promedioCampo(e: ResumenEquipoHistorico, campo: keyof ResumenEquipoHistorico): number | null {
  const v = e[campo];
  return typeof v === 'number' ? v : null;
}

function construirMetrica(
  codigo: string,
  dataset: DatasetAnalisisHistorico,
): Omit<MetricaTecnicaRegla, 'codigo' | 'nombre' | 'categoria' | 'estadoDatos' | 'coberturaPct'> | null {
  const n = numeroRegla(codigo);
  if (!n) return null;

  const local = dataset.local;
  const visita = dataset.visitante;
  const casa = dataset.localEnCasa;
  const fuera = dataset.visitanteFuera;
  const h2h = h2hBase(dataset);

  if (n >= 1 && n <= 5) {
    return {
      tipoMetrica: 'BALANCE_RESULTADOS', unidad: 'partidos',
      local: balance(local), visitante: balance(visita), contextoLocal: balance(casa), contextoVisitante: balance(fuera), h2h,
      detalle: 'Balance histórico de victorias, empates y derrotas antes de la fecha de corte.',
    };
  }

  if (n >= 6 && n <= 13) {
    return {
      tipoMetrica: 'GOLES_POR_EQUIPO', unidad: 'goles/partido',
      local: goles(local), visitante: goles(visita), contextoLocal: goles(casa), contextoVisitante: goles(fuera), h2h,
      detalle: 'Promedios históricos de goles a favor y en contra; no evalúa una cantidad concreta.',
    };
  }

  if (n >= 14 && n <= 19) {
    return {
      tipoMetrica: 'GOLES_TOTALES', unidad: 'goles/partido',
      local: golesTotales(local), visitante: golesTotales(visita), contextoLocal: golesTotales(casa), contextoVisitante: golesTotales(fuera), h2h,
      detalle: 'Promedio descriptivo de goles totales observados en la muestra.',
    };
  }

  if (n >= 20 && n <= 24) {
    return {
      tipoMetrica: 'AMBOS_EQUIPOS', unidad: 'porcentaje histórico',
      local: local.ambosMarcanPct, visitante: visita.ambosMarcanPct,
      contextoLocal: casa.ambosMarcanPct, contextoVisitante: fuera.ambosMarcanPct,
      h2h: dataset.enfrentamientosDirectos.ambosMarcanPct,
      detalle: 'Frecuencia descriptiva de partidos de la muestra en los que ambos equipos marcaron.',
    };
  }

  if (n >= 25 && n <= 39) {
    return {
      tipoMetrica: 'RESULTADO_Y_GOLES', unidad: 'resumen histórico',
      local: { ...balance(local), golesFavorPromedio: local.golesFavorPromedio, golesContraPromedio: local.golesContraPromedio },
      visitante: { ...balance(visita), golesFavorPromedio: visita.golesFavorPromedio, golesContraPromedio: visita.golesContraPromedio },
      contextoLocal: goles(casa), contextoVisitante: goles(fuera), h2h,
      detalle: 'Combina balance de resultados y promedios de goles sin producir una predicción.',
    };
  }

  if (n >= 40 && n <= 46) {
    return {
      tipoMetrica: 'PRIMER_TIEMPO', unidad: 'goles/primer tiempo',
      local: primerTiempo(local), visitante: primerTiempo(visita), contextoLocal: primerTiempo(casa), contextoVisitante: primerTiempo(fuera), h2h: null,
      detalle: 'Promedios históricos del marcador al descanso.',
    };
  }

  if (n >= 47 && n <= 52) {
    return {
      tipoMetrica: 'SEGUNDO_TIEMPO', unidad: 'goles/segundo tiempo',
      local: segundoTiempo(local), visitante: segundoTiempo(visita), contextoLocal: segundoTiempo(casa), contextoVisitante: segundoTiempo(fuera), h2h: null,
      detalle: 'Promedios históricos del segundo tiempo obtenidos por diferencia entre marcador final y descanso.',
    };
  }

  if (n >= 53 && n <= 60) {
    return {
      tipoMetrica: 'CRONOLOGIA_EVENTOS', unidad: 'partidos con eventos',
      local: eventos(local), visitante: eventos(visita), contextoLocal: eventos(casa), contextoVisitante: eventos(fuera), h2h: null,
      detalle: 'Mide disponibilidad de cronología por minuto. Este paso no convierte los minutos de gol en una recomendación.',
    };
  }

  const campo = n >= 61 && n <= 65 ? 'tarjetasPromedio'
    : n === 66 || n === 67 ? 'rojasPromedio'
      : n >= 68 && n <= 73 ? 'cornersFavorPromedio'
        : n === 74 || n === 76 ? 'tirosPromedio'
          : n === 75 ? 'tirosArcoPromedio'
            : n === 77 ? 'posesionPromedio'
              : n === 78 ? 'faltasPromedio'
                : n === 79 ? 'fuerasJuegoPromedio'
                  : null;

  if (!campo) return null;
  const nombres: Record<string, [string, string]> = {
    tarjetasPromedio: ['TARJETAS', 'tarjetas/partido'],
    rojasPromedio: ['TARJETAS_ROJAS', 'rojas/partido'],
    cornersFavorPromedio: ['CORNERS', 'córners/partido'],
    tirosPromedio: ['TIROS', 'tiros/partido'],
    tirosArcoPromedio: ['TIROS_ARCO', 'tiros al arco/partido'],
    posesionPromedio: ['POSESION', 'porcentaje'],
    faltasPromedio: ['FALTAS', 'faltas/partido'],
    fuerasJuegoPromedio: ['FUERAS_JUEGO', 'fueras de juego/partido'],
  };
  const [tipoMetrica, unidad] = nombres[campo];
  return {
    tipoMetrica, unidad,
    local: promedioCampo(local, campo), visitante: promedioCampo(visita, campo),
    contextoLocal: promedioCampo(casa, campo), contextoVisitante: promedioCampo(fuera, campo),
    h2h: null,
    detalle: `Promedio histórico de ${unidad}. Se usa como diagnóstico descriptivo de la muestra.`,
  };
}

export async function calcularMetricasTecnicasReglas(
  fixtureId: string,
  muestra = 20,
): Promise<ResultadoMetricasReglas | null> {
  const [dataset, compatibilidad] = await Promise.all([
    construirDatasetAnalisis(fixtureId, muestra),
    analizarCompatibilidadReglas(fixtureId, muestra),
  ]);
  if (!dataset || !compatibilidad) return null;

  const metricas = compatibilidad.reglas.map((regla): MetricaTecnicaRegla => {
    const m = construirMetrica(regla.codigo, dataset);
    return {
      codigo: regla.codigo,
      nombre: regla.nombre,
      categoria: regla.categoria,
      estadoDatos: regla.estadoDatos,
      coberturaPct: regla.coberturaPct,
      tipoMetrica: m?.tipoMetrica ?? 'SIN_METRICA',
      unidad: m?.unidad ?? 'n/a',
      local: m?.local ?? null,
      visitante: m?.visitante ?? null,
      contextoLocal: m?.contextoLocal ?? null,
      contextoVisitante: m?.contextoVisitante ?? null,
      h2h: m?.h2h ?? null,
      detalle: m?.detalle ?? 'La regla todavía no tiene una métrica técnica asignada.',
    };
  });

  return {
    fixtureId,
    fechaCorte: dataset.fechaCorte,
    partido: dataset.partido,
    calidad: dataset.calidad,
    resumen: {
      reglas: metricas.length,
      conMetrica: metricas.filter((x) => x.tipoMetrica !== 'SIN_METRICA').length,
      utilizables: metricas.filter((x) => x.estadoDatos === 'UTILIZABLE').length,
      limitadas: metricas.filter((x) => x.estadoDatos === 'LIMITADO').length,
      descartadas: metricas.filter((x) => x.estadoDatos === 'DESCARTADO').length,
    },
    metricas,
    aviso: 'Métricas históricas descriptivas para control técnico del catálogo. No son probabilidades, cuotas, montos ni recomendaciones de juego.',
  };
}
