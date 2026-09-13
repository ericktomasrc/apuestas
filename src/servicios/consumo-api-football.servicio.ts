import { pool } from '../infraestructura/db.js';

export type RegistroConsumoApiFootball = {
  ruta: string;
  parametros?: Record<string, string | number>;
  estadoHttp?: number | null;
  exito: boolean;
  duracionMs: number;
  restantes?: number | null;
  limite?: number | null;
  retryAfterSeg?: number | null;
  codigoError?: string | null;
  detalleError?: string | null;
};

function textoCorto(v: unknown, max = 500): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/**
 * Registro best-effort: una falla de telemetría jamás debe romper
 * la sincronización deportiva ni ocultar el error original del proveedor.
 */
export async function registrarConsumoApiFootball(r: RegistroConsumoApiFootball): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO consumo_api_football
       (ruta, parametros, estado_http, exito, duracion_ms, restantes, limite,
        retry_after_seg, codigo_error, detalle_error)
       VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        r.ruta,
        JSON.stringify(r.parametros ?? {}),
        r.estadoHttp ?? null,
        r.exito,
        Math.max(0, Math.round(r.duracionMs || 0)),
        Number.isFinite(r.restantes) ? r.restantes : null,
        Number.isFinite(r.limite) ? r.limite : null,
        Number.isFinite(r.retryAfterSeg) ? r.retryAfterSeg : null,
        textoCorto(r.codigoError, 80),
        textoCorto(r.detalleError, 500),
      ],
    );
  } catch {
    // No relanzar: la telemetría es auxiliar.
  }
}

export type FiltrosConsumoApiFootball = { dias?: number };

function num(v: unknown): number { return Number(v ?? 0) || 0; }

export async function obtenerResumenConsumoApiFootball(filtros: FiltrosConsumoApiFootball = {}) {
  const dias = Math.max(1, Math.min(90, Number(filtros.dias) || 7));
  const reservaImportador = Math.max(0, Number(process.env.HISTORICO_RESERVA_CUOTA ?? 10));

  const [resumenQ, rutasQ, diasQ, erroresQ, ultimaQ] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS llamadas,
              count(*) FILTER (WHERE exito)::int AS exitosas,
              count(*) FILTER (WHERE NOT exito)::int AS errores,
              count(*) FILTER (WHERE estado_http=429)::int AS rate_limit,
              round(COALESCE(avg(duracion_ms),0))::int AS duracion_media_ms,
              max(solicitado_en) AS ultima_llamada
         FROM consumo_api_football
        WHERE solicitado_en >= now() - ($1::text || ' days')::interval`,
      [dias],
    ),
    pool.query(
      `SELECT ruta,
              count(*)::int AS llamadas,
              count(*) FILTER (WHERE NOT exito)::int AS errores,
              round(COALESCE(avg(duracion_ms),0))::int AS duracion_media_ms
         FROM consumo_api_football
        WHERE solicitado_en >= now() - ($1::text || ' days')::interval
        GROUP BY ruta ORDER BY llamadas DESC, ruta ASC`,
      [dias],
    ),
    pool.query(
      `SELECT to_char(date_trunc('day', solicitado_en), 'YYYY-MM-DD') AS fecha,
              count(*)::int AS llamadas,
              count(*) FILTER (WHERE NOT exito)::int AS errores,
              count(*) FILTER (WHERE estado_http=429)::int AS rate_limit
         FROM consumo_api_football
        WHERE solicitado_en >= now() - ($1::text || ' days')::interval
        GROUP BY 1 ORDER BY 1 ASC`,
      [dias],
    ),
    pool.query(
      `SELECT solicitado_en, ruta, estado_http, codigo_error, detalle_error,
              restantes, limite, retry_after_seg
         FROM consumo_api_football
        WHERE solicitado_en >= now() - ($1::text || ' days')::interval
          AND NOT exito
        ORDER BY solicitado_en DESC LIMIT 20`,
      [dias],
    ),
    pool.query(
      `SELECT solicitado_en, restantes, limite
         FROM consumo_api_football
        WHERE restantes IS NOT NULL
        ORDER BY solicitado_en DESC LIMIT 1`,
    ),
  ]);

  const r = resumenQ.rows[0] ?? {};
  const u = ultimaQ.rows[0] ?? null;
  const restantes = u?.restantes === null || u?.restantes === undefined ? null : Number(u.restantes);
  const limite = u?.limite === null || u?.limite === undefined ? null : Number(u.limite);
  let estadoCuota: 'DESCONOCIDA' | 'NORMAL' | 'CERCA_LIMITE' | 'RESERVADA' = 'DESCONOCIDA';
  if (restantes !== null) {
    estadoCuota = restantes <= reservaImportador
      ? 'RESERVADA'
      : restantes <= Math.max(reservaImportador * 2, 20)
        ? 'CERCA_LIMITE'
        : 'NORMAL';
  }

  return {
    periodoDias: dias,
    reservaImportador,
    cuota: {
      restantes,
      limite,
      estado: estadoCuota,
      observadoEn: u?.solicitado_en ?? null,
    },
    resumen: {
      llamadas: num(r.llamadas),
      exitosas: num(r.exitosas),
      errores: num(r.errores),
      rateLimit: num(r.rate_limit),
      duracionMediaMs: num(r.duracion_media_ms),
      ultimaLlamada: r.ultima_llamada ?? null,
    },
    porRuta: rutasQ.rows.map((x) => ({
      ruta: String(x.ruta), llamadas: num(x.llamadas), errores: num(x.errores),
      duracionMediaMs: num(x.duracion_media_ms),
    })),
    porDia: diasQ.rows.map((x) => ({
      fecha: String(x.fecha), llamadas: num(x.llamadas), errores: num(x.errores), rateLimit: num(x.rate_limit),
    })),
    erroresRecientes: erroresQ.rows.map((x) => ({
      solicitadoEn: x.solicitado_en,
      ruta: String(x.ruta),
      estadoHttp: x.estado_http === null ? null : Number(x.estado_http),
      codigoError: x.codigo_error ? String(x.codigo_error) : null,
      detalleError: x.detalle_error ? String(x.detalle_error) : null,
      restantes: x.restantes === null ? null : Number(x.restantes),
      limite: x.limite === null ? null : Number(x.limite),
      retryAfterSeg: x.retry_after_seg === null ? null : Number(x.retry_after_seg),
    })),
    aviso: 'Solo cuenta llamadas HTTP reales a API-Football. Las respuestas servidas desde la caché local no consumen cuota y no se registran como llamadas externas.',
  };
}
