import { pool } from '../infraestructura/db.js';

export type ObjetivoEstimacionImportacion = {
  ligaApiId: string;
  temporada: number;
  liga?: string;
};

export type OpcionesEstimacionImportacion = {
  refrescarFixtures?: boolean;
  reintentarParciales?: boolean;
  coberturaDias?: number;
  reservaCuota?: number;
  maxStats?: number;
  maxEventos?: number;
};

type CoberturaFila = {
  fixtures_estadisticas: boolean | null;
  fixtures_eventos: boolean | null;
  consultado_en: Date | string | null;
};

function vigente(fecha: Date | string | null | undefined, dias: number): boolean {
  if (!fecha) return false;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() <= dias * 86_400_000;
}

function n(v: unknown): number { return Math.max(0, Number(v ?? 0) || 0); }

export async function estimarObjetivosImportacionHistorica(
  objetivos: ObjetivoEstimacionImportacion[],
  opciones: OpcionesEstimacionImportacion = {},
) {
  const coberturaDias = Math.max(1, opciones.coberturaDias ?? Number(process.env.HISTORICO_COBERTURA_DIAS ?? 30));
  const reservaCuota = Math.max(0, opciones.reservaCuota ?? Number(process.env.HISTORICO_RESERVA_CUOTA ?? 10));
  const refrescarFixtures = opciones.refrescarFixtures ?? /^(1|true|si|sí)$/i.test(process.env.HISTORICO_REFRESCAR_FIXTURES ?? 'false');
  const reintentarParciales = opciones.reintentarParciales ?? /^(1|true|si|sí)$/i.test(process.env.HISTORICO_REINTENTAR_PARCIALES ?? 'false');
  const maxStats = Math.max(0, opciones.maxStats ?? Number(process.env.HISTORICO_MAX_STATS ?? 60));
  const maxEventos = Math.max(0, opciones.maxEventos ?? Number(process.env.HISTORICO_MAX_EVENTOS ?? 60));

  const { rows: cuotaRows } = await pool.query(
    `SELECT restantes, limite, solicitado_en
       FROM consumo_api_football
      WHERE restantes IS NOT NULL
      ORDER BY solicitado_en DESC LIMIT 1`,
  ).catch(() => ({ rows: [] as any[] }));
  const cuotaFila = cuotaRows[0] ?? null;
  const restantes = cuotaFila?.restantes == null ? null : Number(cuotaFila.restantes);
  const limite = cuotaFila?.limite == null ? null : Number(cuotaFila.limite);
  const disponibles = restantes == null ? null : Math.max(0, restantes - reservaCuota);

  const unicos = new Map<string, ObjetivoEstimacionImportacion>();
  for (const o of objetivos) {
    if (!o?.ligaApiId || !Number.isInteger(Number(o.temporada))) continue;
    unicos.set(`${o.ligaApiId}:${Number(o.temporada)}`, { ...o, temporada: Number(o.temporada) });
  }

  const items = [] as any[];
  for (const o of unicos.values()) {
    const [estadoQ, coberturaQ, importacionQ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS partidos,
                COUNT(*) FILTER (WHERE NOT COALESCE(p.estadisticas_completas,false))::int AS stats_pendientes,
                COUNT(*) FILTER (WHERE NOT COALESCE(p.eventos_completos,false))::int AS eventos_pendientes,
                COUNT(*) FILTER (
                  WHERE EXISTS (
                    SELECT 1 FROM estadisticas_partido_deportivo e
                     WHERE e.fixture_api_id=p.fixture_api_id
                       AND (e.tiros IS NULL OR e.tiros_arco IS NULL OR e.corners IS NULL OR
                            e.amarillas IS NULL OR e.rojas IS NULL OR e.posesion IS NULL OR
                            e.faltas IS NULL OR e.fueras_juego IS NULL)
                  )
                )::int AS stats_parciales
           FROM partidos_historial_deportivo p
          WHERE p.liga_api_id=$1 AND p.temporada=$2
            AND p.estado IN ('FT','AET','PEN')`,
        [o.ligaApiId, o.temporada],
      ),
      pool.query(
        `SELECT fixtures_estadisticas, fixtures_eventos, consultado_en
           FROM cobertura_liga_temporada
          WHERE liga_api_id=$1 AND temporada=$2`,
        [o.ligaApiId, o.temporada],
      ),
      pool.query(
        `SELECT estado FROM importaciones_historial_deportivo
          WHERE liga_api_id=$1 AND temporada=$2`,
        [o.ligaApiId, o.temporada],
      ),
    ]);

    const e = estadoQ.rows[0] ?? {};
    const c = (coberturaQ.rows[0] ?? null) as CoberturaFila | null;
    const partidos = n(e.partidos);
    const statsPendientesBase = n(e.stats_pendientes);
    const statsParciales = n(e.stats_parciales);
    const eventosPendientesBase = n(e.eventos_pendientes);
    const coberturaVigente = vigente(c?.consultado_en, coberturaDias);
    const coberturaStats = c?.fixtures_estadisticas === false ? false : true;
    const coberturaEventos = c?.fixtures_eventos === false ? false : true;
    const importacionEstado = importacionQ.rows[0]?.estado ? String(importacionQ.rows[0].estado) : null;

    const llamadasCobertura = coberturaVigente ? 0 : 1;
    const llamadasFixtures = refrescarFixtures || partidos === 0 || importacionEstado !== 'COMPLETO' ? 1 : 0;
    const statsPendientes = coberturaStats ? statsPendientesBase + (reintentarParciales ? statsParciales : 0) : 0;
    const eventosPendientes = coberturaEventos ? eventosPendientesBase : 0;
    const completar = llamadasCobertura + llamadasFixtures + statsPendientes + eventosPendientes;
    const planActual = llamadasCobertura + llamadasFixtures + Math.min(statsPendientes, maxStats) + Math.min(eventosPendientes, maxEventos);

    items.push({
      ligaApiId: String(o.ligaApiId), temporada: Number(o.temporada), liga: o.liga ?? null,
      partidos, coberturaVigente, importacionEstado,
      pendientes: { estadisticas: statsPendientes, eventos: eventosPendientes },
      llamadas: {
        cobertura: llamadasCobertura,
        fixtures: llamadasFixtures,
        estadisticas: statsPendientes,
        eventos: eventosPendientes,
        totalParaCompletar: completar,
        totalPlanActual: planActual,
      },
    });
  }

  let acumuladas = 0;
  for (const i of items) {
    i.cuota = {
      disponiblesAntes: disponibles == null ? null : Math.max(0, disponibles - acumuladas),
      puedeCompletar: disponibles == null ? null : acumuladas + i.llamadas.totalParaCompletar <= disponibles,
      puedeEjecutarPlanActual: disponibles == null ? null : acumuladas + i.llamadas.totalPlanActual <= disponibles,
    };
    acumuladas += i.llamadas.totalParaCompletar;
  }

  const totalCompletar = items.reduce((s, x) => s + x.llamadas.totalParaCompletar, 0);
  const totalPlanActual = items.reduce((s, x) => s + x.llamadas.totalPlanActual, 0);
  return {
    cuota: { restantes, limite, reserva: reservaCuota, disponibles, observadoEn: cuotaFila?.solicitado_en ?? null },
    resumen: {
      objetivos: items.length,
      llamadasParaCompletar: totalCompletar,
      llamadasPlanActual: totalPlanActual,
      puedeCompletarTodo: disponibles == null ? null : totalCompletar <= disponibles,
      puedeEjecutarPlanActual: disponibles == null ? null : totalPlanActual <= disponibles,
    },
    items,
    aviso: 'Estimación conservadora basada en el estado actual de la BD. Una respuesta desde caché puede reducir llamadas reales; cambios en API-Football o nuevos partidos pueden aumentarlas.',
  };
}
