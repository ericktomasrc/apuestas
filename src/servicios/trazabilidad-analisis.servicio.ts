import { createHash } from 'node:crypto';
import { construirDatasetEspecializado, type FamiliaDatasetEspecializado } from './dataset-especializado.servicio.js';
import { listarCalibracionReglasActiva } from './calibracion-reglas.servicio.js';
import { crearIdentidadAnalisis } from './versionado-analisis.servicio.js';

export type EstadoIntegridadTemporal = 'OK' | 'REVISAR';

type Observacion = {
  fixtureId?: string;
  fecha?: string;
  condicion?: string;
  rivalApiId?: string;
  rival?: string;
  valores?: Record<string, unknown>;
};

type Serie = {
  equipoApiId?: string;
  nombre?: string;
  contexto?: string;
  muestraSolicitada?: number;
  muestraReal?: number;
  observacionesUtiles?: number;
  coberturaPct?: number;
  observaciones?: Observacion[];
};

type FuenteCampo = {
  tabla: string;
  columnas: string[];
  transformacion?: string;
};

const VERSION_TRAZABILIDAD = 'PASO36_TRAZABILIDAD_V1';

const FUENTES_POR_FAMILIA: Record<FamiliaDatasetEspecializado, Record<string, FuenteCampo>> = {
  RESULTADO: {
    resultado: { tabla: 'partidos_historial_deportivo', columnas: ['goles_local', 'goles_visitante'], transformacion: 'Resultado desde la perspectiva del equipo.' },
    golesFavor: { tabla: 'partidos_historial_deportivo', columnas: ['goles_local', 'goles_visitante'], transformacion: 'Marcador final ajustado a local/visitante.' },
    golesContra: { tabla: 'partidos_historial_deportivo', columnas: ['goles_local', 'goles_visitante'], transformacion: 'Marcador final ajustado a local/visitante.' },
  },
  GOLES: {
    golesFavor: { tabla: 'partidos_historial_deportivo', columnas: ['goles_local', 'goles_visitante'] },
    golesContra: { tabla: 'partidos_historial_deportivo', columnas: ['goles_local', 'goles_visitante'] },
    total: { tabla: 'partidos_historial_deportivo', columnas: ['goles_local', 'goles_visitante'], transformacion: 'Suma del marcador final.' },
    ambosMarcan: { tabla: 'partidos_historial_deportivo', columnas: ['goles_local', 'goles_visitante'], transformacion: 'Booleano derivado de ambos marcadores > 0.' },
  },
  TIEMPOS: {
    primerTiempoFavor: { tabla: 'partidos_historial_deportivo', columnas: ['goles_descanso_local', 'goles_descanso_visitante'] },
    primerTiempoContra: { tabla: 'partidos_historial_deportivo', columnas: ['goles_descanso_local', 'goles_descanso_visitante'] },
    segundoTiempoFavor: { tabla: 'partidos_historial_deportivo', columnas: ['goles_local', 'goles_visitante', 'goles_descanso_local', 'goles_descanso_visitante'], transformacion: 'Marcador final menos marcador al descanso.' },
    segundoTiempoContra: { tabla: 'partidos_historial_deportivo', columnas: ['goles_local', 'goles_visitante', 'goles_descanso_local', 'goles_descanso_visitante'], transformacion: 'Marcador final menos marcador al descanso.' },
  },
  CORNERS: {
    favor: { tabla: 'estadisticas_partido_deportivo', columnas: ['corners'] },
    contra: { tabla: 'estadisticas_partido_deportivo', columnas: ['corners'] },
    total: { tabla: 'estadisticas_partido_deportivo', columnas: ['corners'], transformacion: 'Suma de corners de ambos equipos.' },
  },
  TARJETAS: {
    amarillasFavor: { tabla: 'estadisticas_partido_deportivo', columnas: ['amarillas'] },
    amarillasContra: { tabla: 'estadisticas_partido_deportivo', columnas: ['amarillas'] },
    rojasFavor: { tabla: 'estadisticas_partido_deportivo', columnas: ['rojas'] },
    rojasContra: { tabla: 'estadisticas_partido_deportivo', columnas: ['rojas'] },
  },
  TIROS: {
    tirosFavor: { tabla: 'estadisticas_partido_deportivo', columnas: ['tiros'] },
    tirosContra: { tabla: 'estadisticas_partido_deportivo', columnas: ['tiros'] },
    arcoFavor: { tabla: 'estadisticas_partido_deportivo', columnas: ['tiros_arco'] },
    arcoContra: { tabla: 'estadisticas_partido_deportivo', columnas: ['tiros_arco'] },
    fueraFavor: { tabla: 'estadisticas_partido_deportivo', columnas: ['tiros_fuera'] },
    bloqueadosFavor: { tabla: 'estadisticas_partido_deportivo', columnas: ['tiros_bloqueados'] },
  },
  POSESION: {
    posesionFavor: { tabla: 'estadisticas_partido_deportivo', columnas: ['posesion'] },
    posesionContra: { tabla: 'estadisticas_partido_deportivo', columnas: ['posesion'] },
    pasesFavor: { tabla: 'estadisticas_partido_deportivo', columnas: ['pases'] },
    pasesCorrectosFavor: { tabla: 'estadisticas_partido_deportivo', columnas: ['pases_correctos'] },
    precisionPasesFavor: { tabla: 'estadisticas_partido_deportivo', columnas: ['precision_pases'] },
  },
  DISCIPLINA: {
    faltasFavor: { tabla: 'estadisticas_partido_deportivo', columnas: ['faltas'] },
    faltasContra: { tabla: 'estadisticas_partido_deportivo', columnas: ['faltas'] },
    fuerasJuegoFavor: { tabla: 'estadisticas_partido_deportivo', columnas: ['fueras_juego'] },
    fuerasJuegoContra: { tabla: 'estadisticas_partido_deportivo', columnas: ['fueras_juego'] },
    atajadasFavor: { tabla: 'estadisticas_partido_deportivo', columnas: ['atajadas'] },
  },
  EVENTOS: {
    eventosCompletos: { tabla: 'partidos_historial_deportivo', columnas: ['eventos_completos'] },
    eventosFavor: { tabla: 'eventos_partido_deportivo', columnas: ['fixture_api_id', 'equipo_api_id'], transformacion: 'Conteo de eventos del equipo.' },
    eventosContra: { tabla: 'eventos_partido_deportivo', columnas: ['fixture_api_id', 'equipo_api_id'], transformacion: 'Conteo de eventos del rival.' },
    golesEventoFavor: { tabla: 'eventos_partido_deportivo', columnas: ['tipo', 'equipo_api_id'], transformacion: 'Conteo de eventos cuyo tipo contiene goal.' },
    golesEventoContra: { tabla: 'eventos_partido_deportivo', columnas: ['tipo', 'equipo_api_id'], transformacion: 'Conteo de eventos cuyo tipo contiene goal.' },
    tarjetasEventoFavor: { tabla: 'eventos_partido_deportivo', columnas: ['tipo', 'equipo_api_id'], transformacion: 'Conteo de eventos cuyo tipo contiene card.' },
    tarjetasEventoContra: { tabla: 'eventos_partido_deportivo', columnas: ['tipo', 'equipo_api_id'], transformacion: 'Conteo de eventos cuyo tipo contiene card.' },
  },
};

function estable(valor: unknown): string {
  if (valor === null || valor === undefined) return String(valor);
  if (typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`;
  const obj = valor as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${estable(obj[k])}`).join(',')}}`;
}

function huella(valor: unknown): string {
  return createHash('sha256').update(estable(valor)).digest('hex').slice(0, 24);
}

function resumirSerie(serie: Serie, familia: FamiliaDatasetEspecializado, fechaCorte: string) {
  const observaciones = Array.isArray(serie.observaciones) ? serie.observaciones : [];
  const camposEsperados = Object.keys(FUENTES_POR_FAMILIA[familia]);
  const usados = new Map<string, number>();
  const descartados = new Map<string, number>();
  const partidos = new Map<string, { fixtureId: string; fecha: string | null; rivalApiId: string | null; rival: string | null; condicion: string | null }>();
  const violacionesTemporales: Array<{ fixtureId: string | null; fecha: string | null }> = [];
  const corteMs = new Date(fechaCorte).getTime();

  for (const o of observaciones) {
    const valores = o.valores ?? {};
    const fixtureId = o.fixtureId ? String(o.fixtureId) : null;
    const fecha = o.fecha ? String(o.fecha) : null;
    if (fixtureId && !partidos.has(fixtureId)) {
      partidos.set(fixtureId, {
        fixtureId,
        fecha,
        rivalApiId: o.rivalApiId ? String(o.rivalApiId) : null,
        rival: o.rival ? String(o.rival) : null,
        condicion: o.condicion ? String(o.condicion) : null,
      });
    }
    if (fecha) {
      const t = new Date(fecha).getTime();
      if (Number.isFinite(t) && Number.isFinite(corteMs) && t >= corteMs) {
        violacionesTemporales.push({ fixtureId, fecha });
      }
    }
    for (const campo of camposEsperados) {
      const v = valores[campo];
      if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) {
        descartados.set(campo, (descartados.get(campo) ?? 0) + 1);
      } else {
        usados.set(campo, (usados.get(campo) ?? 0) + 1);
      }
    }
  }

  return {
    equipoApiId: serie.equipoApiId ?? null,
    equipo: serie.nombre ?? null,
    contexto: serie.contexto ?? null,
    muestraSolicitada: Number(serie.muestraSolicitada ?? 0),
    muestraReal: Number(serie.muestraReal ?? observaciones.length),
    observacionesUtiles: Number(serie.observacionesUtiles ?? 0),
    coberturaPct: Number(serie.coberturaPct ?? 0),
    partidosHistoricos: [...partidos.values()],
    campos: camposEsperados.map((campo) => ({
      campo,
      fuente: FUENTES_POR_FAMILIA[familia][campo],
      valoresUsados: usados.get(campo) ?? 0,
      valoresDescartados: descartados.get(campo) ?? 0,
      motivoDescarte: 'Valor nulo, ausente o numérico no finito.',
    })),
    integridadTemporal: {
      estado: (violacionesTemporales.length === 0 ? 'OK' : 'REVISAR') as EstadoIntegridadTemporal,
      regla: 'Toda observación histórica debe tener fecha estrictamente anterior a fechaCorte.',
      violaciones: violacionesTemporales,
    },
  };
}

export async function construirTrazabilidadAnalisis(
  fixtureId: string,
  familia: FamiliaDatasetEspecializado,
  muestra = 20,
) {
  const dataset = await construirDatasetEspecializado(fixtureId, familia, muestra);
  if (!dataset) return null;

  const calibracion = await listarCalibracionReglasActiva();
  const categorias = Array.isArray(calibracion?.categorias) ? calibracion.categorias : [];
  const calibracionResumida = {
    defaults: calibracion?.defaults ?? null,
    categorias: categorias.map((c: any) => ({
      categoria: c.categoria,
      umbralUtilizable: c.umbralUtilizable,
      umbralLimitado: c.umbralLimitado,
      origen: c.origen,
      actualizadoEn: c.actualizadoEn,
    })),
  };
  const huellaCalibracion = huella(calibracionResumida);
  const identidadAnalisis = crearIdentidadAnalisis({ fixtureId, familia, muestra, fechaCorte: dataset.fechaCorte }, huellaCalibracion);

  const s: any = dataset.series;
  const series = {
    localGeneral: resumirSerie(s.local, familia, dataset.fechaCorte),
    localEnCasa: resumirSerie(s.localEnCasa, familia, dataset.fechaCorte),
    visitanteGeneral: resumirSerie(s.visitante, familia, dataset.fechaCorte),
    visitanteFuera: resumirSerie(s.visitanteFuera, familia, dataset.fechaCorte),
  };

  const todas = Object.values(series);
  const idsUnicos = [...new Set(todas.flatMap((x) => x.partidosHistoricos.map((p) => p.fixtureId)))];
  const violaciones = todas.reduce((suma, x) => suma + x.integridadTemporal.violaciones.length, 0);

  return {
    generadoEn: new Date().toISOString(),
    versionTrazabilidad: VERSION_TRAZABILIDAD,
    versionado: identidadAnalisis,
    fixtureId: dataset.fixtureId,
    familia,
    muestra,
    fechaCorte: dataset.fechaCorte,
    objetivo: {
      origenObjetivo: dataset.origenObjetivo,
      ligaApiId: dataset.ligaApiId,
      temporada: dataset.temporada,
      partido: dataset.partido,
    },
    fuentes: {
      tablas: [...new Set(Object.values(FUENTES_POR_FAMILIA[familia]).map((f) => f.tabla))],
      camposFamilia: FUENTES_POR_FAMILIA[familia],
      politicaTemporal: 'Solo se admiten observaciones con fecha < fechaCorte.',
    },
    dataset: {
      coberturaGeneralPct: dataset.coberturaGeneralPct,
      datosRequeridos: dataset.datosRequeridos,
      partidosHistoricosUnicos: idsUnicos.length,
      series,
    },
    calibracionActiva: {
      huella: huellaCalibracion,
      ...calibracionResumida,
      nota: 'La huella identifica la configuración de umbrales observada al generar esta trazabilidad.',
    },
    integridad: {
      temporal: violaciones === 0 ? 'OK' : 'REVISAR',
      violacionesTemporales: violaciones,
      huellaTrazabilidad: huella({ fixtureId: dataset.fixtureId, familia, muestra, fechaCorte: dataset.fechaCorte, idsUnicos, calibracion: huellaCalibracion }),
    },
    aviso: 'Trazabilidad técnica del origen y suficiencia de los datos históricos. No representa probabilidad, pronóstico ni recomendación deportiva.',
  };
}
