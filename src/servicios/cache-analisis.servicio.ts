import { pool } from '../infraestructura/db.js';

type EntradaCache<T = unknown> = {
  valor: T;
  versionDatos: string;
  creadoEn: number;
  expiraEn: number;
  ultimoAccesoEn: number;
  aciertos: number;
};

type Pendiente = Promise<unknown>;

const cache = new Map<string, EntradaCache>();
const pendientes = new Map<string, Pendiente>();

const ttlPredeterminadoMs = numeroEntorno('ANALISIS_CACHE_TTL_SEGUNDOS', 300, 10, 3600) * 1000;
const maxEntradas = numeroEntorno('ANALISIS_CACHE_MAX_ENTRADAS', 500, 20, 5000);
const intervaloFirmaMs = numeroEntorno('ANALISIS_CACHE_FIRMA_SEGUNDOS', 10, 2, 300) * 1000;

let firmaMemoria: { valor: string; consultadaEn: number } | null = null;
let versionObservada: string | null = null;
let estadisticas = {
  aciertos: 0,
  fallos: 0,
  calculos: 0,
  deduplicados: 0,
  expirados: 0,
  desalojados: 0,
  invalidacionesPorCambioDatos: 0,
  limpiezasManuales: 0,
  erroresFirma: 0,
};

function numeroEntorno(nombre: string, defecto: number, minimo: number, maximo: number): number {
  const n = Number(process.env[nombre] ?? defecto);
  if (!Number.isFinite(n)) return defecto;
  return Math.min(maximo, Math.max(minimo, Math.trunc(n)));
}

function estable(valor: unknown): string {
  if (valor === null || valor === undefined) return String(valor);
  if (typeof valor !== 'object') return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`;
  const obj = valor as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${estable(obj[k])}`).join(',')}}`;
}

function claveCompleta(espacio: string, parametros: unknown): string {
  return `${espacio}:${estable(parametros)}`;
}

async function obtenerFirmaDatos(forzar = false): Promise<string> {
  const ahora = Date.now();
  if (!forzar && firmaMemoria && ahora - firmaMemoria.consultadaEn < intervaloFirmaMs) {
    return firmaMemoria.valor;
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::text FROM partidos_historial_deportivo) AS partidos_total,
        (SELECT COALESCE(MAX(actualizado_en), 'epoch'::timestamptz)::text FROM partidos_historial_deportivo) AS partidos_max,
        (SELECT COUNT(*)::text FROM estadisticas_partido_deportivo) AS estadisticas_total,
        (SELECT COALESCE(MAX(actualizado_en), 'epoch'::timestamptz)::text FROM estadisticas_partido_deportivo) AS estadisticas_max,
        (SELECT COUNT(*)::text FROM eventos_partido_deportivo) AS eventos_total,
        (SELECT COALESCE(MAX(actualizado_en), 'epoch'::timestamptz)::text FROM eventos_partido_deportivo) AS eventos_max
    `);
    const r = rows[0] ?? {};
    const firma = [
      r.partidos_total ?? '0', r.partidos_max ?? 'epoch',
      r.estadisticas_total ?? '0', r.estadisticas_max ?? 'epoch',
      r.eventos_total ?? '0', r.eventos_max ?? 'epoch',
    ].join('|');
    firmaMemoria = { valor: firma, consultadaEn: ahora };

    if (versionObservada !== null && versionObservada !== firma) {
      cache.clear();
      estadisticas.invalidacionesPorCambioDatos += 1;
    }
    versionObservada = firma;
    return firma;
  } catch {
    estadisticas.erroresFirma += 1;
    // Si no se puede calcular la firma, no reutilizamos indefinidamente resultados antiguos.
    const firma = `SIN_FIRMA:${Math.floor(ahora / ttlPredeterminadoMs)}`;
    firmaMemoria = { valor: firma, consultadaEn: ahora };
    return firma;
  }
}

function podar(ahora = Date.now()): void {
  for (const [k, entrada] of cache) {
    if (entrada.expiraEn <= ahora) {
      cache.delete(k);
      estadisticas.expirados += 1;
    }
  }
  if (cache.size <= maxEntradas) return;
  const orden = [...cache.entries()].sort((a, b) => a[1].ultimoAccesoEn - b[1].ultimoAccesoEn);
  for (const [k] of orden.slice(0, Math.max(0, cache.size - maxEntradas))) {
    if (cache.delete(k)) estadisticas.desalojados += 1;
  }
}

export async function cachearAnalisis<T>(
  espacio: string,
  parametros: unknown,
  productor: () => Promise<T>,
  opciones: { ttlMs?: number } = {},
): Promise<T> {
  const ahora = Date.now();
  podar(ahora);
  const versionDatos = await obtenerFirmaDatos();
  const clave = claveCompleta(espacio, parametros);
  const existente = cache.get(clave) as EntradaCache<T> | undefined;

  if (existente && existente.versionDatos === versionDatos && existente.expiraEn > ahora) {
    existente.ultimoAccesoEn = ahora;
    existente.aciertos += 1;
    estadisticas.aciertos += 1;
    return existente.valor;
  }
  if (existente) cache.delete(clave);
  estadisticas.fallos += 1;

  const enCurso = pendientes.get(clave) as Promise<T> | undefined;
  if (enCurso) {
    estadisticas.deduplicados += 1;
    return enCurso;
  }

  const promesa = (async () => {
    try {
      const valor = await productor();
      estadisticas.calculos += 1;
      const creadoEn = Date.now();
      const ttl = Math.max(1_000, opciones.ttlMs ?? ttlPredeterminadoMs);
      cache.set(clave, {
        valor,
        versionDatos,
        creadoEn,
        expiraEn: creadoEn + ttl,
        ultimoAccesoEn: creadoEn,
        aciertos: 0,
      });
      podar(creadoEn);
      return valor;
    } finally {
      pendientes.delete(clave);
    }
  })();

  pendientes.set(clave, promesa);
  return promesa;
}

export async function obtenerEstadoCacheAnalisis() {
  const ahora = Date.now();
  podar(ahora);
  const firma = await obtenerFirmaDatos();
  const porEspacio: Record<string, { entradas: number; aciertos: number }> = {};
  for (const [clave, entrada] of cache) {
    const espacio = clave.split(':', 1)[0] || 'desconocido';
    porEspacio[espacio] ??= { entradas: 0, aciertos: 0 };
    porEspacio[espacio].entradas += 1;
    porEspacio[espacio].aciertos += entrada.aciertos;
  }
  return {
    habilitada: true,
    tipo: 'MEMORIA_PROCESO',
    entradas: cache.size,
    calculosEnCurso: pendientes.size,
    maxEntradas,
    ttlPredeterminadoSegundos: Math.round(ttlPredeterminadoMs / 1000),
    intervaloFirmaSegundos: Math.round(intervaloFirmaMs / 1000),
    firmaDatos: firma,
    estadisticas: { ...estadisticas },
    porEspacio,
    aviso: 'La caché acelera cálculos repetidos y se invalida cuando cambia el histórico. Al reiniciar el backend comienza vacía.',
  };
}

export function limpiarCacheAnalisis(): { eliminadas: number } {
  const eliminadas = cache.size;
  cache.clear();
  pendientes.clear();
  firmaMemoria = null;
  versionObservada = null;
  estadisticas.limpiezasManuales += 1;
  return { eliminadas };
}
