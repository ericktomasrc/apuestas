import { construirDatasetEspecializado, type FamiliaDatasetEspecializado } from './dataset-especializado.servicio.js';

type Observacion = { fecha: string; valores: Record<string, unknown> };
type Serie = { observaciones: Observacion[]; [k: string]: unknown };

const red = (v: number, dec = 3) => Number(v.toFixed(dec));

export type ConfigPonderacionAntiguedad = {
  vidaMediaDias: number;
  pesoMinimo: number;
};

function pesoPorEdad(fecha: string, fechaCorte: string, cfg: ConfigPonderacionAntiguedad) {
  const dias = Math.max(0, (new Date(fechaCorte).getTime() - new Date(fecha).getTime()) / 86_400_000);
  const peso = Math.pow(0.5, dias / cfg.vidaMediaDias);
  return { diasAntiguedad: red(dias, 1), peso: red(Math.max(cfg.pesoMinimo, peso), 4) };
}

function resumenPonderado(serie: Serie, fechaCorte: string, cfg: ConfigPonderacionAntiguedad) {
  const observaciones = (serie.observaciones || []).map((o) => ({
    ...o,
    ponderacion: pesoPorEdad(o.fecha, fechaCorte, cfg),
  }));

  const claves = [...new Set(observaciones.flatMap((o) => Object.keys(o.valores || {})))];
  const metricasPonderadas: Record<string, number | null> = {};

  for (const clave of claves) {
    let suma = 0;
    let pesos = 0;
    for (const o of observaciones) {
      const valor = o.valores?.[clave];
      if (typeof valor !== 'number' || !Number.isFinite(valor)) continue;
      suma += valor * o.ponderacion.peso;
      pesos += o.ponderacion.peso;
    }
    metricasPonderadas[`${clave}PromedioPonderado`] = pesos > 0 ? red(suma / pesos, 2) : null;
  }

  const resultados = observaciones.filter((o) => ['V','E','D'].includes(String(o.valores?.resultado)));
  if (resultados.length) {
    let puntos = 0, pesos = 0;
    for (const o of resultados) {
      const r = String(o.valores.resultado);
      const p = o.ponderacion.peso;
      puntos += (r === 'V' ? 3 : r === 'E' ? 1 : 0) * p;
      pesos += p;
    }
    metricasPonderadas.puntosPromedioPonderado = pesos > 0 ? red(puntos / pesos, 2) : null;
  }

  const booleanos = claves.filter((k) => observaciones.some((o) => typeof o.valores?.[k] === 'boolean'));
  for (const clave of booleanos) {
    let positivos = 0, pesos = 0;
    for (const o of observaciones) {
      const valor = o.valores?.[clave];
      if (typeof valor !== 'boolean') continue;
      const p = o.ponderacion.peso;
      if (valor) positivos += p;
      pesos += p;
    }
    metricasPonderadas[`${clave}PctPonderado`] = pesos > 0 ? red(positivos * 100 / pesos, 1) : null;
  }

  const sumaPesos = observaciones.reduce((s, o) => s + o.ponderacion.peso, 0);
  return {
    ...serie,
    pesoTotal: red(sumaPesos, 3),
    muestraEfectiva: red(sumaPesos, 2),
    metricasPonderadas,
    observaciones,
  };
}

export async function construirDatasetPonderado(
  fixtureId: string,
  familia: FamiliaDatasetEspecializado,
  muestra = 20,
  vidaMediaDias = 120,
  pesoMinimo = 0.05,
) {
  const dataset = await construirDatasetEspecializado(fixtureId, familia, muestra);
  if (!dataset) return null;

  const cfg: ConfigPonderacionAntiguedad = {
    vidaMediaDias: Math.max(14, Math.min(730, vidaMediaDias)),
    pesoMinimo: Math.max(0, Math.min(0.5, pesoMinimo)),
  };

  return {
    ...dataset,
    ponderacion: {
      metodo: 'DECAIMIENTO_EXPONENCIAL',
      vidaMediaDias: cfg.vidaMediaDias,
      pesoMinimo: cfg.pesoMinimo,
      descripcion: `Cada ${cfg.vidaMediaDias} días el peso relativo se reduce a la mitad, respetando un peso mínimo de ${cfg.pesoMinimo}.`,
    },
    series: {
      local: resumenPonderado(dataset.series.local as Serie, dataset.fechaCorte, cfg),
      visitante: resumenPonderado(dataset.series.visitante as Serie, dataset.fechaCorte, cfg),
      localEnCasa: resumenPonderado(dataset.series.localEnCasa as Serie, dataset.fechaCorte, cfg),
      visitanteFuera: resumenPonderado(dataset.series.visitanteFuera as Serie, dataset.fechaCorte, cfg),
    },
    aviso: 'Ponderación temporal descriptiva: los partidos recientes pesan más que los antiguos. No representa probabilidad ni recomendación.',
  };
}
