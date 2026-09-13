import { randomUUID } from 'node:crypto';
import { pool } from '../infraestructura/db.js';
import {
  ejecutarImportacionHistorica,
  type ObjetivoImportacionHistorica,
} from '../herramientas/importar-historico-deportivo.js';

export type EstadoTrabajoImportacion =
  | 'EN_COLA'
  | 'EN_PROCESO'
  | 'COMPLETO'
  | 'PARCIAL'
  | 'ERROR'
  | 'INTERRUMPIDO';

export type ObjetivoTrabajoImportacion = ObjetivoImportacionHistorica & {
  estado: EstadoTrabajoImportacion;
  error?: string | null;
  iniciadoEn?: string | null;
  finalizadoEn?: string | null;
};

export type TrabajoImportacionHistorica = {
  id: string;
  estado: EstadoTrabajoImportacion;
  usuarioId: string | null;
  usuarioAlias: string | null;
  creadoEn: string;
  iniciadoEn: string | null;
  finalizadoEn: string | null;
  actual: number;
  total: number;
  objetivos: ObjetivoTrabajoImportacion[];
  error: string | null;
};

export type ActorImportacionHistorica = {
  usuarioId?: string | null;
  alias?: string | null;
};

const trabajos = new Map<string, TrabajoImportacionHistorica>();
let cola = Promise.resolve();
let recuperacionInicioEjecutada = false;

function clonar(t: TrabajoImportacionHistorica): TrabajoImportacionHistorica {
  return JSON.parse(JSON.stringify(t));
}

function iso(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function persistirTrabajo(t: TrabajoImportacionHistorica): Promise<void> {
  await pool.query(
    `INSERT INTO trabajos_importacion_historica
       (id, estado, usuario_id, usuario_alias, creado_en, iniciado_en, finalizado_en, actual, total, error, actualizado_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     ON CONFLICT (id) DO UPDATE SET
       estado=EXCLUDED.estado,
       usuario_id=EXCLUDED.usuario_id,
       usuario_alias=EXCLUDED.usuario_alias,
       iniciado_en=EXCLUDED.iniciado_en,
       finalizado_en=EXCLUDED.finalizado_en,
       actual=EXCLUDED.actual,
       total=EXCLUDED.total,
       error=EXCLUDED.error,
       actualizado_en=now()`,
    [t.id, t.estado, t.usuarioId, t.usuarioAlias, t.creadoEn, t.iniciadoEn, t.finalizadoEn, t.actual, t.total, t.error],
  );
}

async function persistirObjetivo(t: TrabajoImportacionHistorica, orden: number): Promise<void> {
  const o = t.objetivos[orden];
  if (!o) return;
  await pool.query(
    `INSERT INTO objetivos_trabajo_importacion_historica
       (trabajo_id, orden, liga_api_id, temporada, liga, estado, error, iniciado_en, finalizado_en, actualizado_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     ON CONFLICT (trabajo_id, orden) DO UPDATE SET
       liga_api_id=EXCLUDED.liga_api_id,
       temporada=EXCLUDED.temporada,
       liga=EXCLUDED.liga,
       estado=EXCLUDED.estado,
       error=EXCLUDED.error,
       iniciado_en=EXCLUDED.iniciado_en,
       finalizado_en=EXCLUDED.finalizado_en,
       actualizado_en=now()`,
    [t.id, orden, o.ligaApiId, o.temporada, o.liga ?? null, o.estado, o.error ?? null, o.iniciadoEn ?? null, o.finalizadoEn ?? null],
  );
}

async function persistirNuevoTrabajo(t: TrabajoImportacionHistorica): Promise<void> {
  await persistirTrabajo(t);
  for (let i = 0; i < t.objetivos.length; i++) await persistirObjetivo(t, i);
}

async function leerEstadoPersistido(ligaApiId: string, temporada: number): Promise<EstadoTrabajoImportacion> {
  const { rows } = await pool.query(
    `SELECT estado FROM importaciones_historial_deportivo WHERE liga_api_id=$1 AND temporada=$2`,
    [ligaApiId, temporada],
  );
  const e = String(rows[0]?.estado ?? 'PARCIAL').toUpperCase();
  if (e === 'COMPLETO' || e === 'ERROR' || e === 'EN_PROCESO') return e as EstadoTrabajoImportacion;
  return 'PARCIAL';
}

async function ejecutarObjetivosEnLote(
  t: TrabajoImportacionHistorica,
  soloPendientes: boolean,
): Promise<void> {
  t.estado = 'EN_PROCESO';
  t.iniciadoEn = t.iniciadoEn ?? new Date().toISOString();
  t.finalizadoEn = null;
  t.error = null;
  await persistirTrabajo(t);

  const indices: number[] = [];
  for (let i = 0; i < t.objetivos.length; i++) {
    const objetivo = t.objetivos[i];
    if (soloPendientes && objetivo.estado === 'COMPLETO') continue;
    indices.push(i);
    objetivo.estado = 'EN_PROCESO';
    objetivo.error = null;
    objetivo.iniciadoEn = new Date().toISOString();
    objetivo.finalizadoEn = null;
    await persistirObjetivo(t, i);
  }

  if (!indices.length) {
    t.estado = 'COMPLETO';
    t.actual = t.total;
    t.finalizadoEn = new Date().toISOString();
    await persistirTrabajo(t);
    return;
  }

  // IMPORTANTE: una sola llamada para todo el trabajo. La carga continúa
  // entre ligas/temporadas mientras exista cuota segura del proveedor.
  try {
    await ejecutarImportacionHistorica({
      objetivos: indices.map((i) => {
        const o = t.objetivos[i];
        return { ligaApiId: o.ligaApiId, temporada: o.temporada, liga: o.liga };
      }),
      refrescarFixtures: false,
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    t.error = mensaje;
  }

  let huboError = false;
  let huboParcial = false;
  for (const i of indices) {
    const objetivo = t.objetivos[i];
    try {
      objetivo.estado = await leerEstadoPersistido(objetivo.ligaApiId, objetivo.temporada);
      objetivo.error = objetivo.estado === 'ERROR' ? (t.error ?? 'Error durante la importación') : null;
    } catch (e) {
      objetivo.estado = 'ERROR';
      objetivo.error = e instanceof Error ? e.message : String(e);
    }
    if (objetivo.estado === 'ERROR') huboError = true;
    else if (objetivo.estado !== 'COMPLETO') huboParcial = true;
    objetivo.finalizadoEn = new Date().toISOString();
    await persistirObjetivo(t, i);
  }

  t.actual = t.objetivos.filter((o) => o.estado === 'COMPLETO').length;
  t.estado = huboError ? 'ERROR' : huboParcial ? 'PARCIAL' : 'COMPLETO';
  t.finalizadoEn = new Date().toISOString();
  await persistirTrabajo(t);
}

async function ejecutarTrabajo(t: TrabajoImportacionHistorica): Promise<void> {
  await ejecutarObjetivosEnLote(t, false);
}

export async function crearTrabajoImportacionHistorica(
  objetivos: Array<{ ligaApiId: string; temporada: number; liga?: string }>,
  actor: ActorImportacionHistorica = {},
): Promise<TrabajoImportacionHistorica> {
  const unicos = new Map<string, { ligaApiId: string; temporada: number; liga?: string }>();
  for (const o of objetivos) {
    const ligaApiId = String(o.ligaApiId).trim();
    const temporada = Number(o.temporada);
    if (!ligaApiId || !Number.isInteger(temporada)) continue;
    unicos.set(`${ligaApiId}:${temporada}`, { ligaApiId, temporada, liga: o.liga?.trim() || undefined });
  }

  const lista = [...unicos.values()].slice(0, 500);
  if (!lista.length) throw new Error('No hay liga/temporada válidas para importar');

  const trabajo: TrabajoImportacionHistorica = {
    id: randomUUID(),
    estado: 'EN_COLA',
    usuarioId: actor.usuarioId ? String(actor.usuarioId) : null,
    usuarioAlias: actor.alias ? String(actor.alias) : null,
    creadoEn: new Date().toISOString(),
    iniciadoEn: null,
    finalizadoEn: null,
    actual: 0,
    total: lista.length,
    objetivos: lista.map((o) => ({ ...o, estado: 'EN_COLA', error: null, iniciadoEn: null, finalizadoEn: null })),
    error: null,
  };

  trabajos.set(trabajo.id, trabajo);
  await persistirNuevoTrabajo(trabajo);

  cola = cola
    .then(() => ejecutarTrabajo(trabajo))
    .catch(async (e) => {
      trabajo.estado = 'ERROR';
      trabajo.error = e instanceof Error ? e.message : String(e);
      trabajo.finalizadoEn = new Date().toISOString();
      try { await persistirTrabajo(trabajo); } catch { /* conserva el error original en memoria */ }
    });

  return clonar(trabajo);
}

async function cargarTrabajoPersistido(id: string): Promise<TrabajoImportacionHistorica | null> {
  const { rows } = await pool.query(
    `SELECT id, estado, usuario_id, usuario_alias, creado_en, iniciado_en, finalizado_en, actual, total, error
       FROM trabajos_importacion_historica WHERE id=$1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  const obj = await pool.query(
    `SELECT liga_api_id, temporada, liga, estado, error, iniciado_en, finalizado_en
       FROM objetivos_trabajo_importacion_historica
      WHERE trabajo_id=$1 ORDER BY orden`,
    [id],
  );
  return {
    id: String(r.id), estado: String(r.estado) as EstadoTrabajoImportacion,
    usuarioId: r.usuario_id ? String(r.usuario_id) : null,
    usuarioAlias: r.usuario_alias ? String(r.usuario_alias) : null,
    creadoEn: iso(r.creado_en)!, iniciadoEn: iso(r.iniciado_en), finalizadoEn: iso(r.finalizado_en),
    actual: Number(r.actual ?? 0), total: Number(r.total ?? 0), error: r.error ? String(r.error) : null,
    objetivos: obj.rows.map((o) => ({
      ligaApiId: String(o.liga_api_id), temporada: Number(o.temporada), liga: o.liga ? String(o.liga) : undefined,
      estado: String(o.estado) as EstadoTrabajoImportacion, error: o.error ? String(o.error) : null,
      iniciadoEn: iso(o.iniciado_en), finalizadoEn: iso(o.finalizado_en),
    })),
  };
}

async function marcarPersistidoComoInterrumpido(id: string): Promise<void> {
  await pool.query(
    `UPDATE trabajos_importacion_historica
        SET estado='INTERRUMPIDO', finalizado_en=COALESCE(finalizado_en, now()),
            error=COALESCE(error, 'Ejecución interrumpida por reinicio o detención del servidor'), actualizado_en=now()
      WHERE id=$1 AND estado IN ('EN_COLA','EN_PROCESO')`,
    [id],
  );
  await pool.query(
    `UPDATE objetivos_trabajo_importacion_historica
        SET estado='INTERRUMPIDO', finalizado_en=COALESCE(finalizado_en, now()),
            error=COALESCE(error, 'Ejecución interrumpida por reinicio o detención del servidor'), actualizado_en=now()
      WHERE trabajo_id=$1 AND estado IN ('EN_COLA','EN_PROCESO')`,
    [id],
  );
}

export async function obtenerTrabajoImportacionHistorica(id: string): Promise<TrabajoImportacionHistorica | null> {
  const enMemoria = trabajos.get(id);
  if (enMemoria) return clonar(enMemoria);
  return await cargarTrabajoPersistido(id);
}

export async function listarHistorialImportaciones(limite = 30): Promise<TrabajoImportacionHistorica[]> {
  const n = Math.max(1, Math.min(100, Number(limite) || 30));
  const { rows } = await pool.query(
    `SELECT id, estado FROM trabajos_importacion_historica ORDER BY creado_en DESC LIMIT $1`,
    [n],
  );
  const salida: TrabajoImportacionHistorica[] = [];
  for (const r of rows) {
    const id = String(r.id);
    const t = trabajos.has(id) ? clonar(trabajos.get(id)!) : await cargarTrabajoPersistido(id);
    if (t) salida.push(t);
  }
  return salida;
}


export type ResultadoReintentoImportacion = {
  trabajo: TrabajoImportacionHistorica;
  origenTrabajoId: string;
  reintentados: number;
  omitidosCompletos: number;
};

/**
 * Crea un nuevo trabajo usando únicamente los objetivos del trabajo anterior
 * que siguen pendientes. Antes de reintentarlos consulta el estado consolidado
 * en importaciones_historial_deportivo para no volver a procesar temporadas
 * que ya quedaron COMPLETO por otra ejecución.
 */
export async function reintentarTrabajoImportacionHistorica(
  trabajoId: string,
  actor: ActorImportacionHistorica = {},
): Promise<ResultadoReintentoImportacion> {
  const anterior = await obtenerTrabajoImportacionHistorica(trabajoId);
  if (!anterior) throw new Error('Trabajo de importación no encontrado');

  const candidatos = anterior.objetivos.filter((o) =>
    ['PARCIAL', 'ERROR', 'INTERRUMPIDO', 'EN_COLA', 'EN_PROCESO'].includes(o.estado),
  );

  if (!candidatos.length) {
    throw new Error('Este trabajo no tiene liga/temporada pendientes para reintentar');
  }

  const objetivos: Array<{ ligaApiId: string; temporada: number; liga?: string }> = [];
  let omitidosCompletos = 0;

  for (const o of candidatos) {
    const estadoActual = await leerEstadoPersistido(o.ligaApiId, o.temporada);
    if (estadoActual === 'COMPLETO') {
      omitidosCompletos++;
      continue;
    }
    objetivos.push({ ligaApiId: o.ligaApiId, temporada: o.temporada, liga: o.liga });
  }

  if (!objetivos.length) {
    throw new Error('Los objetivos pendientes ya aparecen como COMPLETO; no es necesario reintentar');
  }

  const trabajo = await crearTrabajoImportacionHistorica(objetivos, actor);
  return { trabajo, origenTrabajoId: trabajoId, reintentados: objetivos.length, omitidosCompletos };
}


export type ResultadoReanudacionInicio = {
  encontrados: number;
  reanudados: number;
  omitidos: number;
};

/**
 * Recupera trabajos que quedaron EN_COLA/EN_PROCESO después de un reinicio.
 * Los objetivos ya COMPLETO no se repiten. Los demás vuelven a EN_COLA y
 * continúan usando el mismo trabajo persistido, conservando su auditoría.
 * Esta función tiene una guarda por proceso para ejecutarse una sola vez.
 */
export async function reanudarTrabajosPendientesAlInicio(): Promise<ResultadoReanudacionInicio> {
  if (recuperacionInicioEjecutada) return { encontrados: 0, reanudados: 0, omitidos: 0 };
  recuperacionInicioEjecutada = true;

  const { rows } = await pool.query(
    `SELECT id FROM trabajos_importacion_historica
      WHERE estado IN ('EN_COLA','EN_PROCESO')
      ORDER BY creado_en ASC`,
  );

  let reanudados = 0;
  let omitidos = 0;

  for (const row of rows) {
    const id = String(row.id);
    if (trabajos.has(id)) { omitidos++; continue; }

    const trabajo = await cargarTrabajoPersistido(id);
    if (!trabajo) { omitidos++; continue; }

    let pendientes = 0;
    for (let i = 0; i < trabajo.objetivos.length; i++) {
      const objetivo = trabajo.objetivos[i];
      const consolidado = await leerEstadoPersistido(objetivo.ligaApiId, objetivo.temporada);
      if (objetivo.estado === 'COMPLETO' || consolidado === 'COMPLETO') {
        objetivo.estado = 'COMPLETO';
        objetivo.error = null;
        objetivo.finalizadoEn = objetivo.finalizadoEn ?? new Date().toISOString();
      } else {
        objetivo.estado = 'EN_COLA';
        objetivo.error = null;
        objetivo.iniciadoEn = null;
        objetivo.finalizadoEn = null;
        pendientes++;
      }
      await persistirObjetivo(trabajo, i);
    }

    if (!pendientes) {
      trabajo.estado = 'COMPLETO';
      trabajo.actual = trabajo.total;
      trabajo.error = null;
      trabajo.finalizadoEn = trabajo.finalizadoEn ?? new Date().toISOString();
      await persistirTrabajo(trabajo);
      omitidos++;
      continue;
    }

    trabajo.estado = 'EN_COLA';
    trabajo.actual = trabajo.objetivos.filter((o) => o.estado === 'COMPLETO').length;
    trabajo.error = null;
    trabajo.finalizadoEn = null;
    trabajos.set(trabajo.id, trabajo);
    await persistirTrabajo(trabajo);

    cola = cola
      .then(() => ejecutarTrabajoReanudado(trabajo))
      .catch(async (e) => {
        trabajo.estado = 'ERROR';
        trabajo.error = e instanceof Error ? e.message : String(e);
        trabajo.finalizadoEn = new Date().toISOString();
        try { await persistirTrabajo(trabajo); } catch { /* conserva el error original */ }
      });
    reanudados++;
  }

  return { encontrados: rows.length, reanudados, omitidos };
}

async function ejecutarTrabajoReanudado(t: TrabajoImportacionHistorica): Promise<void> {
  await ejecutarObjetivosEnLote(t, true);
}

