import { pool } from './../infraestructura/db.js';
import { diagnosticarDataset } from './diagnostico-dataset.servicio.js';
import { estimarObjetivosImportacionHistorica, type ObjetivoEstimacionImportacion } from './estimacion-importacion-historica.servicio.js';

export interface OpcionesPlanificacionImportacion {
  maxObjetivos?: number;
}

type Prioridad = 'CRITICA' | 'ALTA' | 'MEDIA' | 'OK';

type LigaActiva = { apiId: string; nombre: string };

const rangoPrioridad: Record<Prioridad, number> = { CRITICA: 4, ALTA: 3, MEDIA: 2, OK: 1 };
const clave = (ligaApiId: string, temporada: number) => `${ligaApiId}:${temporada}`;

const ANIO_ACTUAL = new Date().getFullYear();
const HISTORICO_DESDE = Number(process.env.HISTORICO_DESDE ?? (ANIO_ACTUAL - 3));
const HISTORICO_HASTA = Number(process.env.HISTORICO_HASTA ?? ANIO_ACTUAL);

async function ligasActivas(): Promise<LigaActiva[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT l.api_id, l.nombre
       FROM v_ligas l
       JOIN ligas bl ON bl.id = l.id
      WHERE bl.seleccionada_panel = TRUE
        AND bl.eliminado_en IS NULL
      ORDER BY l.nombre`,
  );

  return rows.map((r: any) => ({ apiId: String(r.api_id), nombre: String(r.nombre) }));
}

function objetivosDeLigasActivas(ligas: LigaActiva[]): ObjetivoEstimacionImportacion[] {
  if (
    !Number.isInteger(HISTORICO_DESDE) ||
    !Number.isInteger(HISTORICO_HASTA) ||
    HISTORICO_DESDE > HISTORICO_HASTA
  ) {
    throw new Error('Rango HISTORICO_DESDE/HISTORICO_HASTA inválido');
  }

  const salida: ObjetivoEstimacionImportacion[] = [];
  for (const liga of ligas) {
    for (let temporada = HISTORICO_DESDE; temporada <= HISTORICO_HASTA; temporada += 1) {
      salida.push({ ligaApiId: liga.apiId, temporada, liga: liga.nombre });
    }
  }
  return salida;
}

async function ultimasEjecuciones(): Promise<Map<string, number | null>> {
  const { rows } = await pool.query(
    `SELECT liga_api_id, temporada, finalizado_en
       FROM importaciones_historial_deportivo`,
  );
  const mapa = new Map<string, number | null>();
  for (const r of rows) {
    const fecha = r.finalizado_en ? new Date(r.finalizado_en).getTime() : NaN;
    mapa.set(clave(String(r.liga_api_id), Number(r.temporada)), Number.isFinite(fecha) ? fecha : null);
  }
  return mapa;
}

/**
 * Planifica únicamente sobre ligas activas del Panel Deportes.
 *
 * Reglas importantes:
 * - una liga desactivada conserva sus datos, pero deja de consumir API;
 * - una liga recién activada entra aunque todavía tenga cero histórico;
 * - una liga/temporada con histórico completo no se vuelve a llenar;
 * - se rota por la ejecución más antigua para que las mismas ligas no
 *   monopolicen todas las corridas;
 * - la cuota se reserva contra el lote actual, no contra el coste de completar
 *   todo el histórico de una sola vez.
 */
export async function planificarImportacionHistorica(
  objetivos?: ObjetivoEstimacionImportacion[],
  opciones: OpcionesPlanificacionImportacion = {},
) {
  const maxObjetivos = Math.max(1, Math.min(500, Math.trunc(opciones.maxObjetivos ?? 500)));
  const activas = await ligasActivas();
  const activasPorId = new Map(activas.map((l) => [l.apiId, l]));
  const idsActivos = new Set(activas.map((l) => l.apiId));

  const diagnostico = await diagnosticarDataset({ limite: 300 });
  const mapaDiag = new Map(
    diagnostico.items
      .filter((i: any) => idsActivos.has(String(i.ligaApiId)))
      .map((i: any) => [clave(String(i.ligaApiId), Number(i.temporada)), i]),
  );

  let candidatos: ObjetivoEstimacionImportacion[];
  if (objetivos?.length) {
    const unicos = new Map<string, ObjetivoEstimacionImportacion>();
    for (const o of objetivos) {
      const ligaApiId = String(o.ligaApiId ?? '').trim();
      const temporada = Number(o.temporada);
      if (!idsActivos.has(ligaApiId) || !Number.isInteger(temporada)) continue;
      unicos.set(clave(ligaApiId, temporada), {
        ligaApiId,
        temporada,
        liga: o.liga?.trim() || activasPorId.get(ligaApiId)?.nombre,
      });
    }
    candidatos = [...unicos.values()];
  } else {
    const unicos = new Map<string, ObjetivoEstimacionImportacion>();

    // Primero conserva los pendientes que el diagnóstico ya conoce,
    // pero exclusivamente si la liga sigue activa.
    for (const i of diagnostico.items as any[]) {
      const ligaApiId = String(i.ligaApiId);
      const temporada = Number(i.temporada);
      if (!idsActivos.has(ligaApiId) || i.prioridad === 'OK') continue;
      unicos.set(clave(ligaApiId, temporada), {
        ligaApiId,
        temporada,
        liga: i.liga || activasPorId.get(ligaApiId)?.nombre,
      });
    }

    // Después agrega todas las combinaciones activas para que una liga nueva
    // (cero filas históricas) sea visible desde su primera corrida.
    for (const o of objetivosDeLigasActivas(activas)) {
      const k = clave(String(o.ligaApiId), Number(o.temporada));
      if (!unicos.has(k)) unicos.set(k, o);
    }

    candidatos = [...unicos.values()];
  }

  if (!candidatos.length) {
    return {
      cuota: { restantes: null, limite: null, reserva: 0, disponibles: null, observadoEn: null },
      resumen: { ligasActivas: activas.length, candidatos: 0, seleccionados: 0, pospuestos: 0, llamadasPlanificadas: 0, cuotaDesconocida: true },
      seleccionados: [], pospuestos: [],
      aviso: 'No hay liga/temporada pendientes dentro de las ligas activas.',
    };
  }

  const [estimacion, ultimaEjecucion] = await Promise.all([
    estimarObjetivosImportacionHistorica(candidatos),
    ultimasEjecuciones(),
  ]);

  const items = estimacion.items
    .map((e: any) => {
      const k = clave(String(e.ligaApiId), Number(e.temporada));
      const d: any = mapaDiag.get(k);
      const sinHistorico = Number(e.partidos ?? 0) === 0;
      const nuncaProcesado = !ultimaEjecucion.has(k);
      const prioridad = (d?.prioridad ?? (sinHistorico ? 'CRITICA' : 'MEDIA')) as Prioridad;
      const puntajePrioridad = Number(d?.puntajePrioridad ?? (sinHistorico ? 100 : 50));
      const llamadasPlan = Math.max(0, Number(e.llamadas?.totalPlanActual ?? 0));
      const eficiencia = llamadasPlan > 0 ? Number((puntajePrioridad / llamadasPlan).toFixed(4)) : puntajePrioridad;
      const statsPendientes = Number(e.pendientes?.estadisticas ?? 0);
      const eventosPendientes = Number(e.pendientes?.eventos ?? 0);
      const tienePendientesDatos = statsPendientes > 0 || eventosPendientes > 0;
      const finalizadoMs = ultimaEjecucion.get(k) ?? null;

      return {
        ...e,
        prioridad,
        puntajePrioridad,
        eficiencia,
        faltantes: d?.faltantes ?? (sinHistorico ? ['SIN_HISTORICO'] : []),
        nuncaProcesado,
        finalizadoMs,
        tienePendientesDatos,
      };
    })
    .filter((x: any) => {
      if (x.prioridad === 'OK') return false;
      if (Number(x.llamadas?.totalPlanActual ?? 0) <= 0) return false;
      // Si ya se comprobó una temporada sin histórico y quedó COMPLETO,
      // no volver a consultarla en cada corrida.
      if (Number(x.partidos ?? 0) === 0 && String(x.importacionEstado ?? '') === 'COMPLETO') return false;
      return true;
    })
    .sort((a: any, b: any) => {
      // Rotación: nunca procesados primero; luego el que lleva más tiempo sin ejecutarse.
      if (a.nuncaProcesado !== b.nuncaProcesado) return a.nuncaProcesado ? -1 : 1;
      const ta = a.finalizadoMs == null ? -Infinity : Number(a.finalizadoMs);
      const tb = b.finalizadoMs == null ? -Infinity : Number(b.finalizadoMs);
      if (ta !== tb) return ta - tb;

      // A igualdad de antigüedad, primero trabajo útil sobre fixtures ya guardados.
      if (a.tienePendientesDatos !== b.tienePendientesDatos) return a.tienePendientesDatos ? -1 : 1;
      return (
        (rangoPrioridad[b.prioridad as Prioridad] - rangoPrioridad[a.prioridad as Prioridad]) ||
        (b.puntajePrioridad - a.puntajePrioridad) ||
        (b.eficiencia - a.eficiencia) ||
        (b.temporada - a.temporada) ||
        String(a.liga ?? '').localeCompare(String(b.liga ?? ''))
      );
    });

  const disponibles = estimacion.cuota.disponibles == null ? null : Number(estimacion.cuota.disponibles);
  let restante = disponibles;
  const seleccionados: any[] = [];
  const pospuestos: any[] = [];

  for (const i of items) {
    if (seleccionados.length >= maxObjetivos) {
      pospuestos.push({ ...i, motivoPlan: 'LIMITE_OBJETIVOS' });
      continue;
    }

    // El importador es incremental: para decidir si entra en esta corrida
    // importa el coste del lote actual (p.ej. 60/60), no el coste de completar
    // cientos de pendientes de una sola vez.
    const necesarias = Number(i.llamadas.totalPlanActual || 0);
    if (restante == null) {
      seleccionados.push({ ...i, motivoPlan: 'CUOTA_DESCONOCIDA_PRIORIDAD' });
      continue;
    }
    if (necesarias <= restante) {
      seleccionados.push({ ...i, motivoPlan: 'CABE_LOTE_ACTUAL' });
      restante -= necesarias;
    } else {
      pospuestos.push({ ...i, motivoPlan: 'CUOTA_INSUFICIENTE_LOTE' });
    }
  }

  const llamadasPlanificadas = seleccionados.reduce((s, x) => s + Number(x.llamadas.totalPlanActual || 0), 0);
  return {
    cuota: estimacion.cuota,
    resumen: {
      ligasActivas: activas.length,
      candidatos: items.length,
      seleccionados: seleccionados.length,
      pospuestos: pospuestos.length,
      llamadasPlanificadas,
      cuotaDesconocida: disponibles == null,
      cuotaLibreDespues: restante,
    },
    seleccionados,
    pospuestos,
    aviso: disponibles == null
      ? `Plan sobre ${activas.length} ligas activas; rotación por antigüedad y ejecución incremental.`
      : `Plan sobre ${activas.length} ligas activas; cuota reservada contra el lote incremental actual.`,
  };
}
