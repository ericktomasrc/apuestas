import { construirDatasetAnalisis } from './analisis-historico.servicio.js';
import { construirDatasetPonderado } from './ponderacion-antiguedad.servicio.js';
import type { FamiliaDatasetEspecializado } from './dataset-especializado.servicio.js';

type SeriePonderada = {
  contexto?: string;
  muestraReal?: number;
  observacionesUtiles?: number;
  coberturaPct?: number;
  metricas?: Record<string, unknown>;
  metricasPonderadas?: Record<string, number | null>;
  pesoTotal?: number;
  muestraEfectiva?: number;
};

const red = (v: number, dec = 2) => Number(v.toFixed(dec));

function numericas(obj: Record<string, unknown> | undefined) {
  const salida: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (typeof v === 'number' && Number.isFinite(v)) salida[k] = v;
  }
  return salida;
}

function compararSeries(general: SeriePonderada, especifica: SeriePonderada) {
  const g = numericas(general.metricasPonderadas);
  const e = numericas(especifica.metricasPonderadas);
  const claves = [...new Set([...Object.keys(g), ...Object.keys(e)])];
  const diferencias: Record<string, { general: number | null; contexto: number | null; diferencia: number | null }> = {};

  for (const clave of claves) {
    const vg = g[clave];
    const ve = e[clave];
    diferencias[clave] = {
      general: Number.isFinite(vg) ? vg : null,
      contexto: Number.isFinite(ve) ? ve : null,
      diferencia: Number.isFinite(vg) && Number.isFinite(ve) ? red(ve - vg) : null,
    };
  }

  return {
    muestraGeneral: general.muestraReal ?? 0,
    muestraContexto: especifica.muestraReal ?? 0,
    coberturaGeneralPct: general.coberturaPct ?? 0,
    coberturaContextoPct: especifica.coberturaPct ?? 0,
    muestraEfectivaGeneral: general.muestraEfectiva ?? 0,
    muestraEfectivaContexto: especifica.muestraEfectiva ?? 0,
    diferencias,
  };
}

export async function construirPerfilContextualLocalVisitante(
  fixtureId: string,
  familia: FamiliaDatasetEspecializado,
  muestra = 20,
  vidaMediaDias = 120,
  pesoMinimo = 0.05,
) {
  const [ponderado, base] = await Promise.all([
    construirDatasetPonderado(fixtureId, familia, muestra, vidaMediaDias, pesoMinimo),
    construirDatasetAnalisis(fixtureId, muestra),
  ]);
  if (!ponderado || !base) return null;

  const localGeneral = ponderado.series.local as SeriePonderada;
  const localCasa = ponderado.series.localEnCasa as SeriePonderada;
  const visitanteGeneral = ponderado.series.visitante as SeriePonderada;
  const visitanteFuera = ponderado.series.visitanteFuera as SeriePonderada;

  return {
    fixtureId: ponderado.fixtureId,
    fechaCorte: ponderado.fechaCorte,
    ligaApiId: ponderado.ligaApiId,
    temporada: ponderado.temporada,
    partido: ponderado.partido,
    familia,
    ponderacion: ponderado.ponderacion,
    componentes: {
      local: {
        general: localGeneral,
        enCasa: localCasa,
        comparacion: compararSeries(localGeneral, localCasa),
      },
      visitante: {
        general: visitanteGeneral,
        fuera: visitanteFuera,
        comparacion: compararSeries(visitanteGeneral, visitanteFuera),
      },
      enfrentamientosDirectos: {
        ...base.enfrentamientosDirectos,
        nota: 'Este componente se conserva separado para poder auditarlo. Resume únicamente enfrentamientos anteriores a la fecha de corte.',
      },
    },
    calidad: {
      base: base.calidad,
      coberturaFamiliaPct: ponderado.coberturaGeneralPct,
      muestras: {
        localGeneral: localGeneral.muestraReal ?? 0,
        localCasa: localCasa.muestraReal ?? 0,
        visitanteGeneral: visitanteGeneral.muestraReal ?? 0,
        visitanteFuera: visitanteFuera.muestraReal ?? 0,
        h2h: base.enfrentamientosDirectos.partidos,
      },
    },
    trazabilidad: {
      usaSoloDatosAnteriores: true,
      componentesSeparados: true,
      mezclaEnUnScore: false,
      descripcion: 'El perfil compara histórico general, local en casa, visitante fuera y H2H sin ocultar el origen de cada métrica.',
    },
    aviso: 'Comparación deportiva histórica descriptiva. No representa probabilidad, cuota, monto ni recomendación.',
  };
}
